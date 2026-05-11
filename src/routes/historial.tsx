import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { garminQO } from "@/lib/api";
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

function toSeries(arr: any[] | undefined, valueKey: string): { date: string; value: number }[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((p: any) => p && p[valueKey] != null)
    .map((p: any) => ({ date: String(p.date).slice(5, 10), value: Number(p[valueKey]) }))
    .filter((p) => !isNaN(p.value));
}

type WeekSummary = { weekLabel: string; runMin: number; runKm: number; bikeMin: number };

function getISOWeekKey(dateStr: string): string {
  // Use Monday-start week. Returns "YYYY-Www".
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

function aggregateWeeks(activities: any[]): WeekSummary[] {
  if (!Array.isArray(activities)) return [];
  const buckets = new Map<string, WeekSummary>();
  for (const a of activities) {
    if (!a?.date) continue;
    const key = getISOWeekKey(a.date);
    const type = String(a.type ?? "").toLowerCase();
    const durMin = Number(a.duration_sec ?? 0) / 60;
    const km = Number(a.distance_m ?? 0) / 1000;
    const cur = buckets.get(key) ?? { weekLabel: key, runMin: 0, runKm: 0, bikeMin: 0 };
    if (type.includes("run")) {
      cur.runMin += durMin;
      cur.runKm += km;
    } else if (type.includes("cycl") || type.includes("bike")) {
      cur.bikeMin += durMin;
    }
    buckets.set(key, cur);
  }
  return Array.from(buckets.values()).sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
}

function HistorialPage() {
  const { data: garmin } = useQuery(garminQO());

  const hrvSeries = toSeries(garmin?.health?.hrv, "hrv").slice(-30);
  const rhrSeries = toSeries(garmin?.health?.resting_hr, "resting_hr").slice(-30);
  const summaries = aggregateWeeks((garmin as any)?.activities_last_3_weeks ?? []);

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

function WeekSummaryCard({ w }: { w: WeekSummary }) {
  const label = `Semana ${w.weekLabel.slice(5)}`;
  return (
    <div className="club-card p-5">
      <div className="text-xs" style={{ color: "#9A9A9A", letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase" }}>
        {label}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <Stat icon="🏃" value={w.runMin} suffix="min" digits={0} />
        <Stat icon="📏" value={w.runKm} suffix="km" digits={1} />
        <Stat icon="🚴" value={w.bikeMin} suffix="min" digits={0} />
      </div>
    </div>
  );
}

function Stat({ icon, value, suffix, digits = 0 }: { icon: string; value: number; suffix: string; digits?: number }) {
  const show = value > 0 ? value.toFixed(digits) : "—";
  return (
    <div>
      <div className="text-[11px]" style={{ color: "#9A9A9A" }}>{icon}</div>
      <div className="metric-num text-2xl leading-none mt-1">{show}</div>
      <div className="text-[10px] mt-0.5" style={{ color: "#9A9A9A", letterSpacing: "0.1em" }}>{suffix.toUpperCase()}</div>
    </div>
  );
}