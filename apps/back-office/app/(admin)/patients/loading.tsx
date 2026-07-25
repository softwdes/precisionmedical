import { Skeleton } from '@/components/ui-phoenix';

export default function PatientsLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-2 animate-fade-in">
      {/* PageHeader skeleton */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      {/* Toolbar skeleton */}
      <div className="flex gap-2 items-center flex-wrap mt-1">
        <Skeleton className="h-9 flex-1 min-w-[180px] max-w-sm" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex items-center gap-1 border-b border-border">
        <Skeleton className="h-8 w-20 rounded-none" />
        <Skeleton className="h-8 w-24 rounded-none" />
      </div>

      {/* Table skeleton */}
      <Skeleton.Card className="p-0 overflow-hidden">
        {/* Header row */}
        <div className="border-b border-border bg-bg-2/50 px-4 py-3 flex items-center gap-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24 hidden sm:block" />
          <div className="flex-1" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="border-b border-border/30 px-4 py-3 flex items-center gap-3"
            style={{ opacity: 1 - i * 0.1 }}
          >
            <Skeleton.Circle size={8} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-5 w-14 rounded-md hidden sm:block" />
            <Skeleton className="h-5 w-6 rounded" />
            <div className="flex gap-1">
              <Skeleton.Circle size={7} className="rounded-md" />
              <Skeleton.Circle size={7} className="rounded-md" />
              <Skeleton.Circle size={7} className="rounded-md" />
            </div>
          </div>
        ))}
        {/* Pagination skeleton */}
        <div className="px-4 py-3 bg-bg-2/30 border-t border-border flex items-center justify-between">
          <Skeleton className="h-3 w-28" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton.Circle size={7} className="rounded-md" />
            <Skeleton.Circle size={7} className="rounded-md" />
          </div>
        </div>
      </Skeleton.Card>
    </div>
  );
}
