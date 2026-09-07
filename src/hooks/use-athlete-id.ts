import { useSyncExternalStore } from "react";
import { getActiveAthlete, subscribeAthlete, type AthleteId } from "@/lib/athlete/store";

const SERVER_SNAPSHOT: AthleteId = "jose"; // SSR no toca localStorage

/**
 * Quién está usando la app ahora — NO confundir con useAthlete() (que trae
 * los datos fisiológicos/plan de Jose desde Garmin, sin importar el perfil).
 */
export function useAthleteId(): AthleteId {
  return useSyncExternalStore(subscribeAthlete, getActiveAthlete, () => SERVER_SNAPSHOT);
}
