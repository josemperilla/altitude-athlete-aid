import { useEffect } from "react";

/**
 * Mantiene la pantalla encendida mientras corre un cronómetro.
 *
 * Es la pieza que de verdad sostiene esto en el iPhone: sin ella la pantalla se
 * apaga a mitad de la plancha, y con la pantalla apagada iOS congela la pestaña
 * y calla el audio, así que el aviso del final no llega nunca.
 *
 * Se vuelve a pedir al regresar a la pestaña porque el sistema suelta el
 * bloqueo cada vez que la app pasa a segundo plano y no lo devuelve solo.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (cancelled || document.visibilityState !== "visible") return;
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // El navegador puede negarlo (batería baja, permisos): sin drama.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
