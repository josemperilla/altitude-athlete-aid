import { Link, useRouterState } from "@tanstack/react-router";
import { MapPin, RefreshCw, Settings, Zap } from "lucide-react";
import { useAthlete } from "@/hooks/use-athlete";
import { READINESS_COLORS } from "@/lib/readiness";
import { NAV_TABS } from "@/lib/navigation";
import { ALTITUDE_LABEL } from "@/lib/config";
import { stateColor, stateLabel } from "@/lib/athlete-state";
import { useUpdatePlan } from "@/hooks/use-update-plan";

export function Sidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { readiness, hrv, rhr, athleteState } = useAthlete();
  const update = useUpdatePlan();

  return (
    <aside className="hidden md:flex flex-col w-[248px] shrink-0 h-screen sticky top-0 px-5 py-6 gap-6 border-r border-border bg-surface">
      <div>
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-gold" />
          <h1 className="text-lg text-gold font-extrabold tracking-[0.08em]">ENTRENADOR</h1>
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded bg-gold/10 text-gold tracking-[0.08em] font-semibold">
          <MapPin size={10} />
          {ALTITUDE_LABEL}
        </div>
      </div>

      <Link to="/cuerpo" className="club-card block px-3 py-3">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Disposición</span>
          {readiness && (
            <span
              className="text-[10px] font-bold tracking-[0.08em]"
              style={{ color: READINESS_COLORS[readiness.color] }}
            >
              {readiness.label.toUpperCase()}
            </span>
          )}
        </div>
        {readiness ? (
          <>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className="text-3xl leading-none metric-num"
                style={{ color: READINESS_COLORS[readiness.color] }}
              >
                {readiness.score}
              </span>
              <span className="text-[11px] text-faint">/100</span>
            </div>
            <div className="mt-2 h-1 rounded bg-gold/10">
              <div
                className="h-1 rounded"
                style={{
                  width: `${readiness.score}%`,
                  background: READINESS_COLORS[readiness.color],
                }}
              />
            </div>
            <div className="mt-2 flex gap-3 text-[10px] text-muted">
              <span>
                HRV <span className="metric-num">{hrv}</span>
              </span>
              <span>
                FC <span className="metric-num">{rhr}</span>
              </span>
            </div>
          </>
        ) : (
          <div className="text-sm mt-1 text-muted">Sin datos suficientes</div>
        )}
      </Link>

      {athleteState && (
        <div
          className="px-3 py-2 rounded text-xs text-center font-bold tracking-[0.1em]"
          style={{
            color: stateColor(athleteState),
            background: `color-mix(in srgb, ${stateColor(athleteState)} 15%, transparent)`,
          }}
        >
          {stateLabel(athleteState)}
        </div>
      )}

      <nav className="flex flex-col gap-1 mt-2">
        {NAV_TABS.map((t) => {
          const active = pathname === t.to;
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={
                "relative flex items-center gap-2.5 px-3 py-2.5 text-sm rounded transition-colors " +
                (active
                  ? "bg-gold/10 text-gold font-bold tracking-[0.06em] uppercase"
                  : "text-muted font-medium tracking-[0.06em] uppercase hover:text-fg")
              }
            >
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded bg-gold" />
              )}
              <Icon size={15} />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <Link
          to="/ajustes"
          className="flex items-center gap-2 px-3 py-2 text-xs text-muted rounded transition-colors hover:text-fg"
        >
          <Settings size={13} /> Ajustes
        </Link>
        <button
          onClick={() => update.mutate()}
          disabled={update.isPending}
          className="btn-gold w-full flex items-center justify-center gap-2 text-sm"
        >
          {update.isPending ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
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
