// Estado local de Spotify en localStorage: el registro de playlists creadas
// por sesión y la ventana de anti-repetición de canciones. El registro expone
// un snapshot cacheado y estable para `useSyncExternalStore` (que exige la
// misma referencia entre renders si nada cambió).

import type { IntensityLevel } from "@/lib/spotify-intensity";
import { emitSpotifyChange } from "./store";

/** Bloque sincronizado con una fase, para previsualizar la línea de tiempo. */
export type PlaylistPhase = {
  label: string;
  /** Banda de energía del bloque, para colorear la previsualización. */
  band: IntensityLevel;
  /** Segundo en que arranca el bloque al reproducir la playlist. */
  startSec: number;
  tracks: number;
  /** Desfase del bloque frente a la duración de su fase, en segundos. */
  errorSec: number;
};

export type CreatedPlaylist = {
  playlistId: string;
  externalUrl: string;
  intensityLabel: string;
  timeline?: PlaylistPhase[];
};

const SESSION_PLAYLISTS_KEY = "spotify_session_playlists";

function readSessionPlaylists(): Record<string, CreatedPlaylist> {
  const raw = localStorage.getItem(SESSION_PLAYLISTS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, CreatedPlaylist>;
  } catch {
    return {};
  }
}

// Snapshot cacheado: `useSyncExternalStore` compara referencias entre renders;
// devolver un objeto nuevo cada vez provocaría un bucle de renderizado.
let registrySnapshot: Record<string, CreatedPlaylist> | null = null;

/** Registro completo de playlists creadas, con referencia estable entre llamadas. */
export function getPlaylistRegistry(): Record<string, CreatedPlaylist> {
  if (!registrySnapshot) registrySnapshot = readSessionPlaylists();
  return registrySnapshot;
}

function writeRegistry(all: Record<string, CreatedPlaylist>): void {
  registrySnapshot = all;
  localStorage.setItem(SESSION_PLAYLISTS_KEY, JSON.stringify(all));
  emitSpotifyChange();
}

export function getCreatedPlaylist(sessionKey: string): CreatedPlaylist | null {
  return getPlaylistRegistry()[sessionKey] ?? null;
}

export function recordCreatedPlaylist(sessionKey: string, playlist: CreatedPlaylist): void {
  const all = { ...getPlaylistRegistry() };
  all[sessionKey] = playlist;
  writeRegistry(all);
}

export function forgetCreatedPlaylists(sessionKeys: string[]): void {
  const all = { ...getPlaylistRegistry() };
  let changed = false;
  for (const key of sessionKeys) {
    if (key in all) {
      delete all[key];
      changed = true;
    }
  }
  if (changed) writeRegistry(all);
}

// ── Anti-repetición entre semanas ───────────────────────────────────────────

/** Ventana de anti-repetición: URIs usados en los últimos 60 días se penalizan. */
const RECENT_WINDOW_DAYS = 60;
const RECENT_URIS_KEY = "spotify_recent_uris";

type RecentMap = Record<string, number>; // uri → timestamp (ms)

function readRecentUris(): RecentMap {
  const raw = localStorage.getItem(RECENT_URIS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RecentMap;
  } catch {
    return {};
  }
}

/** Devuelve el conjunto de URIs usados en los últimos RECENT_WINDOW_DAYS días. */
export function recentlyUsedUris(): Set<string> {
  const map = readRecentUris();
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * 86_400_000;
  const out = new Set<string>();
  for (const [uri, ts] of Object.entries(map)) {
    if (ts >= cutoff) out.add(uri);
  }
  return out;
}

/** Registra los URIs de una playlist recién creada, podando los viejos. */
export function recordUsedUris(uris: string[]): void {
  if (uris.length === 0) return;
  const map = readRecentUris();
  const now = Date.now();
  const cutoff = now - RECENT_WINDOW_DAYS * 86_400_000;
  // Poda: borra entradas fuera de ventana antes de añadir las nuevas.
  for (const [uri, ts] of Object.entries(map)) {
    if (ts < cutoff) delete map[uri];
  }
  for (const uri of uris) map[uri] = now;
  try {
    localStorage.setItem(RECENT_URIS_KEY, JSON.stringify(map));
  } catch {
    // Si localStorage está lleno, podamos más agresivo y reintentamos una vez.
    // El reintento también va protegido: la ventana de anti-repetición es un
    // lujo, y perderla nunca puede tumbar la creación de la playlist, que ya
    // existe en Spotify para cuando esto corre. Sin el guard, la excepción
    // subía y la playlist se quedaba sin registrar: al reintentar salían
    // duplicadas.
    try {
      const kept = Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2000);
      localStorage.setItem(RECENT_URIS_KEY, JSON.stringify(Object.fromEntries(kept)));
    } catch {
      console.warn("[spotify] sin espacio en localStorage: se pierde la ventana anti-repetición");
    }
  }
}
