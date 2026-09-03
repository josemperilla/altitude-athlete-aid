// Las señales del cuerpo ahora viven en /cuerpo (fusión con el diagnóstico).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/historial")({
  beforeLoad: () => {
    throw redirect({ to: "/cuerpo" });
  },
});
