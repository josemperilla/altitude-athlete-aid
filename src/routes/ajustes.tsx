import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ExternalLink, Loader2, Music, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { disconnectSpotify, prunePastPlaylists, startSpotifyLogin } from "@/lib/spotify";
import { useCreatedPlaylists, useSpotifyConnected } from "@/hooks/use-spotify-store";
import { useUpdatePlan } from "@/hooks/use-update-plan";
import { PageShell } from "@/components/entrenador/PageShell";

export const Route = createFileRoute("/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes · Entrenador" },
      { name: "description", content: "Conexión de Spotify, playlists creadas y plan." },
    ],
  }),
  component: AjustesPage,
});

function AjustesPage() {
  return (
    <PageShell title="Ajustes" subtitle="Spotify · Playlists · Plan">
      <SpotifySection />
      <PlaylistsSection />
      <PlanSection />
    </PageShell>
  );
}

function SpotifySection() {
  const connected = useSpotifyConnected();

  const connect = () =>
    startSpotifyLogin().catch((e) =>
      toast.error(e instanceof Error ? e.message : "No se pudo conectar con Spotify"),
    );

  return (
    <section className="club-card p-5 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Music size={14} style={{ color: "var(--spotify)" }} />
        <h2 className="eyebrow">Spotify</h2>
      </div>
      <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
        La app crea playlists privadas sincronizadas con las fases de cada sesión (calentamiento,
        intervalos, enfriamiento) y las guarda en tu biblioteca. No reproduce música: la abres en
        Spotify.
      </p>
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <span
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: connected ? "var(--spotify)" : "var(--text-muted)" }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: connected ? "var(--spotify)" : "var(--text-faint)" }}
          />
          {connected ? "Conectado" : "No conectado"}
        </span>
        {connected ? (
          <button
            type="button"
            onClick={() => {
              disconnectSpotify();
              toast.success("Spotify desconectado");
            }}
            className="btn-ghost text-xs"
          >
            Desconectar
          </button>
        ) : (
          <button type="button" onClick={connect} className="btn-gold text-xs">
            Conectar con Spotify
          </button>
        )}
      </div>
    </section>
  );
}

function PlaylistsSection() {
  const registry = useCreatedPlaylists();
  const [pruning, setPruning] = useState(false);
  const [prunedMsg, setPrunedMsg] = useState<string | null>(null);

  const entries = Object.entries(registry).sort(([a], [b]) => b.localeCompare(a));

  const prune = async () => {
    setPruning(true);
    try {
      const result = await prunePastPlaylists(new Date());
      setPrunedMsg(
        `${result.removed} retirada${result.removed === 1 ? "" : "s"} de tu biblioteca` +
          (result.kept > 0
            ? ` · ${result.kept} conservada${result.kept === 1 ? "" : "s"} (renombradas)`
            : "") +
          (result.failed > 0 ? ` · ${result.failed} sin retirar` : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron retirar las playlists");
    } finally {
      setPruning(false);
    }
  };

  return (
    <section className="club-card p-5 mt-4">
      <h2 className="eyebrow mb-1">Playlists creadas</h2>
      <p className="text-xs mt-2" style={{ color: "var(--text-faint)" }}>
        Renombrar una playlist en Spotify (quitarle el prefijo «Entrenador ·») es la forma de
        conservarla para siempre.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm mt-3" style={{ color: "var(--text-muted)" }}>
          Todavía no hay playlists registradas.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 mt-3">
          {entries.map(([key, pl]) => (
            <a
              key={key}
              href={pl.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 py-1.5 text-sm rounded transition-colors hover:bg-white/5 px-2 -mx-2"
            >
              <span className="min-w-0 truncate">
                <span className="metric-num text-xs">{key.slice(0, 10)}</span>{" "}
                <span style={{ color: "var(--text)" }}>{key.slice(11)}</span>{" "}
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  · {pl.intensityLabel}
                </span>
              </span>
              <ExternalLink size={13} className="shrink-0" style={{ color: "var(--text-muted)" }} />
            </a>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={prune}
          disabled={pruning || entries.length === 0}
          className="btn-ghost flex items-center gap-2 text-xs"
        >
          {pruning ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Limpiar playlists de semanas pasadas
        </button>
        {prunedMsg && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {prunedMsg}
          </span>
        )}
      </div>
    </section>
  );
}

function PlanSection() {
  const update = useUpdatePlan();

  return (
    <section className="club-card p-5 mt-4">
      <h2 className="eyebrow mb-1">Plan</h2>
      <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
        «Actualizar plan» regenera el plan en el backend con tus últimos datos de Garmin (consume
        una llamada al asistente) y refresca las métricas. Úsalo al empezar la semana o tras cambiar
        algo en Runna.
      </p>
      <button
        type="button"
        onClick={() => update.mutate()}
        disabled={update.isPending}
        className="btn-gold flex items-center gap-2 text-xs mt-4"
      >
        <RefreshCw size={13} className={update.isPending ? "animate-spin" : undefined} />
        {update.isPending ? "Actualizando…" : "Actualizar plan"}
      </button>
    </section>
  );
}
