'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck, X } from 'lucide-react';
import { createClient } from '@precision-medical/auth/client';

/**
 * El cartel que invita a activar el doble factor.
 *
 * ── Por qué un cartel y no un modal al entrar ──────────────────────────────
 *
 * Erick pidió "un alert al entrar, como hacen todos los sistemas". Un modal que
 * tapa la pantalla a las 8 de la mañana en recepción, con pacientes esperando,
 * se cierra sin leer — y lo que enseña es a apretar "después" sin mirar, que es
 * justo el reflejo que no queremos el día que aparezca un aviso de verdad. Así
 * que va arriba del contenido, visible, sin bloquear nada.
 *
 * ── Dónde aparece ─────────────────────────────────────────────────────────
 *
 * En Clinic y en Providers. En el portal legal NO: esa decisión la toma
 * `AdminShell` por `variant`, y es de Erick — los abogados son externos y
 * pedirles doble factor es una conversación con el bufete, no un cartel.
 *
 * ── Cuándo NO aparece ──────────────────────────────────────────────────────
 *
 *  · si esa persona ya lo tiene activado;
 *  · si lo descartó hace menos de una semana;
 *  · mientras no se sepa todavía una de las dos cosas — no parpadea.
 *
 * ── Por qué se pregunta en el navegador ───────────────────────────────────
 *
 * `mfa.listFactors()` contesta por la sesión de quien mira, sin permisos de
 * administrador y sin que el shell tenga que saber de MFA. El costo es que el
 * cartel aparece un instante después del contenido, que es lo deseable: nunca
 * antes de lo que la persona vino a hacer.
 *
 * ── `localStorage` puede lanzar ───────────────────────────────────────────
 *
 * En ventana privada o con el sitio bloqueado, leer o escribir **tira
 * excepción**. Las dos van en try/catch, y el peor caso es que el cartel vuelva
 * a aparecer — nunca que la pantalla se rompa. Misma lección que la cortina de
 * versiones.
 */

/** Una semana: seguido para que no se olvide, espaciado para que no moleste. */
const SILENCIO_MS = 7 * 24 * 60 * 60 * 1000;

const CLAVE = 'pm:aviso-2fa-descartado';

function descartadoHacePoco(): boolean {
  try {
    const v = window.localStorage.getItem(CLAVE);
    return v ? Date.now() - Number(v) < SILENCIO_MS : false;
  } catch {
    // Sin localStorage, se muestra. Molestar de más es mejor que callar un
    // aviso de seguridad por una preferencia del navegador.
    return false;
  }
}

export function AvisoDobleFactor(): React.ReactElement | null {
  const t = useTranslations('phoenix.aviso2fa');
  const [mostrar, setMostrar] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    void (async () => {
      if (descartadoHacePoco()) return;
      try {
        const { data } = await createClient().auth.mfa.listFactors();
        // `verified` y no solo "existe": un factor a medio inscribir no protege
        // nada, y a esa persona hay que seguir invitándola.
        const tiene = (data?.totp ?? []).some((f) => f.status === 'verified');
        if (vivo && !tiene) setMostrar(true);
      } catch {
        // Si no se pudo preguntar, no se inventa: no se muestra. Un aviso
        // basado en algo que no se pudo leer es ruido.
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (!mostrar) return null;

  const descartar = (): void => {
    try { window.localStorage.setItem(CLAVE, String(Date.now())); } catch { /* ver arriba */ }
    setMostrar(false);
  };

  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center gap-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 sm:mx-6 lg:mx-8">
      <ShieldCheck className="w-4 h-4 shrink-0 text-amber" />
      <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-text-2">
        <span className="font-semibold text-text-1">{t('titulo')}</span>{' '}
        {t('texto')}
      </p>
      <a
        href="/settings/security"
        className="rounded-md border border-amber/30 bg-amber/10 px-3 py-1 text-[11px] font-semibold text-amber transition-colors hover:bg-amber/20"
      >
        {t('activar')}
      </a>
      <button
        type="button"
        onClick={descartar}
        title={t('ahoraNo')}
        aria-label={t('ahoraNo')}
        className="rounded p-1 text-text-muted transition-colors hover:text-text-1"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
