import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { garminQO, planQO, postUpdate } from "@/lib/api";
import { getReadinessScore, READINESS_COLORS } from "@/lib/readiness";

const tabs = [
  { to: "/", label: "Plan", icon: "📅" },
  { to: "/historial", label: "Historial", icon: "📊" },
  { to: "/diagnostico", label: "Diag.", icon: "🩺" },
  { to: "/aprende", label: "Aprende", icon: "📘" },
] as const;

function stateStyle(s: string): { bg: string; color: string } {
  if (s.includes("FATIG")) return { bg: "rgba(239,68,68,0.15)", color: "#EF4444" };
  if (s.includes("DESCARG")) return { bg: "rgba(16,185,129,0.15)", color: "#10B981" };
  if (s.includes("BALANCE")) return { bg: "rgba(251,191,36,0.15)", color: "#FBBF24" };
  return { bg: "rgba(233,206,169,0.1)", color: "#E9CEA9" };
}

export function MobileTopBar() {
  const { data: plan } = useQuery(planQO());
  const { data: garmin } = useQuery(garminQO());
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

  const state = (
    typeof plan?.athlete_state === "string"
      ? plan.athlete_state
      : ((plan?.athlete_state as any)?.state ?? "")
  )
    .toString()
    .toUpperCase();
  const st = stateStyle(state);

  const hrvArr: any[] = (garmin as any)?.health?.hrv ?? [];
  const rhrArr: any[] = (garmin as any)?.health?.resting_hr ?? [];
  const hrv = hrvArr.filter((h: any) => h?.hrv != null).at(-1)?.hrv;
  const rhr = rhrArr.filter((h: any) => h?.resting_hr != null).at(-1)?.resting_hr;
  const readiness = getReadinessScore(garmin);

  return (
    <header
      className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
      style={{ background: "#0D0D0D", borderBottom: "1px solid rgba(233,206,169,0.12)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            style={{ color: "#E9CEA9", fontWeight: 800, letterSpacing: "0.08em", fontSize: 14 }}
          >
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
          style={{ color: "#9A9A9A" }}
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
            HRV <span className="metric-num">{hrv != null ? Math.round(Number(hrv)) : "—"}</span>
          </span>
          <span>
            FC <span className="metric-num">{rhr != null ? Math.round(Number(rhr)) : "—"}</span>
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
        background: "#0D0D0D",
        borderTop: "1px solid rgba(233,206,169,0.15)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5"
            style={{
              color: active ? "#E9CEA9" : "#9A9A9A",
              fontWeight: active ? 700 : 500,
              letterSpacing: "0.06em",
            }}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-[10px] uppercase">{t.label}</span>
            {active && (
              <span
                className="absolute top-0 h-[2px] w-10 rounded-b"
                style={{ background: "#E9CEA9" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
