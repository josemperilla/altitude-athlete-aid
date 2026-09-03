import type { GymSession } from "@/lib/api";

/*
 * Una fila de botones para elegir sesión. Controlada desde fuera.
 *
 * Tuvo su propio estado y su propia tarjeta debajo. El resultado: las sesiones
 * de casa quedaban a 4.800 px de scroll, detrás de la tarjeta entera de la
 * Sesión A, y no existían para quien no bajara seis pantallas. Ahora la vista
 * monta las dos filas juntas arriba y una sola tarjeta debajo.
 *
 * Sigue habiendo dos filas y no una de cinco botones: cinco no caben en 390 px,
 * y meter las de casa entre las del bloque sería mentir — no están agendadas y
 * no cuentan para el progreso.
 */
export function GymSessionPicker({
  sessions,
  codes,
  active,
  onSelect,
}: {
  sessions: Record<string, GymSession>;
  codes: string[];
  active: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="gym-seg" role="tablist">
      {codes.map((code) => {
        const s = sessions[code];
        return (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={code === active}
            onClick={() => onSelect(code)}
          >
            {s.label || `Sesión ${code}`}
            <small>{s.title.split(",")[0]}</small>
          </button>
        );
      })}
    </div>
  );
}
