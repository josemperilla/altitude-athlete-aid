/**
 * Motor de animación SVG por cinemática directa. `animate` devuelve su propia
 * función de parada (la forma que pide la limpieza de un useEffect).
 */
export function animate(svg: SVGSVGElement, spec: unknown): () => void;
