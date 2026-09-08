'use client';

/**
 * Interruptor de los avisos al celular (Web Push).
 *
 * Vive en la barra superior, al lado del sobre, y NO es un banner de una sola
 * vez: un banner se descarta y no vuelve, así que quien lo cierre sin leer
 * queda sin avisos para siempre y sin forma de encontrarlos. Acá el estado se
 * ve y se puede cambiar en los dos sentidos.
 *
 * ── Por qué hay un diálogo antes del permiso ────────────────────────────────
 *
 * El cartel del navegador tiene UN intento. Si la persona toca "Bloquear",
 * queda bloqueado y desbloquearlo requiere entrar a los ajustes del sitio —
 * nadie lo hace. Así que primero se explica en nuestra pantalla, en nuestro
 * idioma, y el cartel del navegador aparece recién cuando ya dijo que sí.
 *
 * Y cuando está bloqueado, el botón SE MUESTRA y explica: esconder la acción
 * bloqueada deja a la persona sin saber por qué no le llegan los avisos.
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { BellRing, BellOff, Bell } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';
import { useToast } from '@/components/ui-phoenix/toast';

type Estado = 'cargando' | 'no-soportado' | 'apagado' | 'encendido' | 'bloqueado';

/**
 * La clave pública VAPID viaja como bytes, no como texto: `subscribe()` pide
 * un Uint8Array y el navegador la sirve en base64url (con `-` y `_`).
 *
 * El tipo de retorno lleva `<ArrayBuffer>` explícito: `applicationServerKey`
 * exige un buffer propio, y un `Uint8Array` sin parametrizar puede estar
 * respaldado por un `SharedArrayBuffer`, que TypeScript rechaza ahí.
 */
function claveABytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(normal);
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

export function PushToggle(): React.ReactElement | null {
  const t = useTranslations('phoenix.topbar');
  const toast = useToast();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [preguntando, setPreguntando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    void (async () => {
      // Sin SW, sin PushManager o sin claves configuradas no hay nada que
      // ofrecer: el botón no se dibuja en vez de prometer algo que no funciona.
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !clavePublica
      ) {
        setEstado('no-soportado');
        return;
      }
      if (Notification.permission === 'denied') {
        setEstado('bloqueado');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setEstado(sub ? 'encendido' : 'apagado');
      } catch {
        setEstado('apagado');
      }
    })();
  }, [clavePublica]);

  const encender = useCallback(async (): Promise<void> => {
    if (!clavePublica) return;
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'apagado');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveABytes(clavePublica),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('alta rechazada');

      setEstado('encendido');
      setPreguntando(false);
      toast.success(t('pushOnDone'));
    } catch (e) {
      console.error('[push] alta falló', e);
      toast.error(t('pushError'));
    } finally {
      setTrabajando(false);
    }
  }, [clavePublica, toast, t]);

  const apagar = useCallback(async (): Promise<void> => {
    setTrabajando(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Primero el servidor: si se desuscribe el navegador y falla el borrado,
        // queda una fila que va a recibir 410 en el próximo envío. Al revés no
        // se pierde nada.
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setEstado('apagado');
      toast.info(t('pushOffDone'));
    } catch (e) {
      console.error('[push] baja falló', e);
      toast.error(t('pushError'));
    } finally {
      setTrabajando(false);
    }
  }, [toast, t]);

  if (estado === 'cargando' || estado === 'no-soportado') return null;

  const etiqueta =
    estado === 'encendido' ? t('pushOn')
    : estado === 'bloqueado' ? t('pushBlocked')
    : t('pushOff');

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (trabajando) return;
          if (estado === 'encendido') { void apagar(); return; }
          setPreguntando(true);
        }}
        aria-label={etiqueta}
        title={etiqueta}
        className={`inline-flex items-center justify-center h-9 w-9 rounded-md border transition-colors ${
          estado === 'encendido'
            ? 'border-emerald/40 bg-emerald/10 text-emerald'
            : estado === 'bloqueado'
              ? 'border-border bg-bg-2 text-text-muted'
              : 'border-border bg-bg-2 text-text-2 hover:text-text-1 hover:bg-white/5'
        }`}
      >
        {estado === 'encendido' ? <BellRing className="w-4 h-4" aria-hidden="true" />
          : estado === 'bloqueado' ? <BellOff className="w-4 h-4" aria-hidden="true" />
          : <Bell className="w-4 h-4" aria-hidden="true" />}
      </button>

      <Dialog open={preguntando} onOpenChange={setPreguntando}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-text-1 text-base font-semibold">
              <Bell className="w-4 h-4 text-brand-text" aria-hidden="true" />
              {estado === 'bloqueado' ? t('pushBlockedTitle') : t('pushAskTitle')}
            </DialogTitle>
          </DialogHeader>

          {estado === 'bloqueado' ? (
            <div className="space-y-3">
              <p className="text-sm text-text-2 leading-relaxed">{t('pushBlockedBody')}</p>
              <button
                type="button"
                onClick={() => setPreguntando(false)}
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
                  onClick={() => setPreguntando(false)}
                  className="flex-1 h-9 rounded-md border border-border bg-bg-2 text-sm text-text-2 hover:text-text-1 hover:bg-white/5 transition-colors"
                >
                  {t('pushLater')}
                </button>
                <button
                  type="button"
                  onClick={() => void encender()}
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
    </>
  );
}
