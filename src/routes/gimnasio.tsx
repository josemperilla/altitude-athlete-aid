import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { gymQO } from "@/lib/api";
import { PageHeader } from "@/components/entrenador/PageHeader";
import { GymSessionPicker } from "@/components/entrenador/gym/GymSessionPicker";
import { PICK_RULES } from "@/lib/gym/loads.js";
import { ERR, MUTED } from "@/lib/theme";

export const Route = createFileRoute("/gimnasio")({
  head: () => ({
    meta: [
      { title: "Gimnasio · Entrenador" },
      {
        name: "description",
        content: "Bloque de fuerza para la media maratón: sesiones, cargas y reglas.",
      },
    ],
  }),
  component: GimnasioPage,
});

// Las de casa van aparte a propósito: no están agendadas, no cuentan para el
// progreso del bloque y se eligen por cómo amaneciste, no por fecha.
const BLOQUE = ["A", "B", "M"];
const CASA = ["C1", "C2"];

function GimnasioPage() {
  const { data, isLoading, error } = useQuery(gymQO());
  const [showPick, setShowPick] = useState(false);

  const sessions = data?.sessions ?? {};
  const bloque = BLOQUE.filter((c) => sessions[c]);
  const casa = CASA.filter((c) => sessions[c]);
  const rules = data?.rules ?? [];

  return (
    <div className="p-6 md:p-10 max-w-[1400px] mx-auto">
      <PageHeader title="Gimnasio" subtitle="Bloque de fuerza · Sesiones, cargas y reglas" />

      {isLoading && (
        <div className="club-card p-8 mt-6 text-center" style={{ color: MUTED }}>
          Cargando el bloque de fuerza…
        </div>
      )}

      {error && (
        <div className="club-card p-6 mt-6" style={{ borderLeft: `3px solid ${ERR}` }}>
          <div style={{ color: ERR, fontWeight: 700 }}>No se pudo cargar el gimnasio</div>
          <div className="text-sm mt-1" style={{ color: MUTED }}>
            {(error as Error).message}
          </div>
        </div>
      )}

      {!isLoading && !error && (
        <div className="gym mt-6 flex flex-col gap-2">
          {bloque.length > 0 && (
            <>
              <h2 className="gym-sec">Las sesiones del bloque</h2>
              <GymSessionPicker sessions={sessions} codes={bloque} />
            </>
          )}

          {casa.length > 0 && (
            <>
              <h2 className="gym-sec">En casa, cuando te sobre energía</h2>
              <GymSessionPicker sessions={sessions} codes={casa} />
            </>
          )}

          <div className="club-card gym-pick">
            <button
              type="button"
              className="gym-pick-head"
              aria-expanded={showPick}
              onClick={() => setShowPick((v) => !v)}
            >
              Cómo elegir el peso
              <span className="chev mono">{showPick ? "reglas ▴" : "reglas ▾"}</span>
            </button>
            {showPick && (
              <ol className="gym-pick-body">
                {(PICK_RULES as string[]).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            )}
          </div>

          {rules.length > 0 && (
            <>
              <h2 className="gym-sec">Valen más que los ejercicios</h2>
              <ol className="gym-rules club-card">
                {rules.map((r) => (
                  <li key={r.rule}>
                    <b>{r.rule}</b>
                    <span>{r.detail}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
