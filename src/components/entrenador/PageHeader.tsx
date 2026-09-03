export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-2 pb-6 border-b border-border">
      <h1 className="text-3xl md:text-4xl text-fg font-extrabold tracking-[0.08em] uppercase">
        {title}
      </h1>
      {subtitle && <p className="text-sm text-muted tracking-[0.04em]">{subtitle}</p>}
    </div>
  );
}
