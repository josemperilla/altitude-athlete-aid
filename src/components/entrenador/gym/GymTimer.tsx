import { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCountdown, type Cue } from "@/hooks/use-countdown";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { parsePrescription, timedSegments } from "@/lib/gym/prescription";
import { audioSupported, playCue, unlockAudio } from "@/lib/gym/timer-audio";
import { notifyDone, notifyState, requestNotifyPermission } from "@/lib/gym/timer-notify";
import { mmss } from "@/lib/workout-steps";

/**
 * Cuenta atrás para los ejercicios prescritos en tiempo.
 *
 * Solo aparece donde hay tiempo que contar. En un ejercicio de repeticiones
 * devuelve null y la tarjeta queda exactamente como estaba: la mayoría del
 * catálogo son repeticiones y no se les añade ruido.
 *
 * Cada serie —y cada lado, cuando el ejercicio es unilateral— es su propio
 * cronómetro, con su propio chip. Al llegar a cero avanza al siguiente pero NO
 * arranca solo: entre lado y lado hay que recolocarse, y un cronómetro que
 * empieza mientras te acomodas cuenta tiempo que no entrenaste.
 */
export function GymTimer({ prescription, name }: { prescription: string; name: string }) {
  const segments = useMemo(() => timedSegments(parsePrescription(prescription)), [prescription]);

  if (segments.length === 0) return null;
  return <Timer segments={segments} name={name} />;
}

type Segment = ReturnType<typeof timedSegments>[number];

function Timer({ segments, name }: { segments: Segment[]; name: string }) {
  const [activo, setActivo] = useState(0);
  const [hechos, setHechos] = useState<Set<string>>(() => new Set());
  const [permiso, setPermiso] = useState(() => notifyState());

  const segment = segments[activo];

  const onCue = useCallback((cue: Cue) => playCue(cue), []);

  const onDone = useCallback(() => {
    setHechos((prev) => new Set(prev).add(segment.key));
    notifyDone(name, segment.label);
    // Deja el siguiente preparado, parado. El que entrena decide cuándo.
    setActivo((i) => (i + 1 < segments.length ? i + 1 : i));
  }, [segment.key, segment.label, name, segments.length]);

  const timer = useCountdown({
    seconds: segment.seconds,
    minSeconds: segment.minSeconds,
    resetKey: segment.key,
    onCue,
    onDone,
  });

  useWakeLock(timer.running);

  // El estado del permiso puede cambiar fuera de esta pestaña (ajustes del
  // navegador), y al volver a ella el botón tiene que reflejar la realidad.
  useEffect(() => {
    const sync = () => setPermiso(notifyState());
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  function toggle() {
    if (timer.running) {
      timer.pause();
      return;
    }
    // Desbloquear el audio tiene que pasar aquí dentro, en el gesto: iOS no
    // deja despertar el contexto de sonido desde ningún otro sitio.
    unlockAudio();
    timer.start();
  }

  function elegir(i: number) {
    if (i === activo) return;
    setActivo(i);
  }

  const completo = hechos.size === segments.length;
  const total = segments.length;

  return (
    <div className="gym-timer">
      <div className="gym-timer-main">
        <div className="gym-timer-clock">
          <span className="metric-num gym-timer-num">{mmss(timer.remaining)}</span>
          <span className="gym-timer-seg">
            {total > 1 ? `${segment.label} de ${total}` : segment.label}
            {segment.minSeconds !== undefined && (
              <em title={`El mínimo prescrito son ${segment.minSeconds} s`}>
                {" "}
                · mín {segment.minSeconds} s
              </em>
            )}
          </span>
        </div>

        <div className="gym-timer-ctrl">
          <button
            type="button"
            className="gym-timer-go"
            onClick={toggle}
            aria-label={timer.running ? "Pausar" : "Iniciar"}
          >
            {timer.running ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
            <span>{timer.running ? "Pausar" : "Iniciar"}</span>
          </button>
          <button
            type="button"
            className="gym-timer-rst"
            onClick={timer.reset}
            disabled={timer.running}
            aria-label="Reiniciar"
            title="Reiniciar"
          >
            <RotateCcw size={16} aria-hidden />
          </button>
        </div>
      </div>

      {total > 1 && (
        <div className="gym-timer-chips" role="group" aria-label="Series">
          {segments.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className="gym-timer-chip"
              data-state={hechos.has(s.key) ? "done" : i === activo ? "active" : "todo"}
              aria-current={i === activo}
              onClick={() => elegir(i)}
            >
              {hechos.has(s.key) ? "✓ " : ""}
              {s.label}
            </button>
          ))}
        </div>
      )}

      {completo && <p className="gym-timer-fin">Series completas.</p>}

      {/* Solo si el navegador puede notificar y aún no se ha decidido. En
          Safari de iOS sin instalar la app, esto no existe y no se pinta. */}
      {permiso === "default" && (
        <button
          type="button"
          className="gym-timer-perm"
          onClick={() => void requestNotifyPermission().then(setPermiso)}
        >
          Activar avisos del sistema
        </button>
      )}
      {!audioSupported() && (
        <p className="gym-timer-fin">Este navegador no reproduce el aviso sonoro.</p>
      )}
    </div>
  );
}
