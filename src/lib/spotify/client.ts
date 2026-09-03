// Cliente HTTP de la Web API de Spotify: wrapper de fetch con manejo de
// errores diagnósticables (401, 429, 403 con hint de scopes) y las dos
// lecturas que usa la curación de playlists (búsqueda y top tracks).

import { disconnectSpotify, getValidAccessToken, readTokens } from "./auth";
import { DEFAULT_TRACK_MS } from "@/lib/playlist-timeline";

const API_BASE = "https://api.spotify.com/v1";

export class SpotifyNotConnectedError extends Error {
  constructor() {
    super("Spotify no está conectado");
    this.name = "SpotifyNotConnectedError";
  }
}

export class SpotifyRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Spotify: demasiadas solicitudes");
    this.name = "SpotifyRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function spotifyFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await getValidAccessToken();
  if (!token) throw new SpotifyNotConnectedError();

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  if (res.status === 401) {
    disconnectSpotify();
    throw new SpotifyNotConnectedError();
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
    throw new SpotifyRateLimitError(retryAfter);
  }
  if (!res.ok) {
    // Spotify explica el motivo real en el cuerpo ("Insufficient client scope",
    // "Invalid limit", …). Sin esto solo queda un código y no hay cómo diagnosticar.
    const detail = await res.text().catch(() => "");
    let message = detail;
    try {
      message = JSON.parse(detail)?.error?.message ?? detail;
    } catch {
      /* el cuerpo no era JSON: se usa tal cual */
    }
    // Un 403 casi siempre es falta de permisos, así que se dice cuáles hay de verdad:
    // adivinarlo desde afuera cuesta una ronda entera de diagnóstico.
    const scopeHint =
      res.status === 403 ? ` · permisos del token: ${readTokens()?.scope || "ninguno"}` : "";
    throw new Error(`Spotify ${path} → ${res.status}${message ? `: ${message}` : ""}${scopeHint}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ── Lecturas para curación ──────────────────────────────────────────────────

/** El atleta está en Bogotá. `/me` no expone el país sin el scope user-read-private. */
const MARKET = "CO";

/**
 * La migración de febrero de 2026 bajó el tope de `limit` de /search de 50 a 10 para las
 * apps en modo desarrollo. Pedir más devuelve 400 "Invalid limit", que no dice nada del
 * verdadero motivo.
 */
const MAX_SEARCH_LIMIT = 10;

/**
 * Pista con su popularidad normalizada (0-1) y su duración real. Como
 * /v1/audio-features está deprecado para apps nuevas, usamos `popularity` como
 * proxy grosero de energía: las pistas más populares tienden a ser más
 * enérgicas, y combinado con el término de búsqueda que las trajo (que ya
 * filtra por mood) basta para ordenar la playlist siguiendo la curva de la
 * sesión. La duración sí viene en /search y /me/top/tracks, y es la que
 * permite sincronizar los bloques de canciones con las fases del entrenamiento.
 */
export type ScoredTrack = { uri: string; popularity: number; durationMs: number };

/** Normaliza la popularidad a 0-1; si falta, asume un valor medio neutro. */
const normPop = (p: number | undefined): number =>
  Number.isFinite(p) && p! >= 0 ? Math.min(1, p! / 100) : 0.5;

/** Duración de la pista; sin duration_ms se asume la media (3.5 min). */
const normDur = (ms: number | undefined): number =>
  Number.isFinite(ms) && ms! > 0 ? ms! : DEFAULT_TRACK_MS;

export async function fetchTopTrackScored(limit = 30): Promise<ScoredTrack[]> {
  const data = await spotifyFetch<{
    items?: { uri: string; popularity?: number; duration_ms?: number }[];
  }>(`/me/top/tracks?limit=${limit}&time_range=medium_term`);
  return (data.items ?? []).map((t) => ({
    uri: t.uri,
    popularity: normPop(t.popularity),
    durationMs: normDur(t.duration_ms),
  }));
}

export async function searchTrackScored(
  term: string,
  limit = MAX_SEARCH_LIMIT,
): Promise<ScoredTrack[]> {
  const capped = Math.min(limit, MAX_SEARCH_LIMIT);
  const data = await spotifyFetch<{
    tracks?: { items?: { uri: string; popularity?: number; duration_ms?: number }[] };
  }>(`/search?type=track&market=${MARKET}&limit=${capped}&q=${encodeURIComponent(term)}`);
  return (data.tracks?.items ?? []).map((t) => ({
    uri: t.uri,
    popularity: normPop(t.popularity),
    durationMs: normDur(t.duration_ms),
  }));
}
