'use client';

import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@precision/ui';

type Variant = 'warning' | 'danger' | 'info';

interface Props {
  open:        boolean;
  onConfirm:   () => void;
  onCancel:    () => void;
  title:       string;
  description: string;
  confirmLabel?: string;
  cancelLabel?:  string;
  variant?:    Variant;
}

const VARIANT_CONFIG: Record<Variant, {
  icon: React.ReactNode;
  iconBg: string;
  confirmClass: string;
}> = {
  warning: {
    icon:         <AlertTriangle className="w-5 h-5 text-amber" />,
    iconBg:       'bg-amber/10 border border-amber/20',
    confirmClass: 'bg-amber hover:bg-amber/90 text-black',
  },
  danger: {
    icon:         <Trash2 className="w-5 h-5 text-rose" />,
    iconBg:       'bg-rose/10 border border-rose/20',
    confirmClass: 'bg-rose hover:bg-rose/90 text-white',
  },
  info: {
    icon:         <Info className="w-5 h-5 text-brand" />,
    iconBg:       'bg-brand/10 border border-brand/20',
    confirmClass: 'bg-brand hover:bg-brand/90 text-white',
  },
};

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel  = 'Cancelar',
  variant      = 'warning',
}: Props) {
  const cfg = VARIANT_CONFIG[variant];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent
        className="max-w-sm p-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-0">
          {/* Icon badge */}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${cfg.iconBg}`}>
            {cfg.icon}
          </div>
          <DialogTitle className="text-text-1 text-base font-semibold leading-tight">
            {title}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-sm mt-1.5 leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="px-6 py-5 flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className={`w-full sm:w-auto px-4 py-2 rounded-md text-sm font-semibold transition-colors ${cfg.confirmClass}`}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
