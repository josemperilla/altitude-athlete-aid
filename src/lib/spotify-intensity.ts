export type IntensityLevel = "baja" | "moderada" | "alta";

export type SessionIntensity = {
  level: IntensityLevel;
  label: string;
  /** Spotify search-friendly genre/mood keywords, ordered by relevance. */
  searchTerms: string[];
  /** Rough target energy 0-1, used to bias track selection when audio features are available. */
  targetEnergy: number;
  specified: boolean;
};

function parseZone(zone: unknown): number | null {
  if (zone == null) return null;
  const m = /(\d)/.exec(String(zone));
  return m ? Number(m[1]) : null;
}

function fromZone(zoneNum: number, sport: string): SessionIntensity {
  if (zoneNum <= 2) {
    return {
      level: "baja",
      label: "Baja intensidad · recuperación",
      searchTerms: ["chill", "lo-fi", "acoustic focus"],
      targetEnergy: 0.3,
      specified: true,
    };
  }
  if (zoneNum === 3) {
    return {
      level: "moderada",
      label: "Intensidad moderada",
      searchTerms: sport === "bike" ? ["indie pop", "feel good"] : ["pop", "indie pop"],
      targetEnergy: 0.6,
      specified: true,
    };
  }
  return {
    level: "alta",
    label: "Alta intensidad",
    searchTerms:
      sport === "bike" ? ["electronic workout", "high energy"] : ["workout", "power pop"],
    targetEnergy: 0.85,
    specified: true,
  };
}

/**
 * Derives a playlist-oriented intensity descriptor from a training session.
 * Sessions from the external plan API are loosely typed, so every field is optional.
 */
export function deriveIntensity(session: any): SessionIntensity {
  const sport = String(session?.sport ?? session?.type ?? "").toLowerCase();
  const zoneNum = parseZone(session?.primary_zone ?? session?.zone);

  if (zoneNum != null) return fromZone(zoneNum, sport);

  const duration = Number(session?.duration_min);
  const fallback: SessionIntensity =
    Number.isFinite(duration) && duration >= 75
      ? {
          level: "moderada",
          label: "Intensidad no especificada — resistencia larga",
          searchTerms: ["endurance run", "steady focus"],
          targetEnergy: 0.55,
          specified: false,
        }
      : {
          level: "moderada",
          label: "Intensidad no especificada",
          searchTerms: ["pop", "indie pop"],
          targetEnergy: 0.55,
          specified: false,
        };

  return fallback;
}
