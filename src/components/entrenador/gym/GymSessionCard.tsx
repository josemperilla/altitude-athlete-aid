import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gymDoneQO, postGymDone, type GymSession } from "@/lib/api";
import { useAthleteId } from "@/hooks/use-athlete-id";
import { WEIGHT_GUIDE } from "@/lib/gym/loads.js";
import { GymExercise } from "./GymExercise";

/**
 * Fecha de hoy en horario local. `toISOString()` no sirve: a las 8 p.m. en
 * Bogotá ya es el día siguiente en UTC y la sesión quedaría marcada mañana.
 */
function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Los ejercicios donde "cuánto cargaste" es una pregunta real: los que tienen
 *  guía de peso. El calentamiento y el tronco van por RPE, no por kilos. */
function weightedItems(session: GymSession): { id: string; name: string }[] {
  const guides = WEIGHT_GUIDE as Record<string, unknown>;
  const out: { id: string; name: string }[] = [];
  for (const block of session.blocks) {
    for (const it of block.items) {
      if (it.id && it.anim && guides[it.anim] !== undefined) out.push({ id: it.id, name: it.name });
    }
  }
  return out;
}

export function GymSessionCard({ session }: { session: GymSession }) {
  const athlete = useAthleteId();
  const qc = useQueryClient();
  const { data: done } = useQuery(gymDoneQO());
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const date = todayISO();
  const entry = done?.[athlete]?.[date];
  // La entrada del día es una sola: si hoy quedó marcada otra sesión, esta no
  // está hecha (y marcarla la reemplaza, que es justo lo que uno querría).
  const isDone = entry?.code === session.code;
  const savedWeights = isDone ? (entry?.weights ?? {}) : {};

  const mut = useMutation({
    mutationFn: (vars: { done: boolean; weights: Record<string, string> }) =>
      postGymDone({ date, code: session.code, done: vars.done, weights: vars.weights }, athlete),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gym-done"] }),
    onError: (e) => toast.error(`Error: ${e instanceof Error ? e.message : "no se pudo guardar"}`),
  });

  const items = weightedItems(session);

  /** Manda el peso de un ejercicio junto con todos los ya guardados. El POST
   *  reemplaza la entrada entera, así que enviar solo uno borraría los demás. */
  function saveWeight(id: string, value: string) {
    const next = { ...savedWeights, ...drafts, [id]: value.trim() };
    for (const k of Object.keys(next)) if (!next[k]) delete next[k];
    if (JSON.stringify(next) === JSON.stringify(savedWeights)) return;
    mut.mutate({ done: true, weights: next });
  }

  return (
    <section className="club-card gym-session" data-code={session.code}>
      <div className="gym-session-head">
        <div className="sid">
          <span className="code">{session.label || `Sesión ${session.code}`}</span>
          <span className="meta mono">
            {session.weekday} · ~{session.duration_min} min
          </span>
        </div>
        <h3>{session.title}</h3>
        <p className="summary">{session.summary}</p>

        <button
          type="button"
          aria-pressed={isDone}
          disabled={mut.isPending}
          onClick={() => mut.mutate({ done: !isDone, weights: isDone ? {} : savedWeights })}
          className={`mt-3 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
            isDone
              ? "border-ok/40 bg-ok/10 text-ok"
              : "border-border text-muted hover:border-border-strong hover:text-fg"
          }`}
        >
          {isDone ? "Hecha hoy ✓" : "Marcar hecha hoy"}
        </button>
      </div>

      {isDone && items.length > 0 && (
        <div className="mx-4 mt-3 rounded-md border border-border bg-surface-2/40 p-3">
          <h4 className="text-xs tracking-wide text-faint uppercase">Qué cargaste hoy</h4>
          <div className="mt-2 flex flex-col gap-1.5">
            {items.map((it) => (
              <label key={it.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">{it.name}</span>
                <input
                  type="text"
                  inputMode="text"
                  placeholder="—"
                  value={drafts[it.id] ?? savedWeights[it.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                  onBlur={(e) => saveWeight(it.id, e.target.value)}
                  className="mono w-20 shrink-0 rounded border border-border bg-surface px-2 py-1 text-right text-fg focus:border-gold focus:outline-none"
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-faint">
            Se guarda al salir del campo. Escribe la unidad que uses: «40 kg», «pin 6».
          </p>
        </div>
      )}

      {session.blocks.map((block) => (
        <div key={block.name}>
          <div className="gym-block-head">
            <span>{block.name}</span>
            <span className="mins mono">{block.minutes} min</span>
          </div>
          {block.note && <div className="gym-block-note">{block.note}</div>}
          {block.items.map((item, i) => (
            <GymExercise key={`${block.name}-${item.name}-${i}`} item={item} />
          ))}
        </div>
      ))}
    </section>
  );
}
