import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { gymQO } from "@/lib/api";
import { PageShell } from "@/components/entrenador/PageShell";
import { QueryState } from "@/components/entrenador/QueryState";
import { GymSessionPicker } from "@/components/entrenador/gym/GymSessionPicker";
import { GymSessionCard } from "@/components/entrenador/gym/GymSessionCard";
import { PICK_RULES } from "@/lib/gym/loads.js";

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
  const [picked, setPicked] = useState<string | null>(null);

  const sessions = data?.sessions ?? {};
  const bloque = BLOQUE.filter((c) => sessions[c]);
  const casa = CASA.filter((c) => sessions[c]);
  const rules = data?.rules ?? [];

  // Sin `picked` todavía (primer render, o los datos aún en vuelo) cae en la
  // primera del bloque. El estado no se inicializa con bloque[0] porque en el
  // primer render `sessions` está vacío y ese valor se quedaría congelado.
  const active = (picked && sessions[picked] && picked) || bloque[0] || casa[0];
  const session = active ? sessions[active] : null;

  return (
    <PageShell title="Gimnasio" subtitle="Bloque de fuerza · Sesiones, cargas y reglas">
      <QueryState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && !session}
        loadingMessage="Cargando el bloque de fuerza…"
        emptyMessage="Sin sesiones de fuerza disponibles."
      >
        <div className="gym mt-6 flex flex-col gap-2">
          {bloque.length > 0 && (
            <>
              <h2 className="gym-sec">Las sesiones del bloque</h2>
              <GymSessionPicker
                sessions={sessions}
                codes={bloque}
                active={active}
                onSelect={setPicked}
              />
            </>
          )}

          {casa.length > 0 && (
            <>
              <h2 className="gym-sec">En casa, cuando te sobre energía</h2>
              <GymSessionPicker
                sessions={sessions}
                codes={casa}
                active={active}
                onSelect={setPicked}
              />
            </>
          )}

          {session && <GymSessionCard session={session} />}

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
      </QueryState>
    </PageShell>
  );
}
