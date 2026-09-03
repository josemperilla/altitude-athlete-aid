import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { insightsQO } from "@/lib/api";
import type { Insight, InsightCategory } from "@/lib/schemas";
import { PageShell } from "@/components/entrenador/PageShell";

export const Route = createFileRoute("/aprende")({
  head: () => ({
    meta: [
      { title: "Aprende · Entrenador" },
      { name: "description", content: "Categorías educativas basadas en evidencia." },
    ],
  }),
  component: AprendePage,
});

function AprendePage() {
  const { data, isLoading } = useQuery(insightsQO());
  const [openCat, setOpenCat] = useState<string | null>(null);

  const categories: InsightCategory[] = Array.isArray(data) ? data : [];

  return (
    <PageShell title="Aprende" subtitle="Ciencia del entrenamiento · 5 papers revisados por pares">
      {isLoading && <div className="club-card p-6 mt-6 text-sm text-muted">Cargando…</div>}

      <div className="flex flex-col gap-4 mt-6">
        {categories.map((cat, i) => {
          const isOpen = openCat != null && openCat === (cat.id ?? cat.title ?? null);
          const insights = cat.insights ?? [];

          return (
            <div key={cat.id ?? cat.title ?? i} className="club-card overflow-hidden">
              {/* Category header — clickable */}
              <button
                onClick={() => setOpenCat(isOpen ? null : (cat.id ?? cat.title ?? null))}
                className="w-full flex items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{cat.icon}</span>
                  <div>
                    <div
                      className="text-sm font-bold tracking-widest uppercase"
                      style={{ color: cat.color ?? "var(--gold)" }}
                    >
                      {cat.title}
                    </div>
                    <div className="text-xs mt-0.5 text-muted">{cat.subtitle}</div>
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  style={{
                    color: cat.color ?? "var(--gold)",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                    flexShrink: 0,
                  }}
                />
              </button>

              {/* Insights grid — expandable */}
              {isOpen && (
                <div
                  className="px-4 pb-4 grid md:grid-cols-2 gap-4"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  {insights.map((ins, i) => (
                    <InsightCard key={i} ins={ins} accentColor={cat.color ?? "var(--gold)"} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}

function InsightCard({ ins, accentColor }: { ins: Insight; accentColor: string }) {
  return (
    <article
      className="flex flex-col gap-3 p-4 rounded-lg mt-4"
      style={{
        background: "var(--surface-2)",
        border: `1px solid ${accentColor}22`,
      }}
    >
      {/* Source */}
      {ins.source && (
        <div
          className="text-[10px] font-bold tracking-widest uppercase"
          style={{ color: accentColor, opacity: 0.8 }}
        >
          {ins.source}
        </div>
      )}

      {/* Title */}
      <div className="text-sm font-bold text-fg">{ins.title}</div>

      {/* Finding */}
      {ins.finding && <p className="text-xs leading-relaxed text-muted">{ins.finding}</p>}

      {/* Stat badge */}
      {ins.number && (
        <div
          className="text-xs font-bold text-center py-2 px-3 rounded"
          style={{
            background: "var(--surface)",
            border: `1px solid color-mix(in srgb, ${accentColor} 27%, transparent)`,
            color: accentColor,
            letterSpacing: "0.05em",
          }}
        >
          {ins.number}
        </div>
      )}

      {/* Application */}
      {ins.application && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
          <div
            className="text-[10px] font-bold tracking-widest uppercase mb-1.5"
            style={{ color: "var(--gold)" }}
          >
            ¿Qué significa para ti?
          </div>
          <p className="text-xs leading-relaxed text-muted">{ins.application}</p>
        </div>
      )}
    </article>
  );
}
