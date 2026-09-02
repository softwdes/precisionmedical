'use client';

/**
 * ReleaseTimeline — las notas de release en orden cronologico, agrupadas por dia.
 *
 * Reemplaza al acordeon por modulo, que fue un error de diseño: hacia del modulo
 * el CONTENEDOR y con eso tiraba el eje que de verdad importa en un changelog,
 * que es el tiempo. El orden salia alfabetico —"Accesos" (1 cambio de hace dos
 * semanas) arriba de "Citas" (12, algunos de hoy)— y lo mas nuevo quedaba
 * enterrado en el grupo doce. Encima obligaba a 16 clics para leer una linea:
 * cambiaba "demasiado scroll" por "cero contenido", que es peor negocio, porque
 * scrollear es mucho mas barato que clickear.
 *
 * Aca el modulo es una ETIQUETA, no una jaula. Lo mas nuevo arriba, se lee hasta
 * donde uno quiera y se para.
 *
 * Los dias son chicos solos: medido el 2026-09-01, la audiencia doctor tenia 9
 * cambios hoy, 2 ayer, 1 anteayer. No hace falta plegar nada.
 */

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { Sparkles, Wrench } from 'lucide-react';
import type { ReleaseNote } from '@precision/release/types';
import { claveDia } from '@/lib/fechas';

export interface ReleaseTimelineProps {
  notes: ReleaseNote[];
  /** "Hoy" / "Ayer" ya traducidos — este componente no decide idioma. */
  labels: { today: string; yesterday: string };
  className?: string;
}

/** Encabezado del dia: "Hoy", "Ayer", o la fecha escrita. */
function tituloDia(clave: string, hoy: string, ayer: string, labels: { today: string; yesterday: string }, locale: string): string {
  if (clave === hoy) return labels.today;
  if (clave === ayer) return labels.yesterday;
  // `clave` es YYYY-MM-DD en zona clinica. Se lee como fecha de calendario —sin
  // zona— porque ya viene resuelta: agregarle una la correria un dia.
  const [y, m, d] = clave.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export function ReleaseTimeline({
  notes,
  labels,
  className = 'px-4 py-2 space-y-4',
}: ReleaseTimelineProps): React.ReactElement {
  const locale = useLocale();

  const dias = useMemo(() => {
    const hoy = claveDia(new Date());
    const ayer = claveDia(new Date(Date.now() - 24 * 60 * 60 * 1000));

    // Un Map conserva el orden de insercion, y las notas ya vienen de la mas
    // nueva a la mas vieja: los dias salen ordenados solos.
    const porDia = new Map<string, ReleaseNote[]>();
    for (const nota of notes) {
      const clave = claveDia(nota.date);
      const bucket = porDia.get(clave) ?? [];
      bucket.push(nota);
      porDia.set(clave, bucket);
    }

    return [...porDia.entries()].map(([clave, notas]) => ({
      clave,
      titulo: tituloDia(clave, hoy, ayer, labels, locale),
      nuevas: notas.filter((n) => n.isNew).length,
      notas,
    }));
  }, [notes, labels, locale]);

  return (
    <div className={className}>
      {dias.map((dia) => (
        <div key={dia.clave} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
              {dia.titulo}
            </p>
            {dia.nuevas > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose text-white tabular-nums">
                {dia.nuevas}
              </span>
            )}
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            {dia.notas.map((nota) => (
              <div key={nota.id} className="flex items-start gap-2">
                {nota.kind === 'FEAT' ? (
                  <Sparkles className="w-3 h-3 text-brand shrink-0 mt-1" aria-hidden="true" />
                ) : (
                  <Wrench className="w-3 h-3 text-violet shrink-0 mt-1" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  {/* El modulo arriba y chico: ubica sin robarle la linea al texto,
                      que es lo que la persona vino a leer. */}
                  <p className="text-[9.5px] uppercase tracking-wider text-text-muted leading-none mb-0.5">
                    {nota.moduleLabel}
                  </p>
                  <p
                    className={`text-[12.5px] leading-relaxed ${
                      nota.isNew ? 'text-text-1 font-semibold' : 'text-text-2'
                    }`}
                  >
                    {nota.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

