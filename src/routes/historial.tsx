import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { garminQO, planQO } from "@/lib/api";
import { PageHeader } from "@/components/entrenador/PageHeader";

export const Route = createFileRoute("/historial")({
  head: () => ({
    meta: [
      { title: "Historial · Entrenador" },
      { name: "description", content: "Histórico de HRV, FC reposo y volumen semanal." },
    ],
  }),
  component: HistorialPage,
});

function toSeries(raw: any, valueKeys: string[]): { date: string; value: number }[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.series) ? raw.series : [];
  return arr
    .map((p: any) => {
      const date = p?.date ?? p?.day ?? p?.timestamp ?? p?.t;
      let value: any;
      for (const k of valueKeys) if (p?.[k] != null) { value = p[k]; break; }
      const n = Number(value);
      return date && !isNaN(n) ? { date: String(date).slice(5, 10), value: n } : null;
    })
    .filter(Boolean) as { date: string; value: number }[];
}

function HistorialPage() {
  const { data: garmin } = useQuery(garminQO());
  const { data: plan } = useQuery(planQO());

  const hrvSeries = toSeries(garmin?.hrv ?? garmin?.health?.hrv_history, ["value", "hrv", "rmssd"]).slice(-30);
  const rhrSeries = toSeries(garmin?.resting_hr ?? garmin?.health?.rhr_history, ["value", "rhr", "resting_hr"]).slice(-30);

  const summaries: any[] = Array.isArray(plan?.week_summary) ? plan!.week_summary : [];

  return (
    <div className="p-6 md:p-10 max-w-[1400px] mx-auto">
      <PageHeader title="Historial" subtitle="Adaptación cardiovascular · Volumen semanal" />

      <div className="grid md:grid-cols-2 gap-5 mt-6">
        <ChartCard title="HRV (ms)" data={hrvSeries} />
        <ChartCard title="FC reposo (bpm)" data={rhrSeries} />
      </div>

      <h2 className="mt-10 mb-4 text-lg" style={{ color: "#E9CEA9", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Resumen semanal
      </h2>
      {summaries.length === 0 ? (
        <div className="club-card p-6 text-sm" style={{ color: "#9A9A9A" }}>
          Sin resúmenes disponibles.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map((w, i) => (
            <WeekSummaryCard key={i} w={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, data }: { title: string; data: { date: string; value: number }[] }) {
  return (
    <div className="club-card p-5">
      <div className="text-xs mb-3" style={{ color: "#9A9A9A", letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase" }}>
        {title}
      </div>
      <div className="h-[220px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm" style={{ color: "#555" }}>Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="rgba(233,206,169,0.08)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#9A9A9A", fontSize: 11 }} axisLine={{ stroke: "rgba(233,206,169,0.15)" }} tickLine={false} />
              <YAxis tick={{ fill: "#9A9A9A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#0D0D0D", border: "1px solid rgba(233,206,169,0.25)", borderRadius: 6 }}
                labelStyle={{ color: "#9A9A9A" }}
                itemStyle={{ color: "#E9CEA9" }}
              />
              <Line type="monotone" dataKey="value" stroke="#E9CEA9" strokeWidth={2} dot={{ fill: "#E9CEA9", r: 2 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function WeekSummaryCard({ w }: { w: any }) {
  const start = w?.week_start ?? w?.start ?? w?.from ?? "";
  const label = w?.label ?? w?.type ?? (start ? `Semana ${String(start).slice(5, 10)}` : "Semana");
  const runMin = w?.running_minutes ?? w?.run_min ?? w?.runMinutes ?? w?.minutes_running;
  const runKm = w?.running_km ?? w?.km ?? w?.distance_km ?? w?.km_running;
  const bikeMin = w?.cycling_minutes ?? w?.bike_min ?? w?.minutes_cycling;
  return (
    <div className="club-card p-5">
      <div className="text-xs" style={{ color: "#9A9A9A", letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase" }}>
        {label}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <Stat icon="🏃" value={runMin} suffix="min" />
        <Stat icon="📏" value={runKm} suffix="km" />
        <Stat icon="🚴" value={bikeMin} suffix="min" />
      </div>
    </div>
  );
}

function Stat({ icon, value, suffix }: { icon: string; value: any; suffix: string }) {
  const show = value != null ? String(Math.round(Number(value))) : "—";
  return (
    <div>
      <div className="text-[11px]" style={{ color: "#9A9A9A" }}>{icon}</div>
      <div className="metric-num text-2xl leading-none mt-1">{show}</div>
      <div className="text-[10px] mt-0.5" style={{ color: "#9A9A9A", letterSpacing: "0.1em" }}>{suffix.toUpperCase()}</div>
    </div>
  );
}