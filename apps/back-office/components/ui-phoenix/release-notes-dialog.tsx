'use client';

/**
 * ReleaseNotesDialog — "esto cambió", después de apretar Actualizar.
 *
 * La lógica (leer la marca de localStorage, pedir el changelog, limpiarla) vive
 * en `@precision/release/notes`; acá sólo está la presentación, con los
 * primitivos y los tokens del sistema (Regla #0).
 *
 * No se renderiza nada si no hay notas publicadas para la audiencia del usuario:
 * no hay diálogo vacío.
 *
 * Color: `brand` para lo nuevo y `violet` para los arreglos — es el par que ya
 * usa el banner del que viene este diálogo.
 */

import { Sparkles, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useReleaseNotes } from '@precision/release/notes';
import type { ReleaseModuleGroup } from '@precision/release/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@precision/ui';

/**
 * La lista de notas, agrupada por modulo. Sin dialogo alrededor.
 *
 * Vive aparte porque la muestran DOS cosas: este dialogo (el que salta una vez
 * despues del reload del banner) y el panel de la campana, que se abre cuando el
 * usuario quiere. Es la misma informacion y tiene que verse igual en los dos
 * lados; duplicar el markup era garantizar que se separaran con el tiempo.
 */
export function ReleaseNotesContent({
  modules,
  className = 'max-h-[60vh] overflow-y-auto px-4 sm:px-6 py-2 space-y-4',
}: {
  modules: ReleaseModuleGroup[];
  className?: string;
}): React.ReactElement {
  return (
    <div className={className}>
      {modules.map((group) => (
        <div key={group.module} className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
            {group.moduleLabel}
          </p>
          <div className="rounded-md bg-bg-2/40 p-3 space-y-2">
            {group.notes.map((note) => (
              <div key={note.id} className="flex items-start gap-2">
                {note.kind === 'FEAT' ? (
                  <Sparkles className="w-3 h-3 text-brand shrink-0 mt-1" />
                ) : (
                  <Wrench className="w-3 h-3 text-violet shrink-0 mt-1" />
                )}
                <p className="text-[12.5px] text-text-1 leading-relaxed">{note.text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReleaseNotesDialog(): React.ReactElement | null {
  const { modules, count, dismiss } = useReleaseNotes();
  const t = useTranslations('phoenix.releaseNotes');

  if (modules.length === 0) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="flex items-center gap-2 text-text-1">
            <Sparkles className="w-4 h-4 text-brand shrink-0" />
            {t('title')}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-text-2">
            {t('subtitle')}
          </DialogDescription>
        </DialogHeader>

        <ReleaseNotesContent modules={modules} />

        <DialogFooter className="flex-col sm:flex-row gap-2 px-4 sm:px-6 pb-4 sm:pb-6">
          <span className="text-[11px] text-text-muted sm:mr-auto">
            {t('count', { count })}
          </span>
          <Button onClick={dismiss} className="w-full sm:w-auto">
            {t('dismiss')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
