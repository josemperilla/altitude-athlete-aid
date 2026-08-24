import { MUTED } from "@/lib/theme";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      className="flex flex-col gap-2 pb-6 border-b"
      style={{ borderColor: "rgba(233,206,169,0.15)" }}
    >
      <h1
        className="text-3xl md:text-4xl"
        style={{
          color: "#FFFFFF",
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm" style={{ color: MUTED, letterSpacing: "0.04em" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
