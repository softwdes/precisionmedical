/**
 * F4 — Confirmación de cita firmada · vista de impresión / PDF
 *
 * Ruta: /print/appointment/[id]
 * Uso:  ícono de impresión del panel de la cita (modal con `iframe`) y Ctrl+P.
 *
 * Reemplaza el impreso del v2 ("Appointment confirmation"), con las mismas
 * secciones y tres cosas que ese no tiene:
 *
 *  · **El membrete real** (logo + dirección de la clínica de la cita).
 *  · **El hash SHA-256 de la firma** y la cláusula ESIGN/UETA, que es lo que
 *    convierte el papel en evidencia y no en un adorno.
 *  · **La especialidad de verdad.** El v2 imprime "Specialty: N/D" teniéndola
 *    en pantalla; acá sale de la del CASO, que es la que se agendó.
 *
 * Y dos correcciones sobre el impreso que ya existía en `apps/clinical`:
 * el botón de imprimir es un client component (ver `PrintButton`), y la cláusula
 * legal NO afirma el medio — con el QR la firma puede venir del teléfono del
 * paciente, no de "una tablet en las instalaciones de la clínica".
 */

import { getLocale, getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { calcAge } from '@precision-medical/database/age';
import { nombreProvider } from '@/lib/provider-name';
import { PrintButton } from '@/components/ui-phoenix/print-button';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ id: string }>;
  /** `embed=1` cuando el documento se muestra dentro del modal del panel. */
  searchParams: Promise<{ embed?: string }>;
};

const ZONA = 'America/Denver';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const appt = await db.appointment.findUnique({
    where:  { id },
    select: { patient: { select: { firstName: true, lastName: true } } },
  });
  const t = await getTranslations('phoenix.appointmentPrint');
  const quien = appt ? `${appt.patient.lastName}, ${appt.patient.firstName}` : id;
  // `absolute` se salta el template del layout raíz: este título es el nombre con
  // el que se guarda el PDF, no una pestaña.
  return { title: { absolute: `${t('docTitle')} · ${quien}` } };
}

export default async function AppointmentPrintPage({ params, searchParams }: Props) {
  const { id }    = await params;
  const { embed } = await searchParams;
  const t      = await getTranslations('phoenix.appointmentPrint');
  const locale = await getLocale();
  const loc    = locale === 'es' ? 'es-US' : 'en-US';

  const appt = await db.appointment.findUnique({
    where: { id },
    select: {
      id: true,
      scheduledFor: true,
      durationMinutes: true,
      attendanceSignedAt: true,
      attendanceSignatureSvg: true,
      attendanceSignatureHash: true,
      patient: {
        select: {
          firstName: true, lastName: true, patientCode: true,
          dateOfBirth: true, sex: true, phone: true, phone2: true, email: true,
        },
      },
      provider: { select: { firstName: true, lastName: true, specialty: true } },
      clinic:   { select: { name: true, address: true, city: true, state: true, zipCode: true, phone: true, email: true } },
      case: {
        select: {
          caseCode: true, caseType: true, status: true, createdAt: true,
          specialty: { select: { name: true } },
        },
      },
    },
  });

  if (!appt) return <Aviso titulo={t('notFoundTitle')} cuerpo={t('notFoundBody')} />;

  // Sin firma no hay documento que imprimir. Se explica en vez de devolver un
  // 404, que se lee como pantalla rota: el caso real es que todavía no firmó.
  if (!appt.attendanceSignedAt) {
    return <Aviso titulo={t('notSignedTitle')} cuerpo={t('notSignedBody')} />;
  }

  // Quién firmó sale del AuditLog: la cita guarda la firma, no el firmante.
  const auditoria = await db.auditLog.findFirst({
    where:   { entityId: id, action: 'PATIENT_SIGN_ATTENDANCE' },
    orderBy: { createdAt: 'desc' },
    select:  { metadata: true },
  });
  const meta        = (auditoria?.metadata ?? null) as { signerName?: string; signerType?: string } | null;
  const firmante    = meta?.signerName ?? `${appt.patient.firstName} ${appt.patient.lastName}`.trim();
  const esApoderado = meta?.signerType === 'GUARDIAN';

  const fFecha = (d: Date | null) => d
    ? new Date(d).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA })
    : '—';
  const fHora = (d: Date) => new Date(d).toLocaleTimeString(loc, {
    hour: 'numeric', minute: '2-digit', timeZone: ZONA,
  });
  const fFechaHora = (d: Date) => `${fFecha(d)} · ${fHora(d)}`;

  /**
   * La fecha de nacimiento se lee en UTC y sin zona: con `America/Denver` un
   * nacido el 1-ene sale 31-dic.
   */
  const fNacimiento = (d: Date | null) => {
    if (!d) return '—';
    const [y, m, dd] = d.toISOString().slice(0, 10).split('-');
    return locale === 'es' ? `${dd}/${m}/${y}` : `${m}/${dd}/${y}`;
  };

  const edad = calcAge(appt.patient.dateOfBirth);
  const sexo = appt.patient.sex ? t(`sex.${appt.patient.sex}` as 'sex.MALE') : '—';

  /**
   * Especialidad de la visita: primero la del CASO, que es la que se agendó.
   * Si el caso no tiene ninguna —pasa en los migrados y en los GM cargados a
   * mano— cae a la del provider, que es informativa y mejor que un guion. El
   * enum viene en MAYÚSCULAS (`FAMILY_PRACTICE`) y en un documento impreso eso
   * se lee como un error, así que se acomoda.
   */
  const bonito = (v: string) =>
    v.toLowerCase().split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  const especialidad = appt.case?.specialty?.name
    ?? (appt.provider?.specialty ? bonito(appt.provider.specialty) : null);

  const direccion = [appt.clinic.address, appt.clinic.city, appt.clinic.state, appt.clinic.zipCode]
    .filter(Boolean).join(', ');

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .hoja { max-width: 820px; margin: 0 auto; padding: 40px 48px; }
        .membrete { display: flex; justify-content: space-between; align-items: flex-start;
          gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 26px; }
        .membrete img { height: 62px; width: auto; }
        .clinica { text-align: right; font-size: 11px; line-height: 1.7; color: #444; }
        .clinica strong { display: block; font-size: 14px; color: #0f172a; margin-bottom: 2px; }
        h1 { font-size: 21px; font-weight: bold; text-align: center; color: #0f172a; margin-bottom: 26px; }
        .seccion { margin-bottom: 22px; }
        .seccion h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
          font-weight: bold; color: #555; border-bottom: 1px solid #ddd;
          padding-bottom: 4px; margin-bottom: 10px; }
        .campos { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 32px; }
        .campo { font-size: 13px; }
        .campo span { color: #555; }
        .campo b { color: #111; font-weight: bold; }
        .declaracion { font-size: 13px; line-height: 1.7; color: #111;
          margin: 30px 0 18px; text-align: center; }
        .firma { text-align: center; margin-bottom: 8px; }
        .firma img { max-width: 320px; max-height: 130px; }
        .firma .linea { border-bottom: 1px solid #111; width: 320px; margin: 0 auto 6px; }
        .firma .pie { font-size: 12px; color: #333; }
        .sello { margin-top: 16px; font-size: 10px; color: #777; line-height: 1.7; text-align: center; }
        .hash { font-family: monospace; font-size: 9px; color: #999; word-break: break-all; }
        .legal { margin-top: 26px; background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 4px; padding: 12px 16px; font-size: 10.5px; color: #555; line-height: 1.7; }
        .footer { margin-top: 26px; border-top: 1px solid #ddd; padding-top: 12px;
          font-size: 10px; color: #888; text-align: center; }
        @media print {
          .no-print { display: none !important; }
          .hoja { padding: 18px 30px; }
        }
      `}</style>

      {/* Embebido en el modal la acción de imprimir vive en su cabecera; dos
          botones iguales a 40px de distancia no ayudan a nadie. */}
      {embed !== '1' && <PrintButton label={t('printAction')} />}

      <div className="hoja">
        <div className="membrete">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-pm.png" alt="Precision Medical" />
          <div className="clinica">
            <strong>{appt.clinic.name}</strong>
            {direccion && <div>{direccion}</div>}
            {appt.clinic.email && <div>{appt.clinic.email}</div>}
            {appt.clinic.phone && <div>{t('tel')}: {appt.clinic.phone}</div>}
          </div>
        </div>

        <h1>{t('docTitle')}</h1>

        <div className="seccion">
          <h2>{t('patientSection')}</h2>
          <div className="campos">
            <Campo label={t('fieldName')} valor={`${appt.patient.firstName} ${appt.patient.lastName}`} />
            <Campo label={t('fieldPhone')} valor={appt.patient.phone} />
            <Campo label={t('fieldSex')} valor={sexo} />
            <Campo label={t('fieldMobile')} valor={appt.patient.phone2} />
            <Campo
              label={t('fieldDob')}
              valor={`${fNacimiento(appt.patient.dateOfBirth)}${edad != null ? ` (${t('yearsOld', { n: edad })})` : ''}`}
            />
            <Campo label={t('fieldEmail')} valor={appt.patient.email} />
            <Campo label={t('fieldPatientCode')} valor={appt.patient.patientCode} />
          </div>
        </div>

        {appt.case && (
          <div className="seccion">
            <h2>{t('caseSection')}</h2>
            <div className="campos">
              <Campo label={t('fieldCaseId')} valor={appt.case.caseCode} />
              <Campo label={t('fieldCaseType')} valor={appt.case.caseType} />
              <Campo label={t('fieldCaseStatus')} valor={appt.case.status} />
              <Campo label={t('fieldCaseCreated')} valor={fFecha(appt.case.createdAt)} />
            </div>
          </div>
        )}

        <div className="seccion">
          <h2>{t('apptSection')}</h2>
          <div className="campos">
            <Campo label={t('fieldClinic')} valor={appt.clinic.name} />
            <Campo label={t('fieldSpecialty')} valor={especialidad} />
            <Campo label={t('fieldApptDate')} valor={fFecha(appt.scheduledFor)} />
            <Campo label={t('fieldApptTime')} valor={fHora(appt.scheduledFor)} />
            <Campo label={t('fieldProvider')} valor={nombreProvider(appt.provider)} />
            <Campo label={t('fieldDuration')} valor={t('minutes', { n: appt.durationMinutes })} />
          </div>
        </div>

        <p className="declaracion">{t('confirmLine')}</p>

        <div className="firma">
          {appt.attendanceSignatureSvg
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={appt.attendanceSignatureSvg} alt={t('signatureAlt')} />
            : <div style={{ height: 70 }} />}
          <div className="linea" />
          {/* Quién firmó, no "el paciente" a secas: si firmó el apoderado, decir
              paciente sería falso en un documento que se usa como evidencia. */}
          <div className="pie">{esApoderado ? t('signatureGuardian') : t('signaturePatient')}</div>
        </div>

        <div className="sello">
          <div><b>{firmante}</b> · {t('signedAt')} {fFechaHora(appt.attendanceSignedAt)}</div>
          {appt.attendanceSignatureHash && (
            <div className="hash">{t('hashLabel')}: {appt.attendanceSignatureHash}</div>
          )}
        </div>

        <div className="legal">{t('legalNotice')}</div>

        <div className="footer">{t('footerLine', { generated: fFechaHora(new Date()) })}</div>
      </div>
    </>
  );
}

function Campo({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div className="campo">
      <span>{label}: </span>
      <b>{valor?.trim() ? valor : '—'}</b>
    </div>
  );
}

/** Pantalla de una línea para los dos casos sin documento (no existe / sin firma). */
function Aviso({ titulo, cuerpo }: { titulo: string; cuerpo: string }) {
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: '90px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 'bold', color: '#0f172a', marginBottom: 10 }}>{titulo}</div>
      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>{cuerpo}</div>
    </div>
  );
}
