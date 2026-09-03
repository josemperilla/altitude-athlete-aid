// Retiro de playlists de semanas pasadas de la biblioteca de Spotify.

import { spotifyFetch } from "./client";
import { forgetCreatedPlaylists, getPlaylistRegistry } from "./storage";
import type { CreatedPlaylist } from "./storage";

/** Prefijo con el que se nombran las playlists generadas. Renombrarlas es la forma de conservarlas. */
const PLAYLIST_PREFIX = "Entrenador · ";
/** `DELETE /me/library` acepta como máximo 40 URIs por llamada. */
const MAX_LIBRARY_URIS = 40;

export type PruneResult = { removed: number; kept: number; failed: number };

/**
 * Retira de la biblioteca las playlists de sesiones anteriores a `before`.
 *
 * Spotify no tiene borrado de playlists: lo que hace la app cuando pulsas "Delete" sobre
 * una propia es dejar de seguirla, y eso es lo que se hace aquí vía `DELETE /me/library`
 * (el antiguo `DELETE /playlists/{id}/followers` quedó deprecado en la migración de
 * febrero de 2026). La playlist sigue existiendo y su enlace sigue funcionando, así que
 * la operación se deshace volviendo a seguirla.
 *
 * Solo toca playlists del registro propio, y respeta las que el usuario haya renombrado
 * quitándoles el prefijo — esa es la manera de quedarse con una para siempre.
 */
export async function prunePastPlaylists(before: Date): Promise<PruneResult> {
  const cutoff = `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, "0")}-${String(before.getDate()).padStart(2, "0")}`;

  // La clave es `YYYY-MM-DD:nombre`, así que la fecha se compara como texto.
  const past = Object.entries(getPlaylistRegistry() as Record<string, CreatedPlaylist>).filter(
    ([key]) => {
      const date = key.slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < cutoff;
    },
  );
  if (past.length === 0) return { removed: 0, kept: 0, failed: 0 };

  const result: PruneResult = { removed: 0, kept: 0, failed: 0 };
  const toRemove: { key: string; uri: string }[] = [];

  for (const [key, playlist] of past) {
    try {
      const detail = await spotifyFetch<{ name?: string }>(`/playlists/${playlist.playlistId}`);
      if (!String(detail?.name ?? "").startsWith(PLAYLIST_PREFIX)) {
        // Renombrada a propósito: se conserva y se olvida para no volver a mirarla.
        forgetCreatedPlaylists([key]);
        result.kept++;
        continue;
      }
      toRemove.push({ key, uri: `spotify:playlist:${playlist.playlistId}` });
    } catch (e) {
      // Si ya no existe, no hay nada que retirar: se limpia el registro igual.
      if (/→ 404/.test(e instanceof Error ? e.message : String(e))) {
        forgetCreatedPlaylists([key]);
        continue;
      }
      console.warn("[spotify] no se pudo revisar la playlist", key, e);
      result.failed++;
    }
  }

  for (let i = 0; i < toRemove.length; i += MAX_LIBRARY_URIS) {
    const batch = toRemove.slice(i, i + MAX_LIBRARY_URIS);
    try {
      const uris = batch.map((b) => b.uri).join(",");
      await spotifyFetch(`/me/library?uris=${encodeURIComponent(uris)}`, { method: "DELETE" });
      forgetCreatedPlaylists(batch.map((b) => b.key));
      result.removed += batch.length;
    } catch (e) {
      console.warn("[spotify] no se pudieron retirar playlists de la biblioteca", e);
      result.failed += batch.length;
    }
  }

  return result;
}
