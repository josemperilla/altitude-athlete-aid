// Qué cargaste la última vez que hiciste este ejercicio.
//
// Registrar el peso solo paga si sirve para progresar, y arrancar cada sesión
// en blanco obliga a acordarse de lo del lunes pasado. El dato ya está: el
// backend devuelve TODAS las fechas marcadas del atleta, así que basta con
// mirar hacia atrás.

import type { GymDoneMap } from "@/lib/schemas";

/**
 * El último peso registrado para un ejercicio ANTES de `hoy`, o `undefined` si
 * nunca se anotó.
 *
 * Estrictamente anterior a propósito: lo de hoy ya se muestra como valor real
 * del campo, y ofrecerlo además como sugerencia sería redundante y confuso.
 * Se recorre por fecha descendente, que con ISO es orden lexicográfico.
 */
export function lastWeightFor(
  done: GymDoneMap | undefined,
  athlete: string,
  exerciseId: string,
  hoy: string,
): string | undefined {
  const entries = done?.[athlete];
  if (!entries) return undefined;
  const fechas = Object.keys(entries)
    .filter((d) => d < hoy)
    .sort()
    .reverse();
  for (const d of fechas) {
    const w = entries[d]?.weights?.[exerciseId];
    if (w) return w;
  }
  return undefined;
}
