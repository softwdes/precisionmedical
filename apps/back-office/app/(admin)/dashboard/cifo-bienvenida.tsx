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
  /**
   * Los de hoy a los que hay que cobrarles antes de atenderlos.
   *
   * Ya viene filtrado y ordenado por `lib/deudas-del-dia.ts`, que es donde está
   * escrito por qué el saldo se mira por el circuito del MOSTRADOR y no por
   * `balanceDue` — con `balanceDue` esto le saltaría a casi todos.
   */
  cobrar: Array<{
    patientId: string;
    nombre: string;
    monto: number;
    marcado: boolean;
    nota: string | null;
  }>;
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

  /**
   * A quién cobrarle antes de atenderlo, justo debajo del panorama del día.
   *
   * Va con NOMBRE, y es la primera vez que este saludo nombra a un paciente.
   * Es deliberado: sin el nombre la línea no sirve para nada —"1 paciente con
   * saldo" no le dice a quién parar en el mostrador— y recepción ve nombres
   * todo el día en la pantalla que está debajo. La regla de no mandar nombres
   * es del AGENTE, que le habla a un modelo; esto se calcula en el servidor y
   * no sale de la clínica.
   *
   * Hasta tres: es el aviso, no la lista. La cola de cobranzas es la pantalla.
   */
  for (const c of datos.cobrar.slice(0, 3)) {
    lineas.push({
      texto: c.nota
        // Si alguien se tomó el trabajo de escribir por qué, eso es lo que hay
        // que leer. El monto sin contexto no dice si se le cobra o se lo frena.
        ? t('saludoCobrarNota', { paciente: c.nombre, nota: c.nota })
        : t('saludoCobrar', { paciente: c.nombre, monto: c.monto.toFixed(2) }),
      urgente: true,
      boton: {
        etiqueta: t('saludoVerFicha'),
        ir: () => router.push(`/patients/${c.patientId}`),
      },
    });
  }

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
