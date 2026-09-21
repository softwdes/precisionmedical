'use client';
import { fecha, fechaCalendario, edad } from '@/lib/fechas';

/**
 * B.4 mockup · PatientDetailClient
 *
 * Ficha completa del paciente:
 *  - Header con avatar + nombre + status + edad
 *  - 3 KPIs: casos totales · casos activos · citas
 *  - InfoCards: Datos personales · Referido por
 *  - Historial de casos (todos los PhoenixCase del paciente)
 *
 * Llegás aquí desde ⌘K search, PreCallStep "Ver historial",
 * o (futuro) clic en nombre de paciente en la queue.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
// El diálogo de edición es el mismo que usa la lista de pacientes. Había una
// segunda implementación acá (más simple y ya divergida: seguía bloqueando el
// guardado por falta de tutor y no veía el vínculo real), y mantener dos
// formularios para la misma tabla garantizaba que cada arreglo se hiciera en uno
// solo — es la duplicación que ya nos pasó con calcAge y los generadores de código.
import { PatientEditDialog } from '../patient-edit-dialog';
import { ArchivosDialog, fotosDelCaso, fotosEliminadasDelCaso } from '@/components/patients/archivos-dialog';
import { ContactoCompartidoNota } from '@/components/patients/contacto-compartido-nota';
import { conCasoAbierto } from '@/lib/case-modal-url';
import { telefonoDe } from '@/lib/telefono-paciente';
import {
  ArrowLeft, Phone, Mail, Calendar, MapPin, Scale, FileText,
  User, Building2, ChevronRight, MessageSquare, ClipboardList,
  Cake, Hash, Clock, Stethoscope, DollarSign,
} from 'lucide-react';
import { Button } from '@precision/ui';
import {
  PageHeader,
  KpiCard,
  InfoCard,
  InfoRow,
  PersonAvatar,
  TagPill,
  EmptyState,
} from '@/components/ui-phoenix';
import { PastillaMembresia } from '@/components/membresias/pastilla-membresia';
import { useMembresia } from '@/components/membresias/use-membresia';
import {
  AvisoDeSaldo, AvisoProximaCita, type CitaDeAviso,
} from '@/components/patients/avisos-del-paciente';
import { MarcaCobro } from '@/components/patients/marca-cobro';

// ─── Tipos derivados del include de Prisma ────────────────────────────────────

type PatientStatus = 'NEW' | 'ACTIVE' | 'COMPLETED' | 'DISCHARGED' | 'INACTIVE';
type CaseStatus =
  | 'NEW_REFERRAL' | 'INTAKE_PENDING' | 'INTAKE_COMPLETED' | 'CONFIRMED'
  | 'ACTIVE' | 'MMI' | 'CLOSED' | 'SETTLED' | 'ARCHIVED' | 'CANCELLED';

interface PatientCase {
  id: string;
  caseCode: string;
  status: CaseStatus;
  caseType: string;
  accidentDate: Date | null;
  accidentType: string | null;
  accidentLocation: string | null;
  createdAt: Date;
  lawFirm: { id: string; firmName: string; paymentSpeed: string | null } | null;
  attorney: { id: string; firstName: string | null; lastName: string | null } | null;
  specialty: { id: string; name: string; color: string } | null;
  primaryInsurance: { id: string; name: string; shortCode: string; color: string } | null;
  _count: { notes: number; appointments: number };
  /**
   * Donde viven las fotos de identificación del paciente — `Patient` no tiene
   * columna de foto. El `include` de la página ya trae todos los escalares del
   * caso; solo faltaba declararlo acá. Ver `components/patients/archivos-dialog`.
   */
  consentsData?: unknown;
}

type AccidentType = 'AUTO' | 'MOTORCYCLE' | 'PEDESTRIAN' | 'WORKPLACE' | 'OTHER';

interface PatientData {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** El celular. Existía en la base y en el diálogo de edición; la ficha no lo
   *  miraba, así que quien solo tenía celular figuraba sin teléfono. */
  phone2: string | null;
  dateOfBirth: Date | null;
  status: PatientStatus;
  createdAt: Date;
  /** "No lo atiendan sin pasar por caja" — la marca de criterio de la clínica.
   *  Es la entrada de lo que avisa CIFO a la mañana; el saldo solo no alcanza
   *  (de $1.377.546 de deuda, $164,81 son del mostrador). Ver `MarcaCobro`. */
  collectBeforeVisit: boolean;
  collectBeforeVisitNote: string | null;
  preferredLanguage: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  accidentDate: Date | null;
  accidentType: AccidentType | null;
  insuranceCarrier: string | null;
  policyNumber: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelation: string | null;
  // El vínculo real al tutor; los tres de arriba son legado.
  guardianPatientId: string | null;
  guardianPatient: {
    id: string; patientCode: string | null;
    firstName: string; lastName: string;
    email: string | null; phone: string | null;
  } | null;
  lawyerReferrer: { id: string; firmName: string | null } | null;
  providerReferrer: { id: string; firstName: string; lastName: string } | null;
  /**
   * Contacto compartido en familia — alimenta el cartel bajo el correo y el
   * teléfono. Es OTRA cosa que `guardianPatient`: el tutor es la relación legal
   * de un menor con quien firma; esto es "usa el teléfono del papá".
   */
  contactOwnerId: string | null;
  contactRelation: string | null;
  sharesEmail: boolean;
  sharesPhone: boolean;
  contactAuthorizedAt: Date | string | null;
  contactOwner: {
    firstName: string; lastName: string;
    email: string | null; phone: string | null;
  } | null;
  cases: PatientCase[];
}

// ─── Status meta ─────────────────────────────────────────────────────────────

const PATIENT_STATUS_COLORS: Record<PatientStatus, { colorClass: string }> = {
  NEW:        { colorClass: 'bg-brand/10 text-brand-text border-brand/30' },
  ACTIVE:     { colorClass: 'bg-emerald/10 text-emerald border-emerald/30' },
  COMPLETED:  { colorClass: 'bg-cyan/10 text-cyan border-cyan/30' },
  DISCHARGED: { colorClass: 'bg-violet/10 text-violet-text border-violet/30' },
  INACTIVE:   { colorClass: 'bg-bg-2 text-text-muted border-border' },
};

const CASE_STATUS_COLORS: Record<string, { colorClass: string; dot: string }> = {
  NEW_REFERRAL:     { colorClass: 'bg-rose/10 text-rose border-rose/30',           dot: 'bg-rose' },
  INTAKE_PENDING:   { colorClass: 'bg-amber/10 text-amber border-amber/30',        dot: 'bg-amber' },
  INTAKE_COMPLETED: { colorClass: 'bg-cyan/10 text-cyan border-cyan/30',           dot: 'bg-cyan' },
  CONFIRMED:        { colorClass: 'bg-emerald/10 text-emerald border-emerald/30',  dot: 'bg-emerald' },
  ACTIVE:           { colorClass: 'bg-brand/10 text-brand-text border-brand/30',        dot: 'bg-brand' },
};

// ─── Component principal ──────────────────────────────────────────────────────

export function PatientDetailClient({
  patient, doctorMode = false, saldo = 0, proximaCita = null,
}: {
  patient: PatientData;
  doctorMode?: boolean;
  /** Lo que debe en el mostrador — ver `lib/saldo-de-mostrador`. */
  saldo?: number;
  /** La cita que viene. Los KPI de abajo cuentan las pasadas, no ésta. */
  proximaCita?: CitaDeAviso | null;
}) {
  /** Socio de la clínica: la misma pastilla que sale en el caso y al agendar. */
  const membresiaDelPaciente = useMembresia(patient.id);
  const t = useTranslations('phoenix.patients');
  /**
   * El botón de cobrar usa la MISMA clave que el botón de Finanzas al que
   * lleva (`sumCollect`: "Pay debts" / "Cobrar"), y no una propia.
   *
   * Son el mismo acto y tienen que decir lo mismo: con dos claves, un día
   * alguien cambia una y la clínica termina con dos nombres para lo mismo. Vive
   * en `phoenix.doctor` porque ahí nació; no se movió para no tocar las cuatro
   * pantallas que ya la usan.
   */
  const tCobro = useTranslations('phoenix.doctor');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Estadísticas del paciente
  const totalCases = patient.cases.length;
  const activeCases = patient.cases.filter(
    (c) => !['COMPLETED', 'DISCHARGED', 'INACTIVE'].includes(c.status)
  ).length;
  const totalAppointments = patient.cases.reduce((acc, c) => acc + c._count.appointments, 0);
  const totalNotes = patient.cases.reduce((acc, c) => acc + c._count.notes, 0);

  const age = edad(patient.dateOfBirth);

  /**
   * Fotos de identificación — las abre el propio avatar.
   *
   * Salen del caso MÁS RECIENTE porque ahí las guarda el endpoint (`Patient` no
   * tiene columna de foto). `patient.cases` ya viene ordenado por `createdAt`
   * descendente desde la página.
   */
  const [archivosOpen, setArchivosOpen] = useState(false);
  const casoReciente = patient.cases[0] ?? null;

  /**
   * El caso al que va el cobro: el último ACTIVO, y si no hay, el más reciente.
   *
   * No es una elección de comodidad — el cargo queda escrito en el caso que se
   * elija. Un cobro de mostrador de hoy pertenece al expediente que está
   * abierto, no al que se cerró hace dos años.
   */
  /**
   * La marca, en el cliente, para que el botón de cobrar se entere al toque.
   *
   * `patient.collectBeforeVisit` viene del servidor y no cambia hasta la
   * próxima carga, así que al marcar el recuadro rojo aparecía y el botón
   * "Cobrar" de al lado no — media tarjeta actualizada y media no, que es la
   * forma de que alguien concluya que algo falló. `MarcaCobro` avisa por
   * `onCambio` DESPUÉS de que el servidor confirmó: no hay estado optimista,
   * solo una forma de enterarse.
   */
  const [hayMarca, setHayMarca] = useState(patient.collectBeforeVisit);
  /**
   * Y se sincroniza cuando el SERVIDOR trae algo distinto — otra pestaña, una
   * recarga, o el `router.refresh()` que viene después de guardar.
   *
   * Sin esto, el botón sobrevivía 23 segundos a la marca que ya no estaba
   * (medido: el recuadro se iba a los 7,3 s y el botón a los 30,4 s).
   *
   * No reintroduce el parpadeo que temía: un payload viejo trae el valor que el
   * prop YA tenía, así que las deps no cambian y el effect no corre. Solo corre
   * con un valor distinto, que es justo el payload fresco.
   */
  useEffect(() => { setHayMarca(patient.collectBeforeVisit); }, [patient.collectBeforeVisit]);

  const CASOS_CERRADOS: CaseStatus[] = ['CLOSED', 'SETTLED', 'ARCHIVED', 'CANCELLED'];
  const casoParaCobrar =
    patient.cases.find(c => !CASOS_CERRADOS.includes(c.status))
    ?? casoReciente;
  const fotos = fotosDelCaso(casoReciente?.consentsData);
  const fotosEliminadas = fotosEliminadasDelCaso(casoReciente?.consentsData);

  const patientStatusColors = PATIENT_STATUS_COLORS[patient.status];
  const PATIENT_STATUS_LABEL_KEYS: Record<PatientStatus, string> = {
    NEW:        t('patientStatus.NEW'),
    ACTIVE:     t('patientStatus.ACTIVE'),
    COMPLETED:  t('patientStatus.COMPLETED'),
    DISCHARGED: t('patientStatus.DISCHARGED'),
    INACTIVE:   t('patientStatus.INACTIVE'),
  };
  const patientStatusLabel = PATIENT_STATUS_LABEL_KEYS[patient.status];

  return (
    <div className="space-y-6">

      {/* PageHeader */}
      <PageHeader
        title={
          <div className="flex items-center gap-3 flex-wrap">
            {/* El avatar es el botón para subir la foto — ver `PersonAvatar`.
                En el portal médico no: el doctor mira la ficha, no la carga. */}
            <PersonAvatar
              firstName={patient.firstName}
              lastName={patient.lastName}
              size={16}
              gradientClass="bg-gradient-brand"
              photoUrl={fotos.selfie ?? null}
              onEditPhoto={doctorMode ? undefined : () => setArchivosOpen(true)}
              editLabel={t('photoEdit')}
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>{patient.firstName} {patient.lastName}</span>
                <TagPill
                  label={patientStatusLabel}
                  colorClass={patientStatusColors.colorClass}
                />
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <code className="text-text-muted text-xs font-mono font-normal">{patient.patientCode}</code>
                {membresiaDelPaciente && <PastillaMembresia membresia={membresiaDelPaciente} />}
                {age !== null && (
                  <span className="text-text-muted text-xs font-normal flex items-center gap-1">
                    <Cake className="w-3 h-3" /> {t('ageYears', { age })}
                  </span>
                )}
                <span className="text-text-muted text-xs font-normal flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {t('registeredRelative', { relative: formatRelative(patient.createdAt, t) })}
                </span>
                {/* Los dos avisos, pegados al nombre y no en una tarjeta más
                    abajo: el que abre la ficha con el paciente enfrente tiene
                    que verlos ANTES de hacer cualquier otra cosa. */}
                <AvisoDeSaldo saldo={saldo} compacto />
                <AvisoProximaCita cita={proximaCita} compacto />
              </div>
            </div>
          </div>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              {t('actionBack')}
            </Button>
            {/* Llamar: el principal, y si no hay, el celular. Con `patient.phone`
                a secas el botón NO APARECÍA para quien sólo tiene celular —la
                mitad del padrón— y desde su propia ficha no había forma de
                llamarlo. Ver `lib/telefono-paciente`. */}
            {telefonoDe(patient) && (
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => window.open(`tel:${telefonoDe(patient)}`)}
              >
                <Phone className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">{t('actionCall')}</span>
              </Button>
            )}
            {/* La marca "cobrar antes de atender", que es lo que el v2 tenía en
                esa franja roja. Va en las acciones y no entre las pastillas de
                arriba porque es algo que se PONE, no que se lee. El componente
                es de la sesión de CIFO — acá solo se monta. */}
            {/* La marca la PONE recepción; el provider solo la lee. El prop
                sale de `doctorMode` y no de la página del portal porque esta
                ficha es la MISMA para los dos: montarlo dos veces sería tener
                dos lugares donde acordarse de esto. */}
            <MarcaCobro
              patientId={patient.id}
              activo={patient.collectBeforeVisit}
              nota={patient.collectBeforeVisitNote}
              soloLectura={doctorMode}
              onCambio={({ marcado }) => setHayMarca(marcado)}
            />
            {/**
              * Cobrar sin salir de la ficha.
              *
              * El aviso decía que había algo que cobrar y después te dejaba
              * solo: el modal de pago vive en el caso, en Finanzas, así que
              * había que salir de la ficha, abrir el caso y buscar el tab —
              * con el paciente enfrente. Esto abre ese mismo tab en un clic;
              * no es una pantalla nueva ni una segunda forma de cobrar.
              *
              * Aparece solo cuando hay MOTIVO (saldo o marca). Un botón de
              * cobrar en todas las fichas invita a cobrarle a los MVA, que es
              * justo lo que no hay que hacer: ahí paga el abogado.
              *
              * Lo abre quien esté en el mostrador en ese momento — decisión de
              * Erick, 2026-09-20: "el encargado de ese momento lo puede
              * procesar". Por eso tampoco se esconde en el portal del provider.
              */}
            {casoParaCobrar && (saldo > 0 || hayMarca) && (
              <Button
                variant="outline"
                className="shrink-0 border-rose/30 text-rose hover:bg-rose/10"
                onClick={() => router.push(
                  conCasoAbierto(pathname, searchParams, casoParaCobrar.id, 'finanzas'),
                  { scroll: false },
                )}
              >
                <DollarSign className="w-3.5 h-3.5 mr-1.5" />
                {tCobro('sumCollect')}
              </Button>
            )}
            <PatientEditDialog patient={patient} />
          </div>
        }
      />

      {/* Fotos de identificación — lo abre el avatar del encabezado */}
      {archivosOpen && (
        <ArchivosDialog
          patientId={patient.id}
          firstName={patient.firstName}
          lastName={patient.lastName}
          fotos={fotos}
          fotosEliminadas={fotosEliminadas}
          tieneCaso={!!casoReciente}
          onClose={() => setArchivosOpen(false)}
        />
      )}

      {/* KPIs strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label={t('kpiTotalCases')}       value={totalCases}        sub={t('kpiTotalCasesSub')}        color="text-brand-text" />
        <KpiCard label={t('kpiActiveCases')}      value={activeCases}       sub={t('kpiActiveCasesSub')}       color="text-emerald" />
        <KpiCard label={t('kpiTotalAppointments')} value={totalAppointments} sub={t('kpiTotalAppointmentsSub')} color="text-cyan" />
        <KpiCard label={t('kpiInternalNotes')}    value={totalNotes}        sub={t('kpiInternalNotesSub')}     color="text-violet-text" />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Datos personales */}
        <InfoCard title={t('sectionPersonalData')} icon={User}>
          <InfoRow
            label={t('fieldCode')}
            value={<code className="font-mono text-brand-text text-[11px]">{patient.patientCode}</code>}
          />
          <InfoRow
            label={t('fieldDob')}
            value={
              patient.dateOfBirth
                ? <span>{fechaCalendario(patient.dateOfBirth)}{age !== null ? <span className="text-text-muted ml-2">({t('ageYears', { age })})</span> : null}</span>
                : <span className="text-text-muted italic">{t('dobNotRegistered')}</span>
            }
          />
          {/* El cartel del contacto compartido va DENTRO del value, pegado al
              canal que explica — ver `ContactoCompartidoNota`. */}
          <InfoRow
            label={t('fieldPhone')}
            value={
              patient.phone
                ? <>
                    <a href={`tel:${patient.phone}`} className="text-brand-text hover:underline font-mono text-[12.5px]">{patient.phone}</a>
                    <ContactoCompartidoNota patient={patient} canal="PHONE" />
                  </>
                : <span className="text-text-muted italic">—</span>
            }
          />
          {/**
           * El CELULAR, que hasta hoy no se mostraba en ninguna parte de la
           * ficha.
           *
           * `phone2` existía en la base y en el diálogo de edición, pero la
           * ficha leía solo `phone`: un paciente que en el formulario dio
           * únicamente su celular aparecía acá con "—" y sin botón de llamar,
           * con el número cargado. Medido el 20-sep-2026: **38 de los 200
           * pacientes más recientes** están así —1 de cada 5—, y sobre el
           * padrón entero son 3.077 de 5.737.
           *
           * Va como fila propia y no reemplazando a la de arriba porque esto es
           * una FICHA: tiene que decir qué hay cargado y dónde, que es lo que
           * después se edita. Elegir uno solo es trabajo de `telefonoDe()`, y
           * eso es para llamar, no para mostrar el expediente.
           */}
          <InfoRow
            label={t('fieldPhone2')}
            value={
              patient.phone2
                ? <a href={`tel:${patient.phone2}`} className="text-brand-text hover:underline font-mono text-[12.5px]">{patient.phone2}</a>
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label={t('fieldEmail')}
            value={
              patient.email
                ? <>
                    <a href={`mailto:${patient.email}`} className="text-brand-text hover:underline text-[12.5px] break-all">{patient.email}</a>
                    <ContactoCompartidoNota patient={patient} canal="EMAIL" />
                  </>
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label={t('fieldStatus')}
            value={<TagPill label={patientStatusLabel} colorClass={patientStatusColors.colorClass} />}
          />
        </InfoCard>

        {/* Referido por */}
        <InfoCard title={t('sectionReferredBy')} icon={Scale}>
          <InfoRow
            label={t('fieldFirm')}
            value={
              patient.lawyerReferrer
                ? <span className="flex items-center gap-1.5"><Scale className="w-3 h-3 text-text-muted" />{patient.lawyerReferrer.firmName}</span>
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label={t('fieldProvider')}
            value={
              patient.providerReferrer
                ? `${patient.providerReferrer.firstName} ${patient.providerReferrer.lastName}`
                : <span className="text-text-muted italic">—</span>
            }
          />
          <InfoRow
            label={t('fieldRegistered')}
            value={<span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-text-muted" />{fecha(patient.createdAt)}</span>}
          />
          <InfoRow
            label={t('fieldTotalCases')}
            value={
              <span className="flex items-center gap-1 text-brand-text font-semibold">
                <Hash className="w-3 h-3" />{t('caseCount', { count: totalCases })}
              </span>
            }
          />
        </InfoCard>
      </div>

      {/* Historial de casos */}
      <InfoCard
        title={t('sectionCaseHistory')}
        icon={ClipboardList}
        rightSlot={
          <TagPill
            label={t('caseCount', { count: totalCases })}
            colorClass="bg-brand/10 text-brand-text border-brand/30"
            compact
          />
        }
      >
        {patient.cases.length === 0 ? (
          <EmptyState.Inline message={t('emptyCases')} />
        ) : (
          <div className="space-y-2 -mx-1">
            {patient.cases.map((c) => (
              <CaseRow
                key={c.id}
                case={c}
                /**
                 * El caso se abre COMO MODAL sobre la ficha, igual que en la
                 * lista: `?case=<id>` en esta misma URL. Había tres caminos
                 * para lo mismo —la lista abría el modal, la ficha del admin
                 * navegaba a `/front-office/<id>` (destino marcado como
                 * obsoleto) y la del portal a `/doctor/case/<id>`—, así que el
                 * mismo caso se veía de dos formas distintas según desde dónde
                 * lo tocaras, y volver atrás desde la página completa perdía la
                 * ficha. El alcance sigue en el server: `CaseUrlModal` revalida
                 * el caso contra la sesión antes de renderizar nada.
                 */
                onClick={() => router.push(conCasoAbierto(pathname, searchParams, c.id), { scroll: false })}
              />
            ))}
          </div>
        )}
      </InfoCard>

    </div>
  );
}

// ─── CaseRow — fila de caso dentro de la ficha del paciente ─────────────────

function CaseRow({ case: c, onClick }: { case: PatientCase; onClick?: () => void }) {
  const t = useTranslations('phoenix.patients');
  const stColors = CASE_STATUS_COLORS[c.status] ?? CASE_STATUS_COLORS.NEW_REFERRAL;
  const CASE_STATUS_LABEL_KEYS: Record<string, string> = {
    NEW_REFERRAL:     t('caseStatus.NEW_REFERRAL'),
    INTAKE_PENDING:   t('caseStatus.INTAKE_PENDING'),
    INTAKE_COMPLETED: t('caseStatus.INTAKE_COMPLETED'),
    CONFIRMED:        t('caseStatus.CONFIRMED'),
    ACTIVE:           t('caseStatus.ACTIVE'),
  };
  const stLabel = CASE_STATUS_LABEL_KEYS[c.status] ?? t('caseStatus.NEW_REFERRAL');
  const ageH = (Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
  const ageLabel = ageH < 1 ? t('ageMinutes') : ageH < 24 ? t('ageHours', { h: Math.floor(ageH) }) : t('ageDays', { d: Math.floor(ageH / 24) });

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-lg border border-border bg-bg-2/40 hover:bg-bg-2 hover:border-border-strong px-4 py-3 transition-all"
    >
      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">

        {/* Status dot + code */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${stColors.dot}`} />
          <code className="text-text-2 text-xs font-mono">{c.caseCode}</code>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <TagPill label={stLabel} colorClass={stColors.colorClass} compact />
            {c.specialty && (
              <TagPill
                label={c.specialty.name}
                colorClass="bg-bg-3 text-text-2 border-border"
                compact
                icon={<span className="w-1.5 h-1.5 rounded-full" style={{ background: c.specialty.color }} />}
              />
            )}
            {c.caseType && c.caseType !== 'MVA' && (
              <TagPill label={c.caseType} colorClass="bg-bg-3 text-text-2 border-border" compact />
            )}
          </div>

          <div className="flex items-center gap-x-4 gap-y-0.5 text-[11px] text-text-muted flex-wrap">
            {c.accidentDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />DOL: {fechaCalendario(c.accidentDate)}
              </span>
            )}
            {c.accidentLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />{c.accidentLocation}
              </span>
            )}
            {c.lawFirm && (
              <span className="flex items-center gap-1">
                <Scale className="w-3 h-3" />{c.lawFirm.firmName}
              </span>
            )}
            {c.primaryInsurance && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />{c.primaryInsurance.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />{t('noteCount', { count: c._count.notes })}
            </span>
            <span className="flex items-center gap-1">
              <Stethoscope className="w-3 h-3" />{t('appointmentCount', { count: c._count.appointments })}
            </span>
            <span className="ml-auto">{ageLabel}</span>
          </div>
        </div>

        {/* Chevron */}
        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-1 transition-colors shrink-0 self-center" />
      </div>
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────


type TFn = ReturnType<typeof useTranslations<'phoenix.patients'>>;

function formatRelative(d: Date | string, t: TFn): string {
  const h = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60);
  if (h < 1) return t('ageMinutes');
  if (h < 24) return t('ageHours', { h: Math.floor(h) });
  const days = Math.floor(h / 24);
  if (days < 30) return t('ageDays', { d: days });
  const months = Math.floor(days / 30);
  return t('ageMonths', { m: months });
}
