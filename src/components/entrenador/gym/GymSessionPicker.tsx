import { useState } from "react";
import type { GymSession } from "@/lib/api";
import { GymSessionCard } from "./GymSessionCard";

/*
 * Un selector segmentado y la tarjeta que muestra.
 *
 * Está sacado a su propio componente porque la vista monta dos: las sesiones
 * del bloque y las de casa. Más de tres botones en una fila no caben en un
 * celular, y meter las de casa bajo "las sesiones del bloque" sería mentir:
 * no están agendadas y no cuentan para el progreso.
 */
export function GymSessionPicker({
  sessions,
  codes,
}: {
  sessions: Record<string, GymSession>;
  codes: string[];
}) {
  const [active, setActive] = useState(codes[0]);
  const session = sessions[active] ?? sessions[codes[0]];
  if (!session) return null;

  return (
    <>
      <div className="gym-seg" role="tablist">
        {codes.map((code) => {
          const s = sessions[code];
          return (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={code === active}
              onClick={() => setActive(code)}
            >
              {s.label || `Sesión ${code}`}
              <small>{s.title.split(",")[0]}</small>
            </button>
          );
        })}
      </div>
      <GymSessionCard session={session} />
    </>
  );
}
