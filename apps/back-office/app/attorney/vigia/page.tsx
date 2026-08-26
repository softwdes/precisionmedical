import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Activity, FileSignature, CalendarDays, Timer, DollarSign, HeartPulse } from 'lucide-react';
import { db } from '@precision-medical/database';
import { PageHeader, KpiCard, TagPill } from '@/components/ui-phoenix';
import { CaseUrlModal } from '@/components/cases/case-url-modal';
import { getSessionLawyer, canViewAsLawyer } from '@/lib/get-session-lawyer';
import { getSessionUser } from '@/lib/session';
import { lawyerCaseFilter, canSeeVigia, ACTIVE_STATUSES } from '@/lib/attorney-portal';
import { ZONA_CLINICA } from '@/lib/fechas';
import { colaDeAtencion } from '@/lib/vigia/queue';
import { AskBox } from './ask-box';
import { QueuePanel } from './queue-panel';
import { AttentionCard } from './attention-card';

/**
 * Portal Legal · Vigía
 *
 * Saludo, el aviso del día, la caja de preguntar, los indicadores y la cola de
 * lo que necesita atención — en ese orden, que es el del mockup aprobado: lo que
 * hay que hacer primero, después los números.
 *
 * Los dos indicadores que siguen sin dato se MUESTRAN igual, en gris y diciendo
 * qué les falta, en vez de esconderse: el hueco es información —es el plan de lo
 * que sigue— y evita que alguien los dé por hechos al mirar la pantalla.
 *
 * El menú está detrás de `canSeeVigia` mientras dure la construcción, pero la
 * página vuelve a preguntar: esconder un link no impide escribir la URL.
 */

/** Los bordes de hoy en la zona de la clínica, no en la del servidor. */
function rangoDeHoy(): { desde: Date; hasta: Date } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = iso.split('-').map(Number);
  // El desfase real de esa fecha sale de cómo se ve el mediodía UTC en la zona
  // de la clínica: 6 horas en verano, 7 en invierno. Fijar uno rompe medio año.
  const tentativo = Date.UTC(y!, m! - 1, d!, 12, 0, 0);
  const horaLocal = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: ZONA_CLINICA, hour12: false, hour: '2-digit' })
      .formatToParts(new Date(tentativo))
      .find((p) => p.type === 'hour')?.value ?? '12',
  );
  const desde = new Date(Date.UTC(y!, m! - 1, d!, 12 - horaLocal, 0, 0));
  return { desde, hasta: new Date(desde.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Mañana / tarde / noche según la hora de la CLÍNICA.
 *
 * No la del servidor ni la del dispositivo: un abogado en otra zona vería
 * "buenas noches" a media mañana, y la clínica es el reloj que manda acá.
 */
function franjaDelDia(): 'Morning' | 'Afternoon' | 'Evening' {
  const hora = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: ZONA_CLINICA, hour12: false, hour: '2-digit' })
      .format(new Date()),
  );
  if (hora < 12) return 'Morning';
  if (hora < 19) return 'Afternoon';
  return 'Evening';
}

export default async function AttorneyVigiaPage({ searchParams }: {
  searchParams: Promise<{ case?: string; tab?: string }>;
}): Promise<React.ReactElement> {
  const [{ case: caseId, tab }, lawyer, user, t] = await Promise.all([
    searchParams,
    getSessionLawyer(),
    getSessionUser(),
    getTranslations('phoenix.attorney'),
  ]);
  if (!lawyer) return <></>;

  const isAdminViewer = user?.email ? await canViewAsLawyer(user.email) : false;
  if (!canSeeVigia(lawyer, isAdminViewer)) redirect('/attorney');

  const scope = lawyerCaseFilter(lawyer);
  const { desde, hasta } = rangoDeHoy();

  const [activeCases, pendingSignature, apptsToday, saldo, cola, alcance, ultimoCaso] = await Promise.all([
    db.case.count({ where: { ...scope, status: { in: ACTIVE_STATUSES as unknown as never[] } } }),
    // Mismo criterio que el Panel: falta la firma DEL ABOGADO, y los exentos no
    // cuentan. Si acá se contara distinto, los dos números del portal se
    // contradirían en la misma sesión.
    db.case.count({
      where: { ...scope, signatureExempt: false, lienSignatures: { none: { signerType: 'ATTORNEY' } } },
    }),
    db.appointment.count({
      where: { case: scope, scheduledFor: { gte: desde, lt: hasta }, status: { not: 'CANCELLED' } },
    }),
    // Sale de la misma consulta que usa la herramienta `metricas_del_bufete`:
    // el número del tablero y el que dice Vigía tienen que ser el mismo, o el
    // bufete deja de creerle a los dos.
    db.appointmentBilling.aggregate({
      _sum: { balanceDue: true },
      where: { appointment: { case: scope } },
    }),
    colaDeAtencion(lawyer),
    // El alcance completo, no solo los activos: es lo que Vigía puede leer.
    db.case.count({ where: scope }),
    // Un caso REAL para la sugerencia de ejemplo — ver abajo.
    db.case.findFirst({ where: scope, orderBy: { createdAt: 'desc' }, select: { caseCode: true } }),
  ]);

  /**
   * La sugerencia del caso usa un código REAL del alcance de quien mira.
   *
   * Antes decía "2026-0142", un código que inventé para el simulador y que no
   * existe en la base: al tocarlo, Vigía contestaba correctamente que ese caso
   * no está en su alcance, y parecía roto justo cuando estaba funcionando bien.
   * Se prefiere el primero de la cola —es del que además habla la tarjeta de
   * arriba— y si no hay cola, el caso más reciente. Sin ninguno, la sugerencia
   * no se ofrece: mejor tres que funcionan que cuatro con una trampa.
   */
  const casoEjemplo = cola.filas[0]?.caseCode ?? ultimoCaso?.caseCode ?? null;

  const saldoPendiente = Number(saldo._sum.balanceDue ?? 0);
  const saldoTexto = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(saldoPendiente);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('vigiaTitle')}
        subtitle={t('vigiaSubtitle', { firm: lawyer.firmName ?? '—' })}
        action={<TagPill label={t('vigiaBuilding')} colorClass="bg-amber/15 text-amber border-amber/30" />}
      />

      {/* El saludo y la conversación viven en una COLUMNA ANGOSTA y centrada.
          A todo el ancho, la caja de preguntar se leía como un buscador flaco
          pegado a los chips; contenida se lee como lo que es. Los indicadores y
          la cola siguen a ancho completo: son tabla, no conversación. */}
      <div className="mx-auto w-full max-w-[720px] space-y-4">
        <p className="text-2xl font-bold text-text-1 text-center pt-2">
          {t(`vigiaGreeting${franjaDelDia()}`, {
            nombre: lawyer.firstName ?? lawyer.firmName ?? '',
          })}
        </p>

        {/* Las sugerencias se arman en el servidor: el componente es de cliente
            y así no hay que llevarle el namespace de traducciones entero. */}
        <AskBox
          alcance={alcance}
          /* Se decide en el SERVIDOR: si no hay clave, la caja se muestra
             bloqueada desde el arranque en vez de dejar preguntar al vacío y
             fallar después del clic. La variable nunca cruza al cliente: viaja
             el booleano, no el valor. */
          configurado={!!process.env.OPENAI_API_KEY}
          sugerencias={[
            t('vigiaSuggest1'),
            t('vigiaSuggest2'),
            t('vigiaSuggest3'),
            ...(casoEjemplo ? [t('vigiaSuggest4', { caso: casoEjemplo })] : []),
          ]}
        />
      </div>

      <AttentionCard fila={cola.filas[0] ?? null} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          label={t('kpiActive')} value={activeCases} sub={t('kpiActiveSub')}
          color="text-brand-text" icon={Activity} iconBg="bg-brand/10" iconColor="text-brand-text"
        />
        <KpiCard
          label={t('kpiPendingSignature')} value={pendingSignature} sub={t('kpiPendingSignatureSub')}
          color="text-amber" icon={FileSignature} iconBg="bg-amber/10" iconColor="text-amber"
        />
        <KpiCard
          label={t('vigiaApptsToday')} value={apptsToday} sub={t('vigiaApptsTodaySub')}
          color="text-cyan" icon={CalendarDays} iconBg="bg-cyan/10" iconColor="text-cyan"
        />

        {/* Los tres que faltan. En gris y con el motivo — ver el comentario de
            arriba: el hueco es el plan, no un error. */}
        <KpiCard
          label={t('vigiaCycle')} value={t('vigiaSoon')} sub={t('vigiaCycleSub')}
          color="text-text-muted" icon={Timer} iconBg="bg-bg-2/60" iconColor="text-text-muted"
        />
        <KpiCard
          label={t('vigiaBalance')} value={saldoTexto} sub={t('vigiaBalanceLive')}
          color="text-emerald" icon={DollarSign} iconBg="bg-emerald/10" iconColor="text-emerald"
        />
        <KpiCard
          label={t('vigiaDischarges')} value={t('vigiaSoon')} sub={t('vigiaDischargesSub')}
          color="text-text-muted" icon={HeartPulse} iconBg="bg-bg-2/60" iconColor="text-text-muted"
        />
      </div>

      <QueuePanel
        total={cola.total}
        abandonados={cola.abandonados}
        filas={cola.filas.map((f) => ({
          caseId: f.caseId,
          caseCode: f.caseCode,
          motivo: f.motivo,
          diasSinCita: f.diasSinCita,
          diasAbierto: f.diasAbierto,
          sinFirma: f.agravantes.includes('LIEN_SIN_FIRMA'),
        }))}
      />

      {/* El mismo modal del Panel y de la lista, montado acá: los botones de
          Vigía abren el caso ENCIMA de esta pantalla en vez de mandarte a otra.
          Trae adentro el aviso de firma y el pad — no hace falta un botón
          "Firmar" aparte. */}
      <CaseUrlModal caseId={caseId} tab={tab} variant="attorney" />
    </div>
  );
}
