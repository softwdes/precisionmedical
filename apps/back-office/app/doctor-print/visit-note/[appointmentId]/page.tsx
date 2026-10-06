/**
 * Portal Médico · Nota clínica imprimible (N3)
 *
 * Ruta:   /doctor-print/visit-note/[appointmentId]
 * Acceso: el doctor dueño de la cita (o ADMIN/SUPER_ADMIN en soporte).
 * Uso:    botón "Imprimir" de la nota firmada → se abre en el visor
 *         (`VisitNotePrintDialog`), NO en otra pestaña. Salir de la pantalla
 *         donde se está trabajando para volver cerrando una pestaña era el
 *         reclamo; y la orden de laboratorio ya abría en modal, así que la
 *         misma acción se comportaba de dos maneras (Erick, 2026-09-07).
 *
 * Server-rendered y sin dependencias de JS para el contenido. Para IMPRIMIR hay
 * que usar el botón de la hoja: llama a `window.print()` desde adentro del
 * iframe y sale el documento solo. El Ctrl+P del usuario imprime el documento de
 * nivel superior —la app con el modal encima— y por eso la pista de Ctrl+P se
 * quitó de la barra (ver el comentario largo más abajo).
 *
 * Los honorarios NO aparecen — el doctor no ve pagos (los servicios se listan
 * solo como acto clínico).
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { fechaCalendario, edad } from '@/lib/fechas';
import { db, VIGENTES } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { safeHtml, hasText } from '@/lib/safe-html';
import { getSectionLabelOverrides, sectionLabelFrom } from '@/lib/section-labels';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { nombreProvider } from '@/lib/provider-name';

type Props = { params: Promise<{ appointmentId: string }> };

const TZ = 'America/Denver';

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { appointmentId } = await params;
  const a = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { scheduledFor: true, patient: { select: { firstName: true, lastName: true } } },
  });
  const t = await getTranslations('phoenix.pageTitles');
  if (!a) return { title: { absolute: t('clinicalNote') } };
  const name = `${dec(a.patient.lastName) ?? ''}, ${dec(a.patient.firstName) ?? ''}`;
  const date = a.scheduledFor.toLocaleDateString('en-CA', { timeZone: TZ });
  return { title: { absolute: `${t('clinicalNote')} — ${name} — ${date}` } };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | null | undefined, locale: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ,
  });
}

function fmtDateTime(d: Date | null | undefined, locale: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

/**
 * Nacimiento y fecha del accidente son fechas de CALENDARIO: van sin zona, a
 * diferencia de `fmtDate`, que fija America/Denver porque formatea instantes
 * (la hora de la cita). Con la zona puesta, un nacimiento guardado a medianoche
 * UTC se imprimía con el día anterior — y esto sale impreso de la clínica.
 * Ver lib/fechas.ts.
 */
function fmtCalendar(d: Date | string | null | undefined, locale: string): string {
  return fechaCalendario(d, locale === 'en' ? 'en-US' : 'es-US');
}


interface PlannedService {
  id?: string;
  code?: string;
  description?: string;
  category?: string;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function VisitNotePrintPage({ params }: Props): Promise<React.ReactElement> {
  const { appointmentId } = await params;
  const t = await getTranslations('phoenix.doctor');
  const tSpec = await getTranslations('providers.specialties');
  const locale = await getLocale();

  /**
   * IMPRIMIR es tan ancho como LEER. Decisión de Erick, 2026-10-06.
   *
   * Esta página tenía su propio guard —`canViewAsDoctor || canAuditNotesFor`, o
   * ser el provider dueño— y era MÁS ESTRECHO que el permiso de abrir la nota en
   * pantalla. Resultado: recepción leía la nota entera, veía el botón "Print the
   * note" (que se muestra con mirar sólo si está firmada) y recibía "Document
   * not available". Medido: **17 cuentas EMPLOYEE** quedaban de ese lado, que son
   * justo quienes imprimen para el bufete y el seguro.
   *
   * Y no protegía nada: quien ya tiene la nota a la vista no gana acceso a nada
   * nuevo al imprimirla.
   *
   * Ahora usa `checkAppointmentAccess`, **el mismo resolvedor que la API que
   * sirve la nota** (`/api/admin/visit-notes/[id]`), con sus cuatro ramas: el
   * doctor de la cita, los admins, quien audita notas y el staff del
   * back-office. Un solo lugar decide quién puede ver una nota, y la impresión
   * deja de ser una regla aparte que se desincroniza.
   *
   * El propio comentario de `appointment-access.ts` ya avisaba que este callejón
   * —ver la lista y no poder abrir— había habido que destaparlo antes "en la
   * vista de impresión y en el modal de caso". Esta es la tercera vez.
   */
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) notFound();

  const a = await db.appointment.findFirst({
    where: { ...VIGENTES, id: appointmentId },
    select: {
      id: true,
      scheduledFor: true,
      type: true,
      patient: {
        select: { firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true },
      },
      provider: {
        select: { firstName: true, lastName: true, specialty: true, licenseNumber: true },
      },
      clinic: {
        select: { name: true, address: true, city: true, state: true, zipCode: true, phone: true },
      },
      case: {
        select: {
          // `caseType` decide QUÉ logo va en el membrete — ver `marcaDelCaso`.
          caseType: true,
          caseCode: true, accidentDate: true, accidentType: true,
          primaryPolicyNumber: true,
          primaryInsurance: { select: { name: true } },
          attorney: { select: { firstName: true, lastName: true } },
          lawFirm: { select: { firmName: true } },
        },
      },
      triageRecord: true,
      plannedServiceCodes: true,
      visitNote: {
        include: {
          diagnoses: { orderBy: { sortOrder: 'asc' } },
          // Los addenda son PARTE del documento: lo que se agregó después de
          // firmar. Una nota impresa sin ellos es una nota incompleta, y es la
          // copia que va al bufete y al seguro.
          addenda: { orderBy: { numero: 'asc' } },
        },
      },
    },
  });

  if (!a || !a.visitNote) notFound();

  const note = a.visitNote;
  const isSigned = note.status === 'SIGNED';
  const tr = a.triageRecord;
  const pa = edad(a.patient.dateOfBirth);

  // Vitales: fuente principal es el triaje del MA; la nota los conserva si el
  // doctor los ajustó al firmar.
  const v = {
    heightFt: tr?.heightFt ?? note.heightFt,
    heightIn: tr?.heightIn ?? note.heightIn,
    heightCm: tr?.heightCm ?? note.heightCm,
    weightLbs: tr?.weightLbs ?? note.weightLbs,
    weightKg: tr?.weightKg ?? note.weightKg,
    systolic: tr?.systolicMmhg ?? note.systolicMmhg,
    diastolic: tr?.diastolicMmhg ?? note.diastolicMmhg,
    pulse: tr?.pulseBpm ?? note.pulseBpm,
    resp: tr?.respiratoryRate ?? note.respRate,
    tempF: tr?.tempFahrenheit ?? note.tempFahrenheit,
    tempC: tr?.tempCelsius ?? note.tempCelsius,
    pain: tr?.painScale ?? note.painScale,
    o2: tr?.o2Saturation ?? note.o2Saturation,
    onRoomAir: tr?.onRoomAir ?? note.onRoomAir,
    visionR: tr?.visualAcuityRight ?? null,
    visionL: tr?.visualAcuityLeft ?? null,
  };

  const vitals: Array<[string, string]> = [
    [t('vitHeight'), v.heightFt != null ? `${v.heightFt}'${v.heightIn ?? 0}"${v.heightCm != null ? ` · ${v.heightCm} cm` : ''}` : ''],
    [t('vitWeight'), v.weightLbs != null ? `${v.weightLbs} lb${v.weightKg != null ? ` · ${v.weightKg} kg` : ''}` : ''],
    [t('vitBP'), v.systolic != null && v.diastolic != null ? `${v.systolic}/${v.diastolic} mmHg` : ''],
    [t('vitPulse'), v.pulse != null ? `${v.pulse} bpm` : ''],
    [t('vitResp'), v.resp != null ? `${v.resp}/min` : ''],
    [t('vitTemp'), v.tempF != null ? `${v.tempF} °F${v.tempC != null ? ` · ${v.tempC} °C` : ''}` : ''],
    [t('vitPain'), v.pain != null ? `${v.pain}/10` : ''],
    [t('vitO2'), v.o2 != null ? `${v.o2}%${v.onRoomAir ? ` · ${t('roomAir')}` : ''}` : ''],
    [t('vitVision'), v.visionR || v.visionL ? `${t('fRight')} ${v.visionR ?? '—'} · ${t('fLeft')} ${v.visionL ?? '—'}` : ''],
  ].filter((row): row is [string, string] => row[1] !== '');

  // Los títulos de sección con el nombre propio que haya puesto el admin (el
  // mismo que ve el provider en la nota), o el por defecto.
  const secOverrides = await getSectionLabelOverrides();
  const sec = (key: string): string => sectionLabelFrom(secOverrides, key, locale, t(`sec_${key}`));
  const SOAP: Array<[string, string | null]> = [
    [sec('QUEJA_PRINCIPAL'), note.chiefComplaint],
    [sec('HPI'), note.hpi],
    [sec('ROS'), note.ros],
    [sec('EXAMEN_FISICO'), note.physicalExam],
    [sec('EVALUACIONES'), note.assessment],
    [sec('PLAN'), note.plan],
  ];
  const soapFilled = SOAP.filter(([, c]) => hasText(c));

  const services = ((a.plannedServiceCodes ?? []) as PlannedService[]).filter((s) => s.code);

  // Varias clínicas guardan la dirección completa en `address` (incluye ciudad y
  // ZIP); solo se compone cuando el ZIP no viene ya dentro del texto.
  const addr = a.clinic.address?.trim() ?? '';
  const zip = a.clinic.zipCode ?? '';
  const clinicLine = (addr && zip && addr.includes(zip)
    ? [addr]
    : [addr, [a.clinic.city, a.clinic.state].filter(Boolean).join(', '), zip]
  ).filter(Boolean).join(' · ');

  const specialty = a.provider?.specialty ? tSpec(a.provider.specialty) : '—';

  /**
   * EL ACENTO DEL PAPEL, en un solo lugar.
   *
   * Devin, 2026-10-05: *"proceed as you recommended with the logo with the same
   * accent color the other documents use"*. La hoja venía en violeta
   * (`#6d28d9`/`#5b21b6`), que es el color del MÓDULO del doctor en pantalla
   * —B.17/B.18— y el único de la familia impresa que no coincidía con nada: la
   * confirmación de cita usa `#0f172a`, el paquete de admisión `#1E4D8C` y la
   * requisición de LabCorp `#1F3A6E`.
   *
   * Se adopta el azul del paquete de admisión: es el documento PROPIO de la
   * clínica que ve el paciente, y es un acento de verdad —el `#0f172a` de la
   * confirmación es casi negro—. La requisición no sirve de guía porque imita a
   * propósito el formulario de LabCorp, que no es nuestro.
   *
   * Los tonos claros son la traducción de los violetas que había, conservando la
   * misma relación de claridad para no alterar el peso visual de la hoja.
   */
  /**
   * QUÉ MARCA va en el membrete. Devin, 2026-10-05: *"for telemed the logo will
   * likely be the Precision Medical Urgent Care and Family Practice Logo but
   * that will just be determined by whether it's an MVA case or a GM case"*.
   *
   * O sea: **lo decide el TIPO DE CASO, no la sede**. Un accidente de tránsito
   * sale con Pain Management and Orthopedics; lo demás, con Urgent Care and
   * Family Practice. Una visita de telemedicina de un caso MVA lleva la de Pain
   * Management, aunque "telemedicina" suene a medicina general.
   *
   * Sin caso —una visita suelta— cae en Urgent Care, que es la marca general de
   * la clínica.
   */
  const esMVA = a.case?.caseType === 'MVA';
  const marcaDelCaso = esMVA
    ? { src: '/logo-pm-pain-management.png', alt: 'Precision Medical Pain Management and Orthopedics' }
    : { src: '/logo-pm.png', alt: 'Precision Medical Urgent Care and Family Practice' };

  const ACENTO = '#1E4D8C';
  const ACENTO_OSC = '#163A63';
  const BORDE_CITA = '#CFE0F3';
  const FONDO_TH = '#F2F6FB';
  const FONDO_CITA = '#FAFCFE';
  const LINEA_SUAVE = '#DCE7F4';
  const LINEA_TENUE = '#E8EFF7';

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-size:11pt;line-height:1.45}
    .wrap{max-width:900px;margin:0 auto;padding:0 24px 48px}
    .doc{max-width:780px;margin:0 auto}

    /* Barra de acciones (no se imprime) */
    .pbar{background:#f6f5fa;border-bottom:1px solid #e3e0ec;padding:10px 24px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:sticky;top:0;z-index:10;margin-bottom:24px}
    .pbar button{padding:9px 18px;background:${ACENTO};color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .pbar span{font-size:11px;color:#6b7280}

    /* Membrete. El logo y el bloque de la sede van juntos a la izquierda; a la
       derecha siguen el título, la fecha y el sello. Mismo patrón que la
       confirmación de cita, que es el único membrete que ya existía. */
    .lh{border-bottom:2px solid ${ACENTO};padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
    .lhl{display:flex;align-items:flex-start;gap:14px;min-width:0}
    .lhl img{height:52px;width:auto;flex-shrink:0}
    .cn{font-size:17pt;font-weight:bold;color:${ACENTO_OSC};line-height:1.2}
    .cs{font-size:8.5pt;color:#555;margin-top:3px}
    .dt{font-size:12.5pt;font-weight:bold;text-align:right;color:#333;letter-spacing:.04em}
    .ds{font-size:8.5pt;color:#555;text-align:right;margin-top:2px}
    .badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:8.5pt;font-weight:bold;margin-top:5px}
    .signed{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
    .draft{background:#fffbeb;color:#b45309;border:1px solid #fde68a}

    /* Aviso de borrador */
    .warn{margin-bottom:16px;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:5px;font-size:9pt;color:#92400e}

    /* Grid de datos */
    .igrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px}
    .ibox{border:1px solid #e5e7eb;border-radius:5px;padding:8px 10px}
    .ibt{font-size:7.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.09em;color:${ACENTO};margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid ${LINEA_TENUE}}
    .irow{display:flex;justify-content:space-between;gap:10px;font-size:9pt;margin-top:3px}
    .il{color:#6b7280;white-space:nowrap}
    .iv{font-weight:600;color:#111;text-align:right}
    .mono{font-family:'Courier New',monospace;font-weight:bold}

    /* Títulos de sección */
    .stitle{font-size:9.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.09em;color:${ACENTO};margin:18px 0 6px;padding-bottom:3px;border-bottom:1px solid ${LINEA_SUAVE}}

    /* Tablas */
    table{width:100%;border-collapse:collapse;font-size:9pt}
    th{background:${FONDO_TH};color:${ACENTO_OSC};text-align:left;padding:5px 8px;font-size:8pt;font-weight:700;letter-spacing:.04em;border:1px solid ${LINEA_SUAVE}}
    td{padding:5px 8px;border:1px solid #eee;vertical-align:top}
    .vtab td{text-align:center;font-weight:600}
    .vtab th{text-align:center}

    /* SOAP */
    .ss{margin-bottom:12px;break-inside:avoid}
    .sl{font-size:8.5pt;font-weight:bold;color:${ACENTO_OSC};text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}
    .sc{font-size:10pt;line-height:1.5;color:#1f2937;padding:6px 10px;border-left:3px solid ${BORDE_CITA};background:${FONDO_CITA}}
    .sc p{margin:0 0 6px}
    .sc p:last-child{margin-bottom:0}
    .sc ul,.sc ol{margin:0 0 6px 18px}
    .sc li{margin-bottom:2px}
    .sc .chk{font-size:11pt;line-height:1;margin-right:2px}
    .sc .blank{display:inline-block;min-width:56px;padding:0 4px;border-bottom:1px solid #6b7280;line-height:1.2}
    .sc h1,.sc h2,.sc h3{font-size:10.5pt;font-weight:bold;margin:4px 0}
    .sc blockquote{margin:4px 0 6px 10px;padding-left:8px;border-left:2px solid ${BORDE_CITA};color:#4b5563;font-style:italic}
    .sc strong{font-weight:700}

    /* Diagnósticos */
    .dx{padding:5px 0;border-bottom:1px solid #f1f1f1;display:flex;gap:12px;font-size:9pt}
    .dx:last-child{border-bottom:none}
    .dxn{color:#9ca3af;min-width:14px}
    .dxc{font-family:'Courier New',monospace;font-weight:bold;color:${ACENTO_OSC};min-width:74px}
    .dxd{flex:1;color:#1f2937}
    .dxs{color:#047857;font-size:8pt;font-family:'Courier New',monospace;margin-top:1px}

    /* Firma */
    .sigb{margin-top:26px;padding-top:14px;border-top:1px solid #e5e7eb;break-inside:avoid}
    .sigs{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;padding:10px 14px;font-size:9pt;color:#166534;line-height:1.5}
    .siglines{display:flex;gap:28px;margin-top:26px}
    .sigl{flex:1;border-top:1px solid #333;padding-top:4px;font-size:8.5pt;color:#6b7280}
    .signame{font-size:10pt;font-weight:bold;color:#111;margin-bottom:2px}

    /* Pie HIPAA */
    .hipaa{margin-top:18px;padding:8px 10px;background:#fafafa;border:1px solid #eee;border-radius:4px;font-size:7.5pt;color:#8a8a8a;line-height:1.45}

    @media print{
      .pbar{display:none!important}
      .wrap{padding:0 6px}
      .doc{max-width:100%}
      .sc{background:#fff;border-left-color:#c4c4c4}
      @page{margin:14mm}
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/*
        * Se fueron el "← Volver a la consulta" y el "Ctrl+P" — ver el comentario
        * equivalente en la orden de laboratorio: el link navegaba el iframe y la
        * pista de Ctrl+P instruía algo que imprime la app, no el documento.
        *
        * El estado SE QUEDA: firmada vs borrador es lo único de esa barra que era
        * información y no instrucción, y en una nota clínica saber que estás
        * imprimiendo un borrador importa.
        */}
      <div className="pbar">
        <button id="btn-print" type="button">🖨 {t('prPrintBtn')}</button>
        <span>{isSigned ? t('prBarSigned') : t('prBarDraft')}</span>
      </div>

      <div className="wrap">
        <div className="doc">

          {/* Membrete: logo + la sede de ESTA cita.
              Devin pidió el nombre y la dirección de la sede y descartó
              codificarlas por color, así que van en texto. El dato ya venía en
              la consulta (`Appointment.clinicId` es obligatorio): lo único que
              faltaba era el logo.
              El `<img>` es a propósito y no `next/image`: esta hoja se imprime,
              y el componente de Next mete `srcset` y carga diferida, que en una
              impresión salen mal o directamente no salen. Mismo criterio que la
              confirmación de cita. */}
          <div className="lh">
            <div className="lhl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={marcaDelCaso.src} alt={marcaDelCaso.alt} />
              <div>
                <div className="cn">{a.clinic.name}</div>
                {clinicLine && <div className="cs">{clinicLine}</div>}
                {a.clinic.phone && <div className="cs">{a.clinic.phone}</div>}
              </div>
            </div>
            <div>
              <div className="dt">{t('prTitle')}</div>
              <div className="ds">{fmtDateTime(a.scheduledFor, locale)}</div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge ${isSigned ? 'signed' : 'draft'}`}>
                  {isSigned ? `✓ ${t('prSignedBadge')}` : t('prDraftBadge')}
                </span>
              </div>
            </div>
          </div>

          {!isSigned && <div className="warn">⚠ {t('prDraftWarning')}</div>}

          {/* Paciente · Caso · Proveedor · Visita */}
          <div className="igrid">
            <div className="ibox">
              <div className="ibt">{t('prPatient')}</div>
              <div className="irow">
                <span className="il">{t('prName')}</span>
                <span className="iv">
                  {(dec(a.patient.lastName) ?? '').toUpperCase()}, {dec(a.patient.firstName) ?? ''}
                </span>
              </div>
              {a.patient.dateOfBirth && (
                <div className="irow">
                  <span className="il">{t('prDob')}</span>
                  <span className="iv">
                    {fmtCalendar(a.patient.dateOfBirth, locale)}{pa != null ? ` (${pa} ${t('yearsShort')})` : ''}
                  </span>
                </div>
              )}
              {a.patient.sex && (
                <div className="irow"><span className="il">{t('prSex')}</span><span className="iv">{a.patient.sex}</span></div>
              )}
              {dec(a.patient.phone) && (
                <div className="irow"><span className="il">{t('prPhone')}</span><span className="iv">{dec(a.patient.phone)}</span></div>
              )}
            </div>

            <div className="ibox">
              <div className="ibt">{t('prCase')}</div>
              {a.case ? (
                <>
                  <div className="irow"><span className="il">{t('prCaseCode')}</span><span className="iv mono">{a.case.caseCode}</span></div>
                  {a.case.accidentDate && (
                    <div className="irow"><span className="il">{t('prAccident')}</span><span className="iv">{fmtCalendar(a.case.accidentDate, locale)}</span></div>
                  )}
                  {a.case.primaryInsurance && (
                    <div className="irow"><span className="il">{t('prInsurance')}</span><span className="iv">{a.case.primaryInsurance.name}</span></div>
                  )}
                  {a.case.primaryPolicyNumber && (
                    <div className="irow"><span className="il">{t('prPolicy')}</span><span className="iv mono">{a.case.primaryPolicyNumber}</span></div>
                  )}
                  {(a.case.attorney ?? a.case.lawFirm) && (
                    <div className="irow">
                      <span className="il">{t('prAttorney')}</span>
                      <span className="iv">
                        {a.case.attorney ? `${a.case.attorney.lastName}, ${a.case.attorney.firstName}` : a.case.lawFirm?.firmName}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="irow"><span className="il">{t('prNoCase')}</span></div>
              )}
            </div>

            <div className="ibox">
              <div className="ibt">{t('prProvider')}</div>
              {a.provider ? (
                <>
                  <div className="irow">
                    <span className="il">{t('prDoctor')}</span>
                    <span className="iv">{a.provider.lastName}, {a.provider.firstName}</span>
                  </div>
                  <div className="irow"><span className="il">{t('prSpecialty')}</span><span className="iv">{specialty}</span></div>
                  {a.provider.licenseNumber && (
                    <div className="irow"><span className="il">{t('prLicense')}</span><span className="iv mono">{a.provider.licenseNumber}</span></div>
                  )}
                </>
              ) : (
                <div className="irow"><span className="il">—</span></div>
              )}
            </div>

            <div className="ibox">
              <div className="ibt">{t('prVisit')}</div>
              <div className="irow"><span className="il">{t('prDate')}</span><span className="iv">{fmtDate(a.scheduledFor, locale)}</span></div>
              <div className="irow"><span className="il">{t('prVisitType')}</span><span className="iv">{a.type.replace(/_/g, ' ')}</span></div>
              {isSigned && note.signedAt && (
                <div className="irow"><span className="il">{t('prSignedAt')}</span><span className="iv">{fmtDateTime(note.signedAt, locale)}</span></div>
              )}
            </div>
          </div>

          {/* Signos vitales (del triaje) */}
          {vitals.length > 0 && (
            <>
              <div className="stitle">{t('prVitals')}</div>
              <table className="vtab">
                <tbody>
                  <tr>{vitals.map(([label]) => <th key={label}>{label}</th>)}</tr>
                  <tr>{vitals.map(([label, val]) => <td key={label}>{val}</td>)}</tr>
                </tbody>
              </table>
            </>
          )}

          {/* Nota SOAP */}
          {soapFilled.length > 0 && (
            <>
              <div className="stitle">{t('prSoap')}</div>
              {soapFilled.map(([label, content]) => (
                <div key={label} className="ss">
                  <div className="sl">{label}</div>
                  <div className="sc" dangerouslySetInnerHTML={{ __html: safeHtml(content) }} />
                </div>
              ))}
            </>
          )}

          {/* Diagnósticos */}
          {note.diagnoses.length > 0 && (
            <>
              <div className="stitle">{t('prDiagnoses')}</div>
              {note.diagnoses.map((dx, i) => (
                <div key={dx.id} className="dx">
                  <span className="dxn">{i + 1}.</span>
                  <span className="dxc">{dx.icd10Code ?? '—'}</span>
                  <div className="dxd">
                    <div>{dx.icd10Label ?? dx.snomedLabel ?? '—'}</div>
                    {dx.snomedCode && <div className="dxs">SNOMED {dx.snomedCode} — {dx.snomedLabel ?? ''}</div>}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Addenda ──────────────────────────────────────────────────────
              Al pie y con su propio título: se lee como lo que es, un agregado
              posterior con su fecha y su firma, y NO se mezcla con el cuerpo.
              Esa separación visual es parte de lo que hace válida la enmienda:
              quien lee tiene que poder distinguir qué se firmó cuándo. */}
          {note.addenda.length > 0 && (
            <>
              <div className="stitle">{t('prAddenda')}</div>
              {note.addenda.map((ad) => (
                <div key={ad.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {t('prAddendumNumber', { n: ad.numero })}
                  </div>
                  <div style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>
                    {t('prAddendumSignedBy', {
                      name: ad.signedByName ?? '—',
                      date: fmtDateTime(ad.signedAt, locale),
                    })}
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: safeHtml(ad.texto) }} />
                </div>
              ))}
            </>
          )}

          {/* Servicios realizados — sin honorarios (el doctor no ve pagos) */}
          {services.length > 0 && (
            <>
              <div className="stitle">{t('prServices')}</div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>{t('prSvcCode')}</th>
                    <th>{t('prSvcDescription')}</th>
                    <th style={{ width: 130 }}>{t('prSvcCategory')}</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, i) => (
                    <tr key={s.id ?? `${s.code}-${i}`}>
                      <td><span className="mono">{s.code}</span></td>
                      <td>{s.description ?? '—'}</td>
                      <td>{s.category ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Firma */}
          <div className="sigb">
            {isSigned ? (
              <div className="sigs">
                ✓ {t('prSignedStatement', {
                  date: fmtDateTime(note.signedAt, locale),
                  name: note.signedByName ?? nombreProvider(a.provider),
                })}
                {a.provider?.licenseNumber ? ` · ${t('prLicense')} ${a.provider.licenseNumber}` : ''}
                <br />{t('prSignedRecord')}
              </div>
            ) : (
              <div className="siglines">
                <div className="sigl">{t('prSignatureLine')}</div>
                <div className="sigl">{t('prDateLine')}</div>
                <div className="sigl">{t('prLicenseLine')}</div>
              </div>
            )}
          </div>

          {/* HIPAA */}
          <div className="hipaa">
            🔒 {t('prHipaa')}
            <br />{a.clinic.name} · {t('prGenerated', { date: fmtDateTime(new Date(), locale) })}
          </div>

        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('btn-print')?.addEventListener('click',function(){window.print()})`,
        }}
      />
    </>
  );
}
