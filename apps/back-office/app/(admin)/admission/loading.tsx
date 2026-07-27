import { Skeleton } from '@/components/ui-phoenix';

export default function AdmissionLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-4 animate-fade-in">

      {/* PageHeader skeleton */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      {/* Date nav skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md ml-1" />
      </div>

      {/* KPI cards skeleton — 4 columnas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton.Card key={i}>
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-8 w-10 mb-1" />
            <Skeleton className="h-2.5 w-20" />
          </Skeleton.Card>
        ))}
      </div>

      {/* Appointment rows skeleton */}
      <Skeleton.Card className="p-0 overflow-hidden">
        {/* Group header */}
        <div className="px-4 py-2.5 border-b border-border bg-bg-2/50 flex items-center gap-2">
          <Skeleton className="h-2.5 w-2.5 rounded-full" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-5 w-6 rounded-full ml-auto" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="px-4 py-3.5 border-b border-border/30 flex items-center gap-3"
            style={{ opacity: 1 - i * 0.14 }}
          >
            <Skeleton.Circle size={9} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-5 w-16 rounded-md hidden sm:block" />
            <Skeleton className="h-5 w-14 rounded-md hidden sm:block" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        ))}
      </Skeleton.Card>

    </div>
  );
}
