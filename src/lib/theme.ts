// Paleta del tema "Entrenador — premium dark club", espejo de las CSS vars
// definidas en src/styles.css. Centraliza los colores que los componentes usan
// inline para que un cambio de marca se haga en un solo sitio.

export const BG = "#020101";
export const PANEL = "#0D0D0D";
export const CARD_1 = "#111111";
export const CARD_2 = "#1A1A1A";
export const GOLD = "#E9CEA9";
export const GOLD_DEEP = "#CEA970";
export const GOLD_LIGHT = "#FFBC7D";
export const MUTED = "#9A9A9A";
export const RUN = "#3B82F6";
export const BIKE = "#10B981";
export const ERR = "#EF4444";
export const WARN = "#FBBF24";

export type AthleteStateStyle = { bg: string; color: string };

/** Fondo y color del badge del estado del atleta ("FATIGA", "DESCARGADO", "BALANCEADO"...). */
export function stateStyle(s: string): AthleteStateStyle {
  if (s.includes("FATIG")) return { bg: "rgba(239,68,68,0.15)", color: ERR };
  if (s.includes("DESCARG")) return { bg: "rgba(16,185,129,0.15)", color: BIKE };
  if (s.includes("BALANCE")) return { bg: "rgba(251,191,36,0.15)", color: WARN };
  return { bg: "rgba(233,206,169,0.1)", color: GOLD };
}
