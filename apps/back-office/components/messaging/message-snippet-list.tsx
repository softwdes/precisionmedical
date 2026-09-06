'use client';

/**
 * La columna de plantillas de la mensajería — los "Send Message Snippets" de
 * Medusa, a la izquierda del editor, al redactar Y al responder.
 *
 * Son los snippets de las categorías MENSAJE_* del catálogo de Configuración:
 * un solo lugar, favoritos por persona, "solo admin borra". Dos grupos: los de
 * los providers y los de la clínica. Cuál se ofrece lo decide la API según
 * dónde está quien escribe (portal / back-office) y su rol — un admin ve los
 * dos, con su encabezado.
 *
 * Acá vive lo que comparten el compose y el hilo: la carga con caché, el orden
 * (favoritos, después los más usados), la resolución del nombre del paciente y
 * el contador de uso. La cara es `InsertList` (ui-phoenix), la misma que la nota.
 */

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { InsertList } from '@/components/ui-phoenix';
import {
  messageContextFor, ownMessageSection, type MessageContext, type SnippetMessageSection,
} from '@/lib/snippet-sections';
import { resolveMergeFields, type SnippetMergeData } from '@/lib/snippet-merge';

export interface MessageSnippet {
  id: string;
  sectionKey: SnippetMessageSection;
  title: string;
  body: string;
  description: string | null;
  isFavorite: boolean;
  usageCount: number;
}

/** Preferencia local: ver o no la columna junto al editor (compose e hilo). */
export const MESSAGE_SNIPPETS_PREF = 'pm.mensajes.plantillas';

/**
 * [visible, alternar] — se recuerda en este navegador. Arranca CERRADA la
 * primera vez (Erick 2026-09-06): la lista se abre con el clic en "Plantillas"
 * y queda abierta para quien la usa.
 */
export function useMessageSnippetsVisible(): [boolean, () => void] {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    try { if (window.localStorage.getItem(MESSAGE_SNIPPETS_PREF) === '1') setVisible(true); } catch { /* sin storage */ }
  }, []);
  const toggle = React.useCallback((): void => {
    setVisible((v) => {
      try { window.localStorage.setItem(MESSAGE_SNIPPETS_PREF, v ? '0' : '1'); } catch { /* sin storage */ }
      return !v;
    });
  }, []);
  return [visible, toggle];
}

/**
 * Dónde está quien escribe y en qué grupo guarda lo suyo. El compose y el hilo
 * lo usan para "Guardar como plantilla".
 */
export function useMessageContext(): { context: MessageContext; ownSection: SnippetMessageSection } {
  const pathname = usePathname();
  const context = messageContextFor(pathname);
  return { context, ownSection: ownMessageSection(context) };
}

const cache = new Map<MessageContext, { at: number; items: MessageSnippet[] }>();
const CACHE_MS = 60_000;

/** Para después de "Guardar como plantilla": la próxima lista vuelve a pedir. */
export function invalidateMessageSnippets(): void { cache.clear(); }

async function loadMessageSnippets(context: MessageContext): Promise<MessageSnippet[]> {
  const hit = cache.get(context);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
  const res = await fetch(`/api/admin/snippets?messageContext=${context}`);
  if (!res.ok) throw new Error(String(res.status));
  const d = (await res.json()) as { snippets: Array<{
    id: string; sectionKey: SnippetMessageSection; title: string; content: string; description: string | null;
    isFavorite: boolean; usageCount: number; isActive: boolean;
  }> };
  const items = d.snippets
    .filter((s) => s.isActive)
    .map((s) => ({ id: s.id, sectionKey: s.sectionKey, title: s.title, body: s.content, description: s.description, isFavorite: s.isFavorite, usageCount: s.usageCount }))
    // Favoritos primero, después los más usados (Medusa: "My Favorites" y "Most Used").
    .sort((a, b) => (Number(b.isFavorite) - Number(a.isFavorite)) || (b.usageCount - a.usageCount) || a.title.localeCompare(b.title));
  cache.set(context, { at: Date.now(), items });
  return items;
}

interface Props {
  /** Recibe el HTML ya resuelto, listo para insertar en el cursor. */
  onInsert: (html: string) => void;
  /** "APELLIDO, Nombre" del paciente del mensaje, si lo hay. Resuelve `[Patient Name]`. */
  patientName: string | null;
  /** Cambiarlo fuerza recargar (después de guardar una plantilla nueva). */
  refreshKey?: number;
  disabled?: boolean;
  maxHeight?: number;
  /** Dentro del recuadro del editor (`sidePanel`): sin marco propio. */
  bare?: boolean;
}

export function MessageSnippetList({ onInsert, patientName, refreshKey = 0, disabled = false, maxHeight, bare = false }: Props): React.ReactElement {
  const t = useTranslations('phoenix.messaging');
  const tSec = useTranslations('phoenix.doctor');
  const { context } = useMessageContext();
  const [items, setItems] = React.useState<MessageSnippet[] | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    setItems(null); setError(false);
    loadMessageSnippets(context)
      .then((list) => { if (vivo) setItems(list); })
      .catch(() => { if (vivo) { setItems([]); setError(true); } });
    return () => { vivo = false; };
  }, [context, refreshKey]);

  const pick = (id: string): void => {
    const s = items?.find((x) => x.id === id);
    if (!s || disabled) return;
    // El mensaje sabe del paciente solo el nombre; el resto de los campos
    // queda entre corchetes para que quien escribe vea que falta completarlo.
    const data: SnippetMergeData = {
      'patient.name': patientName, 'patient.age': null, 'patient.dob': null,
      'patient.sex': null, 'patient.phone': null, 'patient.insurance': null,
    };
    onInsert(resolveMergeFields(s.body, data));
    void fetch(`/api/admin/snippets/${s.id}/use`, { method: 'POST' }).catch(() => {});
  };

  // El encabezado de grupo solo cuando hay más de uno (un admin): a quien ve
  // un solo grupo, el rótulo no le dice nada.
  const multi = new Set(items?.map((s) => s.sectionKey)).size > 1;
  const listItems = items?.map((s) => ({
    id: s.id, title: s.title, hint: s.description, favorite: s.isFavorite,
    group: multi ? tSec(`sec_${s.sectionKey}`) : undefined,
  })) ?? null;

  return (
    <InsertList
      items={listItems}
      onPick={(it) => pick(it.id)}
      header={t('tplButton')}
      searchPlaceholder={t('tplSearchPlaceholder')}
      empty={t('tplEmpty')}
      noResults={t('tplEmpty')}
      loadingLabel="…"
      errorLabel={t('tplEmpty')}
      error={error}
      maxHeight={maxHeight}
      bare={bare}
    />
  );
}
