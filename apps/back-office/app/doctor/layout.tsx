import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createServerClient } from '@precision-medical/auth/server';
import { Stethoscope } from 'lucide-react';
import { AdminShell } from '@/components/layout/admin-shell';
import { UpdateBanner } from '@/components/ui-phoenix/update-banner';
import { getSessionProvider } from '@/lib/get-session-provider';

/**
 * Portal Médico · Layout (B.17–B.18 · identidad violet, Regla #5)
 *
 * Server Component: resuelve la sesión y el Provider vinculado.
 * El middleware ya garantiza que solo PROVIDER / SUPER_ADMIN / ADMIN llegan aquí.
 */

export default async function DoctorLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const provider = await getSessionProvider();
  const t = await getTranslations('phoenix.doctor');

  // Sin perfil de doctor vinculado (ej. admin en soporte, o cuenta mal configurada)
  if (!provider) {
    return (
      <div className="min-h-screen bg-bg-0 flex items-center justify-center p-6">
        <div className="rounded-lg border border-dashed border-border bg-bg-1/50 p-12 text-center max-w-md">
          <Stethoscope className="w-12 h-12 text-violet mx-auto mb-3" />
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
        userRole="Doctor"
        userInitials={initials}
        userEmail={provider.email}
      >
        {children}
      </AdminShell>
    </>
  );
}
