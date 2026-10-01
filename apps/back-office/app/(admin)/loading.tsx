import { Skeleton } from '@/components/ui-phoenix';

/**
 * Loading boundary genérico para todas las rutas bajo (admin).
 *
 * Next.js lo muestra automáticamente mientras un Server Component está
 * fetcheando data. Replica el shape canónico de una pantalla del back-office:
 *
 *   PageHeader · KPIs (4 cards) · DataTable (con filas placeholder)
 *
 * Si una ruta necesita un skeleton específico (ej. Dashboard de Recepción),
 * puede agregar su propio loading.tsx que overridea este.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* PageHeader skeleton */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* KPIs grid skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton.Card key={i}>
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-9 w-20 mb-2" />
            <Skeleton className="h-3 w-24" />
          </Skeleton.Card>
        ))}
      </div>

      {/* Filters row skeleton */}
      <div className="flex gap-2 items-center flex-wrap">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-24" />
      </div>

      {/* DataTable skeleton */}
      <Skeleton.Card className="p-0 overflow-hidden">
        <div className="border-b border-border bg-bg-2/50 px-5 py-3 flex items-center gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
          <div className="flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border-b border-border/30 px-5 py-3.5 flex items-center gap-4"
            style={{ opacity: 1 - i * 0.12 }}
          >
            <Skeleton.Circle size={9} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-5 w-16 rounded-md" />
            <div className="flex gap-1">
              <Skeleton.Circle size={8} className="rounded-md" />
              <Skeleton.Circle size={8} className="rounded-md" />
              <Skeleton.Circle size={8} className="rounded-md" />
            </div>
          </div>
        ))}
        <div className="px-5 py-3 bg-bg-2/30 border-t border-border flex items-center justify-between">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </Skeleton.Card>
    </div>
  );
}
