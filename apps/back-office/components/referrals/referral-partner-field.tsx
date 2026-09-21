'use client';

/**
 * ReferralPartnerField — elegir un referidor del catálogo, o crearlo sin salir
 * de acá. Mismo patrón que `LawFirmField`, por los mismos motivos: con el
 * paciente enfrente, recepción no puede abandonar el alta para ir al catálogo.
 *
 * Reemplaza al autocompletado que buscaba contra `/api/admin/providers`, que
 * eran los providers PROPIOS de la clínica — medido el 2026-09-20: 20, los 20
 * con especialidad GENERAL, cero quiroprácticos. O sea que la lista no podía
 * ofrecer nunca lo que el campo pedía, y lo que quedaba escrito lo tecleaba
 * recepción entera, cada vez.
 *
 * La acción de crear va ARRIBA y siempre visible: buscar "Axcess" trae tres
 * filas del histórico y la que hay que cargar puede ser una cuarta.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Autocomplete, type AutoResult } from '@/components/ui-phoenix';
import { PartnerDialog, type TipoReferidor } from '@/app/(admin)/admin/referral-partners/referral-partners-client';

export function ReferralPartnerField({
  selected,
  onSelect,
  placeholder,
  tipoPorDefecto,
}: {
  selected: AutoResult | null;
  onSelect: (r: AutoResult | null) => void;
  placeholder: string;
  /** Tipo con el que se abre el alta — el campo sabe qué está buscando. */
  tipoPorDefecto?: TipoReferidor;
}) {
  const t = useTranslations('phoenix.referralPartners');
  const [abierto, setAbierto] = useState(false);
  /** Lo que se venía tecleando, para precargar el nombre del formulario. */
  const [buscado, setBuscado] = useState('');

  return (
    <>
      <Autocomplete
        endpoint="/api/admin/referral-partners"
        placeholder={placeholder}
        selected={selected}
        onSelect={onSelect}
        emptyHint={t('noMatch')}
        renderAvatar={(r) => (
          <div className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold shrink-0 bg-cyan/20 border border-cyan/30 text-cyan">
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
                {query ? t('addNamed', { name: query }) : t('addNew')}
              </div>
              <div className="text-[11px] text-text-muted">{t('addHint')}</div>
            </div>
          </button>
        )}
      />

      <PartnerDialog
        open={abierto}
        onOpenChange={setAbierto}
        editing={null}
        initialName={buscado}
        tipoInicial={tipoPorDefecto}
        onCreated={(p) => onSelect({ id: p.id, label: p.name })}
      />
    </>
  );
}
