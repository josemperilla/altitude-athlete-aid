import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { createIntensityPlaylist, SpotifyRateLimitError } from "@/lib/spotify";
import type { IntensityLevel } from "@/lib/spotify-intensity";

/**
 * Genera (o regenera) la playlist de una sesión, con toast de éxito/error.
 * Compartida por `WeekBlock` (sin override) y `SessionDetailModal` (con
 * override manual de nivel) — antes cada uno mantenía su propia copia idéntica
 * de este mutation.
 */
export function usePlaylistMutation(session: any, key: string, garmin: any) {
  return useMutation({
    mutationFn: (levelOverride?: IntensityLevel) =>
      createIntensityPlaylist(session, key, garmin, levelOverride),
    onSuccess: (result) => {
      toast.success(`Playlist creada · ${result.intensityLabel}`, {
        action: { label: "Abrir", onClick: () => window.open(result.externalUrl, "_blank") },
      });
    },
    onError: (e: any) => {
      if (e instanceof SpotifyRateLimitError) {
        toast.error(`Spotify: demasiadas solicitudes, intenta en ${e.retryAfterSeconds}s`);
      } else {
        toast.error(e?.message ?? "No se pudo crear la playlist");
      }
    },
  });
}
