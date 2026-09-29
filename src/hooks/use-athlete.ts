import { useQuery } from "@tanstack/react-query";
import { garminQO, getAthleteState, planQO } from "@/lib/api";
import { getReadinessScore, latestReading, type ReadinessResult } from "@/lib/readiness";
import type { GarminData, PlanData } from "@/lib/schemas";

/**
 * La foto completa del atleta en un solo hook: datos Garmin + plan, y todo lo
 * que se deriva de ellos (readiness, estado, minis de HRV/FC).
 *
 * Antes Sidebar y MobileTopBar replicaban esta secuencia (~60 líneas casi
 * idénticas cada una) y la página Hoy iba a ser la tercera copia.
 */
export function useAthlete() {
  const garminQuery = useQuery(garminQO());
  const planQuery = useQuery(planQO());

  const garmin = garminQuery.data;
  const plan = planQuery.data;

  const readiness: ReadinessResult | null = getReadinessScore(garmin);
  const athleteState = getAthleteState(plan);
  const hrv = latestReading(garmin, "hrv");
  const rhr = latestReading(garmin, "resting_hr");

  return {
    garmin,
    plan,
    readiness,
    athleteState,
    hrv,
    rhr,
    /** Cierto mientras cualquiera de las dos fuentes esté cargando. */
    isLoading: garminQuery.isLoading || planQuery.isLoading,
    error: garminQuery.error ?? planQuery.error,
  };
}

export type Athlete = ReturnType<typeof useAthlete>;
