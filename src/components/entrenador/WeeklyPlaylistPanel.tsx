import { useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { SpotifyIcon } from "@/components/entrenador/SpotifyIcon";
import {
  createIntensityPlaylist,
  getCreatedPlaylist,
  isSpotifyConnected,
  startSpotifyLogin,
  SpotifyNotConnectedError,
  SpotifyRateLimitError,
  type CreatedPlaylist,
} from "@/lib/spotify";
import { sessionKey, thisWeekRange, inRange, sessionDate } from "@/lib/session-dates";

type Row = {
  key: string;
  session: any;
  kind: "run" | "bike";
  label: string;
  status: "pending" | "creating" | "done" | "error" | "already";
  result?: CreatedPlaylist;
  errorMessage?: string;
};

function toRows(runs: any[], bikes: any[]): Row[] {
  const { start, end } = thisWeekRange();
  const build = (items: any[], kind: "run" | "bike"): Row[] =>
    items
      .filter((s) => {
        const d = sessionDate(s);
        return d && inRange(d, start, end);
      })
      .map((session) => {
        const key = sessionKey(session, kind);
        const existing = getCreatedPlaylist(key);
        const label = session?.name ?? (kind === "run" ? "Carrera" : "Ciclismo");
        return {
          key,
          session,
          kind,
          label: String(label),
          status: existing ? "already" : "pending",
          result: existing ?? undefined,
        } as Row;
      });
  return [...build(runs, "run"), ...build(bikes, "bike")];
}

export function WeeklyPlaylistPanel({
  runs,
  bikes,
  onClose,
}: {
  runs: any[];
  bikes: any[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(runs, bikes));
  const [running, setRunning] = useState(false);

  const runSequentially = async (targets: Row[]) => {
    setRunning(true);
    for (const row of targets) {
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: "creating" } : r)));
      try {
        const result = await createIntensityPlaylist(row.session, row.key);
        setRows((prev) =>
          prev.map((r) => (r.key === row.key ? { ...r, status: "done", result } : r)),
        );
      } catch (e: any) {
        if (e instanceof SpotifyNotConnectedError) {
          setRows((prev) =>
            prev.map((r) =>
              r.status === "pending" || r.status === "creating"
                ? { ...r, status: "error", errorMessage: "Spotify desconectado" }
                : r,
            ),
          );
          setRunning(false);
          startSpotifyLogin();
          return;
        }
        const errorMessage =
          e instanceof SpotifyRateLimitError
            ? `Límite de Spotify, intenta en ${e.retryAfterSeconds}s`
            : (e?.message ?? "Error al crear la playlist");
        setRows((prev) =>
          prev.map((r) => (r.key === row.key ? { ...r, status: "error", errorMessage } : r)),
        );
      }
    }
    setRunning(false);
  };

  const start = () => {
    if (!isSpotifyConnected()) {
      startSpotifyLogin();
      return;
    }
    runSequentially(rows.filter((r) => r.status === "pending"));
  };

  const retryOne = (key: string) => {
    const row = rows.find((r) => r.key === key);
    if (row) runSequentially([row]);
  };

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const doneCount = rows.filter((r) => r.status === "done").length;
  const alreadyCount = rows.filter((r) => r.status === "already").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return (
    <div className="club-card p-5 mt-4" style={{ borderLeft: "3px solid #E9CEA9" }}>
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-sm flex items-center gap-2"
          style={{
            color: "#E9CEA9",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <SpotifyIcon size={16} />
          Playlists de esta semana
        </h3>
        <button type="button" onClick={onClose} style={{ color: "#9A9A9A" }} aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>

      {rows.length === 0 && (
        <p className="text-sm" style={{ color: "#9A9A9A" }}>
          No hay sesiones esta semana.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-col gap-2 mb-4">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between text-sm py-1.5"
                style={{ borderBottom: "1px solid rgba(233,206,169,0.08)" }}
              >
                <span style={{ color: "#fff" }}>{row.label}</span>
                <RowStatus row={row} onRetry={() => retryOne(row.key)} />
              </div>
            ))}
          </div>

          {!running && pendingCount > 0 && (
            <button type="button" onClick={start} className="btn-gold">
              Generar {pendingCount} playlist{pendingCount === 1 ? "" : "s"}
            </button>
          )}

          {running && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "#9A9A9A" }}>
              <Loader2 size={14} className="animate-spin" /> Generando…
            </div>
          )}

          {!running && pendingCount === 0 && (
            <p className="text-xs" style={{ color: "#9A9A9A" }}>
              {doneCount} creadas · {alreadyCount} ya existían
              {errorCount > 0 ? ` · ${errorCount} con error` : ""}
            </p>
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
        className="flex items-center gap-1 text-[11px]"
        style={{ color: "#9A9A9A" }}
      >
        <Check size={12} /> {row.status === "already" ? "Ya generada" : "Lista"}
      </button>
    );
  }
  if (row.status === "creating") {
    return (
      <span className="flex items-center gap-1 text-[11px]" style={{ color: "#E9CEA9" }}>
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
        style={{ color: "#EF4444" }}
        title={row.errorMessage}
      >
        Error · reintentar
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px]" style={{ color: "#555" }}>
      <SpotifyIcon size={12} /> Pendiente
    </span>
  );
}
