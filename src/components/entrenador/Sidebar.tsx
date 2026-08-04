import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { garminQO, planQO, postUpdate } from "@/lib/api";
import { getReadinessScore, READINESS_COLORS, type ReadinessResult } from "@/lib/readiness";

const tabs = [
  { to: "/", label: "Plan" },
  { to: "/historial", label: "Historial" },
  { to: "/diagnostico", label: "Diagnóstico" },
  { to: "/aprende", label: "Aprende" },
] as const;

function pickHRV(g: any): string {
  const arr = g?.health?.hrv;
  if (!Array.isArray(arr)) return "—";
  const last = arr.filter((h: any) => h?.hrv != null).at(-1);
  const v = last?.hrv;
  return v != null && !isNaN(Number(v)) ? String(Math.round(Number(v))) : "—";
}
function pickRHR(g: any): string {
  const arr = g?.health?.resting_hr;
  if (!Array.isArray(arr)) return "—";
  const last = arr.filter((h: any) => h?.resting_hr != null).at(-1);
  const v = last?.resting_hr;
  return v != null && !isNaN(Number(v)) ? String(Math.round(Number(v))) : "—";
}
function pickState(p: any): string {
  const s =
    typeof p?.athlete_state === "string"
      ? p.athlete_state
      : (p?.athlete_state?.state ?? p?.athlete_state?.label);
  return (s ?? "").toString().toUpperCase();
}

function stateStyle(s: string): { bg: string; color: string } {
  if (s.includes("FATIG")) return { bg: "rgba(239,68,68,0.15)", color: "#EF4444" };
  if (s.includes("DESCARG")) return { bg: "rgba(16,185,129,0.15)", color: "#10B981" };
  if (s.includes("BALANCE")) return { bg: "rgba(251,191,36,0.15)", color: "#FBBF24" };
  return { bg: "rgba(233,206,169,0.1)", color: "#E9CEA9" };
}

export function Sidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data: garmin } = useQuery(garminQO());
  const { data: plan } = useQuery(planQO());
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: postUpdate,
    onSuccess: () => {
      toast.success("Plan actualizado");
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["garmin"] });
    },
    onError: (e: any) => toast.error(`Error: ${e?.message ?? "no se pudo actualizar"}`),
  });

  const hrv = pickHRV(garmin);
  const rhr = pickRHR(garmin);
  const readiness = getReadinessScore(garmin);
  const state = pickState(plan);
  const st = stateStyle(state);

  return (
    <aside
      className="hidden md:flex flex-col w-[260px] shrink-0 h-screen sticky top-0 px-5 py-6 gap-6"
      style={{ background: "#0D0D0D", borderRight: "1px solid rgba(233,206,169,0.1)" }}
    >
      <div>
        <h1
          className="text-xl"
          style={{ color: "#E9CEA9", fontWeight: 800, letterSpacing: "0.08em" }}
        >
          ⚡ ENTRENADOR
        </h1>
        <div
          className="mt-3 inline-block px-2.5 py-1 text-[11px] rounded"
          style={{
            background: "rgba(233,206,169,0.1)",
            color: "#E9CEA9",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          📍 BOGOTÁ · 2.600 M
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {readiness && <ReadinessCard readiness={readiness} />}
        <div className="grid grid-cols-2 gap-3">
          <MetricMini label="HRV" value={hrv} />
          <MetricMini label="FC REPOSO" value={rhr} />
        </div>
      </div>

      {state && (
        <div
          className="px-3 py-2 rounded text-xs text-center"
          style={{ background: st.bg, color: st.color, letterSpacing: "0.1em", fontWeight: 700 }}
        >
          {state}
        </div>
      )}

      <nav className="flex flex-col gap-1 mt-2">
        {tabs.map((t) => {
          const active = pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className="relative px-3 py-2.5 text-sm rounded transition-colors"
              style={{
                color: active ? "#E9CEA9" : "#9A9A9A",
                background: active ? "rgba(233,206,169,0.08)" : "transparent",
                fontWeight: active ? 700 : 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {active && (
                <span
                  className="absolute left-0 top-2 bottom-2 w-[2px] rounded"
                  style={{ background: "#E9CEA9" }}
                />
              )}
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <button
          onClick={() => update.mutate()}
          disabled={update.isPending}
          className="btn-gold w-full flex items-center justify-center gap-2 text-sm"
        >
          {update.isPending ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Actualizando…
            </>
          ) : (
            "Actualizar plan"
          )}
        </button>
      </div>
    </aside>
  );
}

/** Desviación de hoy contra la base móvil, en porcentaje con signo. */
function delta(today: number, base: number): string {
  const pct = Math.round(((today - base) / base) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function ReadinessCard({ readiness: r }: { readiness: ReadinessResult }) {
  const color = READINESS_COLORS[r.color];
  return (
    <div
      className="rounded px-3 py-3"
      style={{ background: "#111", border: `1px solid ${color}40` }}
    >
      <div className="flex items-baseline justify-between">
        <span
          className="text-[10px]"
          style={{ color: "#9A9A9A", letterSpacing: "0.1em", fontWeight: 600 }}
        >
          DISPOSICIÓN
        </span>
        <span className="text-[10px]" style={{ color, fontWeight: 700, letterSpacing: "0.08em" }}>
          {r.label.toUpperCase()}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl leading-none metric-num" style={{ color }}>
          {r.score}
        </span>
        <span className="text-[11px]" style={{ color: "#555" }}>
          /100
        </span>
      </div>
      <div className="mt-2 h-1 rounded" style={{ background: "rgba(233,206,169,0.12)" }}>
        <div className="h-1 rounded" style={{ width: `${r.score}%`, background: color }} />
      </div>
      <div className="mt-2 text-[10px]" style={{ color: "#9A9A9A" }}>
        HRV {delta(r.todayHrv, r.baseHrv)} · FC {delta(r.todayRhr, r.baseRhr)} vs base 7d
      </div>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded px-3 py-3"
      style={{ background: "#111", border: "1px solid rgba(233,206,169,0.12)" }}
    >
      <div
        className="text-[10px]"
        style={{ color: "#9A9A9A", letterSpacing: "0.1em", fontWeight: 600 }}
      >
        {label}
      </div>
      <div className="text-2xl mt-1 metric-num leading-none">{value}</div>
    </div>
  );
}
