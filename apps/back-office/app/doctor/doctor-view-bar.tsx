'use client';

/**
 * DoctorViewBar — barra "viendo como" del portal médico.
 *
 * Aparece para quien tiene la capacidad de elegir médico: admins (soporte, demos)
 * y las cuentas con "Portal Médico" marcado en su ficha (QA, pruebas). Al elegir
 * un doctor, todo el portal —Mi Día, Mis Pacientes, Estadísticas, Consulta— se
 * muestra tal como lo ve ese médico: la elección vive en una cookie que lee
 * `getSessionProvider`.
 *
 * Sale también cuando lo que se ve es el portal PROPIO (`isViewAs=false`): un
 * tester con ficha de doctor entraba a su propia agenda y sin barra no tenía con
 * qué cambiar de médico — quedaba encerrado, y sin acceso a lo que solo funciona
 * en la cuenta dada de alta en ScriptSure (la bandeja de recetas). El aviso ámbar
 * y el "viendo como" solo se pintan cuando la agenda es de otro, para que nadie
 * confunda la vista de soporte con la del médico real.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import { Button } from '@precision/ui';
import { DoctorCombobox, type DoctorComboboxProvider } from '@/components/ui-phoenix/doctor-combobox';
import { useTransitionProgress } from '@/components/layout/navigation-progress';

interface Props {
  providers: DoctorComboboxProvider[];
  /**
   * Doctor que el portal está mostrando ahora ('' si todavía no eligió).
   *
   * NO se le pasa como `value` al combobox: con un id, el combobox esconde el
   * buscador y muestra el badge de "ya elegiste a este" — el selector quedaba
   * mudo justo cuando más se necesita, y salir del badge (la X) no dispara
   * ningún cambio porque un id vacío no es una selección. Acá solo sirve para
   * no repetir el viaje al server si eligen al que ya está puesto.
   */
  currentId: string;
  /** true cuando la agenda que se ve es de OTRO médico — enciende el aviso ámbar. */
  isViewAs?: boolean;
  /** true si tiene ficha propia: habilita "volver a mi portal". */
  hasOwnProfile?: boolean;
  /** true si tiene back-office al que volver (un rol DOCTOR no lo tiene). */
  canReturnToAdmin?: boolean;
}

export function DoctorViewBar({
  providers,
  currentId,
  isViewAs = true,
  hasOwnProfile = false,
  canReturnToAdmin = true,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);
  const [saving, setSaving] = React.useState(false);

  async function select(id: string): Promise<void> {
    if (!id || id === currentId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/doctor-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: id }),
      });
      if (!res.ok) return;
      startTransition(() => { router.refresh(); });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Volver a la propia agenda es BORRAR la cookie, no elegir su propio id: con la
   * cookie puesta `getSessionProvider` sigue resolviendo por selección, y si su
   * ficha se archiva quedaría viendo un perfil que ya no le corresponde.
   */
  async function exit(): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/doctor-view', { method: 'DELETE' });
      if (!res.ok) return;
      startTransition(() => { router.refresh(); });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-lg px-4 py-3 mb-4 flex items-center gap-3 flex-wrap ${
        isViewAs ? 'border border-amber/30 bg-amber/[0.07]' : 'bg-bg-1'
      }`}
    >
      <div className="flex items-center gap-2 shrink-0">
        {saving || isPending
          ? <Loader2 className={`w-4 h-4 animate-spin ${isViewAs ? 'text-amber' : 'text-text-muted'}`} />
          : <Eye className={`w-4 h-4 ${isViewAs ? 'text-amber' : 'text-text-muted'}`} />}
        <span className={`text-[12px] font-semibold ${isViewAs ? 'text-amber' : 'text-text-2'}`}>
          {isViewAs ? t('viewAsLabel') : t('viewAsSelfLabel')}
        </span>
      </div>
      <div className="flex-1 min-w-[220px]">
        <DoctorCombobox
          providers={providers}
          value=""
          onChange={(id) => void select(id)}
          placeholder={t('viewAsPlaceholder')}
        />
      </div>
      {isViewAs && <span className="text-[11px] text-text-muted">{t('viewAsHint')}</span>}
      {/* Volver a su propia agenda. Solo para quien tiene ficha: al resto la
          cookie es lo único que le da un portal, y borrarla lo dejaría en la
          pantalla de selección. */}
      {isViewAs && hasOwnProfile && (
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => void exit()} disabled={saving || isPending}>
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('viewAsBackToOwn')}
        </Button>
      )}
      {/* Única salida del portal: el sidebar violet apunta todo a /doctor y no
          tiene link al back-office. Vive acá y no en el shell del portal. Se
          esconde para los roles DOCTOR/PROVIDER: el middleware los devuelve a
          /doctor, así que el botón sería un callejón sin salida. */}
      {canReturnToAdmin && (
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/dashboard">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('backToAdmin')}
          </Link>
        </Button>
      )}
    </div>
  );
}
