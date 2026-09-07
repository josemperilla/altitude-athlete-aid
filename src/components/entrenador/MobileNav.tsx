import { Link, useRouterState } from "@tanstack/react-router";
import { Settings, Zap } from "lucide-react";
import { useAthlete } from "@/hooks/use-athlete";
import { useAthleteId } from "@/hooks/use-athlete-id";
import { setActiveAthlete, type AthleteId } from "@/lib/athlete/store";
import { READINESS_COLORS } from "@/lib/readiness";
import { NAV_TABS } from "@/lib/navigation";
import { stateColor, stateLabel } from "@/lib/athlete-state";
import { ThemeToggle } from "@/components/entrenador/ThemeToggle";

const PROFILES: { id: AthleteId; label: string }[] = [
  { id: "jose", label: "José" },
  { id: "andrea", label: "Andrea" },
];

function ProfileSwitch() {
  const athlete = useAthleteId();
  return (
    <div className="flex shrink-0 items-center gap-1 p-0.5 rounded bg-surface-2">
      {PROFILES.map((p) => {
        const active = p.id === athlete;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveAthlete(p.id)}
            aria-pressed={active}
            className={
              "px-2 py-1 rounded text-[10px] font-bold tracking-[0.06em] uppercase transition-colors " +
              (active ? "bg-gold/10 text-gold" : "text-muted hover:text-fg")
            }
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function MobileTopBar() {
  const { readiness, athleteState } = useAthlete();

  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-gold" />
          <span className="text-gold font-extrabold tracking-[0.08em] text-sm">ENTRENADOR</span>
          {athleteState && (
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.08em]"
              style={{
                color: stateColor(athleteState),
                background: `color-mix(in srgb, ${stateColor(athleteState)} 15%, transparent)`,
              }}
            >
              {stateLabel(athleteState)}
            </span>
          )}
        </div>
        {readiness && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: READINESS_COLORS[readiness.color] }}
            />
            <span className="metric-num" style={{ color: READINESS_COLORS[readiness.color] }}>
              {readiness.score}
            </span>
            <span className="font-semibold" style={{ color: READINESS_COLORS[readiness.color] }}>
              {readiness.label}
            </span>
          </div>
        )}
      </div>
      <ProfileSwitch />
      <ThemeToggle />
      <Link
        to="/ajustes"
        aria-label="Ajustes"
        className="shrink-0 p-2 -m-1 text-muted rounded transition-colors hover:text-fg"
      >
        <Settings size={17} />
      </Link>
    </header>
  );
}

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 grid border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      style={{
        // Las columnas salen de NAV_TABS y no de una clase fija: estaba en
        // grid-cols-4 y al añadir Gimnasio la barra se partió en dos filas.
        gridTemplateColumns: `repeat(${NAV_TABS.length}, minmax(0, 1fr))`,
      }}
    >
      {NAV_TABS.map((t) => {
        const active = pathname === t.to;
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={
              "relative flex flex-col items-center justify-center gap-1 py-2.5 " +
              (active ? "text-gold font-bold" : "text-muted font-medium")
            }
          >
            {active && <span className="absolute top-0 h-[2px] w-10 rounded-b bg-gold" />}
            <Icon size={17} strokeWidth={active ? 2.4 : 2} />
            <span className="text-[10px] uppercase tracking-[0.06em]">{t.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
