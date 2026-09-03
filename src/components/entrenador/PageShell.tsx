import { PageHeader } from "./PageHeader";

/**
 * Andamio común de página: wrapper responsive + cabecera con acciones a la
 * derecha. Antes cada ruta repetía el wrapper y su propio bloque de
 * skeleton/error/vacío casi idéntico.
 */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 md:p-10 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={title} subtitle={subtitle} />
        {actions}
      </div>
      {children}
    </div>
  );
}
