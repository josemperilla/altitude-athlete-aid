import { useEffect, useRef } from "react";
import { animate } from "@/lib/gym/figure.js";
import { POSES } from "@/lib/gym/poses.js";

/*
 * La figura animada de un ejercicio.
 *
 * El motor (src/lib/gym/figure.js) viene tal cual de la app de gimnasio y no se
 * tocó al portarla: `animate(svg, spec)` devuelve su propia función de parada,
 * que es exactamente la forma que pide la limpieza de un useEffect.
 *
 * Solo anima lo que se ve. Una sesión desplegada tiene doce ejercicios, y sin
 * este control quedarían doce requestAnimationFrame corriendo a la vez para
 * dibujos que nadie está mirando. En la app original esto lo hacía un
 * IntersectionObserver único compartido; aquí es uno por figura, que es lo
 * idiomático en React y cuesta lo mismo a esta escala.
 */
export function GymFigure({ anim, name }: { anim: string | null; name: string }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = ref.current;
    const spec = anim ? (POSES as Record<string, unknown>)[anim] : null;
    if (!svg || !spec) return;

    let stop: (() => void) | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !stop) {
          stop = animate(svg, spec) as () => void;
        } else if (!entry.isIntersecting && stop) {
          stop();
          stop = null;
          svg.replaceChildren();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(svg);

    return () => {
      observer.disconnect();
      if (stop) stop();
      svg.replaceChildren();
    };
  }, [anim]);

  if (!anim || !(POSES as Record<string, unknown>)[anim]) return null;

  return (
    <div className="gym-anim">
      <svg ref={ref} role="img" aria-label={`Animación: ${name}`} />
    </div>
  );
}
