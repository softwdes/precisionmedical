'use client';

/**
 * LawFirmField — buscar un bufete del catálogo, o crearlo sin salir de acá.
 *
 * ── El agujero que cierra ───────────────────────────────────────────────────
 *
 * El wizard de caso nuevo mostraba un aviso que decía «si no está en la lista,
 * usá "Agregar bufete"» y ese botón NO existía en esa pantalla: el texto
 * prometía una salida que no estaba. Recepción, con el paciente enfrente, tenía
 * que abandonar el alta, ir al catálogo de bufetes, crearlo y empezar de nuevo.
 *
 * El mismo callejón está en seis pantallas que usan
 * `/api/admin/lawyers/autocomplete`; la única que podía crear era
 * `quick-register-dialog`, con un autocomplete propio que daba de alta el bufete
 * **con el nombre solo**. Eso es justo lo que produce el desorden que se midió
 * en el catálogo, así que acá se abre el formulario COMPLETO y no un campito.
 *
 * ── Por qué la acción va ARRIBA y siempre ──────────────────────────────────
 *
 * El primitivo ya tenía `renderEmpty` para el caso "no hay resultados". No
 * alcanza: buscar "Sterling" trae tres sucursales y la que hay que cargar puede
 * ser una cuarta. Con la acción solo en el estado vacío, ahí no hay salida. Por
 * eso se le agregó `renderAction`, que se ve siempre.
 *
 * Y va ARRIBA porque al pie no se encontraba: probado con los 109 bufetes
 * reales, la lista scrollea y la acción quedaba fuera de la pantalla (Erick,
 * 2026-09-07: «no es intuitivo»). Después de filtrar la vista está arriba, que
 * es justo el momento en que hace falta crear.
 *
 * ── Lo que hace al crear ────────────────────────────────────────────────────
 *
 * Precarga el nombre con lo que se venía buscando, y al guardar SELECCIONA el
 * bufete en el campo y devuelve el foco al wizard, que sigue donde estaba. El
 * aviso de parecidos vive dentro de `FirmDialog`, así que también protege al
 * catálogo.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Autocomplete, type AutoResult } from '@/components/ui-phoenix';
import { FirmDialog, type FirmCreado } from './firm-dialog';

export function LawFirmField({
  selected,
  onSelect,
  placeholder,
  onCreated,
}: {
  selected: AutoResult | null;
  onSelect: (r: AutoResult | null) => void;
  placeholder: string;
  /** Aviso extra cuando se creó uno nuevo (refrescar una lista, telemetría…). */
  onCreated?: (firm: FirmCreado) => void;
}) {
  const t = useTranslations('phoenix.lawyers');
  const [abierto, setAbierto] = useState(false);
  /** Lo que se venía tecleando, para precargar el nombre del formulario. */
  const [buscado, setBuscado] = useState('');

  function seleccionar(firm: FirmCreado): void {
    onSelect({
      id: firm.id,
      label: firm.firmName,
      subtitle: firm.city ?? '',
    });
    onCreated?.(firm);
  }

  return (
    <>
      <Autocomplete
        endpoint="/api/admin/lawyers/autocomplete"
        placeholder={placeholder}
        selected={selected}
        onSelect={onSelect}
        /* Con la acción arriba y la lista vacía, el panel quedaba mudo: se veía
           el botón verde y nada más, sin decir que la búsqueda no encontró. */
        emptyHint={t('noFirmMatch')}
        renderAvatar={(r) => (
          <div className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold shrink-0 bg-brand/20 border border-brand/30 text-brand-text">
            {r.label.slice(0, 2).toUpperCase()}
          </div>
        )}
        renderAction={(query, close) => (
          <button
            type="button"
            onMouseDown={(e) => {
              /* `onMouseDown` con `preventDefault`, igual que los resultados: con
                 `onClick` el blur del input cierra el panel y el clic se pierde. */
              e.preventDefault();
              setBuscado(query);
              close();
              setAbierto(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
          >
            <div className="w-7 h-7 rounded flex items-center justify-center shrink-0 bg-emerald/15 border border-emerald/30">
              <Plus className="w-3.5 h-3.5 text-emerald" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-emerald font-semibold truncate">
                {query ? t('addFirmNamed', { name: query }) : t('addFirmNew')}
              </div>
              <div className="text-[11px] text-text-muted">{t('addFirmHint')}</div>
            </div>
          </button>
        )}
      />

      <FirmDialog
        open={abierto}
        onOpenChange={setAbierto}
        editing={null}
        initialName={buscado}
        onCreated={seleccionar}
        /* El catálogo recarga su lista acá; el wizard no tiene ninguna que
           recargar, así que solo cierra. */
        onSaved={() => setAbierto(false)}
      />
    </>
  );
}
