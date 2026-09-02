import { Skeleton } from '@/components/ui-phoenix';

/**
 * El mismo esqueleto sirve para la carga de la ruta (`loading.tsx`) y para el
 * Suspense de cada cambio de filtro — por eso va exportado además del default.
 * Dos versiones distintas harían que filtrar se vea diferente de entrar.
 */
export function NotesSkeleton(): React.ReactElement {
  return (
    <div className="p-4 sm:p-6 space-y-4 animate-fade-in">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Barra de filtros: tres pills + tres selects + el buscador */}
      <div className="flex gap-2 items-center flex-wrap">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-[200px]" />
      </div>

      <Skeleton className="h-4 w-40" />

      <div className="rounded-lg bg-bg-1 overflow-hidden">
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
