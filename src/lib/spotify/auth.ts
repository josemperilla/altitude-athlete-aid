// OAuth PKCE contra Spotify, directo desde el navegador (sin backend).
// Incluye la gestión de tokens: lectura, refresco con de-duplicación de la
// petición en vuelo y desconexión.

import { emitSpotifyChange } from "./store";

const AUTH_BASE = "https://accounts.spotify.com";
const VERIFIER_KEY = "spotify_pkce_verifier";
const TOKENS_KEY = "spotify_tokens";

// `user-library-modify` y `user-follow-modify` son para `DELETE /me/library`, que es
// como se retiran las playlists pasadas. La documentación no aclara cuál de los tres
// aplica a playlists en concreto — el endpoint es genérico — así que se piden todos.
const SCOPES =
  "playlist-modify-private playlist-modify-public user-top-read " +
  "user-library-modify user-follow-modify";
/** Sin este permiso no se puede retirar nada de la biblioteca. */
const REQUIRED_SCOPES = ["playlist-modify-private", "user-library-modify"];

export type StoredTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  /** Permisos que Spotify concedió de verdad, no los que se pidieron. */
  scope?: string;
};

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
  emitSpotifyChange();
}

export function readTokens(): StoredTokens | null {
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
function grantedScopes(tokens: StoredTokens): string[] {
  return (tokens.scope ?? "").split(/\s+/).filter(Boolean);
}

/**
 * Lectura pura, sin efectos. Tiene que serlo: `useSpotifyConnected` la usa como
 * `getSnapshot` de useSyncExternalStore, y React la llama durante el render.
 * Antes borraba los tokens y notificaba a sus propios suscriptores ahí mismo,
 * que es justo lo que React prohíbe en fase de render.
 */
export function isSpotifyConnected(): boolean {
  const tokens = readTokens();
  if (!tokens) return false;
  const granted = grantedScopes(tokens);
  return REQUIRED_SCOPES.every((s) => granted.includes(s));
}

/**
 * Descarta tokens a los que les falta algún permiso obligatorio. Es la mitad
 * con efectos de lo que antes hacía `isSpotifyConnected`; se llama desde un
 * efecto, nunca durante el render.
 */
export function dropTokensWithMissingScopes(): void {
  const tokens = readTokens();
  if (!tokens) return;
  const granted = grantedScopes(tokens);
  if (!REQUIRED_SCOPES.every((s) => granted.includes(s))) disconnectSpotify();
}

export function disconnectSpotify(): void {
  localStorage.removeItem(TOKENS_KEY);
  emitSpotifyChange();
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
