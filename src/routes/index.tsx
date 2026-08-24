import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { planQO } from "@/lib/api";
import { dedupeSessions } from "@/lib/session-dates";
import { deriveSport } from "@/lib/spotify-intensity";
import { PageHeader } from "@/components/entrenador/PageHeader";
import { ERR, MUTED } from "@/lib/theme";
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

  const weeks: any[] = Array.isArray(data?.weeks_plan) ? data!.weeks_plan : [];

  // El plan puede traer la misma sesión más de una vez (ver dedupeSessions).
  // Se unifica aquí, una sola vez, para que el calendario y el panel de
  // playlists partan exactamente de la misma lista. El deporte se decide por el
  // campo `sport`/`type` y no por el arreglo de origen: `runna_sessions`
  // también trae ciclismo.
  const { runs, bikes } = useMemo(() => {
    const all = dedupeSessions(
      Array.isArray(data?.runna_sessions) ? data!.runna_sessions : [],
      Array.isArray(data?.cycling_sessions) ? data!.cycling_sessions : [],
    );
    return {
      runs: all.filter((s) => deriveSport(s) === "running"),
      bikes: all.filter((s) => deriveSport(s) === "cycling"),
    };
  }, [data]);

  return (
    <div className="p-6 md:p-10 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Plan" subtitle="Calendario de sesiones · Runna + Ciclismo" />
        {!isLoading && !error && (
          <button
            type="button"
            onClick={() => setShowWeeklyPanel((v) => !v)}
            className="btn-gold flex items-center gap-2 mt-1"
          >
            <SpotifyIcon size={14} />
            Generar playlists de esta semana
          </button>
        )}
      </div>
      {showWeeklyPanel && (
        <WeeklyPlaylistPanel
          runs={runs}
          bikes={bikes}
          weeks={weeks}
          onClose={() => setShowWeeklyPanel(false)}
        />
      )}
      {isLoading && <SkeletonBlock />}
      {error && <ErrorBlock message={(error as Error).message} />}
      {!isLoading && !error && weeks.length === 0 && (
        <EmptyBlock message="Sin semanas planificadas todavía. Pulsa “Actualizar plan”." />
      )}
      <div className="flex flex-col gap-8 mt-6">
        {weeks.map((w, i) => (
          <WeekBlock
            key={w?.id ?? w?.week_start ?? i}
            week={w}
            runs={runs}
            bikes={bikes}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="club-card p-8 mt-6 text-center" style={{ color: MUTED }}>
      Cargando plan…
    </div>
  );
}
function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="club-card p-6 mt-6" style={{ borderLeft: "3px solid #EF4444" }}>
      <div style={{ color: ERR, fontWeight: 700 }}>No se pudo cargar el plan</div>
      <div className="text-sm mt-1" style={{ color: MUTED }}>
        {message}
      </div>
    </div>
  );
}
function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="club-card p-8 mt-6 text-center" style={{ color: MUTED }}>
      {message}
    </div>
  );
}
