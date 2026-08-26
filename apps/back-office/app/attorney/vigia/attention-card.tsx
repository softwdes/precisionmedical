import { getTranslations } from 'next-intl/server';
import { Sparkles } from 'lucide-react';
import { AttentionActions } from './attention-actions';
import type { FilaAtencion } from '@/lib/vigia/queue';

/**
 * Portal Legal · Vigía · la tarjeta proactiva.
 *
 * Es el caso más urgente de la cola, promovido arriba de todo con su motivo
 * explicado y UN botón. No agrega datos: es la primera fila de
 * `colaDeAtencion()`, con más aire.
 *
 * Existe porque es la diferencia entre un tablero y un vigía. Un tablero espera
 * que vayas a mirarlo; esto te dice qué hacer hoy antes de que preguntes — que
 * es exactamente lo que vende la competencia.
 *
 * Se muestra SOLO si el primero de la cola pesa de verdad. Promover cualquier
 * cosa a titular hace que el titular deje de significar algo: si grita todos los
 * días, nadie lo mira. Con la cola vacía —o floja— no aparece nada, que es la
 * respuesta correcta a un día sin nada urgente.
 */

/** Debajo de esto no hay titular: la cola de abajo alcanza. */
const UMBRAL = 60;

export async function AttentionCard({ fila }: { fila: FilaAtencion | null }): Promise<React.ReactElement | null> {
  if (!fila || fila.prioridad < UMBRAL) return null;

  const t = await getTranslations('phoenix.attorney');
  // Lo que hace grave a una fila es que además le falte la firma: el caso está
  // parado Y sin asegurar.
  const urgente = fila.agravantes.includes('LIEN_SIN_FIRMA');

  return (
    <div className={`rounded-lg p-6 text-center ${urgente ? 'bg-rose/[0.07]' : 'bg-amber/[0.07]'}`}>
      <div className="flex items-center justify-center gap-2 mb-2">
        <Sparkles className={`w-3.5 h-3.5 ${urgente ? 'text-rose' : 'text-amber'}`} />
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${urgente ? 'text-rose' : 'text-amber'}`}>
          {t(urgente ? 'vigiaHeroLabelUrgent' : 'vigiaHeroLabel')}
        </span>
      </div>

      <h2 className="text-text-1 text-xl font-bold">
        {t(urgente ? 'vigiaHeroTitleUrgent' : 'vigiaHeroTitle', { caso: fila.caseCode })}
      </h2>

      <p className="text-text-2 text-sm mt-2 max-w-2xl mx-auto">
        {t(`vigiaHeroWhy_${fila.motivo}`, { dias: fila.diasSinCita ?? fila.diasAbierto })}
        {urgente && ` ${t('vigiaHeroWhyUnsigned')}`}
      </p>

      {/* Dos salidas: ver el caso, o pedirle a la clínica lo que falta. El
          texto del pedido nace armado con el motivo — el abogado no tiene que
          escribir de cero lo que Vigía ya sabe. */}
      <AttentionActions
        caso={fila.caseCode}
        href={`/attorney/vigia?case=${fila.caseId}`}
        urgente={urgente}
        asunto={t(`vigiaReqSubject_${fila.motivo}`, { caso: fila.caseCode })}
        cuerpo={t(`vigiaReqBody_${fila.motivo}`, {
          caso: fila.caseCode,
          dias: fila.diasSinCita ?? fila.diasAbierto,
        })}
      />
    </div>
  );
}
