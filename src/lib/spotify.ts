import {
  buildSessionPhases,
  deriveIntensity,
  withLevel,
  type IntensityLevel,
  type SessionIntensity,
  type SessionPhase,
} from "@/lib/spotify-intensity";
import { applyFatigue } from "@/lib/apply-fatigue";

const AUTH_BASE = "https://accounts.spotify.com";
const API_BASE = "https://api.spotify.com/v1";
// `user-library-modify` y `user-follow-modify` son para `DELETE /me/library`, que es
// como se retiran las playlists pasadas. La documentación no aclara cuál de los tres
// aplica a playlists en concreto — el endpoint es genérico — así que se piden todos.
const SCOPES =
  "playlist-modify-private playlist-modify-public user-top-read " +
  "user-library-modify user-follow-modify";
/** Sin este permiso no se puede retirar nada de la biblioteca. */
const REQUIRED_SCOPES = ["playlist-modify-private", "user-library-modify"];
const VERIFIER_KEY = "spotify_pkce_verifier";
const TOKENS_KEY = "spotify_tokens";

type StoredTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  /** Permisos que Spotify concedió de verdad, no los que se pidieron. */
  scope?: string;
};

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

function clientId(): string {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!id) {
    throw new Error(
      "Falta VITE_SPOTIFY_CLIENT_ID en el .env. Crea la app en developer.spotify.com, " +
        "pega el Client ID y reinicia el servidor de desarrollo.",
    );
  }
  return id;
}

function redirectUri(): string {
  return import.meta.env.VITE_SPOTIFY_REDIRECT_URI || `${window.location.origin}/spotify-callback`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, 128);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function startSpotifyLogin(): Promise<void> {
  const verifier = generateCodeVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await generateCodeChallenge(verifier);

  // No se usa URLSearchParams: codifica los espacios como "+", y Spotify lee el scope
  // literal, así que los tres permisos llegan como uno solo inventado y no concede
  // ninguno. El síntoma es 403 al crear la playlist mientras /me y /search funcionan.
  const params = [
    ["response_type", "code"],
    ["client_id", clientId()],
    ["scope", SCOPES],
    ["redirect_uri", redirectUri()],
    ["code_challenge_method", "S256"],
    ["code_challenge", challenge],
  ]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  window.location.assign(`${AUTH_BASE}/authorize?${params}`);
}

function storeTokens(data: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}) {
  const prev = readTokens();
  const tokens: StoredTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? prev?.refresh_token ?? "",
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? prev?.scope,
  };
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

function readTokens(): StoredTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

export async function completeSpotifyLogin(code: string): Promise<void> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Falta el verificador PKCE; intenta conectar de nuevo");

  const res = await fetch(`${AUTH_BASE}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: clientId(),
      code_verifier: verifier,
    }),
  });
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!res.ok) throw new Error(`No se pudo completar la conexión con Spotify (${res.status})`);
  storeTokens(await res.json());
}

async function refreshAccessToken(refresh_token: string): Promise<StoredTokens | null> {
  const res = await fetch(`${AUTH_BASE}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
      client_id: clientId(),
    }),
  });
  if (!res.ok) return null;
  storeTokens(await res.json());
  return readTokens();
}

/**
 * Se considera conectado solo si además hay permiso para crear playlists. Un token sin
 * `scope` registrado viene de antes de que se guardaran, así que se descarta: es más
 * barato pedir el consentimiento otra vez que fallar con un 403 al final de todo.
 */
export function isSpotifyConnected(): boolean {
  const tokens = readTokens();
  if (!tokens) return false;

  const granted = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
  if (!REQUIRED_SCOPES.every((s) => granted.includes(s))) {
    disconnectSpotify();
    return false;
  }
  return true;
}

export function disconnectSpotify(): void {
  localStorage.removeItem(TOKENS_KEY);
}

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

export function getCreatedPlaylist(sessionKey: string): CreatedPlaylist | null {
  return readSessionPlaylists()[sessionKey] ?? null;
}

export function recordCreatedPlaylist(sessionKey: string, playlist: CreatedPlaylist): void {
  const all = readSessionPlaylists();
  all[sessionKey] = playlist;
  localStorage.setItem(SESSION_PLAYLISTS_KEY, JSON.stringify(all));
}

function forgetCreatedPlaylists(sessionKeys: string[]): void {
  const all = readSessionPlaylists();
  for (const key of sessionKeys) delete all[key];
  localStorage.setItem(SESSION_PLAYLISTS_KEY, JSON.stringify(all));
}

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
  const past = Object.entries(readSessionPlaylists()).filter(([key]) => {
    const date = key.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < cutoff;
  });
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
    } catch (e: any) {
      // Si ya no existe, no hay nada que retirar: se limpia el registro igual.
      if (/→ 404/.test(String(e?.message))) {
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

/**
 * Refresco en vuelo, compartido. `buildTrackPool` dispara ~8 llamadas en paralelo, y
 * Spotify rota el refresh token en cada uso: sin esto, la primera lo consume y las
 * demás fallan con un token ya inválido, tumbando la sesión a mitad de la generación.
 */
let refreshInFlight: Promise<StoredTokens | null> | null = null;

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - 60_000) return tokens.access_token;
  if (!tokens.refresh_token) return null;

  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(tokens.refresh_token).finally(() => {
      refreshInFlight = null;
    });
  }
  const refreshed = await refreshInFlight;
  return refreshed?.access_token ?? null;
}

async function spotifyFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
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

/** El atleta está en Bogotá. `/me` no expone el país sin el scope user-read-private. */
const MARKET = "CO";
/** Duración promedio de una canción, para calcular cuántas caben en la sesión. */
const MINUTES_PER_TRACK = 3.5;
const MIN_TRACKS = 8;
const MAX_TRACKS = 60;
/** Techo del gusto personal: el resto de la playlist lo manda la intensidad. */
const PERSONAL_SHARE = 0.3;

/**
 * Que falle una fuente no puede tumbar la playlist entera, pero tampoco puede
 * desaparecer sin dejar rastro: el motivo se guarda para poder reportarlo si al final
 * no quedó ninguna canción. Devuelve [] si la fuente falla.
 */
async function safeArray<T>(
  context: string,
  run: () => Promise<T[]>,
  failures: string[],
): Promise<T[]> {
  try {
    return await run();
  } catch (e: any) {
    const reason = `${context} → ${e?.message ?? e}`;
    console.warn("[spotify]", reason);
    failures.push(reason);
    return [];
  }
}

/**
 * Pista con su popularidad (0-100). Como /v1/audio-features está deprecado para
 * apps nuevas, usamos `popularity` como proxy grosero de energía: las pistas
 * más populares tienden a ser más enérgicas, y combinado con el término de
 * búsqueda que las trajo (que ya filtra por mood) basta para ordenar la
 * playlist siguiendo la curva de la sesión.
 */
type ScoredTrack = { uri: string; popularity: number };

/**normaliza la popularidad a 0-1; si falta, asume un valor medio neutro. */
const normPop = (p: number | undefined): number =>
  Number.isFinite(p) && p! >= 0 ? Math.min(1, p! / 100) : 0.5;

async function fetchTopTrackScored(limit = 30): Promise<ScoredTrack[]> {
  const data = await spotifyFetch<{ items?: { uri: string; popularity?: number }[] }>(
    `/me/top/tracks?limit=${limit}&time_range=medium_term`,
  );
  return (data.items ?? []).map((t) => ({ uri: t.uri, popularity: normPop(t.popularity) }));
}

/**
 * La migración de febrero de 2026 bajó el tope de `limit` de /search de 50 a 10 para las
 * apps en modo desarrollo. Pedir más devuelve 400 "Invalid limit", que no dice nada del
 * verdadero motivo.
 */
const MAX_SEARCH_LIMIT = 10;

async function searchTrackScored(term: string, limit = MAX_SEARCH_LIMIT): Promise<ScoredTrack[]> {
  const capped = Math.min(limit, MAX_SEARCH_LIMIT);
  const data = await spotifyFetch<{ tracks?: { items?: { uri: string; popularity?: number }[] } }>(
    `/search?type=track&market=${MARKET}&limit=${capped}&q=${encodeURIComponent(term)}`,
  );
  return (data.tracks?.items ?? []).map((t) => ({ uri: t.uri, popularity: normPop(t.popularity) }));
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Curva de energía (#1) ──────────────────────────────────────────────────

/**
 * Ordena las canciones siguiendo la curva de energía de la sesión (calentamiento
 * → picos de calidad → enfriamiento) en vez de dejarlas al azar.
 *
 * Reparte `tracks` entre las fases proporcionalmente a la duración de cada una.
 * Dentro de cada fase, ordena por cercanía de su `popularity` a la energía
 * objetivo de la fase: las fases de alta energía reciben las pistas más
 * populares, las de baja las más suaves. Como la búsqueda ya filtra por mood
 * (los searchTerms traen "chill", "high energy", etc.), la popularidad actúa
 * como un refinamiento, no como el único criterio.
 *
 * `personal` se reparte entre las fases como acentos, sin amontonarse.
 */
function buildEnergyCurve(
  tracks: ScoredTrack[],
  phases: SessionPhase[],
  personal: string[],
  target: number,
): string[] {
  if (tracks.length === 0) return [];

  // Cuántas canciones toca a cada fase, proporcional a sus minutos.
  const totalMinutes = phases.reduce((a, p) => a + Math.max(1, p.minutes), 0);
  // Reservamos espacio para los acentos personales antes de repartir.
  const coreTarget = Math.max(1, target - personal.length);
  const phaseQuota = phases.map((p) =>
    Math.max(1, Math.round((Math.max(1, p.minutes) / totalMinutes) * coreTarget)),
  );

  // Pool ordenado por popularidad (descendente). De aquí vamos sacando para cada
  // fase según su energía: fases de más energía piden las más populares.
  const pool = [...tracks].sort((a, b) => b.popularity - a.popularity);
  // Índices de "extremos": las fases de alta energía consumen desde el inicio
  // del pool (más populares), las de baja desde el final (menos populares).
  let hi = 0; // puntero para pistas enérgicas
  let lo = pool.length - 1; // puntero para pistas suaves
  const used = new Set<string>();
  const takeN = (energy: number, n: number): ScoredTrack[] => {
    const out: ScoredTrack[] = [];
    // energy > 0.5 → tomamos del frente (populares); si no, del final (suaves).
    const fromFront = energy >= 0.5;
    while (out.length < n) {
      const idx = fromFront ? hi : lo;
      if (hi > lo) break;
      const t = pool[idx];
      // Avanzamos el puntero correspondiente saltando los ya usados.
      if (fromFront) hi++;
      else lo--;
      if (!t || used.has(t.uri)) continue;
      used.add(t.uri);
      out.push(t);
    }
    return out;
  };

  const ordered: string[] = [];
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const picked = takeN(phase.energy, phaseQuota[i] ?? 1);
    // Intercalamos un acento personal en medio de la fase si toca.
    const accentIdx = Math.floor((ordered.length / Math.max(1, coreTarget)) * personal.length);
    const accent =
      personal[accentIdx] && !used.has(personal[accentIdx]) ? personal[accentIdx] : null;
    const half = Math.floor(picked.length / 2);
    ordered.push(...picked.slice(0, half).map((t) => t.uri));
    if (accent) {
      ordered.push(accent);
      used.add(accent);
    }
    ordered.push(...picked.slice(half).map((t) => t.uri));
  }

  // Acentos personales que no entraron aún: se añaden al final antes de cortar.
  for (const uri of personal) {
    if (!used.has(uri) && ordered.length < target) {
      ordered.push(uri);
      used.add(uri);
    }
  }
  return ordered.slice(0, target);
}

// ── Diversidad entre semanas (#3) ──────────────────────────────────────────

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
function recentlyUsedUris(): Set<string> {
  const map = readRecentUris();
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * 86_400_000;
  const out = new Set<string>();
  for (const [uri, ts] of Object.entries(map)) {
    if (ts >= cutoff) out.add(uri);
  }
  return out;
}

/** Registra los URIs de una playlist recién creada, podando los viejos. */
function recordUsedUris(uris: string[]): void {
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
    const kept = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2000);
    localStorage.setItem(RECENT_URIS_KEY, JSON.stringify(Object.fromEntries(kept)));
  }
}

/**
 * Reordena un pool de búsqueda empujando al final los URIs ya usados en semanas
 * recientes. No los elimina —si el catálogo es pobre pueden seguir entrando para
 * no vaciar la lista— pero quedan últimos, así que solo aparecen si hace falta
 * rellenar déficit.
 */
function deprioritizeRecent(tracks: ScoredTrack[], recent: Set<string>): ScoredTrack[] {
  if (recent.size === 0) return tracks;
  const fresh: ScoredTrack[] = [];
  const stale: ScoredTrack[] = [];
  for (const t of tracks) (recent.has(t.uri) ? stale : fresh).push(t);
  return [...fresh, ...stale];
}

/**
 * Rota los searchTerms con un offset determinístico basado en la fecha de la
 * sesión, para que dos "Easy Run" en semanas distintas no pidan exactamente los
 * mismos términos a Spotify (y por tanto no reciban los mismos resultados).
 */
function rotateSearchTerms(terms: string[], session: any): string[] {
  if (terms.length <= 1) return terms;
  const dateStr = String(session?.date ?? session?.scheduled_date ?? "").slice(0, 10);
  // Hash simple y estable de la fecha → offset entre 0 y terms.length-1.
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  const offset = h % terms.length;
  return [...terms.slice(offset), ...terms.slice(0, offset)];
}

/**
 * Arma la lista de canciones de una sesión.
 *
 * Lo que manda es la intensidad: al menos el 70% sale de las búsquedas por
 * `searchTerms`, y el gusto personal (top tracks/artists) entra solo como sazón. Antes
 * era al revés — los top tracks iban primero y la lista se cortaba en 25 — y por eso
 * todas las sesiones producían prácticamente la misma playlist.
 *
 * El orden final sigue la curva de energía de la sesión (#1): calentamiento,
 * picos de calidad, enfriamiento. Y las canciones ya usadas en semanas recientes
 * se penalizan (#3) para que dos sesiones repetidas no suenen idénticas.
 */
export async function buildTrackPool(
  intensity: SessionIntensity,
  session?: any,
): Promise<string[]> {
  const target = Math.min(
    MAX_TRACKS,
    Math.max(MIN_TRACKS, Math.ceil(intensity.estimatedMinutes / MINUTES_PER_TRACK)),
  );
  const personalTarget = Math.round(target * PERSONAL_SHARE);

  // Rotación de searchTerms por fecha (#3): dos Easy Run en semanas distintas
  // empiezan por términos distintos y así no reciben los mismos resultados.
  const terms = rotateSearchTerms(intensity.searchTerms, session);

  // Se pide el doble de lo necesario para tener de dónde escoger tras deduplicar,
  // dentro del tope de 10 por búsqueda que impone el modo desarrollo.
  const perTerm = Math.min(MAX_SEARCH_LIMIT, Math.max(6, Math.ceil((target * 2) / terms.length)));

  // El gusto personal sale solo de /me/top/tracks (el endpoint de artistas favoritos
  // fue eliminado en la migración de febrero de 2026). Va envuelto en safeArray y puede
  // quedar vacío: en ese caso la playlist se arma solo con las búsquedas por intensidad.
  const failures: string[] = [];
  const [searched, topTracks] = await Promise.all([
    Promise.all(
      terms.map((t) => safeArray(`search "${t}"`, () => searchTrackScored(t, perTerm), failures)),
    ),
    safeArray("me/top/tracks", () => fetchTopTrackScored(), failures),
  ]);

  // (#3) URIs usados en las últimas semanas → penalizados (quedan últimos).
  const recent = recentlyUsedUris();

  // Pool por intensidad: deduplica por URI y empuja los recientes al final.
  const seenUri = new Set<string>();
  const intensityPool: ScoredTrack[] = [];
  for (const t of searched.flat()) {
    if (seenUri.has(t.uri)) continue;
    seenUri.add(t.uri);
    intensityPool.push(t);
  }
  const intensityFresh = deprioritizeRecent(shuffle(intensityPool), recent);

  // Pool personal: top tracks del usuario.
  const personalPool = shuffle([...topTracks]);
  const personalFresh = deprioritizeRecent(personalPool, recent).map((t) => t.uri);

  // Curva de energía de la sesión (#1): fases con su energía y duración.
  const phases = buildSessionPhases(session, intensity);

  // Reservamos el cupo personal y el resto va al core que ordena la curva.
  const personal = personalFresh.slice(0, personalTarget);
  const core = intensityFresh.slice(0, Math.max(0, target - personal.length));

  // Construimos el orden siguiendo la curva; los personales se intercalan.
  let uris = buildEnergyCurve(core, phases, personal, target);

  // Déficit: si faltaron canciones (búsqueda pobre, sin historial), rellenamos
  // sin importar la curva —mejor una playlist completa algo desordenada que corta—.
  if (uris.length < Math.min(target, 8)) {
    const usedSet = new Set(uris);
    const fallbackCore = intensityFresh.map((t) => t.uri);
    const fallback = [...fallbackCore, ...personalFresh].filter((u) => !usedSet.has(u));
    uris = [...uris, ...fallback].slice(0, target);
  }

  if (uris.length === 0) {
    throw new Error(
      failures.length > 0
        ? `Spotify no devolvió canciones. ${failures[0]}`
        : "Spotify no devolvió canciones para esta sesión.",
    );
  }
  return uris;
}

export type CreatedPlaylist = {
  playlistId: string;
  externalUrl: string;
  intensityLabel: string;
};

export async function createIntensityPlaylist(
  session: any,
  sessionKey?: string,
  garmin?: any,
  levelOverride?: IntensityLevel,
): Promise<CreatedPlaylist> {
  const base = deriveIntensity(session);
  const intensity = levelOverride ? withLevel(base, levelOverride) : base;
  const adjusted = await applyFatigue(intensity, garmin);

  const uris = await buildTrackPool(adjusted, session);

  // `POST /users/{id}/playlists` fue eliminado en la migración de febrero de 2026 y
  // responde 403 a todo el mundo desde el 9 de marzo. El reemplazo es `/me/playlists`,
  // que ya no necesita el id del usuario — por eso tampoco se llama a `/me`.
  const sessionName = String(session?.name ?? session?.sport ?? "Entrenamiento").slice(0, 70);
  const playlist = await spotifyFetch<{ id: string; external_urls?: { spotify?: string } }>(
    "/me/playlists",
    {
      method: "POST",
      body: JSON.stringify({
        name: `Entrenador · ${sessionName} · ${adjusted.label}`,
        description:
          `Generado por Entrenador · ${adjusted.label} · ~${adjusted.estimatedMinutes} min · ` +
          `${adjusted.targetTempoBpm[0]}-${adjusted.targetTempoBpm[1]} BPM`,
        public: false,
      }),
    },
  );

  // Misma migración: `/playlists/{id}/tracks` pasó a llamarse `/playlists/{id}/items`.
  await spotifyFetch(`/playlists/${playlist.id}/items`, {
    method: "POST",
    body: JSON.stringify({ uris }),
  });

  // (#3) Registramos los URIs para que no se repitan en las próximas semanas.
  recordUsedUris(uris);

  const created: CreatedPlaylist = {
    playlistId: playlist.id,
    externalUrl:
      playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
    intensityLabel: adjusted.label,
  };
  if (sessionKey) recordCreatedPlaylist(sessionKey, created);
  return created;
}
