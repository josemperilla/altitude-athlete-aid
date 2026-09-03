import { Link, useRouterState } from "@tanstack/react-router";
import { useAthlete } from "@/hooks/use-athlete";
import { READINESS_COLORS, type ReadinessResult } from "@/lib/readiness";
import { NAV_TABS } from "@/lib/navigation";
import { stateStyle, GOLD, MUTED, PANEL } from "@/lib/theme";
import { useUpdatePlan } from "@/hooks/use-update-plan";

export function Sidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { readiness, hrv, rhr, athleteState } = useAthlete();

  const update = useUpdatePlan();
  const st = stateStyle(athleteState);

  return (
    <aside
      className="hidden md:flex flex-col w-[260px] shrink-0 h-screen sticky top-0 px-5 py-6 gap-6"
      style={{ background: PANEL, borderRight: "1px solid rgba(233,206,169,0.1)" }}
    >
      <div>
        <h1 className="text-xl" style={{ color: GOLD, fontWeight: 800, letterSpacing: "0.08em" }}>
          ⚡ ENTRENADOR
        </h1>
        <div
          className="mt-3 inline-block px-2.5 py-1 text-[11px] rounded"
          style={{
            background: "rgba(233,206,169,0.1)",
            color: GOLD,
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

      {athleteState && (
        <div
          className="px-3 py-2 rounded text-xs text-center"
          style={{ background: st.bg, color: st.color, letterSpacing: "0.1em", fontWeight: 700 }}
        >
          {athleteState}
        </div>
      )}

      <nav className="flex flex-col gap-1 mt-2">
        {NAV_TABS.map((t) => {
          const active = pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className="relative px-3 py-2.5 text-sm rounded transition-colors"
              style={{
                color: active ? GOLD : MUTED,
                background: active ? "rgba(233,206,169,0.08)" : "transparent",
                fontWeight: active ? 700 : 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {active && (
                <span
                  className="absolute left-0 top-2 bottom-2 w-[2px] rounded"
                  style={{ background: GOLD }}
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
          style={{ color: MUTED, letterSpacing: "0.1em", fontWeight: 600 }}
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
      <div className="mt-2 text-[10px]" style={{ color: MUTED }}>
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
        style={{ color: MUTED, letterSpacing: "0.1em", fontWeight: 600 }}
      >
        {label}
      </div>
      <div className="text-2xl mt-1 metric-num leading-none">{value}</div>
    </div>
  );
}
