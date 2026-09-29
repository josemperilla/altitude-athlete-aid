import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { performanceQO } from "@/lib/api";
import type { Performance, PerformanceInsight } from "@/lib/schemas";
import { PageShell } from "@/components/entrenador/PageShell";
import { QueryState } from "@/components/entrenador/QueryState";

export const Route = createFileRoute("/rendimiento")({
  head: () => ({
    meta: [
      { title: "Rendimiento · Entrenador" },
      {
        name: "description",
        content:
          "Intensidad real, volumen, eficiencia aeróbica y técnica desde tu historial de Garmin.",
      },
    ],
  }),
  component: RendimientoPage,
});

// Tres zonas en orden de intensidad: rampa ordinal de un solo tono (tokens
// --zone-*, validados por tema). El orden de la lista es el orden de la pila.
const ZONES = [
  { key: "low", label: "Suave · <156 lpm", color: "var(--zone-low)" },
  { key: "mid", label: "Umbral · 156–175", color: "var(--zone-mid)" },
  { key: "high", label: "Alto · ≥176", color: "var(--zone-high)" },
] as const;

const AXIS_TICK = { fill: "var(--text-muted)", fontSize: 11 };
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const weekLabel = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];

function RendimientoPage() {
  const { data, isLoading, error } = useQuery(performanceQO());
  const empty = !data?.kpis || data.weekly.length === 0;
  const failed = data?.history_status?.ok === false;

  return (
    <PageShell title="Rendimiento" subtitle="Últimas 26 semanas · historial de Garmin">
      <QueryState
        isLoading={isLoading}
        error={error}
        isEmpty={empty}
        loadingMessage="Calculando tu rendimiento…"
        emptyMessage={
          failed
            ? `Garmin no entregó el historial en la última actualización (${data?.history_status?.at ?? "—"}). Vuelve a pulsar “Actualizar plan” en unos minutos. Detalle: ${data?.history_status?.error ?? "desconocido"}`
            : "Todavía no hay historial. Pulsa “Actualizar plan” y el tablero se arma con tus carreras de Garmin."
        }
      >
        {data && <Dashboard perf={data} />}
      </QueryState>
    </PageShell>
  );
}

function Dashboard({ perf }: { perf: Performance }) {
  const k = perf.kpis;
  const z = k?.zones_pct_12w;
  const target = perf.zone_model?.low_target_pct ?? 75;
  const easyShare =
    k?.easy_runs && k.easy_runs_in_zone != null ? `${k.easy_runs_in_zone} de ${k.easy_runs}` : "—";

  return (
    <div className="flex flex-col gap-8 mt-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Tiempo suave (12 sem)"
          value={z ? `${z.low} %` : "—"}
          note={`Meta ≥${target} %`}
        />
        <StatTile
          label="Volumen medio"
          value={k?.weekly_km_12w != null ? `${k.weekly_km_12w} km` : "—"}
          note="por semana, 12 sem"
        />
        <StatTile
          label="Semanas con 3+ carreras"
          value={k?.weeks_3plus_runs != null ? `${k.weeks_3plus_runs} de ${k.weeks_counted}` : "—"}
          note="la constancia construye base"
        />
        <StatTile label="Rodajes fáciles en zona" value={easyShare} note="FC media ≤156 lpm" />
        <StatTile
          label="VO2máx"
          value={k?.vo2max != null ? String(k.vo2max) : "—"}
          note={k?.vo2max_date ? `Garmin, ${weekLabel(k.vo2max_date)}` : "estimación de Garmin"}
        />
        <StatTile
          label="Tirada más larga"
          value={k?.longest_km_12w != null ? `${k.longest_km_12w} km` : "—"}
          note="últimas 12 semanas"
        />
        <StatTile
          label="FC máx observada"
          value={k?.max_hr_observed != null ? `${k.max_hr_observed} lpm` : "—"}
          note="2.º valor más alto, 26 sem"
        />
        <StatTile
          label="Variación semanal"
          value={k?.weekly_km_cv != null ? k.weekly_km_cv.toFixed(2) : "—"}
          note="0 = volumen parejo"
        />
      </section>

      {perf.insights.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">Lo que dicen tus datos</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {perf.insights.map((i) => (
              <InsightCard key={i.title} insight={i} />
            ))}
          </div>
        </section>
      )}

      <WeeklyChart perf={perf} />
      <MonthlyZonesChart perf={perf} target={target} />

      <div className="grid lg:grid-cols-2 gap-4">
        <MonthlyLine
          title="Eficiencia aeróbica"
          subtitle="Metros por minuto por latido, rodajes suaves en Bogotá. Más alto = más base."
          data={perf.monthly.map((m) => ({
            label: monthLabel(m.month),
            value: m.efficiency ?? null,
          }))}
          format={(v) => v.toFixed(3)}
        />
        <MonthlyLine
          title="Cadencia"
          subtitle="Pasos por minuto, promedio mensual."
          data={perf.monthly.map((m) => ({ label: monthLabel(m.month), value: m.cadence ?? null }))}
          format={(v) => v.toFixed(0)}
        />
      </div>

      <ZonesNote />
      <WeeklyTable perf={perf} />
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="club-card p-4 flex flex-col gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="text-2xl font-semibold text-fg">{value}</span>
      <span className="text-[11px] text-faint">{note}</span>
    </div>
  );
}

const LEVEL = {
  ok: { label: "Va bien", color: "var(--ok)", Icon: CheckCircle2 },
  watch: { label: "Vigilar", color: "var(--warn)", Icon: Eye },
  act: { label: "Cambiar", color: "var(--err)", Icon: AlertTriangle },
} as const;

function InsightCard({ insight }: { insight: PerformanceInsight }) {
  const { label, color, Icon } = LEVEL[insight.level];
  return (
    <div className="club-card p-4" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]">
        <Icon size={13} style={{ color }} />
        <span className="text-muted">{label}</span>
      </div>
      <p className="text-sm font-semibold mt-1.5 text-fg">{insight.title}</p>
      <p className="text-xs mt-1 leading-relaxed text-muted">{insight.detail}</p>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      {ZONES.map((zz) => (
        <span key={zz.key} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: zz.color }} />
          {zz.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  legend = false,
  children,
}: {
  title: string;
  subtitle: string;
  legend?: boolean;
  children: React.ReactElement;
}) {
  return (
    <section className="club-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="eyebrow">{title}</h2>
          <p className="text-xs text-muted mt-1">{subtitle}</p>
        </div>
        {legend && <Legend />}
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

type TipRow = { name: string; value: string; color?: string };

function TipBox({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div
      className="rounded-md px-3 py-2 text-xs"
      style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
    >
      <div className="text-muted mb-1">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2">
          {r.color && (
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: r.color }} />
          )}
          <span className="text-muted">{r.name}</span>
          <span className="ml-auto pl-3 text-fg font-semibold">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function WeeklyChart({ perf }: { perf: Performance }) {
  const data = perf.weekly.map((w) => ({
    label: weekLabel(w.week),
    low: w.low_min,
    mid: w.mid_min,
    high: w.high_min,
    km: w.km,
    runs: w.runs,
  }));
  return (
    <ChartCard
      title="Minutos por semana, por intensidad"
      subtitle="Cada columna es una semana (lunes a domingo). Las vacías también cuentan."
      legend
    >
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          axisLine={{ stroke: "var(--chart-axis)" }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} unit=" min" width={60} />
        <Tooltip
          cursor={{ fill: "var(--gold-wash)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                title={`Semana del ${label} · ${payload[0].payload.km} km, ${payload[0].payload.runs} carreras`}
                rows={[...ZONES].reverse().map((zz) => ({
                  name: zz.label,
                  value: `${payload[0].payload[zz.key]} min`,
                  color: zz.color,
                }))}
              />
            ) : null
          }
        />
        {ZONES.map((zz, i) => (
          <Bar
            key={zz.key}
            dataKey={zz.key}
            stackId="z"
            fill={zz.color}
            stroke="var(--surface)"
            strokeWidth={2}
            maxBarSize={18}
            radius={i === ZONES.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartCard>
  );
}

function MonthlyZonesChart({ perf, target }: { perf: Performance; target: number }) {
  const data = perf.monthly.map((m) => ({ label: monthLabel(m.month), ...m.zones_pct, km: m.km }));
  return (
    <ChartCard
      title="Reparto de intensidad por mes"
      subtitle={`Porcentaje del tiempo. La línea marca la meta: al menos ${target} % suave.`}
      legend
    >
      <BarChart data={data} margin={{ top: 8, right: 48, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          axisLine={{ stroke: "var(--chart-axis)" }}
          tickLine={false}
        />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          unit=" %"
          width={52}
        />
        <Tooltip
          cursor={{ fill: "var(--gold-wash)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                title={`${label} · ${payload[0].payload.km} km`}
                rows={[...ZONES].reverse().map((zz) => ({
                  name: zz.label,
                  value: `${payload[0].payload[zz.key]} %`,
                  color: zz.color,
                }))}
              />
            ) : null
          }
        />
        {ZONES.map((zz, i) => (
          <Bar
            key={zz.key}
            dataKey={zz.key}
            stackId="z"
            fill={zz.color}
            stroke="var(--surface)"
            strokeWidth={2}
            maxBarSize={24}
            radius={i === ZONES.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
        <ReferenceLine
          y={target}
          stroke="var(--text-muted)"
          strokeWidth={1}
          label={{
            value: `meta ${target}`,
            position: "right",
            fill: "var(--text-muted)",
            fontSize: 11,
          }}
        />
      </BarChart>
    </ChartCard>
  );
}

function MonthlyLine({
  title,
  subtitle,
  data,
  format,
}: {
  title: string;
  subtitle: string;
  data: { label: string; value: number | null }[];
  format: (v: number) => string;
}) {
  return (
    <ChartCard title={title} subtitle={subtitle}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          axisLine={{ stroke: "var(--chart-axis)" }}
          tickLine={false}
        />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => format(v)}
          width={52}
        />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)" }}
          content={({ active, payload, label }) =>
            active && payload?.length && payload[0].value != null ? (
              <TipBox
                title={String(label)}
                rows={[{ name: title, value: format(Number(payload[0].value)) }]}
              />
            ) : null
          }
        />
        <Line
          type="linear"
          dataKey="value"
          stroke="var(--zone-mid)"
          strokeWidth={2}
          connectNulls
          dot={{ r: 4, fill: "var(--zone-mid)", stroke: "var(--surface)", strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartCard>
  );
}

function ZonesNote() {
  return (
    <section className="club-card p-5">
      <h2 className="eyebrow">Tu reloj y la app usan zonas distintas</h2>
      <p className="text-sm text-muted mt-2 leading-relaxed">
        Garmin calcula sus 5 zonas como porcentaje de la FC máxima: Z1 98 · Z2 117 · Z3 137 · Z4 156
        · Z5 176. La app usa las de Strava: Z2 126–156, Z3 157–171, Z4 172–186. Por eso un rodaje a
        145 lpm sale como <span className="text-fg">«Z3»</span> en el reloj y es{" "}
        <span className="text-fg">fácil</span> para el plan. Este tablero agrupa las del reloj en
        tres que sí coinciden: suave &lt;156, umbral 156–175, alto ≥176.
      </p>
      <p className="text-xs text-faint mt-2 leading-relaxed">
        Para que el reloj te diga lo mismo que el plan, configura en Garmin tus zonas por umbral de
        lactato (la prueba guiada del reloj lo estima) en vez de por FC máxima.
      </p>
    </section>
  );
}

function WeeklyTable({ perf }: { perf: Performance }) {
  return (
    <details className="club-card p-5">
      <summary className="eyebrow cursor-pointer">Ver los datos semana a semana</summary>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead className="text-muted">
            <tr className="text-left">
              <th className="py-1.5 pr-3 font-semibold">Semana</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Km</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Carreras</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Suave</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Umbral</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Alto</th>
              <th className="py-1.5 font-semibold text-right">Más larga</th>
            </tr>
          </thead>
          <tbody>
            {[...perf.weekly].reverse().map((w) => (
              <tr key={w.week} className="border-t border-border text-fg">
                <td className="py-1.5 pr-3">{weekLabel(w.week)}</td>
                <td className="py-1.5 pr-3 text-right">{w.km}</td>
                <td className="py-1.5 pr-3 text-right">{w.runs}</td>
                <td className="py-1.5 pr-3 text-right">{w.low_min} min</td>
                <td className="py-1.5 pr-3 text-right">{w.mid_min} min</td>
                <td className="py-1.5 pr-3 text-right">{w.high_min} min</td>
                <td className="py-1.5 text-right">{w.long_km} km</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
