/**
 * Reapertura de la nota firmada — la ventana y quién la puede abrir.
 *
 * Pedido de Devin (2026-09-21): *"Add reopen notes window accessible for up to
 * 48 hours after closing note"*, y sus tres respuestas:
 *
 *   · **48 horas, contadas desde la FIRMA** (no desde la visita ni desde el
 *     checkout).
 *   · La abre **solo el provider que firmó, o un super admin**.
 *   · Al terminar **se vuelve a firmar**, y esa firma escribe la versión
 *     siguiente en `visit_note_versions`.
 *
 * Vive en `lib/` y no en el route porque **un route handler solo puede exportar
 * los verbos HTTP** — exportar una constante desde ahí rompe `next build` y
 * `tsc` no lo ve. Mismo motivo que `visit-note-lock.ts`, que lo aprendió a
 * golpes.
 *
 * Y vive en UN lugar porque la pantalla y el servidor tienen que contestar lo
 * mismo: si el botón se dibuja con una regla y el servidor aplica otra, el
 * provider ve "Reabrir", lo toca y se come un 403 sin entender por qué.
 *
 * ── Por qué la nota reabierta sigue en SIGNED ────────────────────────────────
 *
 * Porque hay 25 lugares que preguntan `status === 'SIGNED'` —Facturación, el
 * HCFA, el seguimiento de Edson, el portal del bufete, la impresión— y
 * devolverla a DRAFT la haría desaparecer de la lista de Facturación en mitad
 * del ciclo de cobro. Erick, 2026-09-21: Finanzas sigue cobrando meses después.
 * Lo que habilita la edición es `reopenedAt`.
 */

/** La ventana de corrección, desde la firma. Decisión de Devin. */
export const VENTANA_REAPERTURA_MS = 48 * 60 * 60 * 1000;

/** Roles que pueden reabrir la nota de otro. */
export const ROLES_REABREN_CUALQUIERA = new Set(['SUPER_ADMIN']);

export type MotivoNoReabrir =
  | 'no-firmada'
  | 'ya-reabierta'
  | 'ventana-vencida'
  | 'no-es-suya';

export interface DatosReapertura {
  status: string;
  signedAt: Date | null;
  signedById: string | null;
  reopenedAt: Date | null;
}

export interface Veredicto {
  puede: boolean;
  motivo: MotivoNoReabrir | null;
  /** Cuándo vence la ventana, para el cartel. `null` si no aplica. */
  venceEn: Date | null;
}

/**
 * ¿Puede `userId` (con rol `rol`) reabrir esta nota, AHORA?
 *
 * El orden de los rechazos no es casual: se contesta primero lo que no depende
 * de quién pregunta ("esta nota no está firmada", "ya está reabierta") y último
 * lo personal ("no es tuya"). Así el mensaje que ve el usuario habla de la nota
 * mientras pueda, y solo se vuelve sobre él cuando de verdad es el motivo.
 */
export function evaluarReapertura(
  nota: DatosReapertura,
  userId: string | null,
  rol: string | null | undefined,
  ahora: Date,
): Veredicto {
  const no = (motivo: MotivoNoReabrir, venceEn: Date | null = null): Veredicto =>
    ({ puede: false, motivo, venceEn });

  if (nota.status !== 'SIGNED' || !nota.signedAt) return no('no-firmada');
  if (nota.reopenedAt) return no('ya-reabierta');

  const vence = new Date(nota.signedAt.getTime() + VENTANA_REAPERTURA_MS);
  if (ahora.getTime() > vence.getTime()) return no('ventana-vencida', vence);

  /**
   * El super admin entra siempre (dentro de la ventana): es el que arregla lo
   * que nadie más puede, y sin él una nota firmada por alguien que ya no está en
   * la clínica sería incorregible para siempre.
   */
  const esSuper = !!rol && ROLES_REABREN_CUALQUIERA.has(rol);
  if (esSuper) return { puede: true, motivo: null, venceEn: vence };

  /**
   * `signedById` puede ser null en las notas migradas del v2. Ahí no hay a quién
   * reconocer como dueño, así que solo queda el super admin — preferible a
   * dejar que cualquiera reabra una firma que no sabemos de quién es.
   */
  if (!userId || !nota.signedById || nota.signedById !== userId) {
    return no('no-es-suya', vence);
  }

  return { puede: true, motivo: null, venceEn: vence };
}
