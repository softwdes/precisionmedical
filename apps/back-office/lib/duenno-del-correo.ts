/**
 * De quién es un correo que ya está tomado en `lawyers`.
 *
 * ── Por qué hace falta ──────────────────────────────────────────────────────
 *
 * `lawyers.email` es **único en toda la tabla**: bufetes y personas comparten
 * el mismo índice. Y no se puede relajar — el portal legal identifica al
 * abogado que inicia sesión por su correo (ver `lib/get-session-lawyer.ts`:
 * *"email es la única llave común"*). Si un bufete y una persona lo
 * compartieran, el portal no sabría quién entró.
 *
 * O sea que rechazar el duplicado es correcto. Lo que fallaba era contarlo: el
 * cartel decía "alguien con ese correo ya existe", y ese "alguien" es casi
 * siempre el BUFETE de la propia persona — en un bufete de un solo abogado, su
 * correo personal ES el de la oficina.
 *
 * Erick perdió un rato con eso el 2026-10-06 tratando de completar a Brian
 * Hills con el correo de Brian Hills Law, y terminó dudando de si la pantalla
 * editaba o creaba de nuevo. Editaba bien; el cartel no decía lo suficiente.
 *
 * ── Por qué vive acá y no en cada ruta ──────────────────────────────────────
 *
 * Son CINCO lugares los que pueden rechazar por correo repetido: el alta y la
 * edición del catálogo, el alta y la edición de miembros, y las dos altas
 * rápidas. Todos mandan el mismo `DUPLICATE_EMAIL` al mismo mensaje de i18n,
 * así que o lo arman igual o el cartel sale distinto según por dónde entraste.
 */
export function duennoDelCorreo(l: {
  entityType?: string | null;
  firmName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (l.entityType === 'FIRM') return l.firmName ?? '—';
  const persona = `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim();
  return persona || l.firmName || '—';
}
