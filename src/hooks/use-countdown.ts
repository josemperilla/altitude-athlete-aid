import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cuenta atrás para el gimnasio.
 *
 * El estado interno es un INSTANTE de vencimiento absoluto, no un contador que
 * se va decrementando en cada tick. Es la diferencia entre funcionar y no
 * funcionar en un teléfono: cuando iOS bloquea la pantalla o pasas a Spotify,
 * congela los temporizadores de la pestaña. Un contador decremental se quedaría
 * atrás tantos segundos como durara la congelación y al volver mostraría una
 * mentira; con un vencimiento absoluto, el tick que llega después de reanudar
 * calcula el tiempo real que queda y todo cuadra.
 *
 * El intervalo (250 ms) solo existe para repintar. La verdad es siempre
 * `deadline - Date.now()`.
 */

/** Avisos que el consumidor puede sonorizar. */
export type Cue =
  /** Uno por segundo en los tres últimos. */
  | "count"
  /** Se cruzó el suelo del rango ("20–30 s": quedan 10 y ya cumpliste los 20). */
  | "floor"
  | "end";

type Options = {
  seconds: number;
  /** Suelo del rango, en segundos restantes desde el final. */
  minSeconds?: number;
  /**
   * Identidad de lo que se cronometra. Al cambiar, el cronómetro vuelve a cero
   * y queda listo.
   *
   * No basta con vigilar `seconds`: la serie 1 derecha dura lo mismo que la
   * serie 1 izquierda, así que al avanzar de lado la duración no cambia y el
   * display se quedaba clavado en 0:00 sobre el segmento nuevo.
   */
  resetKey?: string;
  onCue?: (cue: Cue) => void;
  onDone?: () => void;
};

export type Countdown = {
  /** Segundos restantes, redondeados hacia arriba: sale 1 hasta que de verdad es 0. */
  remaining: number;
  running: boolean;
  done: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
};

const TICK_MS = 250;
/** Últimos segundos que se cantan uno a uno. */
const COUNT_FROM = 3;

export function useCountdown({ seconds, minSeconds, resetKey, onCue, onDone }: Options): Countdown {
  const total = Math.max(0, Math.round(seconds)) * 1000;

  // Vencimiento absoluto mientras corre; null cuando está parado.
  const [deadline, setDeadline] = useState<number | null>(null);
  // Lo que quedaba al pausar. Es también el valor inicial y el de después del
  // reinicio, así que la primera pintura no necesita leer el reloj (SSR limpio).
  const [parkedMs, setParkedMs] = useState(total);
  const [now, setNow] = useState(0);

  // Los callbacks entran por ref para que cambiarlos no reinicie el intervalo:
  // el componente los redefine en cada render y el cronómetro no puede
  // reengancharse cada vez.
  const cueRef = useRef(onCue);
  const doneRef = useRef(onDone);
  cueRef.current = onCue;
  doneRef.current = onDone;

  /** Último segundo entero ya anunciado, para no repetir el pitido en cada tick. */
  const announced = useRef<number | null>(null);

  const remainingMs = deadline === null ? parkedMs : Math.max(0, deadline - now);
  const remaining = Math.ceil(remainingMs / 1000);
  const running = deadline !== null;
  const done = remainingMs <= 0 && parkedMs !== total;

  // Otro segmento (u otra duración) es otro cronómetro: vuelve a su inicio.
  useEffect(() => {
    setDeadline(null);
    setParkedMs(total);
    announced.current = null;
  }, [total, resetKey]);

  const start = useCallback(() => {
    const left = remainingMs <= 0 ? total : remainingMs;
    announced.current = null;
    setNow(Date.now());
    setDeadline(Date.now() + left);
  }, [remainingMs, total]);

  const pause = useCallback(() => {
    setParkedMs(remainingMs);
    setDeadline(null);
  }, [remainingMs]);

  const reset = useCallback(() => {
    setDeadline(null);
    setParkedMs(total);
    announced.current = null;
  }, [total]);

  useEffect(() => {
    if (deadline === null) return;

    // Se pinta ya, sin esperar al primer tick: si no, el número se queda
    // congelado un cuarto de segundo justo al pulsar «iniciar».
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [deadline]);

  // Avisos y final. Va en su propio efecto porque depende del valor pintado,
  // no del intervalo: así el cálculo es el mismo tras una congelación de iOS.
  useEffect(() => {
    if (deadline === null) return;
    const leftMs = Math.max(0, deadline - now);
    const left = Math.ceil(leftMs / 1000);

    if (leftMs <= 0) {
      if (announced.current !== 0) {
        announced.current = 0;
        setParkedMs(0);
        setDeadline(null);
        cueRef.current?.("end");
        doneRef.current?.();
      }
      return;
    }

    if (announced.current === left) return;
    const previo = announced.current;
    announced.current = left;
    // Al arrancar no se canta el primer número; y tras una congelación larga
    // se salta lo que se perdió en vez de soltar una ráfaga de pitidos.
    if (previo === null || previo - left !== 1) return;

    if (minSeconds !== undefined && left === total / 1000 - minSeconds) {
      cueRef.current?.("floor");
    } else if (left <= COUNT_FROM) {
      cueRef.current?.("count");
    }
  }, [deadline, now, minSeconds, total]);

  return { remaining: Math.max(0, remaining), running, done, start, pause, reset };
}
