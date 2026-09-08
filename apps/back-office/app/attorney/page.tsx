import { redirect } from 'next/navigation';
import { getSessionLawyer, canViewAsLawyer } from '@/lib/get-session-lawyer';
import { getSessionUser } from '@/lib/session';
import { canSeeVigia } from '@/lib/attorney-portal';

/**
 * Portal Legal · `/attorney`
 *
 * El Panel se retiró el 2026-09-08 (Erick): mostraba números —casos activos,
 * firmas pendientes— y Vigía ya dice qué hacer hoy con esos mismos datos. Dos
 * pantallas de inicio confundían. La raíz del portal manda a Vigía; el reporte
 * PDF que vivía en el Panel pasó a la cabecera de Casos, y los accesos rápidos
 * (Usuarios, invitar) ya tienen su menú.
 *
 * El middleware sigue mandando a `/attorney` cuando un abogado pide otra cosa,
 * así que esta ruta tiene que existir aunque no dibuje nada.
 */
export default async function AttorneyRootPage(): Promise<never> {
  const [lawyer, user] = await Promise.all([getSessionLawyer(), getSessionUser()]);
  const isAdminViewer = user?.email ? await canViewAsLawyer(user.email) : false;
  // Si por alguna bandera Vigía no se ve, Casos es la pantalla que siempre existe.
  redirect(lawyer && canSeeVigia(lawyer, isAdminViewer) ? '/attorney/vigia' : '/attorney/cases');
}
