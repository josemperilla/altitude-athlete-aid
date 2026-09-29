import { ArrowLeftRight, TriangleAlert } from "lucide-react";
import type { PlanSession, SessionAdjustment } from "@/lib/schemas";

/**
 * Ciclismo que va el mismo día que un rodaje fácil de Runna, como opción: el
 * rodaje sigue en el plan y el atleta elige cuál de los dos hace.
 */
export function AlternativeTag({
  session,
  long = false,
}: {
  session: PlanSession;
  long?: boolean;
}) {
  if (!session?.alternative_to_easy_run) return null;
  return (
    <div className="mt-1 flex items-start gap-1 text-[10px] font-semibold text-bike">
      <ArrowLeftRight size={11} className="shrink-0 mt-px" />
      <span>
        {long
          ? `Alternativa a ${session.alternative_to ?? "el rodaje de Runna"}: haz uno de los dos.`
          : "O el rodaje · tú eliges"}
      </span>
    </div>
  );
}

// Los ajustes son sugerencias sobre una carrera de Runna: Runna no se entera.
// El atleta decide si lo cambia en Runna o si corre directamente esta versión.

const VERDICT_LABEL: Record<string, string> = {
  ajustar: "Ajuste sugerido",
  cambiar_a_facil: "Cambiar a rodaje fácil",
};

const label = (a: SessionAdjustment) => VERDICT_LABEL[a.verdict ?? ""] ?? "Ajuste sugerido";

/** Marca compacta para las tarjetas de la semana. */
export function AdjustmentBadge({ adjustment }: { adjustment: SessionAdjustment }) {
  return (
    <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-warn">
      <TriangleAlert size={11} className="shrink-0" />
      {label(adjustment)}
    </div>
  );
}

/** El ajuste completo: qué cambiar y por qué. */
export function AdjustmentNote({
  adjustment,
  compact = false,
}: {
  adjustment: SessionAdjustment;
  compact?: boolean;
}) {
  return (
    <div className="rounded px-3 py-2.5 bg-warn/10" style={{ borderLeft: "3px solid var(--warn)" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase text-warn">
        <TriangleAlert size={12} className="shrink-0" />
        {label(adjustment)}
      </div>
      <p className="text-sm mt-1.5 leading-relaxed text-fg">{adjustment.change}</p>
      {!compact && adjustment.rationale && (
        <p className="text-xs mt-1.5 leading-relaxed text-muted">{adjustment.rationale}</p>
      )}
      {!compact && (
        <p className="text-[11px] mt-2 text-faint">
          {adjustment.source === "regla"
            ? "Regla automática de sesión pico. "
            : "Revisión semanal contra la evidencia y tus señales de Garmin. "}
          Runna no lo sabe: cámbialo allá o corre esta versión.
        </p>
      )}
    </div>
  );
}
