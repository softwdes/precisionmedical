import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { canAuditNotes } from '@/lib/notes-audit-access';
import { NotesData } from './notes-data';
import { NotesSkeleton } from './loading';

/**
 * Supervisión de notas clínicas — `/doctor/notes`.
 *
 * Vive en el PORTAL MÉDICO porque quien la usa es un médico administrador: el
 * que supervisa a los providers y no entra al back-office. Ver
 * `docs/plan-notas-clinicas.md`.
 *
 * El alcance se valida ACÁ además de en el middleware: los roles del portal
 * salen por su propia rama del middleware antes de que se resuelvan sus
 * módulos, así que esta página es su propia puerta.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.nav');
  return { title: t('clinicalNotes') };
}

export default async function NotesPage({
  searchParams,
}: {
  /**
   * Solo lo que cambia los AGREGADOS viaja al server: la clínica y el rango de
   * fechas. El estado y la búsqueda por nombre filtran la lista de providers en
   * el cliente — son once filas ya cargadas, y hacerles dar la vuelta al server
   * sería un parpadeo por tecla a cambio de nada.
   */
  searchParams: Promise<{ clinica?: string; desde?: string; hasta?: string }>;
}): Promise<React.ReactElement> {
  // A `/doctor`, no a `/dashboard`: un rol del portal no tiene back-office y el
  // rebote en dos saltos se ve como una pantalla rota.
  if (!(await canAuditNotes())) redirect('/doctor');

  const sp = await searchParams;

  const fecha = (v?: string): Date | undefined =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : undefined;

  // `hasta` es INCLUSIVO para quien lo escribe ("hasta el 31") y exclusivo para
  // la consulta, así que se corre un día. Sin esto se pierde el último día entero.
  const hasta = fecha(sp.hasta);
  if (hasta) hasta.setDate(hasta.getDate() + 1);

  const alcance = { clinicId: sp.clinica || undefined, desde: fecha(sp.desde), hasta };

  return (
    // La `key` fuerza el skeleton en CADA cambio de alcance. Sin ella React
    // reusa el árbol y la tabla se queda con los números viejos, quieta, hasta
    // que llega la consulta nueva — parece que el filtro no tomó.
    <Suspense key={JSON.stringify(alcance)} fallback={<NotesSkeleton />}>
      <NotesData alcance={alcance} />
    </Suspense>
  );
}
