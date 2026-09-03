import { useSyncExternalStore } from "react";
import {
  getPlaylistRegistry,
  isSpotifyConnected,
  subscribeSpotify,
  type CreatedPlaylist,
} from "@/lib/spotify";

/**
 * Registro de playlists creadas, reactivo. localStorage no notifica cambios;
 * este hook expone el snapshot cacheado del storage y se re-renderiza cuando
 * una creación/poda lo invalida.
 */
export function useCreatedPlaylists(): Record<string, CreatedPlaylist> {
  return useSyncExternalStore(subscribeSpotify, getPlaylistRegistry, getPlaylistRegistry);
}

/** Estado de conexión de Spotify, reactivo a connects/desconexiones/401. */
export function useSpotifyConnected(): boolean {
  return useSyncExternalStore(subscribeSpotify, isSpotifyConnected, () => false);
}
