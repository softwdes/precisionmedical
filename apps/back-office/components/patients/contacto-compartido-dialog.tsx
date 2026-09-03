'use client';

/**
 * "Ese contacto ya lo usa alguien" — el diálogo que reemplaza al muro.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 *
 * Una familia entera usa el teléfono y el correo del papá o de la mamá. Hasta
 * ahora el sistema respondía "ese email ya está registrado" y ahí se terminaba:
 * la recepcionista quedaba sin salida y el dato del parentesco —que en ese
 * momento lo sabe, porque está hablando con la familia— se perdía.
 *
 * Este diálogo **no bloquea: pregunta**. Y convierte el choque en el momento en
 * que se captura la relación, que es lo único que faltaba para que el dato
 * exista. Diseño de Erick (2026-09-02).
 *
 * ── Las tres respuestas ─────────────────────────────────────────────────────
 *
 *  1. **Es la misma persona** — no se crea nada, se sigue con la ficha que ya
 *     existe. Es el caso más frecuente y por eso va primero.
 *  2. **Es un familiar** — se crea, y se guarda de quién es el contacto y qué
 *     parentesco tiene. Acá está el valor.
 *  3. **Es una coincidencia** — se crea suelto, sin vínculo. Dos personas sin
 *     relación pueden compartir un teléfono (una casa, un trabajo).
 *
 * ── Por qué se pide autorización ────────────────────────────────────────────
 *
 * El parentesco NO es el consentimiento. Si el teléfono de la mamá le llega a 5
 * pacientes, un SMS que dice "tu cita del martes" es información médica de una
 * persona viajando por el canal de otra. Eso se autoriza, no se deduce — de ahí
 * la casilla, que es lo que sella `contactAuthorizedAt`.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users, Mail, Phone, UserCheck, AlertCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button,
} from '@precision/ui';
import { PersonAvatar } from '@/components/ui-phoenix';
import { RELATION_CODES } from '@precision-medical/database/relations';

/** Espejo de `PacienteConEseContacto` del server, serializado. */
export interface CandidatoContacto {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  canales: Array<'PHONE' | 'EMAIL'>;
}

export interface VinculoElegido {
  contactOwnerId: string;
  contactRelation: string;
  sharesEmail: boolean;
  sharesPhone: boolean;
  autorizado: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Quiénes ya usan ese contacto. */
  candidatos: CandidatoContacto[];
  /** El paciente que se está dando de alta — para nombrarlo en la pregunta. */
  nombreNuevo: string;
  /** El contacto que colisionó, para decir cuál de los dos se comparte. */
  emailNuevo?: string | null;
  telefonoNuevo?: string | null;
  onUsarExistente: (patientId: string) => void;
  onVincular: (v: VinculoElegido) => void;
  onCrearSuelto: () => void;
}

type Paso = 'preguntar' | 'parentesco';

export function ContactoCompartidoDialog({
  open, onClose, candidatos, nombreNuevo, emailNuevo, telefonoNuevo,
  onUsarExistente, onVincular, onCrearSuelto,
}: Props) {
  const t = useTranslations('phoenix.patients');

  const [paso, setPaso]           = useState<Paso>('preguntar');
  const [dueñoId, setDueñoId]     = useState<string>(candidatos[0]?.id ?? '');
  const [relacion, setRelacion]   = useState<string>('SPOUSE');
  const [autorizado, setAutorizado] = useState(false);

  // Qué canal colisionó de verdad — decide qué se marca como compartido.
  const chocaEmail = candidatos.some((c) => c.canales.includes('EMAIL'));
  const chocaTel   = candidatos.some((c) => c.canales.includes('PHONE'));

  const dueño = candidatos.find((c) => c.id === dueñoId) ?? candidatos[0];

  if (candidatos.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Users className="w-4 h-4 text-amber" />
            {t('linkContactTitle')}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {chocaEmail && chocaTel ? t('linkContactSubBoth')
              : chocaEmail ? t('linkContactSubEmail')
              : t('linkContactSubPhone')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">

          {/* Quiénes ya usan ese contacto */}
          <div className="rounded-md bg-bg-2/40 divide-y divide-row-sep">
            {candidatos.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <PersonAvatar firstName={c.firstName} lastName={c.lastName} size={8} />
                <div className="min-w-0 flex-1">
                  <div className="text-text-1 text-[13px] font-medium truncate">
                    {c.lastName}, {c.firstName}
                  </div>
                  <div className="text-text-muted text-[10px] font-mono">{c.patientCode}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.canales.includes('EMAIL') && <span title={t('linkContactByEmail')}><Mail className="w-3 h-3 text-amber" /></span>}
                  {c.canales.includes('PHONE') && <span title={t('linkContactByPhone')}><Phone className="w-3 h-3 text-amber" /></span>}
                </div>
              </div>
            ))}
          </div>

          {paso === 'preguntar' ? (
            <>
              <p className="text-[12.5px] text-text-2">
                {t('linkContactQuestion', { nombre: nombreNuevo })}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {/* La misma persona va primero: es la respuesta más frecuente. */}
                <button
                  type="button"
                  onClick={() => onUsarExistente(candidatos[0]!.id)}
                  className="flex items-start gap-3 rounded-md border border-border bg-bg-2/20 px-3 py-2.5 text-left hover:border-brand/40 transition-colors"
                >
                  <UserCheck className="w-4 h-4 text-brand-text shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-text-1">{t('linkContactSame')}</span>
                    <span className="block text-[11px] text-text-muted">{t('linkContactSameHint')}</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaso('parentesco')}
                  className="flex items-start gap-3 rounded-md border border-border bg-bg-2/20 px-3 py-2.5 text-left hover:border-emerald/40 transition-colors"
                >
                  <Users className="w-4 h-4 text-emerald shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-text-1">{t('linkContactFamily')}</span>
                    <span className="block text-[11px] text-text-muted">{t('linkContactFamilyHint')}</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onCrearSuelto}
                  className="flex items-start gap-3 rounded-md border border-border bg-bg-2/20 px-3 py-2.5 text-left hover:border-border-strong transition-colors"
                >
                  <AlertCircle className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-text-1">{t('linkContactCoincidence')}</span>
                    <span className="block text-[11px] text-text-muted">{t('linkContactCoincidenceHint')}</span>
                  </span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {/* De quién es el contacto — solo se pregunta si hay más de uno. */}
              {candidatos.length > 1 && (
                <div>
                  <label className="block text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">
                    {t('linkContactOwnerLabel')}
                  </label>
                  <select
                    value={dueñoId}
                    onChange={(e) => setDueñoId(e.target.value)}
                    className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                  >
                    {candidatos.map((c) => (
                      <option key={c.id} value={c.id}>{c.lastName}, {c.firstName} ({c.patientCode})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">
                  {t('linkContactRelationLabel', { nombre: nombreNuevo })}
                </label>
                <select
                  value={relacion}
                  onChange={(e) => setRelacion(e.target.value)}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                >
                  {RELATION_CODES.map((c) => (
                    <option key={c} value={c}>{t(`relation.${c}`)}</option>
                  ))}
                </select>
              </div>

              {/* Lo que va a quedar guardado, dicho en palabras. */}
              <div className="rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan leading-relaxed">
                {t('linkContactPreview', {
                  nuevo:  nombreNuevo,
                  dueño:  `${dueño!.firstName} ${dueño!.lastName}`,
                  canal:  chocaEmail && chocaTel ? t('linkContactBoth')
                        : chocaEmail ? t('linkContactByEmail') : t('linkContactByPhone'),
                })}
              </div>

              {/**
                * La autorización. No es opcional por burocracia: sin esto,
                * mandarle a la mamá el recordatorio de la cita del hijo es PHI
                * de una persona por el canal de otra.
                */}
              <label className="flex items-start gap-2.5 rounded-md border border-border bg-bg-2/20 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autorizado}
                  onChange={(e) => setAutorizado(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald shrink-0"
                />
                <span className="text-[11.5px] text-text-2 leading-relaxed">
                  {t('linkContactAuthorize', { dueño: `${dueño!.firstName} ${dueño!.lastName}` })}
                </span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 pb-5 flex-col sm:flex-row gap-2">
          {paso === 'parentesco' && (
            <>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setPaso('preguntar')}>
                {t('linkContactBack')}
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!autorizado}
                title={!autorizado ? t('linkContactNeedsAuth') : undefined}
                onClick={() => onVincular({
                  contactOwnerId:  dueñoId || candidatos[0]!.id,
                  contactRelation: relacion,
                  sharesEmail:     chocaEmail,
                  sharesPhone:     chocaTel,
                  autorizado,
                })}
              >
                {t('linkContactConfirm')}
              </Button>
            </>
          )}
          {paso === 'preguntar' && (
            <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>
              {t('linkContactCancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
