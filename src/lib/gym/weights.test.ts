import { describe, expect, test } from "bun:test";
import { lastWeightFor } from "./weights";
import type { GymDoneEntry, GymDoneMap } from "@/lib/schemas";

const entry = (code: string, weights: Record<string, string>): GymDoneEntry => ({
  code,
  note: "",
  weights,
  updated_at: "2026-09-07T08:00:00",
});

describe("lastWeightFor", () => {
  test("devuelve el peso más reciente ANTERIOR a hoy, no el de hoy", () => {
    const done: GymDoneMap = {
      jose: {
        "2026-09-07": entry("A", { squat: "80kg" }),
        "2026-09-14": entry("A", { squat: "82.5kg" }),
        // Lo de hoy ya se muestra como valor real del campo; no es sugerencia.
        "2026-09-15": entry("A", { squat: "999kg" }),
      },
    };
    expect(lastWeightFor(done, "jose", "squat", "2026-09-15")).toBe("82.5kg");
  });

  test("salta fechas donde ese ejercicio no tiene peso y sigue hacia atrás", () => {
    const done: GymDoneMap = {
      jose: {
        "2026-09-14": entry("B", { rdl: "60kg" }), // sin squat ese día
        "2026-09-07": entry("A", { squat: "80kg" }),
      },
    };
    expect(lastWeightFor(done, "jose", "squat", "2026-09-15")).toBe("80kg");
  });

  test("undefined si el atleta no existe, no hay historial o el peso es vacío", () => {
    const soloAndrea: GymDoneMap = { andrea: { "2026-09-07": entry("A", { squat: "40kg" }) } };
    expect(lastWeightFor(soloAndrea, "jose", "squat", "2026-09-15")).toBeUndefined();

    expect(lastWeightFor({ jose: {} }, "jose", "squat", "2026-09-15")).toBeUndefined();

    expect(lastWeightFor(undefined, "jose", "squat", "2026-09-15")).toBeUndefined();

    const vacio: GymDoneMap = { jose: { "2026-09-07": entry("A", { squat: "" }) } };
    expect(lastWeightFor(vacio, "jose", "squat", "2026-09-15")).toBeUndefined();
  });

  test("no mezcla atletas: lo de José nunca sale bajo Andrea", () => {
    const done: GymDoneMap = {
      jose: { "2026-09-07": entry("A", { squat: "80kg" }) },
      andrea: { "2026-09-07": entry("A", { squat: "40kg" }) },
    };
    expect(lastWeightFor(done, "andrea", "squat", "2026-09-15")).toBe("40kg");
    expect(lastWeightFor(done, "jose", "squat", "2026-09-15")).toBe("80kg");
    expect(lastWeightFor(done, "pepito", "squat", "2026-09-15")).toBeUndefined();
  });
});
