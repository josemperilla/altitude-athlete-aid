// Superficie pública del módulo Spotify. Los consumidores importan desde
// "@/lib/spotify" — igual que cuando todo vivía en spotify.ts — y los
// internals (auth, cliente, storage, curación, prune) se pueden mover sin
// romper a nadie.

export {
  startSpotifyLogin,
  completeSpotifyLogin,
  isSpotifyConnected,
  dropTokensWithMissingScopes,
  disconnectSpotify,
  getValidAccessToken,
} from "./auth";

export { SpotifyNotConnectedError, SpotifyRateLimitError } from "./client";

export { getCreatedPlaylist, recordCreatedPlaylist, getPlaylistRegistry } from "./storage";
export { subscribeSpotify } from "./store";
export type { CreatedPlaylist, PlaylistPhase } from "./storage";

export { createIntensityPlaylist } from "./curation";

export { prunePastPlaylists } from "./prune";
export type { PruneResult } from "./prune";
