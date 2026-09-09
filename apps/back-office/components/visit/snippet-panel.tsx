'use client';

/**
 * SnippetPanel — la columna "Available Snippets" de Medusa, DENTRO del
 * recuadro del editor de cada sección de la nota, a la izquierda del texto
 * (va como `sidePanel` del RichTextEditor).
 *
 * Es la forma que los doctores ya conocen (Erick, 2026-09-05: "igual a Medusa,
 * están acostumbrados"). El clic AGREGA en el cursor, nunca reemplaza, y la
 * lista se queda para poder apilar varios — así se arma un HPI allá.
 *
 * Trae SUS snippets por API al montarse (no al cargar la nota entera de golpe)
 * y los deja en caché por un minuto. Favoritos primero, después los más usados.
 * La cara es `InsertList` (ui-phoenix), la misma que usa la mensajería.
 */

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { InsertList } from '@/components/ui-phoenix';
import type { SnippetSection } from '@/lib/snippet-sections';

export interface SnippetItem {
  id: string;
  title: string;
  description: string | null;
  content: string;
  isFavorite: boolean;
  usageCount: number;
}

/**
 * Caché por sección, compartida por todos los editores de la pestaña. Un
 * minuto: lo que dura una consulta abriendo y cerrando la misma sección. Se
 * invalida al crear uno desde Configuración porque esa es otra pantalla.
 */
const cache = new Map<SnippetSection, { at: number; items: SnippetItem[] }>();
const CACHE_MS = 60_000;

async function loadSnippets(section: SnippetSection): Promise<SnippetItem[]> {
  const hit = cache.get(section);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
  const res = await fetch(`/api/admin/snippets?section=${section}`);
  if (!res.ok) throw new Error(String(res.status));
  const d = await res.json() as { snippets: Array<SnippetItem & { isActive: boolean }> };
  const items = d.snippets
    .filter((s) => s.isActive)
    .map((s) => ({
      id: s.id, title: s.title, description: s.description, content: s.content,
      isFavorite: s.isFavorite, usageCount: s.usageCount,
    }))
    // Favoritos primero, después los más usados, después alfabético. InsertList
    // vuelve a poner los favoritos adelante pero respeta este orden entre pares.
    .sort((a, b) =>
      (Number(b.isFavorite) - Number(a.isFavorite))
      || (b.usageCount - a.usageCount)
      || a.title.localeCompare(b.title));
  cache.set(section, { at: Date.now(), items });
  return items;
}

interface Props {
  section: SnippetSection;
  onPick: (snippet: SnippetItem) => void;
  /** Adónde ir a crear uno. null si esta pantalla no tiene acceso al catálogo. */
  settingsHref: string | null;
  /** Alto máximo. Sin valor, se estira con el editor. */
  maxHeight?: number;
  /** Dentro del recuadro del editor (`sidePanel`): sin marco propio. */
  bare?: boolean;
}

export function SnippetPanel({ section, onPick, settingsHref, maxHeight, bare = false }: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const [items, setItems] = React.useState<SnippetItem[] | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    setItems(null); setError(false);
    loadSnippets(section)
      .then((list) => { if (vivo) setItems(list); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [section]);

  /**
   * Sin `preview`: la nota NO le pasa el contenido a la lista.
   *
   * El globo al pasar el mouse molesta al provider mientras recorre los
   * snippets buscando cuál insertar (Erick, 2026-09-09), y acá la lista vive
   * pegada al editor, así que la tarjeta le tapa justo el texto que está
   * escribiendo. No alcanzaba con apagarla por bandera: si el dato no se manda,
   * no hay forma de que reaparezca por un prop mal pasado.
   *
   * El contenido se sigue viendo donde corresponde: el catálogo de
   * Configuración → Snippets, que es la pantalla hecha para eso.
   */
  const listItems = React.useMemo(
    () => items?.map((s) => ({ ...s, hint: s.description ?? t('snpPanelHint'), favorite: s.isFavorite })) ?? null,
    [items, t],
  );

  return (
    <InsertList
      items={listItems}
      onPick={onPick}
      header={t('snpPanelHeader')}
      searchPlaceholder={t('snpPanelSearch')}
      noResults={t('snpNoResults')}
      loadingLabel={t('snpPanelLoading')}
      errorLabel={t('snpPanelError')}
      error={error}
      maxHeight={maxHeight}
      bare={bare}
      // Cierra la otra puerta del mismo estorbo: sin esto, al no haber tarjeta
      // el ítem cae al `title` nativo y el navegador dibuja SU globo al pasar el
      // mouse. La descripción se sigue pudiendo buscar (va en `hint`).
      sinPreview
      empty={
        <>
          <div>{t('snpPanelEmpty')}</div>
          {settingsHref && (
            <Link href={settingsHref} className="text-violet-text font-semibold hover:underline inline-flex items-center gap-1">
              {t('snpPanelCreate')} <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </>
      }
    />
  );
}
