import { deriveIntensity } from "@/lib/spotify-intensity";

const AUTH_BASE = "https://accounts.spotify.com";
const API_BASE = "https://api.spotify.com/v1";
const SCOPES = "playlist-modify-private playlist-modify-public user-top-read";
const VERIFIER_KEY = "spotify_pkce_verifier";
const TOKENS_KEY = "spotify_tokens";

type StoredTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
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
  if (!id) throw new Error("VITE_SPOTIFY_CLIENT_ID no está configurado");
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

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.assign(`${AUTH_BASE}/authorize?${params.toString()}`);
}

function storeTokens(data: { access_token: string; refresh_token?: string; expires_in: number }) {
  const prev = readTokens();
  const tokens: StoredTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? prev?.refresh_token ?? "",
    expires_at: Date.now() + data.expires_in * 1000,
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

export function isSpotifyConnected(): boolean {
  return readTokens() != null;
}

export function disconnectSpotify(): void {
  localStorage.removeItem(TOKENS_KEY);
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - 60_000) return tokens.access_token;
  if (!tokens.refresh_token) return null;
  const refreshed = await refreshAccessToken(tokens.refresh_token);
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
  if (!res.ok) throw new Error(`Spotify ${path} ${res.status}`);

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function fetchTopArtistIds(): Promise<string[]> {
  try {
    const data = await spotifyFetch<{ items?: { id: string }[] }>(
      "/me/top/artists?limit=5&time_range=medium_term",
    );
    return (data.items ?? []).map((a) => a.id);
  } catch {
    return [];
  }
}

async function fetchTopTrackUris(): Promise<string[]> {
  try {
    const data = await spotifyFetch<{ items?: { uri: string }[] }>(
      "/me/top/tracks?limit=8&time_range=medium_term",
    );
    return (data.items ?? []).map((t) => t.uri);
  } catch {
    return [];
  }
}

async function searchTrackUris(term: string, limit = 8): Promise<string[]> {
  try {
    const data = await spotifyFetch<{ tracks?: { items?: { uri: string }[] } }>(
      `/search?type=track&limit=${limit}&q=${encodeURIComponent(term)}`,
    );
    return (data.tracks?.items ?? []).map((t) => t.uri);
  } catch {
    return [];
  }
}

async function artistTopTrackUris(artistId: string): Promise<string[]> {
  try {
    const data = await spotifyFetch<{ tracks?: { uri: string }[] }>(
      `/artists/${artistId}/top-tracks?market=from_token`,
    );
    return (data.tracks ?? []).slice(0, 3).map((t) => t.uri);
  } catch {
    return [];
  }
}

export type CreatedPlaylist = {
  playlistId: string;
  externalUrl: string;
  intensityLabel: string;
};

export async function createIntensityPlaylist(session: any): Promise<CreatedPlaylist> {
  const intensity = deriveIntensity(session);

  const me = await spotifyFetch<{ id: string }>("/me");

  const [topTrackUris, topArtistIds] = await Promise.all([
    fetchTopTrackUris(),
    fetchTopArtistIds(),
  ]);
  const artistTrackLists = await Promise.all(topArtistIds.map(artistTopTrackUris));
  const searchResults = await Promise.all(intensity.searchTerms.map((t) => searchTrackUris(t)));

  const uris = Array.from(
    new Set([...topTrackUris, ...artistTrackLists.flat(), ...searchResults.flat()]),
  ).slice(0, 25);

  if (uris.length === 0) throw new Error("No se encontraron canciones para esta sesión");

  const sessionName = session?.name ?? session?.sport ?? "Entrenamiento";
  const playlist = await spotifyFetch<{ id: string; external_urls?: { spotify?: string } }>(
    `/users/${me.id}/playlists`,
    {
      method: "POST",
      body: JSON.stringify({
        name: `Entrenador · ${sessionName} · ${intensity.label}`,
        description: "Generado automáticamente por Entrenador según la intensidad de tu sesión.",
        public: false,
      }),
    },
  );

  await spotifyFetch(`/playlists/${playlist.id}/tracks`, {
    method: "POST",
    body: JSON.stringify({ uris }),
  });

  return {
    playlistId: playlist.id,
    externalUrl:
      playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
    intensityLabel: intensity.label,
  };
}
