import type { Audience } from './audience';

/**
 * Handoff entre el bundle viejo y el nuevo.
 *
 * El modal de "que cambio" NO se muestra antes de recargar: el click en
 * Actualizar borra SW + caches y hace `location.replace()`, asi que cualquier
 * cosa en pantalla se destruye a medio camino. Y el usuario que aprieta
 * Actualizar quiere actualizarse, no leer.
 *
 * Entonces el bundle viejo deja una nota en localStorage con el SHA desde el
 * cual hay que contar, y el bundle nuevo la levanta al montar, pide el
 * changelog, muestra el modal y limpia la marca.
 */

const PENDING_KEY = 'pm:pending-release-notes';

export interface PendingNotes {
  /** SHA de arranque. Se sigue mandando, pero es el ancla de RESERVA. */
  since: string;
  audience: Audience;
  /** Hora del server al arrancar la pestaña — el ancla buena. */
  bootAt?: string;
}

export function stashPendingNotes(pending: PendingNotes): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Safari en modo privado tira en setItem. El reload igual tiene que pasar:
    // perder el changelog es aceptable, quedarse en el bundle viejo no.
  }
}

export function readPendingNotes(): PendingNotes | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<PendingNotes>;
    if (typeof parsed.since !== 'string' || typeof parsed.audience !== 'string') {
      return null;
    }
    return {
      since: parsed.since,
      audience: parsed.audience as Audience,
      bootAt: typeof parsed.bootAt === 'string' ? parsed.bootAt : undefined,
    };
  } catch {
    return null;
  }
}

export function clearPendingNotes(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* noop */
  }
}
