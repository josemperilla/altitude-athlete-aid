import { useSyncExternalStore } from "react";
import {
  getPlaylistRegistry,
  isSpotifyConnected,
  subscribeSpotify,
  type CreatedPlaylist,
} from "@/lib/spotify";

// El snapshot del servidor tiene que ser una referencia estable: React compara
// por identidad y un objeto nuevo por render provocaría un bucle.
const EMPTY_REGISTRY: Record<string, CreatedPlaylist> = Object.freeze({});

/**
 * Registro de playlists creadas, reactivo. localStorage no notifica cambios;
 * este hook expone el snapshot cacheado del storage y se re-renderiza cuando
 * una creación/poda lo invalida.
 *
 * En el servidor devuelve el registro vacío: `getPlaylistRegistry` toca
 * localStorage, que no existe en Node, y usarlo como snapshot de servidor
 * tumbaba el render SSR de /ajustes en cada petición.
 */
export function useCreatedPlaylists(): Record<string, CreatedPlaylist> {
  return useSyncExternalStore(subscribeSpotify, getPlaylistRegistry, () => EMPTY_REGISTRY);
}

/** Estado de conexión de Spotify, reactivo a connects/desconexiones/401. */
export function useSpotifyConnected(): boolean {
  return useSyncExternalStore(subscribeSpotify, isSpotifyConnected, () => false);
}
