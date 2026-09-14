import { useEffect, useState } from "react";

import { msUntilNextMidnight, todayISO } from "@/lib/gym/weeks";

/**
 * El día de hoy en ISO local, y que de verdad cambia cuando cambia el día.
 *
 * Hasta ahora cada vista llamaba a `todayISO()` durante el render, que es una
 * foto del momento en que se montó el componente. En un navegador de
 * escritorio eso se corrige solo al recargar; en el teléfono no: la app es una
 * PWA que se abre en el gimnasio y se queda abierta, y iOS mantiene viva la
 * pestaña durante días. El resultado era que el lunes 14 la franja "esta
 * semana" seguía mostrando el gimnasio del 7 y del 9 — la semana en la que se
 * abrió la app — y peor, «marcar hecha hoy» escribía en la fecha vieja.
 *
 * Dos despertadores, porque ninguno basta solo: un temporizador hasta la
 * próxima medianoche (que iOS congela con la pestaña en segundo plano) y los
 * eventos de volver a la app, que son los que de verdad disparan tras una
 * noche con el teléfono bloqueado.
 */
export function useToday(): string {
  const [iso, setIso] = useState(todayISO);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const sync = () => {
      // El comparador importa: devolver la misma cadena evita un render por
      // cada foco de ventana durante todo el día.
      setIso((prev) => {
        const hoy = todayISO();
        return hoy === prev ? prev : hoy;
      });
      arm();
    };

    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(sync, msUntilNextMidnight());
    };

    arm();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return iso;
}
