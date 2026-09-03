import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postUpdate } from "@/lib/api";

/** Mutación "Actualizar plan" compartida por la barra lateral, Hoy y Ajustes. */
export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postUpdate,
    onSuccess: () => {
      toast.success("Plan actualizado");
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["garmin"] });
    },
    onError: (e) =>
      toast.error(`Error: ${e instanceof Error ? e.message : "no se pudo actualizar"}`),
  });
}
