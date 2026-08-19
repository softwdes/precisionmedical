import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Scale } from 'lucide-react';
import { db } from '@precision-medical/database';
import { AdminShell } from '@/components/layout/admin-shell';
import { UpdateBanner } from '@/components/ui-phoenix/update-banner';
import { ReleaseNotesDialog } from '@/components/ui-phoenix/release-notes-dialog';
import { NavigationProgressProvider } from '@/components/layout/navigation-progress';
import { getSessionUser } from '@/lib/session';
import { getSessionLawyer, canViewAsLawyer, ATTORNEY_VIEW_COOKIE } from '@/lib/get-session-lawyer';
import { menusFor } from '@/lib/attorney-portal';
import { AttorneyViewBar, type FirmOption } from './attorney-view-bar';
import { OfficeCard, type OfficeClinic } from './office-card';
import { cookies } from 'next/headers';

/**
 * Portal Legal · Layout
 *
 * Server Component: resuelve la sesión y la ficha de abogado vinculada. El
 * middleware ya garantiza que acá solo llegan los LAWYER y los admins.
 *
 * Los menús salen de `menusFor()` y viajan como `allowedModules`, el mismo
 * mecanismo que gobierna los menús del staff interno — pero esconder un menú NO
 * es la protección: cada página filtra sus datos por sesión (`lawyerCaseFilter`).
 */

export default async function AttorneyLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  const [user, lawyer, t] = await Promise.all([
    getSessionUser(),
    getSessionLawyer(),
    getTranslations('phoenix.attorney'),
  ]);
  if (!user) redirect('/login');

  const canView = user.email ? await canViewAsLawyer(user.email) : false;

  // La lista se arma una sola vez: la usan el selector inicial Y la barra de
  // "viendo como", que sin ella no dejaría cambiar de despacho sin desloguearse.
  const options: FirmOption[] = canView
    ? (await db.lawyer.findMany({
        where: { deletedAt: null, status: 'ACTIVE', parentFirmId: null },
        orderBy: [{ firmName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firmName: true, firstName: true, lastName: true },
      })).map((f) => ({
        id: f.id,
        label: f.firmName ?? (`${f.firstName ?? ''} ${f.lastName ?? ''}`.trim() || '—'),
      }))
    : [];

  // Admin sin bufete elegido todavía: el selector, no un "sin acceso" que sería
  // falso. Mismo criterio que el portal médico.
  if (!lawyer && canView) {
    return (
      <NavigationProgressProvider>
        <div className="min-h-screen bg-bg-0 flex items-center justify-center p-6">
          <div className="w-full max-w-lg">
            <div className="text-center mb-5">
              <Scale className="w-12 h-12 text-brand-text mx-auto mb-3" />
              <div className="text-text-1 font-semibold">{t('viewAsPickTitle')}</div>
              <div className="text-text-2 text-sm mt-1">{t('viewAsPickSubtitle')}</div>
            </div>
            <AttorneyViewBar firms={options} currentId="" />
          </div>
        </div>
      </NavigationProgressProvider>
    );
  }

  // Cuenta con rol LAWYER pero sin ficha vinculada — mal configurada.
  if (!lawyer) {
    return (
      <div className="min-h-screen bg-bg-0 flex items-center justify-center p-6">
        <div className="rounded-lg border border-dashed border-border bg-bg-1/50 p-12 text-center max-w-md">
          <Scale className="w-12 h-12 text-brand-text mx-auto mb-3" />
          <div className="text-text-1 font-semibold">{t('noProfileTitle')}</div>
          <div className="text-text-2 text-sm mt-1">{t('noProfileSubtitle')}</div>
        </div>
      </div>
    );
  }

  // El mapa lleva `false` EXPLÍCITO en lo oculto: el sidebar filtra con
  // `!== false`, así que un menú ausente se vería igual.
  const menus = menusFor(lawyer);
  const allowedModules: Record<string, boolean> = {
    panel:        menus.includes('panel'),
    cases:        menus.includes('cases'),
    users:        menus.includes('users'),
    appointments: menus.includes('appointments'),
  };

  // Tarjeta de oficina (F7). Los campos `photos`/`website`/`businessHours` son
  // nuevos y hoy están vacíos: la tarjeta esconde cada bloque sin datos y va
  // apareciendo sola a medida que se carguen.
  const clinicRows = await db.clinic.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, address: true, city: true, state: true, zipCode: true,
      photos: true, website: true, businessHours: true,
    },
  });

  const clinics: OfficeClinic[] = clinicRows.map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    city: c.city,
    state: c.state,
    zipCode: c.zipCode,
    photos: c.photos,
    website: c.website,
    // `businessHours` es Json: puede traer cualquier forma. Se pasa solo si es
    // un objeto — un string o un array roto pintaría "undefined - undefined".
    hours:
      c.businessHours && typeof c.businessHours === 'object' && !Array.isArray(c.businessHours)
        ? (c.businessHours as OfficeClinic['hours'])
        : null,
  }));

  const isViewAs = !!(await cookies()).get(ATTORNEY_VIEW_COOKIE)?.value && canView;
  const displayName = lawyer.isFirmAccount
    ? (lawyer.firmName ?? t('roleFirm'))
    : `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim() || (lawyer.email ?? 'Miembro');
  const initials = displayName.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();

  return (
    <>
      <UpdateBanner audience="attorney" />
      <ReleaseNotesDialog />
      <AdminShell
        variant="attorney"
        userName={displayName}
        userRole={lawyer.isFirmAccount ? t('roleFirm') : t(`role${lawyer.memberRole ?? 'OTHER'}` as 'roleOTHER')}
        userInitials={initials || 'AB'}
        userEmail={lawyer.email ?? ''}
        allowedModules={allowedModules}
        sidebarBelowNav={<OfficeCard clinics={clinics} />}
      >
        {isViewAs && <AttorneyViewBar firms={options} currentId={lawyer.id} />}
        {children}
      </AdminShell>
    </>
  );
}
