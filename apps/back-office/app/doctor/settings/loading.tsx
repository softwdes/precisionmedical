import { Skeleton } from '@/components/ui-phoenix';

/**
 * Esqueleto de cualquier pantalla de Configuración: el índice izquierdo lo
 * pinta el layout (no se esqueletiza, ya está), acá va solo el contenido —
 * encabezado, filtros y una tabla — que es la forma de Plantillas, Snippets y
 * Laboratorios por igual.
 */
export default function SettingsLoading(): React.ReactElement {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="rounded-lg bg-bg-1 overflow-hidden">
        <Skeleton className="h-9 w-full rounded-none" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-none mt-px" />
        ))}
      </div>
    </div>
  );
}
