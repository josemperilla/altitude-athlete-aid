import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  deriveIntensity,
  LABEL,
  type IntensityLevel,
  type SessionIntensity,
} from "@/lib/spotify-intensity";
import { sessionKey } from "@/lib/session-dates";
import { mmss } from "@/lib/workout-steps";
import { getCreatedPlaylist, isSpotifyConnected, startSpotifyLogin } from "@/lib/spotify";
import { usePlaylistMutation } from "@/hooks/use-playlist-mutation";
import type { GarminData, PlanSession } from "@/lib/schemas";
import { SpotifyIcon } from "./SpotifyIcon";

const INTENSITY_COLOR: Record<IntensityLevel, string> = {
  baja: "var(--bike)",
  moderada: "var(--warn)",
  alta: "var(--err)",
};
const INTENSITY_LEVELS: IntensityLevel[] = ["baja", "moderada", "alta"];

/**
 * Genera la playlist de una sesión permitiendo forzar un nivel de intensidad
 * distinto del inferido. Lo usa el modal de detalle (completo) y la página
 * Hoy (compacto: sin selector ni explicación — eso queda en el modal).
 */
export function PlaylistControl({
  session,
  garmin,
  compact = false,
}: {
  session: PlanSession | undefined;
  garmin?: GarminData;
  compact?: boolean;
}) {
  const base: SessionIntensity = deriveIntensity(session);
  const key = sessionKey(session);
  const [level, setLevel] = useState<IntensityLevel | null>(null);
  const selected = level ?? base.level;

  const mut = usePlaylistMutation(session, key, garmin);

  const existing = getCreatedPlaylist(key);
  const created = mut.data ?? existing;

  const generate = () => {
    if (!isSpotifyConnected()) {
      startSpotifyLogin().catch((e) =>
        toast.error(e instanceof Error ? e.message : "No se pudo conectar con Spotify"),
      );
      return;
    }
    mut.mutate(level ?? undefined);
  };

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <>
          <div className="flex gap-1.5">
            {INTENSITY_LEVELS.map((l) => {
              const active = selected === l;
              const color = INTENSITY_COLOR[l];
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel((prev) => (prev === l ? null : l))}
                  className="flex-1 px-2 py-1.5 rounded text-[11px] transition-colors"
                  style={{
                    background: active
                      ? `color-mix(in srgb, ${color} 13%, transparent)`
                      : "var(--surface)",
                    color: active ? color : "var(--text-muted)",
                    border: `1px solid ${active ? color : "var(--border)"}`,
                    fontWeight: 600,
                  }}
                >
                  {LABEL[l]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            {level
              ? level === base.level
                ? "Nivel inferido por la sesión."
                : `Nivel manual: ${LABEL[level].toLowerCase()}.`
              : `Intensidad inferida: ${base.label.toLowerCase()}.`}
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={mut.isPending}
          className="btn-gold text-[11px] px-3 py-2"
        >
          {mut.isPending ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Creando…
            </span>
          ) : created ? (
            "Regenerar playlist"
          ) : (
            <span className="flex items-center gap-1.5">
              <SpotifyIcon size={12} /> Generar playlist
            </span>
          )}
        </button>
        {created && (
          <a
            href={created.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px]"
            style={{ color: "var(--spotify)", fontWeight: 600 }}
          >
            <Check size={12} /> Abrir en Spotify
          </a>
        )}
      </div>

      {created?.timeline && created.timeline.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {created.timeline.map((phase, i) => (
            <span
              key={i}
              className="px-2 py-1 rounded text-[11px]"
              style={{
                background: `color-mix(in srgb, ${INTENSITY_COLOR[phase.band]} 10%, transparent)`,
                color: INTENSITY_COLOR[phase.band],
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              {mmss(phase.startSec)} · {phase.label} · {phase.tracks}
              {Math.abs(phase.errorSec) > 45 &&
                ` (${phase.errorSec > 0 ? "+" : ""}${phase.errorSec}s)`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
