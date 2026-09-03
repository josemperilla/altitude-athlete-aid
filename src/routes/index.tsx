import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { planQO } from "@/lib/api";
import type { PlanSession, PlanWeek } from "@/lib/schemas";
import { dedupeSessions } from "@/lib/session-dates";
import { deriveSport } from "@/lib/spotify-intensity";
import { PageShell } from "@/components/entrenador/PageShell";
import { QueryState } from "@/components/entrenador/QueryState";
import { WeekBlock } from "@/components/entrenador/WeekBlock";
import { WeeklyPlaylistPanel } from "@/components/entrenador/WeeklyPlaylistPanel";
import { SpotifyIcon } from "@/components/entrenador/SpotifyIcon";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plan · Entrenador" },
      { name: "description", content: "Calendario semanal de sesiones de carrera y ciclismo." },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  const { data, isLoading, error } = useQuery(planQO());
  const [showWeeklyPanel, setShowWeeklyPanel] = useState(false);

  // El plan puede traer la misma sesión más de una vez (ver dedupeSessions).
  // Se unifica aquí, una sola vez, para que el calendario y el panel de
  // playlists partan exactamente de la misma lista.
  const { weeks, runs, bikes } = useMemo(() => {
    const weeks: PlanWeek[] = data?.weeks_plan ?? [];
    // `cycling_sessions` no trae `sport` (solo `type`, p. ej. "ciclorruta_en_plano"):
    // se etiqueta aquí por el arreglo de origen, que es una señal cierta, en vez de
    // dejar que deriveSport lo infiera solo del texto — así una sesión de ciclismo
    // nunca puede caer en "running" por un `type`/`name` que el texto no reconozca.
    const cycling: PlanSession[] = (data?.cycling_sessions ?? []).map((s) => ({
      ...s,
      sport: s.sport ?? "cycling",
    }));
    const all = dedupeSessions(data?.runna_sessions ?? [], cycling);
    return {
      weeks,
      runs: all.filter((s) => deriveSport(s) === "running"),
      bikes: all.filter((s) => deriveSport(s) === "cycling"),
    };
  }, [data]);

  return (
    <PageShell
      title="Plan"
      subtitle="Calendario de sesiones · Runna + Ciclismo"
      actions={
        !isLoading && !error ? (
          <button
            type="button"
            onClick={() => setShowWeeklyPanel((v) => !v)}
            className="btn-gold flex items-center gap-2 mt-1"
          >
            <SpotifyIcon size={14} />
            Generar playlists de esta semana
          </button>
        ) : undefined
      }
    >
      {showWeeklyPanel && (
        <WeeklyPlaylistPanel
          runs={runs}
          bikes={bikes}
          weeks={weeks}
          onClose={() => setShowWeeklyPanel(false)}
        />
      )}
      <QueryState
        isLoading={isLoading}
        error={error}
        isEmpty={weeks.length === 0}
        loadingMessage="Cargando plan…"
        emptyMessage="Sin semanas planificadas todavía. Pulsa “Actualizar plan”."
      >
        <div className="flex flex-col gap-8 mt-6">
          {weeks.map((w, i) => (
            <WeekBlock key={w?.id ?? w?.start ?? i} week={w} runs={runs} bikes={bikes} index={i} />
          ))}
        </div>
      </QueryState>
    </PageShell>
  );
}
