// Notificación del sistema al terminar una cuenta atrás.
//
// Advertencia sobre el iPhone, para que nadie cuente con esto más de lo que da:
// en Safari de iOS la API de notificaciones SOLO existe dentro de una app
// instalada en la pantalla de inicio (Compartir → Añadir a pantalla de inicio,
// iOS 16.4+). Y aun instalada, solo se dispara mientras la página sigue viva:
// si te vas a Spotify, iOS congela la pestaña, la cuenta no llega a cero y no
// hay nada que notificar. En el iPhone lo que sostiene el aviso es el Wake Lock
// más el pitido; esto suma en Android y en escritorio.
//
// Donde la API no existe, todo devuelve false y no se pinta ningún botón.

export type NotifyState = "unsupported" | "default" | "granted" | "denied";

export function notifyState(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const p = Notification.permission;
  return p === "granted" || p === "denied" ? p : "default";
}

/** Pide permiso. Tiene que salir de un gesto del usuario. */
export async function requestNotifyPermission(): Promise<NotifyState> {
  try {
    if (notifyState() === "unsupported") return "unsupported";
    const p = await Notification.requestPermission();
    return p === "granted" || p === "denied" ? p : "default";
  } catch {
    return "unsupported";
  }
}

/**
 * Avisa de que se acabó el tiempo.
 *
 * No hace nada con la pestaña a la vista: ahí el número en pantalla ya lo dijo
 * y una notificación encima sería ruido sobre la misma información.
 */
export function notifyDone(exercise: string, segment: string): void {
  try {
    if (notifyState() !== "granted") return;
    if (typeof document !== "undefined" && !document.hidden) return;
    new Notification("Tiempo", {
      body: `${exercise} · ${segment}`,
      tag: "gym-timer",
      silent: false,
    });
  } catch {
    // Notificación fallida: el pitido ya cumplió.
  }
}
