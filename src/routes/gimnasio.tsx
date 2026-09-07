import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { gymDoneQO, gymQO, type GymDoneMap } from "@/lib/api";
import { useAthleteId } from "@/hooks/use-athlete-id";
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

/** Los dos perfiles, en el orden en que se muestran en la franja conjunta. */
const ATLETAS: { id: string; label: string }[] = [
  { id: "jose", label: "José" },
  { id: "andrea", label: "Andrea" },
];

/** Igual que en GymSessionCard: fecha local, no UTC. Se repite a propósito —
 *  los dos archivos son del mismo carril y no hay dónde compartirla sin tocar
 *  un archivo de otro. */
function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type SemanaGym = { start: string; end: string; sessions: { date: string; session: string }[] };

/**
 * `gym.weeks` llega como `unknown[]` desde el contrato (schemas.ts lo deja sin
 * tipar porque solo esta vista lo usa). Se estrecha aquí, campo a campo, y lo
 * que no calce se descarta en vez de romper la página.
 */
function parseSemana(raw: unknown): SemanaGym | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.start !== "string" || typeof w.end !== "string") return null;
  const sessions: SemanaGym["sessions"] = [];
  for (const s of Array.isArray(w.sessions) ? w.sessions : []) {
    if (!s || typeof s !== "object") continue;
    const e = s as Record<string, unknown>;
    if (typeof e.date === "string" && typeof e.session === "string") {
      sessions.push({ date: e.date, session: e.session });
    }
  }
  return { start: w.start, end: w.end, sessions };
}

/** La semana que contiene hoy; si el bloque ya terminó (o aún no arranca), la
 *  siguiente que quede por delante. */
function semanaVigente(weeks: unknown[] | undefined, hoy: string): SemanaGym | null {
  const parsed = (weeks ?? []).map(parseSemana).filter((w): w is SemanaGym => w !== null);
  return (
    parsed.find((w) => w.start <= hoy && hoy <= w.end) ?? parsed.find((w) => w.start > hoy) ?? null
  );
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function diaCorto(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d}`;
}

/**
 * La vista conjunta: quién marcó qué, en las sesiones agendadas de esta semana.
 * Es lo único de la página que mira a los DOS atletas a la vez — por eso lee
 * `gymDoneQO()` sin parámetro (el backend siempre devuelve los dos).
 */
function FranjaConjunta({ semana, done }: { semana: SemanaGym; done: GymDoneMap | undefined }) {
  const hoy = todayISO();
  if (semana.sessions.length === 0) return null;

  return (
    <div className="club-card flex flex-col gap-2 p-3">
      <h2 className="eyebrow">Esta semana, los dos</h2>
      <div className="flex flex-col gap-1.5">
        {semana.sessions.map((s) => (
          <div key={s.date} className="flex items-center justify-between gap-3 text-sm">
            <span className={s.date === hoy ? "text-gold" : "text-muted"}>
              <span className="mono">{diaCorto(s.date)}</span> · Sesión {s.session}
            </span>
            <span className="flex shrink-0 gap-1.5">
              {ATLETAS.map((a) => {
                const hecha = done?.[a.id]?.[s.date]?.code === s.session;
                return (
                  <span
                    key={a.id}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      hecha ? "border-ok/40 bg-ok/10 text-ok" : "border-border text-faint"
                    }`}
                  >
                    {a.label} {hecha ? "✓" : "–"}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GimnasioPage() {
  const athlete = useAthleteId();
  const { data, isLoading, error } = useQuery(gymQO(athlete));
  const { data: done } = useQuery(gymDoneQO());
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
  const semana = semanaVigente(data?.weeks ?? undefined, todayISO());

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
          {semana && <FranjaConjunta semana={semana} done={done} />}

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
