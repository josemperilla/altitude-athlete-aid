/**
 * Color semántico del estado del atleta ("FATIGA", "DESCARGADO",
 * "BALANCEADO"...), como CSS var para usar en styles inline o color-mix.
 * El fondo del badge se deriva con color-mix al 15 %.
 */
export function stateColor(s: string): string {
  if (s.includes("FATIG")) return "var(--err)";
  if (s.includes("DESCARG")) return "var(--bike)";
  if (s.includes("BALANCE")) return "var(--warn)";
  return "var(--gold)";
}

/** Etiqueta en español del estado del atleta; crudo en mayúsculas si no se reconoce. */
export function stateLabel(s: string): string {
  if (s.includes("FATIG")) return "FATIGA";
  if (s.includes("DESCARG")) return "DESCARGADO";
  if (s.includes("BALANCE")) return "BALANCEADO";
  if (s.includes("RECOVER") || s.includes("REST")) return "RECUPERADO";
  return s.toUpperCase();
}
