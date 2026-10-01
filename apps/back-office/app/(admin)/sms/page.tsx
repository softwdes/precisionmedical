import { SmsPageClient } from './sms-client';

/**
 * La sección SMS del menú.
 *
 * Es una PÁGINA de verdad y no un diálogo sobre Pacientes, que era el atajo que
 * tenía antes (Erick, 2026-10-01). La diferencia la nota quien la usa: la URL es
 * suya, el menú la marca como activa, el botón «atrás» hace lo que se espera y
 * se puede compartir el link.
 *
 * El contenido es el MISMO componente que monta el diálogo de Pacientes —
 * `SmsHistoryPanel`— así que no hay dos pantallas que se puedan desincronizar.
 */
export default function SmsPage() {
  return <SmsPageClient />;
}
