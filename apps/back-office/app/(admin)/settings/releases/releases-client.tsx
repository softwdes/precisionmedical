'use client';

/**
 * Cola de curación de las notas de release.
 *
 * El script del build parsea el `git log` y deja TODO en DRAFT; nada llega al
 * banner "Actualizar" hasta que se publica desde acá. El gate es a propósito:
 * hay commits que no se publican —los de seguridad le regalan el mapa a quien
 * lea el banner— y hay tres commits de `tracking` que se leen mejor como una
 * sola línea.
 *
 * Publicar exige el inglés escrito en cada entrada visible: el idioma sale de la
 * cookie `locale`, y si el usuario está en EN tiene que ver todo en EN.
 *
 * Se carga por fetch en el cliente, sin `initialData`: con el staleTime global de
 * 60 s, pasar initialData sin condicionar congela la lista.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Check, EyeOff, Loader2, PackageCheck, Rocket, Undo2, Wrench,
} from 'lucide-react';
import { AUDIENCES, type Audience } from '@precision/release/audience';
import { MODULE_LABELS } from '@precision/release/modules';
import { EmptyState, Section } from '@/components/ui-phoenix';

interface Entry {
  id: string;
  kind: 'FEAT' | 'FIX';
  module: string;
  audiences: Audience[];
  textEs: string;
  textEn: string | null;
  hidden: boolean;
  needsReview: boolean;
  commitSha: string;
  commitScope: string | null;
}

interface Release {
  id: string;
  app: string;
  sha: string;
  status: 'DRAFT' | 'PUBLISHED';
  deployedAt: string;
  publishedByName: string | null;
  missingEnglish: number;
  entries: Entry[];
}

interface EntryPatch {
  textEs?: string;
  textEn?: string | null;
  module?: string;
  audiences?: Audience[];
  hidden?: boolean;
}

const MODULE_KEYS = Object.keys(MODULE_LABELS);

export function ReleasesClient(): React.ReactElement {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/releases', { cache: 'no-store' });
      if (!res.ok) {
        setError(
          res.status === 403
            ? 'Sólo un admin puede curar notas de release.'
            : 'No se pudo cargar la lista.',
        );
        return;
      }
      const data = (await res.json()) as { releases: Release[] };
      setReleases(data.releases);
      setError(null);
    } catch {
      setError('No se pudo cargar la lista.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEntry(entryId: string, patch: EntryPatch): Promise<void> {
    setBusy(entryId);
    try {
      const res = await fetch('/api/admin/releases/entries/' + entryId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(
          body.error === 'ALREADY_PUBLISHED'
            ? 'Ese release ya está publicado: despublicalo antes de editarlo.'
            : 'No se pudo guardar.',
        );
        return;
      }
      setError(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function togglePublish(release: Release): Promise<void> {
    const publishing = release.status !== 'PUBLISHED';
    setBusy(release.id);
    try {
      const res = await fetch('/api/admin/releases/' + release.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: publishing ? 'publish' : 'unpublish' }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string; missing?: unknown[] };
        setError(
          body.error === 'MISSING_ENGLISH'
            ? 'Faltan ' + String(body.missing?.length ?? 0) + ' traducciones al inglés.'
            : body.error === 'NOTHING_TO_PUBLISH'
              ? 'Este release no tiene ninguna entrada visible para publicar.'
              : 'No se pudo publicar.',
        );
        return;
      }
      setError(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (releases === null && error === null) {
    return (
      <div className="flex items-center gap-2 px-4 sm:px-6 py-8 text-[12px] text-text-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Cargando releases…
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 space-y-3">
      {error !== null && (
        <div className="flex items-center gap-2 rounded-lg bg-rose/10 px-3 py-2 text-[12px] text-rose">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {releases !== null && releases.length === 0 && (
        <EmptyState.Rich
          icon={PackageCheck}
          title="Todavía no hay releases"
          subtitle="El script del build crea uno en cada deploy. El primero de cada app es sólo la línea base, sin notas."
        />
      )}

      {releases?.map((release) => {
        const visible = release.entries.filter((entry) => !entry.hidden);
        const review = release.entries.filter((entry) => entry.needsReview).length;
        const published = release.status === 'PUBLISHED';
        const blocked = release.missingEnglish > 0 || visible.length === 0;

        return (
          <Section
            key={release.id}
            icon={published ? Rocket : Wrench}
            tone={published ? 'emerald' : 'amber'}
            title={release.app + ' · ' + release.sha.slice(0, 8)}
            count={visible.length}
            collapsible
            defaultOpen={!published}
            action={
              <div className="flex items-center gap-2">
                {review > 0 && (
                  <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber">
                    {review} para revisar
                  </span>
                )}
                {release.missingEnglish > 0 && (
                  <span className="rounded-full bg-rose/15 px-2 py-0.5 text-[10px] font-semibold text-rose">
                    faltan {release.missingEnglish} en inglés
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void togglePublish(release)}
                  disabled={busy === release.id || (!published && blocked)}
                  title={
                    !published && release.missingEnglish > 0
                      ? 'Escribí el inglés de todas las entradas visibles'
                      : !published && visible.length === 0
                        ? 'No hay ninguna entrada visible para publicar'
                        : undefined
                  }
                  className={
                    'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ' +
                    (published
                      ? 'bg-white/5 text-text-2 hover:text-text-1'
                      : 'bg-gradient-brand text-white shadow-glow')
                  }
                >
                  {busy === release.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : published ? (
                    <Undo2 className="w-3 h-3" />
                  ) : (
                    <Rocket className="w-3 h-3" />
                  )}
                  {published ? 'Despublicar' : 'Publicar'}
                </button>
              </div>
            }
          >
            <div className="space-y-2">
              <p className="text-[11px] text-text-3">
                {new Date(release.deployedAt).toLocaleString()}
                {published && release.publishedByName !== null
                  ? ' · publicado por ' + release.publishedByName
                  : ''}
              </p>

              {release.entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  busy={busy === entry.id}
                  readOnly={published}
                  onSave={(patch) => void saveEntry(entry.id, patch)}
                />
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function EntryRow({
  entry,
  busy,
  readOnly,
  onSave,
}: {
  entry: Entry;
  busy: boolean;
  readOnly: boolean;
  onSave: (patch: EntryPatch) => void;
}): React.ReactElement {
  const [textEs, setTextEs] = useState(entry.textEs);
  const [textEn, setTextEn] = useState(entry.textEn ?? '');
  const [module, setModule] = useState(entry.module);
  const [audiences, setAudiences] = useState<Audience[]>(entry.audiences);

  const dirty =
    textEs !== entry.textEs ||
    textEn !== (entry.textEn ?? '') ||
    module !== entry.module ||
    audiences.join() !== entry.audiences.join();

  const missingEnglish = textEn.trim() === '' && !entry.hidden;

  return (
    <div
      className={
        'rounded-lg bg-bg-2/40 p-2.5 space-y-2 ' +
        (entry.hidden ? 'opacity-50' : entry.needsReview ? 'ring-1 ring-amber/30' : '')
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-3">
        <span
          className={
            'rounded px-1.5 py-0.5 font-bold ' +
            (entry.kind === 'FEAT' ? 'bg-cyan/15 text-cyan' : 'bg-violet/15 text-violet')
          }
        >
          {entry.kind === 'FEAT' ? 'nuevo' : 'arreglo'}
        </span>
        <span className="font-mono">{entry.commitSha.slice(0, 7)}</span>
        {entry.commitScope !== null && <span>scope: {entry.commitScope}</span>}
        {entry.hidden && (
          <span className="flex items-center gap-1 text-rose">
            <EyeOff className="w-3 h-3" />
            oculta
          </span>
        )}
        {entry.needsReview && !entry.hidden && <span className="text-amber">para revisar</span>}
      </div>

      <input
        value={textEs}
        onChange={(event) => setTextEs(event.target.value)}
        disabled={readOnly}
        placeholder="Texto en español"
        className="w-full rounded-md bg-bg-1 px-2 py-1.5 text-[12px] text-text-1 outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
      />
      <input
        value={textEn}
        onChange={(event) => setTextEn(event.target.value)}
        disabled={readOnly}
        placeholder="English — obligatorio para publicar"
        className={
          'w-full rounded-md bg-bg-1 px-2 py-1.5 text-[12px] text-text-1 outline-none focus:ring-1 focus:ring-brand disabled:opacity-60 ' +
          (missingEnglish ? 'ring-1 ring-rose/40' : '')
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={module}
          onChange={(event) => setModule(event.target.value)}
          disabled={readOnly}
          className="rounded-md bg-bg-1 px-2 py-1 text-[11px] text-text-1 outline-none disabled:opacity-60"
        >
          {MODULE_KEYS.map((key) => (
            <option key={key} value={key}>
              {MODULE_LABELS[key].es}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-1">
          {AUDIENCES.map((audience) => {
            const on = audiences.includes(audience);
            return (
              <button
                key={audience}
                type="button"
                disabled={readOnly}
                onClick={() =>
                  setAudiences(
                    on ? audiences.filter((a) => a !== audience) : [...audiences, audience],
                  )
                }
                className={
                  'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-60 ' +
                  (on ? 'bg-brand/20 text-brand' : 'bg-white/5 text-text-3 hover:text-text-2')
                }
              >
                {audience}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={readOnly || busy}
            onClick={() => onSave({ hidden: !entry.hidden })}
            className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-text-2 hover:text-text-1 disabled:opacity-40"
          >
            {entry.hidden ? 'Mostrar' : 'Ocultar'}
          </button>
          <button
            type="button"
            disabled={readOnly || busy || !dirty}
            onClick={() =>
              onSave({
                textEs,
                textEn: textEn.trim() === '' ? null : textEn,
                module,
                audiences,
              })
            }
            className="flex items-center gap-1 rounded-md bg-gradient-brand px-2.5 py-1 text-[10px] font-semibold text-white disabled:opacity-30"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
