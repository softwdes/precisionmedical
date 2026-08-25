'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MoreHorizontal, Eye, PenLine, History, FileDown, FileText, FileSignature, Loader2 } from 'lucide-react';
import {
  Button, Input, Label, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from '@precision/ui';
import { DataTable, EmptyState, TagPill, IconAction } from '@/components/ui-phoenix';
import { SignaturePad } from '@/components/ui-phoenix/signature-pad';
import { conCasoAbierto } from '@/lib/case-modal-url';
import { fechaHora } from '@/lib/fechas';

/**
 * Portal Legal · menú de acciones de un caso (Ver caso · Firmar · Ver historial)
 * y los diálogos que cuelgan de él.
 *
 * El flujo replica v2 con sus DOS puertas, que no son lo mismo:
 *  · Ver caso sin firma → ADVERTENCIA. "Continuar" está habilitado; ver el caso
 *    de su propio cliente nunca se bloquea.
 *  · Abrir un documento  → BLOQUEO real. Eso sí exige la firma.
 */

export interface CaseActionsCase {
  id: string;
  caseCode: string;
  hasSigned: boolean;
  signatureExempt: boolean;
  /** Nombre del abogado asignado — pre-carga el diálogo de firma. */
  attorneyName: string | null;
}

interface Props {
  caseRow: CaseActionsCase;
  /** Solo los abogados firman (decisión de Erick). */
  canSign: boolean;
  /** Nombre de quien está logueado, para pre-cargar cuando el caso no tiene abogado. */
  sessionName: string;
  onSigned: () => void;
}

export function CaseActionsMenu({ caseRow, canSign, sessionName, onSigned }: Props): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const tc = useTranslations('phoenix.common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [dialog, setDialog] = React.useState<'warn' | 'sign' | 'history' | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  /**
   * El menú se dibuja en un PORTAL con posición fija, no dentro de la celda.
   *
   * `DataTable.Scroll` es un `overflow-x-auto`, y por spec eso hace que
   * `overflow-y` compute a `auto` también (está documentado en el propio
   * primitivo). Un desplegable `absolute` dentro de ese contenedor queda
   * recortado: en las últimas filas no se ve, y en las primeras aparece cortado
   * a la derecha. Es el mismo problema que ya tuvimos con los overlays dentro de
   * un Dialog, y la solución es la misma: sacarlo del árbol.
   */
  const [menuPos, setMenuPos] = React.useState<{ top: number; right: number } | null>(null);
  const open = menuPos !== null;

  const openMenu = React.useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }, []);

  // Cerrar al hacer clic afuera, al scrollear y con Escape. El scroll importa
  // porque la posición es fija: si la tabla se mueve, el menú quedaría flotando
  // lejos de su fila.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setMenuPos(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuPos(null); };
    const onScroll = () => setMenuPos(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const needsSignature = !caseRow.hasSigned && !caseRow.signatureExempt;

  /**
   * Abrir el caso = agregar `?case=<id>` a la URL de la LISTA, no navegar a otra
   * pantalla. Así la lista queda montada debajo con su búsqueda y su página, y
   * cerrar el caso devuelve exactamente la vista que había — el mismo patrón de
   * Pacientes y Calendario (ver `lib/case-modal-url.ts`).
   */
  function openCase(): void {
    router.push(conCasoAbierto(pathname, searchParams, caseRow.id), { scroll: false });
  }

  function viewCase(): void {
    setMenuPos(null);
    // Sin firma: se avisa primero. Con firma (o exento), directo al caso.
    if (needsSignature) setDialog('warn');
    else openCase();
  }

  return (
    <div className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setMenuPos(null) : openMenu())}
        className="w-8 h-8 rounded-md text-text-muted hover:text-text-1 hover:bg-white/5 inline-flex items-center justify-center"
        aria-label={tc('actions')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {menuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
          className="z-[60] w-56 rounded-lg bg-bg-1 shadow-xl py-1"
        >
          <MenuItem icon={Eye} label={t('menuViewCase')} onClick={viewCase} />
          {canSign && (
            <MenuItem
              icon={PenLine}
              label={t('menuSign')}
              onClick={() => { setMenuPos(null); setDialog('sign'); }}
            />
          )}
          <MenuItem
            icon={History}
            label={t('menuHistory')}
            onClick={() => { setMenuPos(null); setDialog('history'); }}
          />
        </div>,
        document.body,
      )}

      {dialog === 'warn' && (
        <MissingSignatureDialog
          onCancel={() => setDialog(null)}
          onContinue={() => { setDialog(null); openCase(); }}
        />
      )}

      {dialog === 'sign' && (
        <SignDialog
          caseRow={caseRow}
          // El nombre de quien firma, no el del abogado del caso — ver el
          // comentario en `case-url-modal.tsx`.
          defaultName={sessionName}
          onClose={() => setDialog(null)}
          onSigned={() => { setDialog(null); onSigned(); }}
        />
      )}

      {dialog === 'history' && (
        <HistoryDialog caseRow={caseRow} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

/**
 * Las DOS acciones frecuentes como íconos sueltos — el patrón del panel de v2.
 *
 * En la lista completa se usa el menú "..." con las tres opciones; acá, donde
 * solo caben diez filas y el objetivo es destrabar firmas, las dos que importan
 * quedan a un clic. Comparten los mismos diálogos que el menú, así que el aviso
 * de firma faltante y el pad se comportan igual en los dos lados.
 */
export function CaseRowIcons({
  caseRow, canSign, sessionName, onSigned,
}: Omit<Props, 'onSigned'> & {
  /**
   * OPCIONAL a propósito: el Panel es un SERVER component y no puede pasar una
   * función a un componente de cliente — Next no serializa funciones al cruzar
   * esa frontera y la página revienta entera en runtime.
   *
   * Sin handler, el refresco lo hace este componente por su cuenta. Lo pasa
   * quien ya vive en el cliente y necesita hacer algo más (la lista de Casos
   * recarga su propio fetch, que el router no toca).
   */
  onSigned?: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dialog, setDialog] = React.useState<'warn' | 'sign' | null>(null);

  const needsSignature = !caseRow.hasSigned && !caseRow.signatureExempt;

  function openCase(): void {
    router.push(conCasoAbierto(pathname, searchParams, caseRow.id), { scroll: false });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <IconAction
        icon={Eye}
        label={t('actionView')}
        onClick={() => (needsSignature ? setDialog('warn') : openCase())}
      />
      {canSign && (
        <IconAction
          icon={FileSignature}
          label={t('actionSign')}
          // Firmado y exento no ofrecen el botón: re-firmar existe, pero desde
          // el menú de la lista. Acá el ícono es para destrabar lo pendiente, y
          // ofrecerlo en todas las filas diluye justo eso.
          disabled={!needsSignature}
          onClick={() => setDialog('sign')}
        />
      )}

      {dialog === 'warn' && (
        <MissingSignatureDialog
          onCancel={() => setDialog(null)}
          onContinue={() => { setDialog(null); openCase(); }}
        />
      )}

      {dialog === 'sign' && (
        <SignDialog
          caseRow={caseRow}
          defaultName={sessionName}
          onClose={() => setDialog(null)}
          onSigned={() => {
            setDialog(null);
            if (onSigned) onSigned();
            else router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * El aviso de "falta la firma". Vive aparte porque lo abren los DOS caminos —el
 * menú de la lista y los íconos del panel— y son el mismo mensaje: duplicarlo
 * era garantizar que un día dijeran cosas distintas.
 */
function MissingSignatureDialog({
  onCancel, onContinue,
}: {
  onCancel: () => void; onContinue: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const tc = useTranslations('phoenix.common');
  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('missingSignatureTitle')}</DialogTitle>
          <DialogDescription>{t('missingSignatureBody')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onCancel}>
            {tc('cancel')}
          </Button>
          <Button className="w-full sm:w-auto" onClick={onContinue}>
            {t('continueAnyway')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MenuItem({
  icon: Icon, label, onClick,
}: {
  icon: React.ElementType; label: string; onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-2 hover:text-text-1 hover:bg-white/5 text-left"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </button>
  );
}

/**
 * Diálogo de firma. El nombre viene pre-cargado pero es editable (decisión de
 * Erick); el email de quien firma lo pone el servidor desde la sesión, así que
 * lo que se tipee acá no puede falsear la identidad detrás del documento.
 */
export function SignDialog({
  caseRow, defaultName, onClose, onSigned,
}: {
  caseRow: CaseActionsCase;
  defaultName: string;
  onClose: () => void;
  onSigned: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const tc = useTranslations('phoenix.common');

  const [name, setName] = React.useState(defaultName);
  const [signature, setSignature] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!name.trim() || !signature) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/attorney/cases/${caseRow.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: name.trim(), signatureSvg: signature }),
      });
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error === 'NOT_AN_ATTORNEY' ? t('notAnAttorney') : (data.message ?? t('signError')));
        return;
      }
      onSigned();
    } catch {
      setError(t('signError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('signTitle')}</DialogTitle>
        </DialogHeader>

        {/* Re-firmar está permitido, pero avisar evita la firma duplicada por
            descuido — la anterior no se pierde, queda en el historial. */}
        {caseRow.hasSigned && (
          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
            {t('signAlreadyWarning')}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t('signNameLabel')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <p className="text-text-muted text-[11px]">{t('signNameHint')}</p>
        </div>

        <div className="space-y-1.5">
          <Label>
            {t('signPadLabel')} <span className="text-rose">*</span>
          </Label>
          <SignaturePad
            onChange={setSignature}
            clearLabel={tc('delete')}
            hintLabel={t('signPadHint')}
            height={160}
          />
        </div>

        {error && (
          <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
            {error}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button
            className="w-full sm:w-auto"
            loading={saving}
            disabled={!name.trim() || !signature}
            onClick={() => void submit()}
          >
            {t('signSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface HistoryRow {
  id: string;
  date: string;
  changeType: string | null;
  action: string | null;
  user: string | null;
  previousValue: string | null;
  newValue: string | null;
}

const ACTION_COLOR: Record<string, string> = {
  Asignado:    'bg-emerald/10 text-emerald border-emerald/20',
  Actualizado: 'bg-brand/10 text-brand-text border-brand/20',
  Removido:    'bg-rose/10 text-rose border-rose/20',
};

function HistoryDialog({
  caseRow, onClose,
}: {
  caseRow: CaseActionsCase; onClose: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const [rows, setRows] = React.useState<HistoryRow[] | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/attorney/cases/${caseRow.id}/history`);
        const data = await res.json().catch(() => ({ rows: [] })) as { rows?: HistoryRow[] };
        setRows(data.rows ?? []);
      } catch {
        setRows([]);
      }
    })();
  }, [caseRow.id]);

  /**
   * CSV armado en el navegador: son como mucho 200 filas que YA están en
   * memoria, así que pedirle al servidor que las devuelva otra vez en otro
   * formato sería un viaje de más.
   */
  function downloadCsv(): void {
    if (!rows?.length) return;
    const header = [t('colDate'), t('colChangeType'), t('colAction'), t('colUser'), t('colPrevValue'), t('colNewValue')];
    const esc = (v: string | null): string => `"${(v ?? '').replace(/"/g, '""')}"`;
    const body = rows.map((r) => [
      esc(fechaHora(r.date)), esc(r.changeType), esc(r.action),
      esc(r.user), esc(r.previousValue), esc(r.newValue),
    ].join(','));
    const csv = [header.map(esc).join(','), ...body].join('\n');

    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-${caseRow.caseCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {t('historyTitle')}
            <TagPill label={caseRow.caseCode} mono compact colorClass="bg-brand/10 text-brand-text border-brand/20" />
          </DialogTitle>
        </DialogHeader>

        {rows === null ? (
          <div className="py-10 text-center text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState.Inline message={t('historyEmpty')} />
        ) : (
          <>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => window.open(`/api/attorney/cases/${caseRow.id}/history/pdf`, '_blank', 'noopener')}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                PDF
              </Button>
              <Button variant="ghost" onClick={downloadCsv}>
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                {t('exportCsv')}
              </Button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              <DataTable.Card>
                <DataTable.Scroll>
                  <DataTable.Table>
                    <DataTable.Head>
                      <DataTable.Th sticky="left">{t('colDate')}</DataTable.Th>
                      <DataTable.Th>{t('colChangeType')}</DataTable.Th>
                      <DataTable.Th>{t('colAction')}</DataTable.Th>
                      <DataTable.Th>{t('colUser')}</DataTable.Th>
                      <DataTable.Th>{t('colPrevValue')}</DataTable.Th>
                      <DataTable.Th>{t('colNewValue')}</DataTable.Th>
                    </DataTable.Head>
                    <tbody>
                      {rows.map((r) => (
                        <DataTable.Row key={r.id}>
                          <DataTable.Td sticky="left">
                            <span className="whitespace-nowrap">{fechaHora(r.date)}</span>
                          </DataTable.Td>
                          <DataTable.Td>
                            {r.changeType
                              ? <TagPill label={r.changeType} compact colorClass="bg-white/5 text-text-2 border-border" />
                              : '—'}
                          </DataTable.Td>
                          <DataTable.Td>
                            {r.action
                              ? <TagPill label={r.action} compact colorClass={ACTION_COLOR[r.action] ?? 'bg-white/5 text-text-2 border-border'} />
                              : '—'}
                          </DataTable.Td>
                          <DataTable.Td>
                            <span className="text-[12.5px]">{r.user ?? '—'}</span>
                          </DataTable.Td>
                          <DataTable.Td>{r.previousValue ?? '—'}</DataTable.Td>
                          <DataTable.Td>{r.newValue ?? '—'}</DataTable.Td>
                        </DataTable.Row>
                      ))}
                    </tbody>
                  </DataTable.Table>
                </DataTable.Scroll>
              </DataTable.Card>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
