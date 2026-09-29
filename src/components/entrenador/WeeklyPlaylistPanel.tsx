import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { SpotifyIcon } from "@/components/entrenador/SpotifyIcon";
import {
  createIntensityPlaylist,
  disconnectSpotify,
  getCreatedPlaylist,
  isSpotifyConnected,
  prunePastPlaylists,
  startSpotifyLogin,
  SpotifyNotConnectedError,
  SpotifyRateLimitError,
  type CreatedPlaylist,
  type PruneResult,
} from "@/lib/spotify";
import { garminQO } from "@/lib/api";
import type { GarminData } from "@/lib/schemas";
import type { PlanSession, PlanWeek } from "@/lib/schemas";
import {
  sessionKey,
  currentPlanWeekRange,
  inRange,
  sessionDate,
  dedupeSessions,
} from "@/lib/session-dates";
import { deriveSport } from "@/lib/spotify-intensity";

type Row = {
  key: string;
  session: PlanSession;
  label: string;
  status: "pending" | "creating" | "done" | "error" | "already";
  result?: CreatedPlaylist;
  errorMessage?: string;
};

function toRows(
  runs: PlanSession[],
  bikes: PlanSession[],
  range: { start: Date; end: Date },
): Row[] {
  const { start, end } = range;
  return dedupeSessions(runs, bikes)
    .filter((s) => {
      const d = sessionDate(s);
      return d && inRange(d, start, end);
    })
    .sort((a, b) => (sessionDate(a)?.getTime() ?? 0) - (sessionDate(b)?.getTime() ?? 0))
    .map((session) => {
      const key = sessionKey(session);
      const existing = getCreatedPlaylist(key);
      const fallback = deriveSport(session) === "cycling" ? "Ciclismo" : "Carrera";
      return {
        key,
        session,
        label: String(session?.name ?? fallback),
        status: existing ? "already" : "pending",
        result: existing ?? undefined,
      } as Row;
    });
}

export function WeeklyPlaylistPanel({
  runs,
  bikes,
  weeks,
  onClose,
}: {
  runs: PlanSession[];
  bikes: PlanSession[];
  weeks: PlanWeek[];
  onClose: () => void;
}) {
  // `weeks` es `weeks_plan` del backend: la semana que se muestra en el
  // calendario manda sobre cualquier convención de semana calculada aquí.
  const weekRange = useMemo(() => currentPlanWeekRange(weeks), [weeks]);
  const [rows, setRows] = useState<Row[]>(() => toRows(runs, bikes, weekRange));
  const [running, setRunning] = useState(false);
  const [pruned, setPruned] = useState<PruneResult | null>(null);
  // Garantimos que el ajuste por fatiga (#8) tenga los datos de Garmin.
  const queryClient = useQueryClient();
  const garmin = queryClient.getQueryData<GarminData>(garminQO().queryKey) ?? undefined;

  // Si el plan cambia mientras el panel sigue abierto (p. ej. el usuario pulsa
  // "Actualizar plan" sin cerrarlo), las filas quedaban congeladas con la
  // lista vieja de sesiones. Se resincroniza aquí, salvo mientras hay una
  // generación en curso, para no cortarla a medio camino.
  useEffect(() => {
    if (running) return;
    setRows(toRows(runs, bikes, weekRange));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, bikes, weekRange]);

  // startSpotifyLogin es async: sin este catch, un fallo de configuración
  // (Client ID ausente) deja el botón sin hacer absolutamente nada.
  const connect = () =>
    startSpotifyLogin().catch((e) =>
      toast.error(e instanceof Error ? e.message : "No se pudo conectar con Spotify"),
    );

  const runSequentially = async (targets: Row[]) => {
    setRunning(true);
    for (const row of targets) {
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: "creating" } : r)));
      try {
        const result = await createIntensityPlaylist(row.session, row.key, garmin);
        setRows((prev) =>
          prev.map((r) => (r.key === row.key ? { ...r, status: "done", result } : r)),
        );
      } catch (e) {
        if (e instanceof SpotifyNotConnectedError) {
          setRows((prev) =>
            prev.map((r) =>
              r.status === "pending" || r.status === "creating"
                ? { ...r, status: "error", errorMessage: "Spotify desconectado" }
                : r,
            ),
          );
          setRunning(false);
          connect();
          return;
        }
        const errorMessage =
          e instanceof SpotifyRateLimitError
            ? `Límite de Spotify, intenta en ${e.retryAfterSeconds}s`
            : e instanceof Error
              ? e.message
              : "Error al crear la playlist";
        setRows((prev) =>
          prev.map((r) => (r.key === row.key ? { ...r, status: "error", errorMessage } : r)),
        );
      }
    }
    setRunning(false);
  };

  const start = async () => {
    if (!isSpotifyConnected()) {
      connect();
      return;
    }
    // Limpiar es secundario: si falla, la generación sigue igual.
    try {
      const result = await prunePastPlaylists(new Date());
      setPruned(result);
    } catch (e) {
      console.warn("[spotify] no se pudieron retirar las playlists pasadas", e);
    }
    runSequentially(rows.filter((r) => r.status === "pending"));
  };

  const retryOne = (key: string) => {
    // Mismo control que `start`: sin esto se reintenta con un token sin permisos y
    // nunca se dispara la reconexión, porque tras un fallo el botón principal
    // desaparece (ya no quedan filas pendientes) y solo queda "reintentar".
    if (!isSpotifyConnected()) {
      connect();
      return;
    }
    const row = rows.find((r) => r.key === key);
    if (row) runSequentially([row]);
  };

  const retryAll = () => {
    if (!isSpotifyConnected()) {
      connect();
      return;
    }
    const failed = rows.filter((r) => r.status === "error");
    setRows((prev) =>
      prev.map((r) =>
        r.status === "error" ? { ...r, status: "pending", errorMessage: undefined } : r,
      ),
    );
    runSequentially(failed);
  };

  const { start: weekStart, end: weekEnd } = weekRange;
  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const doneCount = rows.filter((r) => r.status === "done").length;
  const alreadyCount = rows.filter((r) => r.status === "already").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return (
    <div className="club-card p-5 mt-4" style={{ borderLeft: "3px solid var(--gold)" }}>
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm flex items-center gap-2"
          style={{
            color: "var(--gold)",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <SpotifyIcon size={16} />
          Playlists de esta semana
        </h3>
        <button type="button" onClick={onClose} className="text-muted" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted">
          No hay sesiones entre el {fmtDay(weekStart)} y el {fmtDay(weekEnd)}.
        </p>
      )}

      {pruned && pruned.removed > 0 && (
        <p className="text-[11px] mb-3 text-muted">
          {pruned.removed} playlist{pruned.removed === 1 ? "" : "s"} de semanas pasadas retirada
          {pruned.removed === 1 ? "" : "s"} de tu biblioteca
          {pruned.kept > 0 &&
            ` · ${pruned.kept} conservada${pruned.kept === 1 ? "" : "s"} por estar renombrada${pruned.kept === 1 ? "" : "s"}`}
          {pruned.failed > 0 && ` · ${pruned.failed} sin retirar`}. Siguen existiendo en Spotify: se
          recuperan abriendo su enlace y volviendo a seguirlas.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-col gap-2 mb-4">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex flex-col gap-1 py-1.5"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="text-fg">{row.label}</span>
                  <RowStatus row={row} onRetry={() => retryOne(row.key)} />
                </div>
                {row.errorMessage && (
                  <p className="text-[11px] break-words" style={{ color: "var(--err)" }}>
                    {row.errorMessage}
                  </p>
                )}
              </div>
            ))}
          </div>

          {!running && pendingCount > 0 && (
            <button type="button" onClick={start} className="btn-gold">
              Generar {pendingCount} playlist{pendingCount === 1 ? "" : "s"}
            </button>
          )}

          {running && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Generando…
            </div>
          )}

          {!running && pendingCount === 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-muted">
                {doneCount} creadas · {alreadyCount} ya existían
                {errorCount > 0 ? ` · ${errorCount} con error` : ""}
              </p>
              {errorCount > 0 && (
                <button type="button" onClick={retryAll} className="btn-gold">
                  Reintentar {errorCount}
                </button>
              )}
              {errorCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    disconnectSpotify();
                    connect();
                  }}
                  className="text-xs underline text-muted"
                >
                  Reconectar Spotify
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RowStatus({ row, onRetry }: { row: Row; onRetry: () => void }) {
  if (row.status === "already" || row.status === "done") {
    return (
      <button
        type="button"
        onClick={() => row.result && window.open(row.result.externalUrl, "_blank")}
        className="flex items-center gap-1 text-[11px] text-muted"
      >
        <Check size={12} /> {row.status === "already" ? "Ya generada" : "Lista"}
      </button>
    );
  }
  if (row.status === "creating") {
    return (
      <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--gold)" }}>
        <Loader2 size={12} className="animate-spin" /> Creando…
      </span>
    );
  }
  if (row.status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 text-[11px]"
        style={{ color: "var(--err)" }}
        title={row.errorMessage}
      >
        Error · reintentar
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
      <SpotifyIcon size={12} /> Pendiente
    </span>
  );
}

const fmtDay = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
