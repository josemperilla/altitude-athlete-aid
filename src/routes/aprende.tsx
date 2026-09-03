import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { insightsQO } from "@/lib/api";
import type { Insight, InsightCategory } from "@/lib/schemas";
import { PageShell } from "@/components/entrenador/PageShell";
import { CARD_2, GOLD, MUTED, PANEL } from "@/lib/theme";

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
      {isLoading && (
        <div className="club-card p-6 mt-6 text-sm" style={{ color: MUTED }}>
          Cargando…
        </div>
      )}

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
                      style={{ color: cat.color ?? GOLD }}
                    >
                      {cat.title}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                      {cat.subtitle}
                    </div>
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  style={{
                    color: cat.color ?? GOLD,
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
                  style={{ borderTop: "1px solid rgba(233,206,169,.1)" }}
                >
                  {insights.map((ins: any, i: number) => (
                    <InsightCard key={i} ins={ins} accentColor={cat.color ?? GOLD} />
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
        background: CARD_2,
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
      <div className="text-sm font-bold" style={{ color: "#FFFFFF" }}>
        {ins.title}
      </div>

      {/* Finding */}
      {ins.finding && (
        <p className="text-xs leading-relaxed" style={{ color: "#C0C0C0" }}>
          {ins.finding}
        </p>
      )}

      {/* Stat badge */}
      {ins.number && (
        <div
          className="text-xs font-bold text-center py-2 px-3 rounded"
          style={{
            background: PANEL,
            border: `1px solid ${accentColor}44`,
            color: accentColor,
            letterSpacing: "0.05em",
          }}
        >
          {ins.number}
        </div>
      )}

      {/* Application */}
      {ins.application && (
        <div style={{ borderTop: "1px solid rgba(233,206,169,.08)", paddingTop: "10px" }}>
          <div
            className="text-[10px] font-bold tracking-widest uppercase mb-1.5"
            style={{ color: GOLD }}
          >
            ¿Qué significa para ti?
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "#B0B0B0" }}>
            {ins.application}
          </p>
        </div>
      )}
    </article>
  );
}
