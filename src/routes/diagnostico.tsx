// La evaluación de molestias ahora vive en /cuerpo (fusión con las señales).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/diagnostico")({
  beforeLoad: () => {
    throw redirect({ to: "/cuerpo" });
  },
});
