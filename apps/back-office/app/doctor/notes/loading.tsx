import { Skeleton } from '@/components/ui-phoenix';

/**
 * El mismo esqueleto sirve para la carga de la ruta y para el Suspense de cada
 * cambio de alcance — por eso va exportado además del default. Dos versiones
 * distintas harían que filtrar se vea diferente de entrar.
 *
 * Dibuja lo que la pantalla tiene AHORA: KPIs + la única tabla, la de
 * providers. Cuando había una segunda tabla de visitas, este esqueleto la
 * prometía y el ojo la esperaba.
 */
export function NotesSkeleton(): React.ReactElement {
  return (
    <div className="p-4 sm:p-6 space-y-4 animate-fade-in">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] w-full" />)}
      </div>

      <div className="rounded-lg bg-bg-1 overflow-hidden">
        {/* Encabezado con los filtros */}
        <div className="px-4 py-3 space-y-2.5">
          <Skeleton className="h-4 w-52" />
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-[180px]" />
          </div>
        </div>
        <Skeleton className="h-9 w-full rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none mt-px" />
        ))}
      </div>
    </div>
  );
}

export default function NotesLoading(): React.ReactElement {
  return <NotesSkeleton />;
}
