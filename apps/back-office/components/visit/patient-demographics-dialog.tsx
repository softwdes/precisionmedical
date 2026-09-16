'use client';

/**
 * PatientDemographicsDialog — completar dirección y teléfono sin salir de la
 * consulta.
 *
 * ScriptSure no crea al paciente sin esos datos, así que sin ellos no se abre
 * ningún widget de recetas. Antes eso era un callejón sin salida: el aviso decía
 * "completá la dirección en la ficha del paciente" y no llevaba a ningún lado —
 * un provider no pudo mostrar el módulo de medicamentos por esto (Devin vía
 * Erick, 2026-09-16). Ahora se completa acá y el widget se reintenta solo.
 *
 * ── Que no se guarde donde no corresponde ──────────────────────────────────
 *
 * El diálogo **no conoce ni manda el id del paciente**: habla con una ruta
 * scopeada por CITA que resuelve la ficha del lado del servidor. Los valores se
 * leen de esa misma ruta (no de lo que tuviera cargado la pantalla anterior), y
 * el nombre se muestra arriba para que quien edita vea a quién le está editando
 * antes de tocar nada.
 *
 * Un campo que se deja vacío NO borra lo que ya había — esto es para completar.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@precision/ui';
import { Loader2, AlertTriangle, MapPin, Check } from 'lucide-react';

/** Los campos que ScriptSure rechazó, para marcarlos en el formulario. */
export type CampoFaltante = 'addressLine1' | 'city' | 'state' | 'zip' | 'phone';

interface Datos {
  patientName: string;
  addressLine1: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  phone: string;
}

const VACIO: Datos = {
  patientName: '', addressLine1: '', addressCity: '', addressState: '',
  addressZip: '', phone: '',
};

/** Campo del formulario → nombre con el que lo reporta el servidor. */
const FALTANTE: Record<keyof Omit<Datos, 'patientName'>, CampoFaltante> = {
  addressLine1: 'addressLine1',
  addressCity: 'city',
  addressState: 'state',
  addressZip: 'zip',
  phone: 'phone',
};

interface Props {
  open: boolean;
  appointmentId: string;
  /** Lo que reportó el 422 — se resalta en el formulario. */
  faltantes: CampoFaltante[];
  onCancel: () => void;
  /** Datos guardados: quien llama reintenta el widget que se había trabado. */
  onSaved: () => void;
}

export function PatientDemographicsDialog({
  open, appointmentId, faltantes, onCancel, onSaved,
}: Props): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');
  const [datos, setDatos] = React.useState<Datos>(VACIO);
  const [cargando, setCargando] = React.useState(true);
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Se leen del servidor CADA vez que se abre: el formulario tiene que mostrar
  // lo que la ficha tiene de verdad, no lo que la pantalla anterior asumía.
  React.useEffect(() => {
    if (!open) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    fetch(`/api/admin/patients/demographics/${appointmentId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Datos) => { if (vivo) { setDatos({ ...VACIO, ...d }); setCargando(false); } })
      .catch(() => { if (vivo) { setError(t('demogLoadError')); setCargando(false); } });
    return () => { vivo = false; };
  }, [open, appointmentId, t]);

  if (!open) return null;

  const set = (k: keyof Datos) => (e: React.ChangeEvent<HTMLInputElement>): void =>
    setDatos((d) => ({ ...d, [k]: e.target.value }));

  /** Falta algo de lo que ScriptSure pidió y sigue sin completarse. */
  const incompleto = (Object.keys(FALTANTE) as Array<keyof typeof FALTANTE>)
    .some((k) => faltantes.includes(FALTANTE[k]) && !datos[k].trim());

  async function guardar(): Promise<void> {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/patients/demographics/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addressLine1: datos.addressLine1,
          addressCity: datos.addressCity,
          addressState: datos.addressState,
          addressZip: datos.addressZip,
          phone: datos.phone,
        }),
      });
      if (!res.ok) { setError(t('demogSaveError')); return; }
      onSaved();
    } catch {
      setError(t('demogSaveError'));
    } finally {
      setGuardando(false);
    }
  }

  const campo = (
    k: keyof Omit<Datos, 'patientName'>,
    label: string,
    ph: string,
    ancho = '',
  ): React.ReactElement => {
    const marcado = k in FALTANTE && faltantes.includes(FALTANTE[k as keyof typeof FALTANTE]);
    return (
      <div className={ancho}>
        <label className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1 flex items-center gap-1.5">
          {label}
          {marcado && <span className="text-amber normal-case tracking-normal font-normal">· {t('demogRequired')}</span>}
        </label>
        <input
          value={datos[k]}
          onChange={set(k)}
          placeholder={ph}
          disabled={cargando}
          className={`w-full h-9 rounded-md bg-bg-2 px-3 text-sm text-text-1 outline-none focus:ring-1 focus:ring-violet/40 disabled:opacity-50 ${
            marcado && !datos[k].trim() ? 'ring-1 ring-amber/40' : ''
          }`}
        />
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !guardando) onCancel(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[88vh]">
        <DialogHeader className="px-5 py-3 shrink-0 border-b border-border">
          <DialogTitle className="text-[14px] flex items-center gap-2">
            <MapPin className="w-4 h-4 text-violet-text shrink-0" />
            {t('demogTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          <p className="text-[12.5px] text-text-2 leading-relaxed">{t('demogHint')}</p>

          {/* A quién se le está editando. Va arriba de los campos a propósito:
              es la confirmación de que esto no le escribe a otra ficha. */}
          {!cargando && datos.patientName && (
            <div className="rounded-md bg-bg-2/40 px-3 py-2 text-[12px] text-text-1">
              <span className="text-text-muted">{t('demogFor')} </span>
              <b>{datos.patientName}</b>
            </div>
          )}

          {cargando ? (
            <div className="flex items-center gap-2 text-[12px] text-text-muted py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('demogLoading')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {campo('addressLine1', t('demogStreet'), t('demogStreetPh'), 'sm:col-span-2')}
              {campo('addressCity', t('demogCity'), t('demogCityPh'))}
              {campo('addressState', t('demogState'), t('demogStatePh'))}
              {campo('addressZip', t('demogZip'), t('demogZipPh'))}
              {campo('phone', t('demogPhone'), t('demogPhonePh'))}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} disabled={guardando} className="h-9 w-full sm:w-auto">
            {t('demogCancel')}
          </Button>
          <Button
            onClick={() => void guardar()}
            disabled={guardando || cargando || incompleto}
            className="h-9 w-full sm:w-auto gap-1.5"
          >
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {t('demogSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
