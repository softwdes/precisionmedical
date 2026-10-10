'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { PiggyBank, X } from 'lucide-react';

/**
 * "Crédito a favor en cobranza" — poner y sacar la marca que frena el copago.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Es el espejo de `MarcaCobro` con el signo invertido: aquélla dice *cobrale
 * antes de atenderlo*, ésta dice **no le cobres el copago**. La plata no la
 * tiene la clínica — está retenida a nombre del paciente en PHI, el software de
 * CBO, y se aplica entre dos semanas y dos meses después.
 *
 * Lo pidió Darrell (cobranza) el 2026-10-09 describiendo lo que ya hace en
 * Medusa, y eligió que la marca viva en el PACIENTE y no en cada cargo: el
 * crédito es de la persona, no de la visita.
 *
 * ⚠️ **No cambia ningún saldo.** El copago se sigue debiendo hasta que CBO
 * aplique el crédito; cuando lo aplica, el pago se registra como cualquier otro
 * con su fecha real. Lo único que esta marca agrega es el PORQUÉ: hoy un copago
 * esperando un crédito se ve idéntico a uno que nadie cobró.
 *
 * ── Por qué ámbar y no rojo ────────────────────────────────────────────────
 *
 * El rojo está tomado, y por algo: `MarcaCobro` frena la ATENCIÓN de una
 * persona. Esto no frena a nadie — cambia lo que el mostrador le pide. Es una
 * instrucción que pide atención, que es exactamente lo que el ámbar significa
 * en la tabla de colores por intención (regla #5).
 *
 * ⚠️ NO decide quién puede escribir: eso lo resuelve el servidor, detrás de
 * `checkPatientAccess(admin: true)`. `soloLectura` es lo que evita ofrecerle el
 * botón a quien se va a comer un 403.
 */

export function MarcaCredito({ patientId, activo, nota, soloLectura = false, onCambio }: {
  patientId: string;
  activo: boolean;
  nota: string | null;
  /**
   * Se ve, no se toca — para el portal del provider.
   *
   * Él tiene que SABER que a este paciente no se le cobra el copago, pero la
   * marca la pone recepción o cobranza. Misma regla que en `MarcaCobro`: no se
   * esconde, se explica.
   */
  soloLectura?: boolean;
  /** Avisa al resto de la ficha — se llama DESPUÉS del 200. Ver `MarcaCobro`. */
  onCambio?: (estado: { marcado: boolean; nota: string | null }) => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.avisosPaciente');
  const router = useRouter();

  /**
   * El estado vive ACÁ, sembrado desde el servidor — no se lee del prop directo.
   *
   * Es la misma trampa que ya se pisó en `MarcaCobro`: con el prop solo, después
   * de marcar el botón volvía al estado sin marcar y había que recargar a mano.
   * El dato se guardaba bien; lo que no llegaba era el repintado, y para quien
   * marca eso se lee como "no funcionó", así que vuelve a marcar.
   */
  const [marcado, setMarcado] = React.useState(activo);
  const [notaActual, setNotaActual] = React.useState(nota);

  // Si el servidor manda un valor distinto —otra pestaña, una recarga— gana él.
  React.useEffect(() => {
    setMarcado(activo);
    setNotaActual(nota);
  }, [activo, nota]);

  const [abierto, setAbierto] = React.useState(false);
  const [texto, setTexto] = React.useState(nota ?? '');
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function guardar(nuevoActivo: boolean): Promise<void> {
    // Corta el doble clic: sin esto, dos toques seguidos mandan dos PATCH.
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const notaNueva = nuevoActivo ? (texto.trim() || null) : null;
    try {
      const r = await fetch(`/api/admin/patients/${patientId}/credito`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: nuevoActivo, nota: notaNueva }),
      });
      if (!r.ok) {
        // El 403 se nombra: es "no es tuyo", no "se rompió".
        setError(r.status === 403 ? t('creditoSinPermiso') : t('creditoError'));
        return;
      }
      setMarcado(nuevoActivo);
      setNotaActual(notaNueva);
      setTexto(notaNueva ?? '');
      setAbierto(false);
      onCambio?.({ marcado: nuevoActivo, nota: notaNueva });
      router.refresh();
    } catch {
      setError(t('creditoError'));
    } finally {
      setGuardando(false);
    }
  }

  // ── Marcado: el aviso, con lo que escribió quien lo marcó ────────────────
  if (marcado && !abierto) {
    return (
      <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2">
        <div className="flex items-start gap-2 flex-wrap">
          <PiggyBank className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-amber uppercase tracking-wider">
              {t('creditoTitulo')}
            </p>
            {/* La instrucción, siempre. La marca sin esta línea obliga a
                recordar qué significa; con ella se lee sola. */}
            <p className="text-[12.5px] text-text-1 mt-0.5">{t('creditoInstruccion')}</p>
            {notaActual && (
              <p className="text-[12.5px] text-text-2 mt-0.5 break-words">{notaActual}</p>
            )}
            {soloLectura && (
              <p className="text-[11px] text-text-muted mt-0.5">{t('creditoSoloRecepcion')}</p>
            )}
          </div>
          {!soloLectura && (
            <button
              type="button"
              onClick={() => void guardar(false)}
              disabled={guardando}
              className="h-10 sm:h-7 px-3.5 sm:px-2.5 rounded text-[12.5px] sm:text-[11.5px] font-semibold bg-amber/15 text-amber hover:bg-amber/25 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <X className="w-3 h-3" />
              {guardando ? t('creditoQuitando') : t('creditoQuitar')}
            </button>
          )}
        </div>
        {error && <p className="text-[11px] text-rose mt-1.5">{error}</p>}
      </div>
    );
  }

  /**
   * Sin marca y de solo lectura: nada.
   *
   * Misma excepción deliberada que en `MarcaCobro`: no hay nada que hacer ni
   * nada que saber, y un cartel de "este paciente no tiene crédito" en cada
   * ficha del portal médico es ruido en la pantalla que él abre todo el día.
   */
  if (soloLectura) return <></>;

  // ── El formulario, al marcar ─────────────────────────────────────────────
  if (abierto) {
    return (
      <div className="rounded-md bg-bg-2/40 p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
          {t('creditoTitulo')}
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={280}
          rows={2}
          autoFocus
          placeholder={t('creditoPlaceholder')}
          className="w-full rounded border border-border bg-bg-1 px-2.5 py-2 text-[12.5px] text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none"
        />
        <p className="text-[11px] text-text-muted">{t('creditoAyuda')}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => void guardar(true)}
            disabled={guardando}
            className="w-full sm:w-auto h-10 sm:h-8 px-3.5 rounded text-[12.5px] font-semibold bg-amber/15 text-amber hover:bg-amber/25 transition-colors disabled:opacity-50"
          >
            {guardando ? t('creditoGuardando') : t('creditoGuardar')}
          </button>
          <button
            type="button"
            onClick={() => { setAbierto(false); setTexto(notaActual ?? ''); setError(null); }}
            className="w-full sm:w-auto h-10 sm:h-8 px-3.5 rounded text-[12.5px] font-semibold text-text-2 hover:text-text-1 hover:bg-white/[0.04] transition-colors"
          >
            {t('creditoCancelar')}
          </button>
        </div>
        {error && <p className="text-[11px] text-rose">{error}</p>}
      </div>
    );
  }

  /**
   * Sin marcar: el botón se MUESTRA igual.
   *
   * Regla de no esconder la acción bloqueada. Y acá pesa más que en otros
   * lados: si el botón no está a la vista, cobranza no se entera de que la
   * función existe, y el crédito vuelve a vivir donde vive hoy — en la cabeza
   * de una sola persona.
   */
  return (
    <button
      type="button"
      onClick={() => setAbierto(true)}
      className="inline-flex items-center gap-1.5 h-10 sm:h-7 px-3.5 sm:px-2.5 rounded text-[12.5px] sm:text-[11.5px] font-semibold text-text-muted hover:text-amber hover:bg-amber/10 transition-colors"
    >
      <PiggyBank className="w-3 h-3" />
      {t('creditoTitulo')}
    </button>
  );
}
