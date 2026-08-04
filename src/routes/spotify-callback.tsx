import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { completeSpotifyLogin } from "@/lib/spotify";

const searchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/spotify-callback")({
  validateSearch: searchSchema,
  component: SpotifyCallbackPage,
});

function SpotifyCallbackPage() {
  const { code, error } = Route.useSearch();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (error) {
      toast.error("Conexión con Spotify cancelada");
      navigate({ to: "/" });
      return;
    }
    if (!code) {
      navigate({ to: "/" });
      return;
    }
    completeSpotifyLogin(code)
      .then(() => toast.success("Spotify conectado"))
      .catch((e: any) => toast.error(e?.message ?? "No se pudo conectar Spotify"))
      .finally(() => navigate({ to: "/" }));
  }, [code, error, navigate]);

  return (
    <div className="p-10 text-center" style={{ color: "#9A9A9A" }}>
      Conectando con Spotify…
    </div>
  );
}
