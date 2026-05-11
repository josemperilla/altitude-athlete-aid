import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { insightsQO } from "@/lib/api";
import { PageHeader } from "@/components/entrenador/PageHeader";

export const Route = createFileRoute("/aprende")({
  head: () => ({
    meta: [
      { title: "Aprende · Entrenador" },
      { name: "description", content: "Categorías educativas basadas en evidencia." },
    ],
  }),
  component: AprendePage,
});

function normalizeInsights(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.insights)) return data.insights;
  if (Array.isArray(data?.categories)) return data.categories;
  if (typeof data === "object") {
    return Object.entries(data).map(([k, v]: [string, any]) => ({ category: k, ...(v as object) }));
  }
  return [];
}

function AprendePage() {
  const { data, isLoading } = useQuery(insightsQO());
  const items = normalizeInsights(data);

  return (
    <div className="p-6 md:p-10 max-w-[1400px] mx-auto">
      <PageHeader title="Aprende" subtitle="Categorías educativas · Basado en evidencia" />
      {isLoading && <div className="club-card p-6 mt-6 text-sm" style={{ color: "#9A9A9A" }}>Cargando…</div>}
      <div className="grid md:grid-cols-2 gap-5 mt-6">
        {items.map((it, i) => <InsightCard key={i} item={it} />)}
      </div>
    </div>
  );
}

function InsightCard({ item }: { item: any }) {
  const emoji = item?.emoji ?? item?.icon ?? "📘";
  const category = (item?.category ?? item?.name ?? item?.title ?? "Concepto").toString();
  const source = item?.source ?? item?.paper ?? item?.reference;
  const stat = item?.stat ?? item?.metric ?? item?.number ?? item?.value;
  const statLabel = item?.stat_label ?? item?.metric_label ?? item?.unit;
  const meaning = item?.meaning ?? item?.implication ?? item?.what_it_means ?? item?.takeaway ?? item?.application;
  const body = item?.body ?? item?.description ?? item?.summary ?? item?.text;

  return (
    <article className="club-card p-5 flex flex-col gap-3">
      {source && <div className="text-[11px]" style={{ color: "#666", letterSpacing: "0.06em" }}>{String(source)}</div>}
      <h3 className="text-base" style={{ color: "#E9CEA9", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {emoji} {category}
      </h3>
      {stat != null && (
        <div>
          <span className="inline-block px-3 py-1 rounded text-sm" style={{ background: "#E9CEA9", color: "#020101", fontWeight: 800, letterSpacing: "0.06em" }}>
            {String(stat)}{statLabel ? ` ${statLabel}` : ""}
          </span>
        </div>
      )}
      {body && <p className="text-sm" style={{ color: "#cfcfcf" }}>{String(body)}</p>}
      {meaning && (
        <>
          <hr className="gold-divider" />
          <div>
            <div className="text-[11px] mb-1.5" style={{ color: "#9A9A9A", letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase" }}>
              ¿Qué significa para ti?
            </div>
            <p className="text-sm" style={{ color: "#E9CEA9" }}>{String(meaning)}</p>
          </div>
        </>
      )}
    </article>
  );
}