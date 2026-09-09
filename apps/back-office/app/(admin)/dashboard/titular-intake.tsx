'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Sparkles, CheckCircle2, Phone, Send } from 'lucide-react';
import { Button } from '@precision/ui';
import { SendPortalDialog } from '@/components/cases/send-portal-dialog';
import { useTwilioDevice } from '@/lib/use-twilio-device';
import { mereceTitular, recalcularUrgencia } from '@/lib/intake-urgencia';
import { useReloj } from '@/lib/use-reloj';
import { caseInfo, type FilaVista } from './intake-panel';

/**
 * Lo primero de hoy · la tarjeta que elige UN caso y lo dice en una frase.
 *
 * Es la pieza copiada de `attention-card.tsx` del portal legal, que fue la que
 * hizo que Erick prefiriera Vigía: la pantalla no te entrega treinta y tres
 * filas para que decidas, decide ella y te da el botón.
 *
 * ── Por qué hay un umbral, y por qué el verde importa ────────────────────────
 *
 * Sin umbral, la tarjeta titularía siempre algo, y un martes tranquilo diría
 * "Fulano llega el jueves" con el mismo tamaño de letra y el mismo rojo que un
 * paciente que ya debía estar en la sala. Eso es exactamente la enfermedad que
 * veníamos a curar, movida un piso más arriba.
 *
 * Así que cuando nadie alcanza `UMBRAL_TITULAR` la tarjeta dice en verde que no
 * hay nada urgente. Esa versión verde es la que le da valor a la roja: si la
 * tarjeta está roja, es porque de verdad hay algo.
 *
 * ── Los dos botones ─────────────────────────────────────────────────────────
 *
 * Llamar y mandar el formulario, en ese orden, y son los mismos caminos que la
 * cola de abajo — el mismo `useTwilioDevice` y el mismo `SendPortalDialog`. No
 * hay un tercer camino de envío en el sistema y esta tarjeta no inventa uno.
 *
 * El de llamar se MUESTRA aunque no haya teléfono, y se bloquea explicando por
 * qué (regla de Erick: no esconder la acción bloqueada). Un botón que desaparece
 * deja a quien mira preguntándose si el sistema se rompió.
 */
export function TitularIntake({ fila: filaDelServidor }: { fila: FilaVista | null }): React.ReactElement {
  const t = useTranslations('phoenix.dashboard');
  const locale = useLocale();
  const router = useRouter();
  const twilio = useTwilioDevice();
  const [pedir, setPedir] = React.useState(false);

  /**
   * Con el reloj propio, igual que la cola. Acá importa el doble: esta tarjeta
   * dice "llega en 19 minutos" en letra de 20 px, así que congelada es la mentira
   * más grande de la pantalla — y además el paso de `AHORA` a `TARDE` cambia el
   * texto entero, no solo el número.
   */
  const ahoraMs = useReloj();
  const fila = React.useMemo(
    () => (filaDelServidor === null || ahoraMs === null
      ? filaDelServidor
      : recalcularUrgencia(filaDelServidor, ahoraMs)),
    [filaDelServidor, ahoraMs],
  );

  /**
   * El criterio es el MISMO que usa el servidor, importado de `intake-urgencia`,
   * que es aritmética pura y no toca la base. Copiar el umbral a mano acá sería
   * la receta para que un día la tarjeta y la cola no coincidan.
   */
  if (!mereceTitular(fila)) {
    return (
      <div className="rounded-lg bg-bg-1 p-6 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald">
            {t('titularTranquiloLabel')}
          </span>
        </div>
        <h2 className="text-text-1 text-xl font-bold">{t('titularTranquiloTitulo')}</h2>
        <p className="text-text-2 text-sm mt-2 flex-1">{t('titularTranquiloCuerpo')}</p>
      </div>
    );
  }

  /**
   * El rojo se reserva para lo que ya no admite espera: la cita pasó (`TARDE`) o
   * falta menos de una hora (`AHORA`). Un caso que titula por acumular
   * agravantes pero llega recién a la tarde va en ámbar — es el mismo reparto de
   * dos tonos que hace la tarjeta de Vigía.
   */
  const urgente = fila.nivel === 'TARDE' || fila.nivel === 'AHORA';
  /**
   * Las clases van ENTERAS y no interpoladas (`text-${tono}` no existe): Tailwind
   * escanea el fuente como texto y una clase armada en tiempo de ejecución no se
   * emite al CSS. No da error — el elemento se queda sin color.
   */
  const tonoTexto = urgente ? 'text-rose' : 'text-amber';

  const titulo = fila.nivel === 'TARDE'
    ? t('titularTarde', {
        paciente: fila.paciente ?? fila.caseCode,
        atraso: duracion(-fila.minutosHasta),
      })
    : t('titularLlega', {
        paciente: fila.paciente ?? fila.caseCode,
        falta: duracion(fila.minutosHasta),
      });

  /** Por qué es este y no otro: los agravantes, en palabras. */
  const porque = [
    fila.pct === 0 ? t('titularSinEmpezar') : t('titularParcial', { pct: fila.pct }),
    fila.ultimoContacto ? null : t('titularSinContacto'),
    fila.bloqueoEnvio === 'SIN_TUTOR' ? t('intakeBlockGuardian')
      : fila.bloqueoEnvio === 'SIN_TELEFONO_NI_EMAIL' ? t('intakeBlockNoContact')
      : null,
  ].filter(Boolean).join(' · ');

  const motivoBloqueo = fila.bloqueoEnvio === 'SIN_TUTOR'
    ? t('intakeBlockGuardian')
    : fila.bloqueoEnvio === 'SIN_TELEFONO_NI_EMAIL'
      ? t('intakeBlockNoContact')
      : null;

  return (
    <div className={`rounded-lg p-6 h-full flex flex-col ${urgente ? 'bg-rose/[0.07]' : 'bg-amber/[0.07]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className={`w-3.5 h-3.5 ${tonoTexto}`} />
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${tonoTexto}`}>
          {fila.nivel === 'TARDE' ? t('titularLabelTarde') : t('titularLabel')}
        </span>
      </div>

      <h2 className="text-text-1 text-xl font-bold">{titulo}</h2>

      <p className="text-[13px] text-text-muted mt-0.5 tabular-nums">
        {fila.caseCode} · {hora(fila.cita, locale)}
        {fila.provider ? ` · ${fila.provider}` : ''}
      </p>

      <p className="text-text-2 text-sm mt-2 flex-1">
        {porque}
        {'. '}
        {/* La consecuencia, que es lo que convierte el dato en una razón para
            levantar el teléfono. Sin esto la tarjeta informa; con esto, pide. */}
        {t('titularConsecuencia')}
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          type="button"
          disabled={!fila.telefono}
          onClick={() => { if (fila.telefono) twilio.connect(fila.telefono); }}
          title={fila.telefono ? undefined : t('intakeNoPhone')}
          className={`inline-flex items-center justify-center gap-2 h-9 px-5 rounded font-semibold text-sm transition-opacity ${
            fila.telefono
              ? `text-white hover:opacity-90 ${urgente ? 'bg-rose' : 'bg-amber'}`
              : 'bg-transparent border border-border text-text-muted/60 cursor-not-allowed'
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          {t('titularLlamar')}
        </button>

        <Button
          variant="secondary"
          size="sm"
          className="h-9 gap-1.5"
          disabled={!!fila.bloqueoEnvio}
          title={motivoBloqueo ?? undefined}
          onClick={() => setPedir(true)}
        >
          <Send className="w-3.5 h-3.5" />
          {t('titularMandar')}
        </Button>

        {/* Abre el caso EN ESTA pantalla: el modal está montado en `page.tsx` y
            lee el `?case=`. Antes esto era `/patients?case=…` y te sacaba del
            panel, contra el patrón de todo el sistema. */}
        <button
          type="button"
          onClick={() => router.push(`/dashboard?case=${fila.caseId}`)}
          className="text-[12.5px] text-text-2 hover:text-text-1 underline-offset-2 hover:underline"
        >
          {t('titularVerCaso')}
        </button>
      </div>

      <SendPortalDialog
        open={pedir}
        onOpenChange={setPedir}
        caseInfo={caseInfo(fila)}
      />
    </div>
  );
}

/** `20 min`, `1 h 41 min`. Las unidades no se traducen: son iguales en es y en. */
function duracion(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** La hora de la cita, en la zona de la CLÍNICA — igual que en la cola. */
function hora(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}
