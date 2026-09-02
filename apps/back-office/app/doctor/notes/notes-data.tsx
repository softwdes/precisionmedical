import { db } from '@precision-medical/database';
import { getNotesSummary, type AlcanceResumen } from '@/lib/notes-summary';
import { NotesClient } from './notes-client';

/**
 * Supervisión de notas · carga de datos.
 *
 * La pantalla es UNA sola lista: los providers. El detalle de cada uno —sus
 * visitas y la nota— vive en un modal que se pide por API al abrirlo
 * (`/api/admin/notes/provider/[id]`), no acá: se abre SOBRE la pantalla, sin
 * navegar, y traer las visitas de los once providers por adelantado sería pedir
 * cientos de filas para mostrar diez.
 *
 * Antes esta función traía además la lista paginada de TODAS las visitas, que
 * era la segunda tabla de la pantalla. Esa tabla se retiró: no era el pedido
 * (Erick, 2-sep-2026) y sus filtros, colgando entre las dos, se leían como si
 * filtraran el resumen.
 */

export async function NotesData({ alcance }: { alcance: AlcanceResumen }): Promise<React.ReactElement> {
  const [resumen, clinics] = await Promise.all([
    getNotesSummary(alcance),
    db.clinic.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return <NotesClient resumen={resumen} clinics={clinics} />;
}
