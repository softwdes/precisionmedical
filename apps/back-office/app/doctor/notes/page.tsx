import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { canAuditNotes } from '@/lib/notes-audit-access';
import { ESTADOS_PENDIENTES, type EstadoNota } from '@/lib/notes-audit';
import { NotesData } from './notes-data';
import { NotesSkeleton } from './loading';

/**
 * Supervisión de notas clínicas — `/notes` (F1).
 *
 * Quién administra a los providers ve acá qué escribió cada uno y qué quedó sin
 * cerrar. Ver `docs/plan-notas-clinicas.md`.
 *
 * El alcance se valida ACÁ además de en el middleware: el menú solo esconde y el
 * middleware puede quedar corto ante una ruta nueva, así que la página es su
 * propia puerta. Es la misma disciplina que `/api/admin/doctor-view`.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('phoenix.nav');
  return { title: t('clinicalNotes') };
}

const ESTADOS_VALIDOS: EstadoNota[] = ['none', 'draft', 'signed', 'voided'];

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string; provider?: string; clinica?: string;
    desde?: string; hasta?: string; antiguedad?: string; q?: string; page?: string;
  }>;
}): Promise<React.ReactElement> {
  // A `/doctor`, no a `/dashboard`: quien entra acá vive en el portal y un rol
  // DOCTOR/PROVIDER no tiene back-office — el middleware lo devolvería igual, y
  // un rebote en dos saltos se ve como una pantalla rota.
  if (!(await canAuditNotes())) redirect('/doctor');

  const sp = await searchParams;

  // Los estados viajan como lista separada por comas. Uno inválido se descarta
  // en vez de tumbar la pantalla: un link viejo pegado en un favorito no puede
  // dejar al admin mirando un error.
  const estados = (sp.estado ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is EstadoNota => ESTADOS_VALIDOS.includes(s as EstadoNota));

  const fecha = (v?: string): Date | undefined =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : undefined;

  // `hasta` es INCLUSIVO para quien lo escribe ("hasta el 31") y exclusivo para
  // la consulta, así que se corre un día. Sin esto el último día del rango se
  // pierde entero y nadie entiende por qué.
  const hasta = fecha(sp.hasta);
  if (hasta) hasta.setDate(hasta.getDate() + 1);

  const filtros = {
    estados: estados.length ? estados : ESTADOS_PENDIENTES,
    providerId: sp.provider || undefined,
    clinicId: sp.clinica || undefined,
    desde: fecha(sp.desde),
    hasta,
    minDias: Math.max(0, parseInt(sp.antiguedad ?? '0', 10) || 0),
    q: sp.q || undefined,
    page: Math.max(0, parseInt(sp.page ?? '0', 10) || 0),
  };

  return (
    // La `key` fuerza a Suspense a mostrar el skeleton en CADA cambio de filtro.
    // Sin ella React reusa el árbol y la tabla se queda con los datos viejos,
    // quieta, hasta que llega la consulta nueva — parece que el filtro no tomó.
    <Suspense key={JSON.stringify(filtros)} fallback={<NotesSkeleton />}>
      <NotesData filtros={filtros} />
    </Suspense>
  );
}
