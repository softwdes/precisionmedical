'use client';

/**
 * GuardarSnippetDialog — convertir lo que se acaba de escribir en la nota en un
 * snippet reutilizable, sin salir de la nota.
 *
 * Pedido de Devin (2026-09-25): *"if you type in HPI a whole write up for a
 * patient then want to save that as a snippet just add a button there on each
 * section where you can name it and save it as a snippet directly from the note.
 * (When doing this there should be an option to save as global or individual)"*.
 *
 * Hasta hoy los snippets solo se creaban desde Configuración: había que copiar
 * el texto, irse de la consulta, pegarlo y volver. El texto ya estaba escrito;
 * lo que faltaba era el gesto.
 *
 * ── Las dos listas ──────────────────────────────────────────────────────────
 *
 * **De la clínica** (`SHARED`) lo ve todo el mundo — es la lista donde viven los
 * 278 que ya existen, incluidos los `BC -` de Barry. **Mío** (`PERSONAL`) lo ve
 * solo quien lo guarda. El servidor filtra por eso, no la pantalla: abrir el
 * alcance sin filtrar la consulta habría hecho que el primer snippet personal
 * apareciera en la lista de todos.
 *
 * El default es la lista de la clínica, que es lo que venían siendo todos. La
 * opción está en botones y no en un desplegable porque son dos y la diferencia
 * —quién más lo va a ver— merece leerse sin abrir nada.
 *
 * ── Lo que se guarda es el HTML ─────────────────────────────────────────────
 *
 * El contenido viaja tal cual está en el editor, con sus listas y sus casillas.
 * Un snippet es un pedazo de nota, no texto plano: si se guardara pelado, un ROS
 * con casillas volvería como un párrafo y habría que rehacerlo.
 *
 * ⚠️ Y por eso mismo: lo que se guarda **puede tener datos del paciente**. Quien
 * guarda es quien decide, así que la pantalla lo dice antes de guardar en vez de
 * intentar adivinar y recortar por su cuenta.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input, Label,
} from '@precision/ui';
import { Scissors, Loader2, AlertTriangle, Users, User } from 'lucide-react';

export type SnippetScope = 'SHARED' | 'PERSONAL';

interface Props {
  open: boolean;
  /** La sección de la nota de donde sale (`HPI`, `PLAN`, …). */
  sectionKey: string;
  /** Cómo se llama esa sección en pantalla, para el subtítulo. */
  sectionLabel: string;
  /** El HTML del editor, tal cual. */
  content: string;
  onClose: () => void;
  /** Guardado: quien llama refresca su lista de snippets. */
  onSaved: (scope: SnippetScope) => void;
}

export function GuardarSnippetDialog({
  open, sectionKey, sectionLabel, content, onClose, onSaved,
}: Props): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');
  const [titulo, setTitulo] = React.useState('');
  const [scope, setScope] = React.useState<SnippetScope>('SHARED');
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Cada apertura arranca limpia: el título del snippet anterior no tiene nada
  // que ver con el siguiente, y dejarlo puesto invita a guardar dos veces lo
  // mismo con el nombre equivocado.
  React.useEffect(() => {
    if (open) { setTitulo(''); setScope('SHARED'); setError(null); }
  }, [open]);

  if (!open) return null;

  /** El texto sin etiquetas, solo para contar y para la vista previa. */
  const pelado = content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const vacio = pelado.length === 0;
  const nombreOk = titulo.trim().length > 0;

  const guardar = async (): Promise<void> => {
    if (!nombreOk || vacio) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionKey, title: titulo.trim(), content, scope }),
      });
      if (!res.ok) { setError(t('snpSaveError')); return; }
      onSaved(scope);
    } catch {
      setError(t('snpSaveError'));
    } finally {
      setGuardando(false);
    }
  };

  const opcion = (valor: SnippetScope, Icono: typeof Users, titulo2: string, detalle: string) => (
    <button
      type="button"
      onClick={() => setScope(valor)}
      aria-pressed={scope === valor}
      className={`flex-1 text-left rounded-lg p-3 transition-colors ${
        scope === valor ? 'bg-violet/10 ring-1 ring-violet/40' : 'bg-bg-2/40 hover:bg-bg-2/60'
      }`}
    >
      <span className={`flex items-center gap-1.5 text-[12.5px] font-semibold ${
        scope === valor ? 'text-violet-text' : 'text-text-1'
      }`}>
        <Icono className="w-3.5 h-3.5" /> {titulo2}
      </span>
      <span className="block text-[11px] text-text-muted mt-0.5 leading-relaxed">{detalle}</span>
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-violet-text" /> {t('snpSaveTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-4">
          <p className="text-[12px] text-text-2">{t('snpSaveFrom', { section: sectionLabel })}</p>

          <div className="space-y-1.5">
            <Label htmlFor="snp-titulo">{t('snpSaveName')}</Label>
            <Input
              id="snp-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={t('snpSaveNamePh')}
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('snpSaveScope')}</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              {opcion('SHARED', Users, t('snpScopeShared'), t('snpScopeSharedHint'))}
              {opcion('PERSONAL', User, t('snpScopePersonal'), t('snpScopePersonalHint'))}
            </div>
          </div>

          {/* Lo que se guarda es el texto TAL CUAL está: puede llevar el nombre
              del paciente o su fecha. Se avisa antes, no después. */}
          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {t('snpSaveWarn')}
          </div>

          {!vacio && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t('snpSavePreview', { count: pelado.length })}
              </span>
              <div className="rounded-md bg-bg-2/40 px-3 py-2 text-[11.5px] text-text-2 max-h-24 overflow-y-auto">
                {pelado.slice(0, 400)}{pelado.length > 400 ? '…' : ''}
              </div>
            </div>
          )}

          {vacio && (
            <div className="rounded-md bg-bg-2/40 px-3 py-2.5 text-center text-[11px] text-text-muted">
              {t('snpSaveEmpty')}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={guardando}>
            {t('snpSaveCancel')}
          </Button>
          <Button
            className="w-full sm:w-auto gap-1.5"
            onClick={() => void guardar()}
            disabled={guardando || !nombreOk || vacio}
          >
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
            {t('snpSaveConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
