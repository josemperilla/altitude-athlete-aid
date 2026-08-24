import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { garminQO, getAthleteState, planQO } from "@/lib/api";
import { getReadinessScore, latestReading, READINESS_COLORS } from "@/lib/readiness";
import { NAV_TABS } from "@/lib/navigation";
import { stateStyle, GOLD, MUTED, PANEL } from "@/lib/theme";
import { useUpdatePlan } from "@/hooks/use-update-plan";

export function MobileTopBar() {
  const { data: plan } = useQuery(planQO());
  const { data: garmin } = useQuery(garminQO());

  const update = useUpdatePlan();

  const state = getAthleteState(plan);
  const st = stateStyle(state);

  const hrv = latestReading(garmin, "hrv");
  const rhr = latestReading(garmin, "resting_hr");
  const readiness = getReadinessScore(garmin);

  return (
    <header
      className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
      style={{ background: PANEL, borderBottom: "1px solid rgba(233,206,169,0.12)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ color: GOLD, fontWeight: 800, letterSpacing: "0.08em", fontSize: 14 }}>
            ⚡ ENTRENADOR
          </span>
          {state && (
            <span
              className="px-2 py-0.5 rounded text-[10px]"
              style={{
                background: st.bg,
                color: st.color,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              {state}
            </span>
          )}
        </div>
        <div
          className="mt-1 flex flex-wrap items-center gap-3 text-[11px]"
          style={{ color: MUTED }}
        >
          {readiness && (
            <span
              className="flex items-center gap-1"
              title={`HRV ${readiness.todayHrv} (base ${readiness.baseHrv}) · FC ${readiness.todayRhr} (base ${readiness.baseRhr})`}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: READINESS_COLORS[readiness.color] }}
              />
              <span className="metric-num" style={{ color: READINESS_COLORS[readiness.color] }}>
                {readiness.score}
              </span>
              <span style={{ color: READINESS_COLORS[readiness.color], fontWeight: 600 }}>
                {readiness.label}
              </span>
            </span>
          )}
          <span>
            HRV <span className="metric-num">{hrv}</span>
          </span>
          <span>
            FC <span className="metric-num">{rhr}</span>
          </span>
        </div>
      </div>
      <button
        onClick={() => update.mutate()}
        disabled={update.isPending}
        className="btn-gold text-[11px] px-3 py-2 shrink-0"
      >
        {update.isPending ? "…" : "Actualizar"}
      </button>
    </header>
  );
}

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4"
      style={{
        background: PANEL,
        borderTop: "1px solid rgba(233,206,169,0.15)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {NAV_TABS.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5"
            style={{
              color: active ? GOLD : MUTED,
              fontWeight: active ? 700 : 500,
              letterSpacing: "0.06em",
            }}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-[10px] uppercase">{t.short}</span>
            {active && (
              <span
                className="absolute top-0 h-[2px] w-10 rounded-b"
                style={{ background: GOLD }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
