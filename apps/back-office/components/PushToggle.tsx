'use client';

/**
 * Los avisos al celular, en sus dos caras.
 *
 * ── Por qué NO es una campana ───────────────────────────────────────────────
 *
 * La primera versión usaba `Bell`/`BellRing`, y quedó al lado de `ReleaseBell`
 * —"novedades del sistema"—, que usa `Bell` al mismo tamaño. A 16px en un
 * teléfono son el mismo icono, y Erick reportó la confusión al probarlo.
 *
 * Pero el problema de fondo no era el parecido: la campana y el sobre son
 * BUZONES —tienen cosas adentro para leer, y un número que lo dice—, y esto es
 * una PREFERENCIA que se toca una vez y no vuelve. Darle forma de buzón promete
 * algo que no cumple. Un teléfono, en cambio, dice exactamente lo que gobierna:
 * si ESTE aparato suena.
 *
 * ── Por qué está en dos lugares ─────────────────────────────────────────────
 *
 * `PushToggle` (barra superior) aparece SOLO cuando hace falta un clic: apagado
 * —para que alguien lo descubra— o bloqueado —para explicar por qué no llegan
 * los avisos, porque esconder la acción bloqueada deja a la persona sin saberlo—.
 * Encendido se va de la barra: no hay nada más que tocar, y en un teléfono esa
 * barra ya lleva siete controles.
 *
 * `PushAvisosMenuItem` (menú del avatar) está siempre, junto a idioma y tema,
 * que son la misma clase de cosa: preferencias personales del dispositivo. Ahí
 * se ve el estado y se puede apagar.
 *
 * Las dos comparten estado por `usePushAvisos` — ver ese archivo.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Smartphone, SmartphoneNfc } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { usePushAvisos } from '@/lib/push-avisos';

/** El color ámbar de los ítems del menú del avatar (no tiene escala de tonos). */
const AMBER = '#F59E0B';

/**
 * Diálogo explicativo: se abre ANTES del cartel del navegador.
 *
 * Ese cartel tiene UN intento. Si la persona toca "Bloquear", queda bloqueado y
 * desbloquearlo requiere entrar a los ajustes del sitio — nadie lo hace. Así que
 * primero se explica acá, en nuestro idioma, y el cartel del navegador aparece
 * recién cuando ya dijo que sí.
 */
function DialogoAvisos({
  abierto, onOpenChange, bloqueado, encendido = false, trabajando, onEncender, onApagar, onReactivar,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  bloqueado: boolean;
  /** Ya está activado: el diálogo pasa a ser el de apagar. */
  encendido?: boolean;
  trabajando: boolean;
  onEncender: () => void;
  onApagar?: () => void;
  onReactivar?: () => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.topbar');

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-text-1 text-base font-semibold">
            <Smartphone className="w-4 h-4 text-brand-text" aria-hidden="true" />
            {encendido ? t('pushOnTitle') : bloqueado ? t('pushBlockedTitle') : t('pushAskTitle')}
          </DialogTitle>
        </DialogHeader>

        {encendido ? (
          <div className="space-y-3">
            <p className="text-sm text-text-2 leading-relaxed">{t('pushOnBody')}</p>
            {/* La acción PRINCIPAL del estado encendido no es apagar: es
                rehacer. Alguien que abre esto teniéndolo en verde casi siempre
                viene de "dice activado y no me llegan", que es el fallo de la
                suscripción muerta — ver `reactivar` en `usePushAvisos`. */}
            <button
              type="button"
              onClick={onReactivar}
              disabled={trabajando}
              className="w-full h-9 rounded-md border border-emerald/40 bg-emerald/15 text-sm font-semibold text-emerald hover:bg-emerald/25 transition-colors disabled:opacity-60"
            >
              {trabajando ? t('saving') : t('pushRedo')}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 h-9 rounded-md border border-border bg-bg-2 text-sm text-text-1 hover:bg-white/5 transition-colors"
              >
                {t('close')}
              </button>
              {/* Apagar es la acción SECUNDARIA: el botón está pero no invita.
                  Con el icono siempre visible, el diálogo es lo único que separa
                  un toque al pasar de quedarse sin avisos sin enterarse. */}
              <button
                type="button"
                onClick={onApagar}
                disabled={trabajando}
                className="flex-1 h-9 rounded-md border border-border bg-bg-2 text-sm text-text-2 hover:text-rose hover:border-rose/30 transition-colors disabled:opacity-60"
              >
                {trabajando ? t('saving') : t('pushDisable')}
              </button>
            </div>
          </div>
        ) : bloqueado ? (
          <div className="space-y-3">
            <p className="text-sm text-text-2 leading-relaxed">{t('pushBlockedBody')}</p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full h-9 rounded-md border border-border bg-bg-2 text-sm text-text-1 hover:bg-white/5 transition-colors"
            >
              {t('close')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-text-2 leading-relaxed">{t('pushAskBody')}</p>
            {/* Lo que NO va a decir el aviso. Se dice acá y no en letra chica:
                es la razón por la que se puede aceptar sin riesgo. */}
            <p className="text-xs text-text-muted leading-relaxed border-l-2 border-border pl-3">
              {t('pushAskPrivacy')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 h-9 rounded-md border border-border bg-bg-2 text-sm text-text-2 hover:text-text-1 hover:bg-white/5 transition-colors"
              >
                {t('pushLater')}
              </button>
              <button
                type="button"
                onClick={onEncender}
                disabled={trabajando}
                className="flex-1 h-9 rounded-md border border-emerald/40 bg-emerald/15 text-sm font-semibold text-emerald hover:bg-emerald/25 transition-colors disabled:opacity-60"
              >
                {trabajando ? t('saving') : t('pushEnable')}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cara 1 — el botón de la barra superior. Solo cuando hace falta un clic.
 */
export function PushToggle(): React.ReactElement | null {
  const t = useTranslations('phoenix.topbar');
  const { estado, trabajando, encender, apagar, reactivar } = usePushAvisos();
  const [abierto, setAbierto] = useState(false);

  /**
   * ── Encendido TAMBIÉN se dibuja ────────────────────────────────────────────
   *
   * La versión anterior lo escondía al quedar activado —idea mía, para no
   * sumar un control permanente a una barra que ya tiene siete— y el estado
   * quedaba solo en el menú del avatar. **Estuvo mal y lo reportó el uso real**
   * (Erick, 2026-09-09): al aceptar el permiso el icono desaparece, y quien
   * necesita apagarlo —o apagarlo y prenderlo, que es la forma de recrear una
   * suscripción huérfana— se queda sin puerta visible.
   *
   * La confusión que motivó el rediseño era campana-contra-campana, y eso ya lo
   * resolvió el cambio de icono a teléfono. Esconderlo era un extra que costaba
   * más de lo que ahorraba: un control que no se ve no existe.
   */
  if (estado === 'cargando' || estado === 'no-soportado') return null;

  const encendido = estado === 'encendido';
  const bloqueado = estado === 'bloqueado';
  const etiqueta = encendido ? t('pushOn') : bloqueado ? t('pushBlocked') : t('pushOff');

  return (
    <>
      <button
        type="button"
        // Encendido NO apaga de un toque: abre el diálogo y ahí se confirma.
        // Con el icono siempre visible, un toque al pasar dejaría a alguien sin
        // avisos sin enterarse — y el que se queda sin avisos no lo descubre
        // hasta que se pierde un mensaje.
        onClick={() => { if (!trabajando) setAbierto(true); }}
        aria-label={etiqueta}
        title={etiqueta}
        className={`inline-flex items-center justify-center h-9 w-9 rounded-md border transition-colors ${
          encendido
            ? 'border-emerald/40 bg-emerald/10 text-emerald'
            : bloqueado
              ? 'border-amber/30 bg-amber/10 text-amber'
              : 'border-border bg-bg-2 text-text-2 hover:text-text-1 hover:bg-white/5'
        }`}
      >
        <Smartphone className="w-4 h-4" aria-hidden="true" />
      </button>

      <DialogoAvisos
        abierto={abierto}
        onOpenChange={setAbierto}
        bloqueado={bloqueado}
        encendido={encendido}
        trabajando={trabajando}
        onEncender={() => { void encender().then(() => setAbierto(false)); }}
        onApagar={() => { void apagar().then(() => setAbierto(false)); }}
        onReactivar={() => { void reactivar().then(() => setAbierto(false)); }}
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
  const t = useTranslations('phoenix.topbar');
  const { estado, trabajando, encender, apagar } = usePushAvisos();
  const [preguntando, setPreguntando] = useState(false);

  if (estado === 'cargando' || estado === 'no-soportado') return null;

  const encendido = estado === 'encendido';
  const bloqueado = estado === 'bloqueado';

  const detalle = encendido ? t('pushStateOn')
    : bloqueado ? t('pushStateBlocked')
    : t('pushStateOff');

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
          ? <SmartphoneNfc className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: AMBER }} aria-hidden="true" />
          : <Smartphone className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: AMBER }} aria-hidden="true" />}
        <span className="min-w-0">
          {t('pushMenuLabel')}
          {/* El estado va en su propia línea y con palabras, no con un color:
              "activados" se lee igual para quien no distingue el verde. */}
          <span className={`block text-[11px] ${
            encendido ? 'text-emerald' : bloqueado ? 'text-amber' : 'text-text-muted'
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
