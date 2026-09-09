'use client';

/**
 * Los avisos al celular, en sus dos caras. Puerto del control del back-office.
 *
 * ── Por qué NO es una campana ───────────────────────────────────────────────
 *
 * La barra del Admin ya tiene una `Bell` para las notificaciones internas. A
 * 16px en un teléfono, dos campanas son el mismo icono — es exactamente la
 * confusión que Erick reportó en el back-office y que allá se resolvió con el
 * teléfono. Además la campana es un BUZÓN (tiene cosas adentro y un número que
 * lo dice) y esto es una PREFERENCIA que se toca una vez. Un teléfono dice lo
 * que gobierna: si ESTE aparato suena.
 *
 * ── Por qué está en dos lugares ─────────────────────────────────────────────
 *
 * `PushToggle` (barra superior) aparece SOLO cuando hace falta un clic: apagado
 * —para que alguien lo descubra— o bloqueado —para explicar por qué no llegan
 * los avisos, porque esconder la acción bloqueada deja a la persona sin saber
 * que existe—. Encendido se va de la barra: no hay nada más que tocar.
 *
 * `PushAvisosMenuItem` (menú del avatar) está siempre, junto a idioma y tema,
 * que son la misma clase de cosa. Ahí se ve el estado y se puede apagar.
 */

import * as React from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Smartphone, SmartphoneNfc } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { usePushAvisos } from '@/lib/push-avisos';

/**
 * Diálogo explicativo: se abre ANTES del cartel del navegador.
 *
 * Ese cartel tiene UN intento. Si la persona toca "Bloquear", queda bloqueado y
 * desbloquearlo requiere entrar a los ajustes del sitio — nadie lo hace. Así que
 * primero se explica acá, en nuestro idioma, y el cartel del navegador aparece
 * recién cuando ya dijo que sí.
 */
function DialogoAvisos({
  abierto, onOpenChange, bloqueado, trabajando, onEncender,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  bloqueado: boolean;
  trabajando: boolean;
  onEncender: () => void;
}): React.ReactElement {
  const t = useTranslations();

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-text-1 text-base font-semibold">
            <Smartphone className="w-4 h-4 text-brand-text" aria-hidden="true" />
            {bloqueado ? t('push.blockedTitle') : t('push.askTitle')}
          </DialogTitle>
        </DialogHeader>

        {bloqueado ? (
          <div className="space-y-3">
            <p className="text-sm text-text-2 leading-relaxed">{t('push.blockedBody')}</p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full h-9 rounded-md border border-border bg-bg-2 text-sm text-text-1 hover:bg-white/5 transition-colors"
            >
              {t('push.close')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-text-2 leading-relaxed">{t('push.askBody')}</p>
            {/* Lo que NO va a decir el aviso. Se dice acá y no en letra chica:
                es la razón por la que se puede aceptar sin riesgo. */}
            <p className="text-xs text-text-muted leading-relaxed border-l-2 border-border pl-3">
              {t('push.askPrivacy')}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 h-9 rounded-md border border-border bg-bg-2 text-sm text-text-2 hover:text-text-1 hover:bg-white/5 transition-colors"
              >
                {t('push.later')}
              </button>
              <button
                type="button"
                onClick={onEncender}
                disabled={trabajando}
                className="flex-1 h-9 rounded-md border border-emerald/40 bg-emerald/15 text-sm font-semibold text-emerald-text hover:bg-emerald/25 transition-colors disabled:opacity-60"
              >
                {trabajando ? t('push.saving') : t('push.enable')}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Cara 1 — el botón de la barra superior. Solo cuando hace falta un clic. */
export function PushToggle(): React.ReactElement | null {
  const t = useTranslations();
  const { estado, trabajando, encender } = usePushAvisos();
  const [preguntando, setPreguntando] = useState(false);

  // Encendido no se dibuja: el estado vive en el menú del avatar y acá sería
  // ruido permanente. Tampoco mientras carga, para no parpadear en cada vista.
  if (estado === 'cargando' || estado === 'no-soportado' || estado === 'encendido') {
    return null;
  }

  const bloqueado = estado === 'bloqueado';
  const etiqueta = bloqueado ? t('push.blocked') : t('push.off');

  return (
    <>
      <button
        type="button"
        onClick={() => { if (!trabajando) setPreguntando(true); }}
        aria-label={etiqueta}
        title={etiqueta}
        className={`inline-flex items-center justify-center h-9 w-9 rounded-md border transition-colors ${
          bloqueado
            ? 'border-amber/30 bg-amber/10 text-amber-text'
            : 'border-border bg-bg-2 text-text-2 hover:text-text-1 hover:bg-white/5'
        }`}
      >
        <Smartphone className="w-4 h-4" aria-hidden="true" />
      </button>

      <DialogoAvisos
        abierto={preguntando}
        onOpenChange={setPreguntando}
        bloqueado={bloqueado}
        trabajando={trabajando}
        onEncender={() => { void encender().then(() => setPreguntando(false)); }}
      />
    </>
  );
}

/**
 * Cara 2 — la fila del menú del avatar. Siempre presente (salvo sin soporte).
 *
 * `onNavigate` cierra el menú, igual que los otros ítems: apagar los avisos y
 * quedarse con el desplegable abierto encima deja la sensación de que no pasó
 * nada.
 */
export function PushAvisosMenuItem({ onNavigate }: { onNavigate: () => void }): React.ReactElement | null {
  const t = useTranslations();
  const { estado, trabajando, encender, apagar } = usePushAvisos();
  const [preguntando, setPreguntando] = useState(false);

  if (estado === 'cargando' || estado === 'no-soportado') return null;

  const encendido = estado === 'encendido';
  const bloqueado = estado === 'bloqueado';

  const detalle = encendido ? t('push.stateOn')
    : bloqueado ? t('push.stateBlocked')
    : t('push.stateOff');

  return (
    <>
      <button
        type="button"
        disabled={trabajando}
        onClick={() => {
          if (encendido) { onNavigate(); void apagar(); return; }
          // Apagado o bloqueado: el diálogo explica antes de tocar el navegador.
          onNavigate();
          setPreguntando(true);
        }}
        className="flex w-full items-start gap-2.5 px-3 py-2 text-sm text-text-2 hover:bg-surface hover:text-text-1 transition-colors text-left disabled:opacity-60"
      >
        {encendido
          ? <SmartphoneNfc className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-text" aria-hidden="true" />
          : <Smartphone className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-text" aria-hidden="true" />}
        <span className="min-w-0">
          {t('push.menuLabel')}
          {/* El estado va en su propia línea y con palabras, no con un color:
              "activados" se lee igual para quien no distingue el verde. */}
          <span className={`block text-[11px] ${
            encendido ? 'text-emerald-text' : bloqueado ? 'text-amber-text' : 'text-text-muted'
          }`}>
            {detalle}
          </span>
        </span>
      </button>

      <DialogoAvisos
        abierto={preguntando}
        onOpenChange={setPreguntando}
        bloqueado={bloqueado}
        trabajando={trabajando}
        onEncender={() => { void encender().then(() => setPreguntando(false)); }}
      />
    </>
  );
}
