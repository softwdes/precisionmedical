'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SaludoCifo, type LineaSaludo } from '@/components/cifo/saludo';

/**
 * Lo que CIFO le dice a RECEPCIÓN al abrir el panel.
 *
 * Acá solo se arman las frases: la entrada, el tipeo y los tiempos viven en
 * `components/cifo/saludo.tsx`, compartidos con el portal del provider.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 *
 * No consulta nada. Los números llegan ya calculados por la página, de las
 * mismas funciones que alimentan lo que está detrás. El saludo no puede
 * contradecir a la pantalla que tapa, porque es el mismo dato.
 */

export interface DatosBienvenida {
  /** Clave del día de la CLÍNICA (`YYYY-MM-DD`). Es la marca de "ya lo vi". */
  hoy: string;
  citasHoy: number;
  sinLlegarTodavia: number;
  sinIntakeFirmado: number;
  liensCerradosSinFirma: number;
  /**
   * El caso que ya no espera, si lo hay. NO silencia el saludo: lo encabeza.
   *
   * La primera versión escondía el saludo entero cuando había un caso TARDE o
   * AHORA. Medido en producción, esa regla lo apagaba SIEMPRE: a media jornada
   * casi siempre hay alguien atrasado, así que la función habría quedado
   * invisible sin que nadie entendiera por qué.
   */
  urgente: { caseId: string; caseCode: string; tarde: boolean } | null;
}

export function CifoBienvenida({ datos }: { datos: DatosBienvenida }): React.ReactElement | null {
  const t = useTranslations('phoenix.dashboard');
  const router = useRouter();

  /**
   * Solo entran las frases que tienen algo que decir: con la cola en cero, la
   * línea de la cola no existe — un "0 pendientes" ocupa el mismo espacio que
   * un dato y no pide nada.
   */
  const lineas: LineaSaludo[] = [{ texto: t('saludoHola') }];

  // Lo que no espera va PRIMERO, antes que el panorama del día. Si alguien ya
  // está atrasado, ese es el titular: el resto de los números pueden esperar
  // quince segundos, esa persona no.
  if (datos.urgente) {
    lineas.push({
      texto: datos.urgente.tarde
        ? t('saludoTarde', { caso: datos.urgente.caseCode })
        : t('saludoAhora', { caso: datos.urgente.caseCode }),
      urgente: true,
      boton: {
        etiqueta: t('saludoVerCaso'),
        ir: () => router.push(`/dashboard?case=${datos.urgente!.caseId}`),
      },
    });
  }

  lineas.push({
    texto: t('saludoCitas', { citas: datos.citasHoy, faltan: datos.sinLlegarTodavia }),
    boton: { etiqueta: t('saludoVerAgenda'), ir: () => router.push('/calendar') },
  });

  if (datos.sinIntakeFirmado > 0) {
    lineas.push({
      texto: t('saludoSinIntake', { n: datos.sinIntakeFirmado }),
      boton: {
        etiqueta: t('saludoVerCola'),
        ir: () => document.getElementById('cola-intake')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      },
    });
  }

  /**
   * Los liens van SIN botón, y es a propósito.
   *
   * No existe ninguna pantalla del back-office que liste "casos cerrados con el
   * lien sin firmar": la firma solo se ve por bufete, adentro de la ficha de
   * cada abogado. El botón apuntaba a `/billing`, donde no hay nada de liens —
   * o sea que decía "Ver facturación" y te dejaba sin forma de encontrarlos.
   * Un botón que no lleva a lo que promete es peor que no tenerlo.
   */
  if (datos.liensCerradosSinFirma > 0) {
    lineas.push({ texto: t('saludoLiens', { n: datos.liensCerradosSinFirma }) });
  }

  lineas.push({ texto: t('saludoCierre') });

  return <SaludoCifo lineas={lineas} hoy={datos.hoy} clave="cifo:saludo-visto" />;
}
