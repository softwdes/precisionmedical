import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Stethoscope } from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { UpdateBanner } from '@/components/ui-phoenix/update-banner';
import { getSessionProvider, getDoctorViewInfo } from '@/lib/get-session-provider';
import { getSessionUser } from '@/lib/session';
import { NavigationProgressProvider } from '@/components/layout/navigation-progress';
import { DoctorViewBar } from './doctor-view-bar';

/**
 * Portal Médico · Layout (B.17–B.18 · identidad violet, Regla #5)
 *
 * Server Component: resuelve la sesión y el Provider vinculado.
 * El middleware ya garantiza que aquí solo llegan los doctores (perfil propio) y
 * quien tiene la capacidad "ver como doctor".
 */

export default async function DoctorLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  // Ambas están memorizadas por request (lib/session.ts) — el usuario se
  // resuelve una sola vez para todo el árbol, no una por componente.
  const [user, provider, viewInfo, t] = await Promise.all([
    getSessionUser(),
    getSessionProvider(),
    getDoctorViewInfo(),
    getTranslations('phoenix.doctor'),
  ]);
  if (!user) redirect('/login');

  // Sin doctor elegido todavía: en vez del cartel de "sin perfil", el selector
  // — puede entrar al portal de cualquier médico para soporte, demo o pruebas.
  if (!provider && viewInfo.isViewAs) {
    // NavigationProgressProvider es obligatorio: DoctorViewBar usa
    // useTransitionProgress (Regla #1) y ese hook lanza si no encuentra el
    // provider. Acá no hay AdminShell —todavía no sabemos qué doctor mostrar—
    // así que se envuelve a mano.
    return (
      <NavigationProgressProvider>
        <div className="min-h-screen bg-bg-0 flex items-center justify-center p-6">
          <div className="w-full max-w-lg">
            <div className="text-center mb-5">
              <Stethoscope className="w-12 h-12 text-violet-text mx-auto mb-3" />
              <div className="text-text-1 font-semibold">{t('viewAsPickTitle')}</div>
              <div className="text-text-2 text-sm mt-1">{t('viewAsPickSubtitle')}</div>
            </div>
            <DoctorViewBar
              providers={viewInfo.options}
              currentId=""
              hasOwnProfile={viewInfo.hasOwnProfile}
              canReturnToAdmin={viewInfo.canReturnToAdmin}
            />
          </div>
        </div>
      </NavigationProgressProvider>
    );
  }

  // Sin perfil de doctor vinculado y sin permisos de admin (cuenta mal configurada)
  if (!provider) {
    return (
      <div className="min-h-screen bg-bg-0 flex items-center justify-center p-6">
        <div className="rounded-lg border border-dashed border-border bg-bg-1/50 p-12 text-center max-w-md">
          <Stethoscope className="w-12 h-12 text-violet-text mx-auto mb-3" />
          <div className="text-text-1 font-semibold">{t('noProfileTitle')}</div>
          <div className="text-text-2 text-sm mt-1">{t('noProfileSubtitle')}</div>
        </div>
      </div>
    );
  }

  const initials = ((provider.firstName[0] ?? '') + (provider.lastName[0] ?? '')).toUpperCase();

  return (
    <>
      <UpdateBanner />
      <AdminShell
        variant="doctor"
        userName={`${provider.firstName} ${provider.lastName}`}
        userRole={viewInfo.isViewAs ? t('viewAsRole') : 'Doctor'}
        userInitials={initials}
        userEmail={provider.email}
      >
        {/* La barra sale con la CAPACIDAD, no con la suplantación: quien puede
            elegir médico tiene que poder hacerlo también cuando está en su propia
            agenda. Antes colgaba de `isViewAs` y un tester con ficha de doctor
            entraba a su portal sin ningún selector — la agenda propia era una
            trampa. En modo propio la barra va gris y sin el aviso ámbar. */}
        {viewInfo.canSelect && (
          <DoctorViewBar
            providers={viewInfo.options}
            currentId={provider.id}
            isViewAs={viewInfo.isViewAs}
            hasOwnProfile={viewInfo.hasOwnProfile}
            canReturnToAdmin={viewInfo.canReturnToAdmin}
          />
        )}
        {children}
      </AdminShell>
    </>
  );
}
