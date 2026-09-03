// Mini-store de notificación para el estado de Spotify en localStorage.
// Los registros (tokens, playlists creadas) viven en localStorage y por
// naturaleza no son reactivos: sin esto, una pantalla de ajustes mostraba un
// snapshot congelado hasta remontar. `useSyncExternalStore` consume esto
// desde src/hooks/use-spotify-store.ts.

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeSpotify(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Avisa a los suscriptores que algo del estado local cambió. */
export function emitSpotifyChange(): void {
  for (const l of listeners) l();
}
