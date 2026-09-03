import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { createIntensityPlaylist, SpotifyRateLimitError } from "@/lib/spotify";
import type { IntensityLevel } from "@/lib/spotify-intensity";
import type { GarminData, PlanSession } from "@/lib/schemas";

/**
 * Genera (o regenera) la playlist de una sesión, con toast de éxito/error.
 * Compartida por `WeekBlock` (sin override), `SessionDetailModal` y la página
 * Hoy (con override manual de nivel) — antes cada uno mantenía su propia copia.
 */
export function usePlaylistMutation(
  session: PlanSession | undefined,
  key: string,
  garmin?: GarminData,
) {
  return useMutation({
    mutationFn: (levelOverride?: IntensityLevel) =>
      createIntensityPlaylist(session, key, garmin, levelOverride),
    onSuccess: (result) => {
      toast.success(`Playlist creada · ${result.intensityLabel}`, {
        action: { label: "Abrir", onClick: () => window.open(result.externalUrl, "_blank") },
      });
    },
    onError: (e) => {
      if (e instanceof SpotifyRateLimitError) {
        toast.error(`Spotify: demasiadas solicitudes, intenta en ${e.retryAfterSeconds}s`);
      } else {
        toast.error(e instanceof Error ? e.message : "No se pudo crear la playlist");
      }
    },
  });
}
