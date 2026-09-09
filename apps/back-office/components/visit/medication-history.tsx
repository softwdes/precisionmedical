'use client';

/**
 * MedicationHistory — conciliación de medicamentos del paciente (B.19).
 *
 * Muestra QUÉ TOMA el paciente, con el detalle de la receta que lo generó:
 * presentación, indicaciones, cantidad, refills, prescriptor, fecha y farmacia.
 * Ese detalle no vive en el historial (que solo guarda nombre, estado y el
 * `dawRxId`) sino en la tabla `prescriptions`; lo pega el servidor antes de
 * mandar la lista — ver `lib/medication-details.ts`.
 *
 * **Agrupa por medicamento, no por receta.** La pregunta del médico es "¿qué
 * está tomando?", no "¿qué se envió?". El sistema que reemplazamos tira una fila
 * por cada envío —el mismo remedio tres veces— y obliga a leer fechas para
 * reconstruir el presente. Acá el medicamento aparece una vez, con lo vigente
 * arriba y los registros anteriores desplegables.
 *
 * También permite anotar algo que el paciente refiere tomar y esta clínica NO
 * prescribió, ahora con dosis, cantidad e indicaciones (pedido del provider vía
 * Erick, 2026-09-09). Sigue siendo una nota del expediente: **no toca ScriptSure
 * ni la tabla Prescription, y no pasa por el control de interacciones**, que
 * corre del lado de ellos sobre lo que está allá. Por eso quedan marcadas.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@precision/ui';
import { Pill, Plus, Loader2, Flag, AlertTriangle, ChevronDown } from 'lucide-react';
import { EmptyState, TagPill } from '@/components/ui-phoenix';
import { fechaCorta } from '@/lib/fechas';
import type { MedicationConDetalle, MedicationRxDetail } from '@/lib/medication-details';
// El estado del envío se pinta con el MISMO mapa que el tab de recetas y el
// Resumen. Duplicarlo acá sería una segunda verdad sobre si una receta llegó.
import { STATUS_KEY as RX_STATUS_KEY, STATUS_CLASS as RX_STATUS_CLASS } from './rx-integration-status';

/**
 * Tope de los campos de texto, IGUAL al de la ruta que escribe
 * (`/api/admin/patients/medications/[appointmentId]`). El server ya validaba y
 * el error ya se mostraba; lo que faltaba era no dejar teclear 5000 caracteres
 * para enterarse recién al guardar.
 */
const MAX_MED = 300;
const MAX_CAMPO = 120;
const MAX_SIG = 500;

export type { MedicationRxDetail };
export type MedicationEntry = MedicationConDetalle;

interface Props {
  appointmentId: string;
  medications: MedicationEntry[];
}

/** Un grupo = un medicamento, con todos sus registros. */
interface Grupo {
  clave: string;
  nombre: string;
  /** Vigente primero; dentro de eso, la receta más nueva. */
  entradas: MedicationEntry[];
  activo: boolean;
}

const esActivo = (m: MedicationEntry): boolean => m.status === 'IN_USE';

/** El estado llega como texto desde el JSON: se acota al mapa compartido. */
type EstadoRx = keyof typeof RX_STATUS_KEY;
const estadoRx = (s: string): EstadoRx => (s in RX_STATUS_KEY ? (s as EstadoRx) : 'DRAFT');

/** Milisegundos de la receta, para ordenar. Sin fecha va al fondo. */
const cuando = (m: MedicationEntry): number => {
  const iso = m.rx?.sentAt;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

function agrupar(items: MedicationEntry[]): Grupo[] {
  const mapa = new Map<string, MedicationEntry[]>();
  for (const m of items) {
    const clave = m.name.trim().toLowerCase();
    const lista = mapa.get(clave) ?? [];
    lista.push(m);
    mapa.set(clave, lista);
  }

  const grupos: Grupo[] = [...mapa.entries()].map(([clave, entradas]) => {
    const orden = [...entradas].sort((a, b) => {
      if (esActivo(a) !== esActivo(b)) return esActivo(a) ? -1 : 1;
      return cuando(b) - cuando(a);
    });
    return {
      clave,
      nombre: orden[0]!.name.trim(),
      entradas: orden,
      activo: orden.some(esActivo),
    };
  });

  // Activos primero: es lo que el doctor necesita ver de un vistazo. Después,
  // alfabético, que es como se busca un remedio en una lista.
  return grupos.sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    return a.nombre.localeCompare(b.nombre);
  });
}

export function MedicationHistory({ appointmentId, medications }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();

  const [items, setItems] = React.useState<MedicationEntry[]>(medications);
  const [formOpen, setFormOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [status, setStatus] = React.useState<'IN_USE' | 'HISTORY'>('IN_USE');
  const [note, setNote] = React.useState('');
  const [dose, setDose] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [sig, setSig] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** Grupos con los registros anteriores desplegados. */
  const [abiertos, setAbiertos] = React.useState<Set<string>>(new Set());

  // El padre puede re-renderizar con datos frescos (router.refresh) — seguirlos
  React.useEffect(() => { setItems(medications); }, [medications]);

  const resetForm = (): void => {
    setFormOpen(false); setName(''); setNote(''); setStatus('IN_USE');
    setDose(''); setQuantity(''); setSig(''); setError(null);
  };

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/admin/patients/medications/${appointmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          status,
          prescribedBy: note.trim() || undefined,
          dose: dose.trim() || undefined,
          quantity: quantity.trim() || undefined,
          instructions: sig.trim() || undefined,
        }),
      });
      if (!res.ok) { setError(t('medHxErrSave')); return; }
      const d = await res.json() as { medications: MedicationEntry[] };
      setItems(d.medications);
      resetForm();
      router.refresh();
    } catch {
      setError(t('medHxErrSave'));
    } finally {
      setSaving(false);
    }
  };

  const grupos = React.useMemo(() => agrupar(items), [items]);
  const activeCount = items.filter(esActivo).length;

  const alternar = (clave: string): void => {
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave); else s.add(clave);
      return s;
    });
  };

  return (
    <div className="rounded-lg bg-bg-1">
      {/* El botón de agregar vive en el encabezado — abajo quedaba enterrado
          cuando la lista crecía (pedido de Erick 2026-08-03). */}
      <div className="px-4 py-3 border-b border-row-sep flex items-center gap-2 flex-wrap">
        <Pill className="w-4 h-4 text-violet-text shrink-0" />
        <span className="text-text-1 font-semibold text-[12px] uppercase tracking-wider">
          {t('medHxTitle')}
        </span>
        {activeCount > 0 && (
          <TagPill
            label={t('medHxActiveCount', { count: activeCount })}
            colorClass="bg-emerald/15 text-emerald border-emerald/30"
          />
        )}
        <span className="text-[10px] text-text-muted">{t('medHxCount', { count: items.length })}</span>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11.5px] font-semibold text-violet-text bg-violet/10 hover:bg-violet/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t('medHxAddShort')}
        </button>
      </div>

      <div className="p-4 flex flex-col gap-2">
        {grupos.length === 0 ? (
          <EmptyState.Rich icon={Pill} title={t('medHxEmptyTitle')} subtitle={t('medHxEmptySubtitle')} />
        ) : (
          grupos.map((g) => {
            const [principal, ...anteriores] = g.entradas;
            const abierto = abiertos.has(g.clave);
            return (
              <div key={g.clave} className="flex flex-col gap-1">
                <FilaMedicamento m={principal!} />

                {anteriores.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => alternar(g.clave)}
                      aria-expanded={abierto}
                      className="self-start inline-flex items-center gap-1 pl-3 text-[11px] text-text-muted hover:text-text-2 transition-colors"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                      {t('medHxOlder', { count: anteriores.length })}
                    </button>
                    {abierto && (
                      <div className="flex flex-col gap-1 pl-3">
                        {anteriores.map((m, i) => <FilaMedicamento key={m.id ?? i} m={m} />)}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal, no un bloque que empuja la lista: anotar un medicamento externo
          es una tarea aparte —el doctor no está leyendo el historial mientras lo
          escribe— y expandido tapaba lo que acababa de leer. */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[88vh]">
          <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
            <DialogTitle className="text-[14px] flex items-center gap-2">
              <Flag className="w-4 h-4 text-amber shrink-0" />
              {t('medHxFormTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 overflow-y-auto space-y-3">
            <p className="text-[11.5px] text-text-muted leading-relaxed">{t('medHxFormHint')}</p>
            {/* Que el detalle se pueda cargar no significa que alguien lo revise:
                el control de interacciones corre del lado de ScriptSure sobre lo
                que está allá. Decirlo acá evita la lectura peligrosa. */}
            <p className="text-[11.5px] text-amber leading-relaxed">{t('medHxFormHintChecks')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="sm:col-span-2">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldName')}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('medHxFieldNamePh')}
                  maxLength={MAX_MED}
                  autoFocus
                  className="w-full h-9 rounded-md bg-bg-2 px-3 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldDose')}
                </label>
                <input
                  value={dose}
                  onChange={(e) => setDose(e.target.value)}
                  placeholder={t('medHxFieldDosePh')}
                  maxLength={MAX_CAMPO}
                  className="w-full h-9 rounded-md bg-bg-2 px-3 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldQty')}
                </label>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={t('medHxFieldQtyPh')}
                  maxLength={MAX_CAMPO}
                  className="w-full h-9 rounded-md bg-bg-2 px-3 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldSig')}
                </label>
                <textarea
                  value={sig}
                  onChange={(e) => setSig(e.target.value)}
                  placeholder={t('medHxFieldSigPh')}
                  maxLength={MAX_SIG}
                  rows={2}
                  className="w-full rounded-md bg-bg-2 px-3 py-2 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40 resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldStatus')}
                </label>
                <div className="flex gap-1.5">
                  {(['IN_USE', 'HISTORY'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`h-9 px-3 rounded-md text-[12px] font-medium transition-colors ${
                        status === s
                          ? 'bg-violet/20 text-violet-text'
                          : 'bg-bg-2 text-text-muted hover:text-text-2'
                      }`}
                    >
                      {s === 'IN_USE' ? t('medHxActive') : t('medHxPrevious')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted block mb-1">
                  {t('medHxFieldNote')}
                </label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void handleSave(); }}
                  placeholder={t('medHxFieldNotePh')}
                  maxLength={MAX_MED}
                  className="w-full h-9 rounded-md bg-bg-2 px-3 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={resetForm} className="h-9 w-full sm:w-auto">
              {t('medHxCancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !name.trim()} className="h-9 w-full sm:w-auto gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {t('medHxSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Una fila: nombre y presentación arriba, las indicaciones debajo, y el pie con
 * lo que hace falta para responder "¿esto llegó y de dónde salió?".
 *
 * El estado del ENVÍO solo se pinta cuando NO es "llegó a la farmacia": lo
 * esperable no necesita etiqueta y la excepción sí. La evidencia de que salió
 * bien es la farmacia y la fecha, que están igual.
 */
function FilaMedicamento({ m }: { m: MedicationEntry }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const rx = m.rx;

  const presentacion = rx?.dose ?? m.dose ?? null;
  const indicaciones = rx?.sig ?? m.instructions ?? null;
  const cantidad = rx?.quantity ?? m.quantity ?? null;

  const meta: string[] = [];
  if (cantidad) meta.push(cantidad);
  if (rx?.refills != null) meta.push(t('medHxRefills', { count: rx.refills }));
  const receta = rx?.prescriberName ?? m.prescribedBy ?? null;
  if (receta) meta.push(receta);
  if (rx?.sentAt) meta.push(fechaCorta(rx.sentAt));
  if (rx?.pharmacyName) meta.push(rx.pharmacyName);

  const envioRaro = rx && rx.rxStatus !== 'SENT';

  return (
    <div className={`rounded-md px-3 py-2 ${m.externalPrescriber ? 'border border-dashed border-border' : 'bg-bg-2/40'}`}>
      <div className="flex items-start gap-1.5 flex-wrap">
        <span className="text-[12.5px] text-text-1 font-medium min-w-0 break-words">
          {m.name}
          {presentacion && <span className="text-text-2 font-normal"> {presentacion}</span>}
        </span>
        <TagPill
          label={m.status === 'IN_USE' ? t('medHxActive') : t('medHxPrevious')}
          colorClass={m.status === 'IN_USE'
            ? 'bg-emerald/15 text-emerald border-emerald/30'
            : 'bg-white/5 text-text-muted border-border'}
        />
        {m.externalPrescriber && (
          <TagPill
            label={t('medHxExternal')}
            colorClass="bg-transparent text-text-muted border-border border-dashed"
          />
        )}
        {rx?.deaSchedule && (
          <TagPill
            label={t('medHxSchedule', { schedule: rx.deaSchedule })}
            colorClass="bg-amber/15 text-amber border-amber/30"
          />
        )}
        {envioRaro && (
          <TagPill
            label={t(`rxStatus_${RX_STATUS_KEY[estadoRx(rx.rxStatus)]}`)}
            colorClass={RX_STATUS_CLASS[estadoRx(rx.rxStatus)]}
          />
        )}
      </div>

      {indicaciones && (
        <div className="text-[11.5px] text-text-2 mt-1 break-words leading-relaxed">{indicaciones}</div>
      )}

      {meta.length > 0 && (
        <div className="text-[11px] text-text-muted mt-1 break-words">{meta.join(' · ')}</div>
      )}
    </div>
  );
}
