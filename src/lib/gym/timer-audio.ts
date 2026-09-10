// Pitidos del cronómetro, sintetizados: ni un archivo de audio en el proyecto.
//
// Va por Web Audio y no por un <audio>, y la diferencia importa en el iPhone.
// Web Audio se MEZCLA con lo que esté sonando, así que el pitido no corta la
// playlist de Spotify — que en esta app es una función de primera clase. El
// precio es que iOS le aplica el interruptor de silencio: con el móvil en
// silencio no se oye. Un <audio> haría justo lo contrario (sonaría en silencio,
// pero pausaría Spotify). Entre las dos, se elige no pelear con la música.
//
// Todo degrada en silencio: sin AudioContext, el cronómetro sigue corriendo.

import type { Cue } from "@/hooks/use-countdown";

type Tono = { hz: number; ms: number; gain: number };

const TONOS: Record<Cue, Tono> = {
  // Seco y agudo, para los tres últimos segundos.
  count: { hz: 880, ms: 90, gain: 0.18 },
  // Más grave: se distingue del conteo sin mirar la pantalla.
  floor: { hz: 660, ms: 130, gain: 0.16 },
  // Largo y por encima de todo: es el que tiene que oírse con música.
  end: { hz: 1320, ms: 420, gain: 0.26 },
};

type Ctor = typeof AudioContext;

let ctx: AudioContext | null = null;

function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: Ctor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Crea (o despierta) el contexto de audio. Hay que llamarlo DENTRO del gesto
 * del usuario: iOS crea todo contexto en estado «suspended» y solo deja
 * reanudarlo desde un toque real. El botón de «iniciar» es ese toque.
 */
export function unlockAudio(): void {
  try {
    const Ctor = audioCtor();
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // Sin audio disponible: el cronómetro es visual y ya.
  }
}

export function playCue(cue: Cue): void {
  try {
    if (!ctx || ctx.state !== "running") return;
    const { hz, ms, gain } = TONOS[cue];
    const t0 = ctx.currentTime;
    const dur = ms / 1000;

    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;

    // Rampas cortas en los dos extremos. Sin ellas, arrancar y cortar la onda
    // de golpe mete un chasquido que suena a error del navegador.
    vol.gain.setValueAtTime(0, t0);
    vol.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    vol.gain.setValueAtTime(gain, t0 + dur - 0.03);
    vol.gain.linearRampToValueAtTime(0, t0 + dur);

    osc.connect(vol).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    // Un pitido perdido no interrumpe la serie.
  }
}

/** ¿Este navegador puede sonar? Para no ofrecer lo que no existe. */
export function audioSupported(): boolean {
  return audioCtor() !== null;
}
