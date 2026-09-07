// Tema visual: oscuro (por defecto, como siempre) o claro.
//
// Mismo patrón que src/lib/athlete/store.ts — localStorage + pub/sub — porque
// el problema es idéntico: un valor por navegador que React necesita oír
// cuando cambia. El <html> lleva data-theme, que styles.css usa para
// sobreescribir los tokens; un script inline en el head lo fija antes del
// primer paint para que no haya destello del tema contrario.

export type Theme = "dark" | "light";

const KEY = "theme";
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage bloqueado o lleno: el cambio vive solo en esta vista.
  }
  // Guarda por contexto sin DOM (bun test): allí solo interesa la notificación.
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
  for (const l of listeners) l();
}

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
