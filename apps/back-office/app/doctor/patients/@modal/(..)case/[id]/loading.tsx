import { Loader2 } from 'lucide-react';

// Backdrop + spinner mientras carga el caso interceptado (Regla #1).
export default function LoadingCaseModal(): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="rounded-lg border border-border bg-bg-1 px-6 py-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    </div>
  );
}
