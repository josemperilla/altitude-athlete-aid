// PAPEL TRANSITORIO: espejo en TS de los tokens de src/styles.css para los
// componentes que aún estilan inline. La Fase 4 del replanteo migra esos
// componentes a utilidades Tailwind (bg-surface, text-muted…) y BORRA este
// archivo. Si cambias la paleta, cámbiala en styles.css y aquí — en ese orden.

export const BG = "#070605";
export const PANEL = "#100e0c"; // == --surface
export const CARD_1 = "#100e0c"; // == --surface
export const CARD_2 = "#181511"; // == --surface-2
export const GOLD = "#E9CEA9";
export const GOLD_DEEP = "#CEA970";
export const GOLD_LIGHT = "#FFBC7D";
export const GOLD_WASH = "rgba(233,206,169,0.09)";
export const MUTED = "#A8A093";
export const RUN = "#3B82F6";
export const BIKE = "#10B981";
export const ERR = "#EF4444";
export const WARN = "#FBBF24";
export const SPOTIFY = "#1ED760";

export type AthleteStateStyle = { bg: string; color: string };

/** Fondo y color del badge del estado del atleta ("FATIGA", "DESCARGADO", "BALANCEADO"...). */
export function stateStyle(s: string): AthleteStateStyle {
  if (s.includes("FATIG")) return { bg: "rgba(239,68,68,0.15)", color: ERR };
  if (s.includes("DESCARG")) return { bg: "rgba(16,185,129,0.15)", color: BIKE };
  if (s.includes("BALANCE")) return { bg: "rgba(251,191,36,0.15)", color: WARN };
  return { bg: GOLD_WASH, color: GOLD };
}
