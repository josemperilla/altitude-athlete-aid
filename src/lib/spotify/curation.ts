// Curación de playlists: arma la lista de canciones de una sesión
// sincronizada con sus fases y la publica en Spotify.

import {
  buildSessionPhases,
  deriveIntensity,
  searchTermsFor,
  withLevel,
  type IntensityLevel,
  type SessionIntensity,
} from "@/lib/spotify-intensity";
import { buildTimeline, fillTimeline, type BandPools, type Segment } from "@/lib/playlist-timeline";
import { mmss } from "@/lib/workout-steps";
import { applyFatigue } from "@/lib/apply-fatigue";
import type { GarminData } from "@/lib/schemas";
import type { PlanSession } from "@/lib/schemas";
import { fetchTopTrackScored, searchTrackScored, spotifyFetch, type ScoredTrack } from "./client";
import { recordCreatedPlaylist, recordUsedUris, recentlyUsedUris } from "./storage";
import type { CreatedPlaylist, PlaylistPhase } from "./storage";

/** Duración promedio de una canción, para calcular cuántas caben en la sesión. */
const MINUTES_PER_TRACK = 3.5;
const MIN_TRACKS = 8;
const MAX_TRACKS = 60;
/** Techo del gusto personal: el resto de la playlist lo manda la intensidad. */
const PERSONAL_SHARE = 0.3;
/** Spotify corta las descripciones en 300 caracteres. */
const MAX_DESCRIPTION = 300;

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
  } catch (e) {
    const reason = `${context} → ${e instanceof Error ? e.message : String(e)}`;
    console.warn("[spotify]", reason);
    failures.push(reason);
    return [];
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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
function rotateSearchTerms(terms: string[], session: PlanSession | undefined): string[] {
  if (terms.length <= 1) return terms;
  const dateStr = String(session?.date ?? session?.scheduled_date ?? "").slice(0, 10);
  // Hash simple y estable de la fecha → offset entre 0 y terms.length-1.
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  const offset = h % terms.length;
  return [...terms.slice(offset), ...terms.slice(0, offset)];
}

/**
 * Arma la lista de canciones de una sesión, sincronizada con sus fases.
 *
 * Cada fase define una banda de energía (suave / media / fuerte) y una ventana
 * de tiempo con arranque absoluto; la playlist se llena fase por fase con
 * canciones de su banda cuyas duraciones reales cubren la ventana (±45 s), de
 * modo que la primera canción fuerte arranca en el minuto en que empiezan los
 * intervalos. Las búsquedas se hacen por banda con sus propios términos: el
 * calentamiento de una sesión de intervalos pide música suave aunque la sesión
 * sea "alta". El gusto personal (top tracks) entra como acentos (~30%)
 * intercalados, y su duración también cuenta para la sincronización.
 *
 * Las canciones ya usadas en semanas recientes se penalizan para que dos
 * sesiones repetidas no suenen idénticas.
 */
export async function buildSessionPlaylist(
  intensity: SessionIntensity,
  session?: PlanSession,
): Promise<{ uris: string[]; segments: Segment[] }> {
  const phases = buildSessionPhases(session, intensity);
  const windows = buildTimeline(phases);

  // Solo se busca en las bandas que la sesión realmente usa: una sesión de
  // recuperación no gasta llamadas pidiendo EDM.
  const totalMs = windows.reduce((a, w) => a + (w.endMs - w.startMs), 0) || 1;
  const bandList = (["baja", "moderada", "alta"] as IntensityLevel[]).filter((band) =>
    windows.some((w) => w.band === band),
  );

  // Tamaño total de referencia (tope de llamadas y de playlist).
  const target = Math.min(
    MAX_TRACKS,
    Math.max(MIN_TRACKS, Math.ceil(intensity.estimatedMinutes / MINUTES_PER_TRACK)),
  );
  const personalTarget = Math.round(target * PERSONAL_SHARE);

  const failures: string[] = [];
  // Todas las búsquedas se disparan en paralelo (la de top tracks incluida).
  const jobs = bandList.map((band) => {
    const bandMs = windows
      .filter((w) => w.band === band)
      .reduce((a, w) => a + (w.endMs - w.startMs), 0);
    // ~2 pistas por cada una necesaria para poder escoger, juntadas con 1-3
    // búsquedas de ≤10 resultados dentro del tope del modo desarrollo.
    const needed = Math.max(2, Math.round((bandMs / totalMs) * target));
    const nTerms = Math.min(3, Math.max(1, Math.ceil((needed * 2) / 10)));
    const terms = rotateSearchTerms(searchTermsFor(intensity.sport, band), session).slice(
      0,
      nTerms,
    );
    return {
      band,
      done: Promise.all(
        terms.map((t) => safeArray(`search "${t}"`, () => searchTrackScored(t), failures)),
      ),
    };
  });
  const topTracksDone = safeArray("me/top/tracks", () => fetchTopTrackScored(), failures);

  // URIs usados en las últimas semanas → penalizados (quedan últimos).
  const recent = recentlyUsedUris();

  // Pool por banda: deduplica entre bandas (la primera banda en encontrarla la
  // conserva) y empuja los recientes al final.
  const seenUri = new Set<string>();
  const pools: BandPools = { baja: [], moderada: [], alta: [] };
  for (const { band, done } of jobs) {
    const fresh = (await done).flat().filter((t) => {
      if (seenUri.has(t.uri)) return false;
      seenUri.add(t.uri);
      return true;
    });
    pools[band] = deprioritizeRecent(shuffle(fresh), recent);
  }

  // Pool personal: top tracks del usuario, como acentos.
  const topTracks = await topTracksDone;
  const personal = deprioritizeRecent(shuffle([...topTracks]), recent).slice(0, personalTarget);

  // Llenado sincronizado con las fases (ver playlist-timeline.ts).
  const filled = fillTimeline(pools, personal, phases);
  let uris = filled.uris;
  const segments = filled.segments;

  // Déficit: si faltaron canciones (búsqueda pobre, sin historial), rellenamos
  // sin importar la sincronización —mejor una playlist completa algo desordenada
  // que corta—. Los segmentos siguen reflejando los bloques sincronizados.
  if (uris.length < Math.min(target, MIN_TRACKS)) {
    const usedSet = new Set(uris);
    const fallback = [...pools.baja, ...pools.moderada, ...pools.alta, ...personal]
      .map((t) => t.uri)
      .filter((u) => !usedSet.has(u));
    uris = [...uris, ...fallback].slice(0, target);
  }

  if (uris.length === 0) {
    throw new Error(
      failures.length > 0
        ? `Spotify no devolvió canciones. ${failures[0]}`
        : "Spotify no devolvió canciones para esta sesión.",
    );
  }
  return { uris, segments };
}

/**
 * Línea de tiempo compacta para la descripción: "⏱ 0:00 Calentamiento ·
 * 8:00 Intervalos · 20:00 Enfriamiento". Solo bloques con canciones — una fase
 * que no acumuló ninguna es una frontera que se atraviesa, no un bloque.
 */
function timelineDescription(segments: Segment[]): string {
  return segments
    .filter((s) => s.uris.length > 0)
    .map((s) => `${mmss(s.startSec)} ${s.label}`)
    .join(" · ");
}

export async function createIntensityPlaylist(
  session: PlanSession | undefined,
  sessionKey?: string,
  garmin?: GarminData,
  levelOverride?: IntensityLevel,
): Promise<CreatedPlaylist> {
  const base = deriveIntensity(session);
  const intensity = levelOverride ? withLevel(base, levelOverride) : base;
  const adjusted = await applyFatigue(intensity, garmin);

  const { uris, segments } = await buildSessionPlaylist(adjusted, session);

  // `POST /users/{id}/playlists` fue eliminado en la migración de febrero de 2026 y
  // responde 403 a todo el mundo desde el 9 de marzo. El reemplazo es `/me/playlists`,
  // que ya no necesita el id del usuario — por eso tampoco se llama a `/me`.
  const sessionName = String(session?.name ?? session?.sport ?? "Entrenamiento").slice(0, 70);
  const description =
    `Generado por Entrenador · ${adjusted.label} · ~${adjusted.estimatedMinutes} min · ` +
    `${adjusted.targetTempoBpm[0]}-${adjusted.targetTempoBpm[1]} BPM`;
  const timelineText = timelineDescription(segments);
  const fullDescription = timelineText ? `${description} · ⏱ ${timelineText}` : description;
  const playlist = await spotifyFetch<{ id: string; external_urls?: { spotify?: string } }>(
    "/me/playlists",
    {
      method: "POST",
      body: JSON.stringify({
        name: `Entrenador · ${sessionName} · ${adjusted.label}`,
        description: fullDescription.slice(0, MAX_DESCRIPTION),
        public: false,
      }),
    },
  );

  // Misma migración: `/playlists/{id}/tracks` pasó a llamarse `/playlists/{id}/items`.
  await spotifyFetch(`/playlists/${playlist.id}/items`, {
    method: "POST",
    body: JSON.stringify({ uris }),
  });

  // Registramos los URIs para que no se repitan en las próximas semanas.
  recordUsedUris(uris);

  const created: CreatedPlaylist = {
    playlistId: playlist.id,
    externalUrl:
      playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
    intensityLabel: adjusted.label,
    timeline: segments
      .filter((s) => s.uris.length > 0)
      .map((s) => ({
        label: s.label,
        band: s.band,
        startSec: s.startSec,
        tracks: s.uris.length,
        errorSec: s.errorSec,
      })),
  };
  if (sessionKey) recordCreatedPlaylist(sessionKey, created);
  return created;
}

export type { PlaylistPhase };
