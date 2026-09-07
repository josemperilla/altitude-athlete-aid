import { useQuery } from "@tanstack/react-query";
import { garminQO, getAthleteState, planQO } from "@/lib/api";
import { useAthleteId } from "@/hooks/use-athlete-id";
import { getReadinessScore, latestReading, type ReadinessResult } from "@/lib/readiness";
import type { GarminData, PlanData } from "@/lib/schemas";

/**
 * La foto completa del atleta en un solo hook: datos Garmin + plan, y todo lo
 * que se deriva de ellos (readiness, estado, minis de HRV/FC) — para el
 * PERFIL ACTIVO (`useAthleteId()`), no solo para Jose.
 *
 * Antes Sidebar y MobileTopBar replicaban esta secuencia (~60 líneas casi
 * idénticas cada una) y la página Hoy iba a ser la tercera copia.
 *
 * Andrea no tiene Garmin conectado (a propósito, ver athletes.py::RACES): el
 * backend le responde `{}` en /garmin y /plan, no un error, así que esto
 * degrada solo a los mismos estados vacíos que ya existían para "sin datos
 * todavía" — no hace falta una rama especial aquí.
 */
export function useAthlete() {
  const athlete = useAthleteId();
  const garminQuery = useQuery(garminQO(athlete));
  const planQuery = useQuery(planQO(athlete));

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
