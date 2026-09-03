/**
 * Estados de query unificados: skeleton, error y vacío con el mismo lenguaje
 * visual. `skeleton` y `empty` permiten pasar un bloque custom cuando la página
 * necesita algo más rico que el texto por defecto.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  loadingMessage = "Cargando…",
  emptyMessage = "Sin datos todavía.",
  skeleton,
  empty,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  skeleton?: React.ReactNode;
  empty?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <>
        {skeleton ?? (
          <div className="club-card p-8 mt-6 text-center text-muted">{loadingMessage}</div>
        )}
      </>
    );
  }
  if (error) {
    return (
      <div className="club-card p-6 mt-6" style={{ borderLeft: "3px solid var(--err)" }}>
        <div className="font-bold" style={{ color: "var(--err)" }}>
          No se pudo cargar
        </div>
        <div className="text-sm mt-1 text-muted">
          {error instanceof Error ? error.message : String(error)}
        </div>
      </div>
    );
  }
  if (isEmpty) {
    return <>{empty ?? defaultEmpty(emptyMessage)}</>;
  }
  return <>{children}</>;
}

function defaultEmpty(message: string) {
  return <div className="club-card p-8 mt-6 text-center text-muted">{message}</div>;
}
