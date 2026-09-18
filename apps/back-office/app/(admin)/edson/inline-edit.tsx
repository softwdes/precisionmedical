'use client';

/**
 * Edicion en la celda para la grilla de tracking.
 *
 * Edson trabajaba esto en Excel y ahi corrige en el lugar: no abre un formulario
 * para cambiar un numero de claim. El modal sigue existiendo para la carga
 * completa; esto es para el retoque de todos los dias.
 *
 * Dos decisiones que conviene entender antes de tocar el archivo:
 *
 *  1. **Un solo clic**, no doble, en las celdas que se ESCRIBEN (claim, y los
 *     combos de aseguradora, abogado y quiro). El doble clic no tiene señal
 *     visual, no se descubre solo y pelea con la seleccion de texto.
 *
 *     La excepcion es la columna de **provider**, que abre con doble clic
 *     (`abreConDobleClic`). Lo pidio Edson dos veces y lo confirmo el
 *     2026-09-18 despues de que le plantee quedarnos con un clic: en esa
 *     columna no se escribe, se ELIGE de una lista corta, y el gesto viene del
 *     Excel del que salio esta vista. Ahi el doble clic si se descubre solo,
 *     porque es el que ya tenia en la mano.
 *
 *  2. **Enter guarda; salir de la celda NO guarda.** Es lo contrario a Excel, y
 *     es a proposito: estas celdas no editan las notas de Edson, editan el CASO
 *     —el seguro y el claim los ve facturacion y el portal del abogado—. Un
 *     clic al costado no puede cambiar el seguro de un caso en silencio.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { AnchoredPanel, type AnchorRect } from './anchored-panel';

/** Caja de texto de la celda; comparte el alto con el contenido normal de la fila. */
const INPUT_CLS =
  'w-full bg-bg-2 border border-brand rounded-[3px] px-1 py-0 text-[8px] text-text-1 focus:outline-none';

/** El disparador se ve como texto plano hasta que se le pasa el mouse. */
const TRIGGER_CLS =
  'w-full text-left rounded-[3px] px-1 -mx-1 hover:bg-brand/10 hover:ring-1 hover:ring-brand/30 focus:outline-none focus:ring-1 focus:ring-brand cursor-text';

function Empty() {
  return <span className="text-text-muted">—</span>;
}

/** Texto libre en la celda. Se usa en Claim #. */
export function InlineText({
  value, onSave, readOnly, mono = false, title,
}: {
  value: string | null;
  onSave: (next: string | null) => Promise<boolean>;
  readOnly?: boolean;
  mono?: boolean;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  async function commit() {
    const next = draft.trim() || null;
    if (next === (value ?? null)) { setEditing(false); return; }
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (readOnly) {
    return value
      ? <span className={mono ? 'font-mono text-text-2' : 'text-text-2'}>{value}</span>
      : <Empty />;
  }

  if (!editing) {
    return (
      <button
        type="button"
        data-inline-edit
        title={title}
        onClick={() => { setDraft(value ?? ''); setEditing(true); }}
        className={TRIGGER_CLS + (mono ? ' font-mono' : '') + (value ? ' text-text-2' : '')}
      >
        {value || <Empty />}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        ref={inputRef}
        value={draft}
        disabled={saving}
        maxLength={60}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); void commit(); }
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
        }}
        onBlur={() => { if (!saving) setEditing(false); }}
        className={INPUT_CLS + (mono ? ' font-mono' : '')}
      />
      {saving && <Loader2 className="w-2.5 h-2.5 animate-spin text-brand shrink-0" />}
    </span>
  );
}

/**
 * Lista + texto libre en la celda. Se usa en Insurance.
 *
 * Elegir de la lista guarda el vinculo al catalogo; escribir guarda el texto
 * tal cual. Los dos caminos existen en la base (`carrierId` y `carrierNameRaw`)
 * justamente para esto: obligar a que todo salga del catalogo es como se
 * termina con la informacion en una hoja aparte.
 */
export function InlineCombo({
  value, options, onSave, readOnly, title, emptyHint,
  abreConLaLista = false, abreConDobleClic = false,
}: {
  value: string | null;
  options: { id: string; name: string }[];
  /** `id` cuando salio de la lista; `text` cuando lo escribio a mano. */
  onSave: (next: { id: string | null; text: string | null }) => Promise<boolean>;
  readOnly?: boolean;
  title?: string;
  emptyHint: string;
  /**
   * Abrir mostrando TODA la lista en vez del valor actual.
   *
   * Por defecto el buscador arranca con el valor que ya tenia, y entonces la
   * lista de abajo queda filtrada a esa sola fila: hay que borrar el texto para
   * ver las opciones. En un catalogo de cientos (aseguradoras, bufetes) eso
   * esta bien, porque la lista completa no se puede leer igual.
   *
   * Con una lista corta y enumerable —los 20 providers— es al reves: Edson
   * abre para VER a quien puede poner, y ver solo al que ya esta no le sirve
   * de nada. Lo reporto el 2026-09-18: "al dar clic no muestra la lista de
   * providers, solo aparece el actual y para borrarlo".
   */
  abreConLaLista?: boolean;
  /**
   * Abrir con DOBLE clic en vez de uno solo. Lo pidió Edson para la columna de
   * provider el 2026-09-18 y lo confirmó cuando le planteé quedarnos con un
   * clic: viene del Excel, donde la celda se edita con doble clic.
   *
   * Va como opción y no como cambio general a propósito: las otras columnas
   * (aseguradora, abogado, quiro) siguen abriendo con un clic, que es lo que
   * dice la nota de arriba del archivo.
   */
  abreConDobleClic?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [rect, setRect]       = useState<AnchorRect | null>(null);
  const [hi, setHi]           = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = draft.trim().toLowerCase();
  // Se acota la lista: el catalogo tiene cientos y un panel con todos no ayuda.
  // Se acota a 8 porque los catalogos grandes no se leen de un vistazo. Cuando
  // la lista es corta y se abre entera, ese tope la cortaria justo en lo que
  // Edson vino a ver — y ademas dejaria la fila resaltada fuera del arreglo.
  const matches = (q ? options.filter(o => o.name.toLowerCase().includes(q)) : options)
    .slice(0, abreConLaLista ? 50 : 8);

  useLayoutEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  function open(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    setDraft(abreConLaLista ? '' : (value ?? ''));
    // Con la lista completa a la vista, se resalta el que ya esta puesto: asi
    // Enter sin tocar nada no cambia nada, y las flechas arrancan desde ahi.
    const actual = abreConLaLista && value ? options.findIndex(o => o.name === value) : -1;
    setHi(actual >= 0 ? actual : 0);
    setEditing(true);
  }

  function close() { setEditing(false); setRect(null); }

  async function commit(next: { id: string | null; text: string | null }) {
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) close();
  }

  function commitTyped() {
    const text = draft.trim();
    if (!text) { void commit({ id: null, text: null }); return; }
    // Si lo escrito coincide exacto con una del catalogo, se guarda el VINCULO y
    // no el texto: si no, quedarian dos casos con el mismo seguro, uno vinculado
    // y otro suelto, y el filtro por aseguradora dejaria de encontrar al segundo.
    const exact = options.find(o => o.name.toLowerCase() === text.toLowerCase());
    void commit(exact ? { id: exact.id, text: null } : { id: null, text });
  }

  if (readOnly) {
    return value ? <span className="text-text-2 truncate block">{value}</span> : <Empty />;
  }

  return (
    <>
      <button
        type="button"
        data-inline-edit
        title={title}
        /*
         * Con doble clic, el clic simple del MOUSE no abre — pero el del
         * TECLADO sí. Enter y Espacio sobre un <button> disparan un click con
         * `detail === 0`, y si lo ignoráramos como al del mouse, la celda
         * quedaría sin forma de abrirse sin mouse.
         */
        onClick={e => { if (abreConDobleClic && e.detail !== 0) return; open(e.currentTarget); }}
        onDoubleClick={e => { if (abreConDobleClic) open(e.currentTarget); }}
        className={TRIGGER_CLS + ' truncate block' + (value ? ' text-text-2' : '')
          + (editing ? ' invisible' : '')
          // Sin esto el doble clic selecciona la palabra antes de abrir y queda
          // el texto resaltado en azul debajo del panel.
          + (abreConDobleClic ? ' select-none' : '')}
      >
        {value || <Empty />}
      </button>

      {editing && rect && (
        <AnchoredPanel rect={rect} width={230} onClose={close}>
          <input
            ref={inputRef}
            value={draft}
            disabled={saving}
            maxLength={200}
            placeholder={emptyHint}
            onChange={e => { setDraft(e.target.value); setHi(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, matches.length - 1)); }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
              if (e.key === 'Escape')    { e.preventDefault(); close(); }
              if (e.key === 'Enter') {
                e.preventDefault();
                const pick = matches[hi];
                /*
                 * Con la lista filtrada, Enter toma la resaltada; si lo escrito
                 * no coincide con ninguna, se guarda tal cual.
                 *
                 * El `q` del medio NO sobra: sin el, borrar el campo y apretar
                 * Enter —que es como se saca un valor— guardaria la primera
                 * opcion de la lista en vez de vaciarlo. Con `abreConLaLista` el
                 * campo arranca vacio a proposito, asi que ahi Enter si tiene
                 * que tomar la resaltada.
                 */
                if (pick && (q || abreConLaLista)) void commit({ id: pick.id, text: null });
                else commitTyped();
              }
            }}
            className={INPUT_CLS + ' !text-[11px] !py-1 !px-2'}
          />

          <div className="max-h-44 overflow-y-auto scroll-thin -mx-1">
            {matches.map((o, i) => (
              <button
                key={o.id}
                type="button"
                // `onMouseDown` y no `onClick`: el click llega DESPUES del blur
                // del input, y para entonces el panel ya se cerro.
                onMouseDown={e => { e.preventDefault(); void commit({ id: o.id, text: null }); }}
                className={'w-full text-left px-2 py-1 text-[11px] rounded truncate ' +
                  (i === hi ? 'bg-brand/15 text-text-1' : 'text-text-2 hover:bg-bg-2')}
              >
                {o.name}
                {value && o.name === value && <Check className="w-3 h-3 inline ml-1 text-emerald" />}
              </button>
            ))}
            {q && matches.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-text-muted italic">{emptyHint}</div>
            )}
          </div>

          {saving && (
            <div className="flex items-center gap-1 text-[10px] text-text-muted">
              <Loader2 className="w-3 h-3 animate-spin" />
            </div>
          )}
        </AnchoredPanel>
      )}
    </>
  );
}
