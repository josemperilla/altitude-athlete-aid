import { useEffect, useSyncExternalStore } from "react";
import {
  getPlaylistRegistry,
  isSpotifyConnected,
  dropTokensWithMissingScopes,
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
  const connected = useSyncExternalStore(subscribeSpotify, isSpotifyConnected, () => false);
  // La limpieza de tokens sin los permisos necesarios vive aquí y no dentro de
  // `isSpotifyConnected`: esa función es el snapshot que React lee durante el
  // render, y escribir en localStorage o notificar suscriptores ahí es un
  // efecto en fase de render.
  useEffect(() => {
    dropTokensWithMissingScopes();
  }, [connected]);
  return connected;
}
