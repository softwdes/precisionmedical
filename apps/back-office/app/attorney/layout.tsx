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
import { menusFor, canSeeVigia } from '@/lib/attorney-portal';
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

/**
 * Bufetes con su gente, para el selector de "ver como".
 *
 * Dos consultas y no una por bufete: 21 despachos serían 21 viajes para armar
 * un desplegable.
 */
async function buildViewOptions(): Promise<FirmOption[]> {
  const [firms, members] = await Promise.all([
    /**
     * Primer nivel: bufetes de verdad y abogados independientes de verdad.
     *
     * `parentFirmId: null` a secas traía también las fichas HUÉRFANAS: personas
     * marcadas `FIRM_MEMBER` que se quedaron sin bufete padre. Aparecían como si
     * fueran despachos, con cero gente y cero casos, y elegirlas mostraba un
     * portal vacío.
     *
     * El caso que lo destapó: hay DOS "Sergio Garcia". El real es miembro de
     * Garcia Law con 69 casos pero está etiquetado `INDEPENDENT`; el huérfano
     * dice `FIRM_MEMBER`, no tiene padre y no tiene nada. Los enums están al
     * revés, así que el filtro NO puede confiar en `entityType` para decidir
     * quién es un despacho: se decide por tener `firmName` (es un bufete) o por
     * ser explícitamente independiente SIN padre.
     */
    db.lawyer.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        parentFirmId: null,
        OR: [
          { firmName: { not: null } },
          { entityType: 'INDEPENDENT' },
        ],
      },
      orderBy: [{ firmName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firmName: true, firstName: true, lastName: true },
    }),
    db.lawyer.findMany({
      where: { deletedAt: null, parentFirmId: { not: null } },
      orderBy: [{ memberRole: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true, firstName: true, lastName: true,
        memberRole: true, status: true, parentFirmId: true,
      },
    }),
  ]);

  const byFirm = new Map<string, FirmOption['members']>();
  for (const m of members) {
    if (!m.parentFirmId) continue;
    const list = byFirm.get(m.parentFirmId) ?? [];
    list.push({
      id: m.id,
      label: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || '—',
      role: m.memberRole,
      // Los inactivos se muestran marcados, no escondidos: sirven para probar
      // qué pasa cuando alguien deja el despacho.
      inactive: m.status !== 'ACTIVE',
    });
    byFirm.set(m.parentFirmId, list);
  }

  return firms.map((f) => ({
    id: f.id,
    label: f.firmName ?? (`${f.firstName ?? ''} ${f.lastName ?? ''}`.trim() || '—'),
    // Sin `firmName` no es un despacho sino un abogado independiente.
    isIndependent: !f.firmName,
    members: byFirm.get(f.id) ?? [],
  }));
}

export default async function AttorneyLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  const [user, lawyer, t] = await Promise.all([
    getSessionUser(),
    getSessionLawyer(),
    getTranslations('phoenix.attorney'),
  ]);
  if (!user) redirect('/login');

  const canView = user.email ? await canViewAsLawyer(user.email) : false;

  /**
   * Opciones del selector "ver como", en DOS niveles: bufete → persona.
   *
   * El de un solo nivel solo dejaba entrar como la cuenta del bufete, que ve
   * todo el despacho. Con eso era imposible comprobar qué ve un gestor de casos
   * o un asistente —justo los roles con el alcance recortado— y esa lógica
   * nunca se pudo verificar en pantalla.
   *
   * Los INDEPENDIENTES (sin bufete) van en su propio grupo: aparecían mezclados
   * entre los despachos y se leían como si fueran uno.
   */
  const options: FirmOption[] = canView ? await buildViewOptions() : [];

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
    // Vigía tiene su propia puerta mientras se construye — ver `canSeeVigia`.
    vigia:        canSeeVigia(lawyer, canView),
    cases:        menus.includes('cases'),
    users:        menus.includes('users'),
    appointments: menus.includes('appointments'),
  };

  // Tarjeta de oficina (F7). Las 5 clínicas que v2 muestra en el portal legal ya
  // tienen foto, horarios y web; "Murray - Surgery" no aparece en v2 y quedó sin
  // cargar a propósito — la tarjeta esconde los bloques vacíos.
  const clinicRows = await db.clinic.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, address: true, city: true, state: true, zipCode: true,
      photos: true, website: true, businessHours: true, isMainOffice: true,
    },
  });

  const clinics: OfficeClinic[] = clinicRows
    // Sin dirección no hay nada que mostrar: la tarjeta existe para decirle al
    // bufete DÓNDE atienden a su cliente. "Murray - Surgery" no tiene dirección
    // ni foto y ocupaba un lugar del carrusel con una tarjeta vacía — v2 tampoco
    // la muestra. El filtro es por dato y no por nombre: si algún día se le
    // carga la dirección, aparece sola.
    .filter((c) => !!c.address)
    .map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    city: c.city,
    state: c.state,
    zipCode: c.zipCode,
    photos: c.photos,
    website: c.website,
    isMainOffice: c.isMainOffice,
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
