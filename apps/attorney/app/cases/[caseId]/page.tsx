/**
 * B.22 — Detalle del caso (vista abogado)
 * 4 tabs: Notas Doctor · Labs & Imaging · HCFA · Citas
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import { ArrowLeft, Calendar, FileText, FlaskConical, Scale, Download, ShieldCheck } from 'lucide-react';
import CaseDetailClient from './case-detail-client';

type Props = { params: Promise<{ caseId: string }> };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
}
function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
}

export default async function CaseDetailPage({ params }: Props) {
  const { caseId } = await params;

  const c = await db.case.findUnique({
    where: { id: caseId, deletedAt: null },
    include: {
      patient: { select: { firstName: true, lastName: true, dateOfBirth: true, phone: true } },
      lawFirm:  { select: { firmName: true } },
      attorney: { select: { firstName: true, lastName: true } },
      primaryInsurance:   { select: { name: true } },
      secondaryInsurance: { select: { name: true } },
      appointments: {
        where: { status: { not: 'CANCELLED' } },
        include: {
          visitNote: {
            select: {
              id: true, status: true, signedAt: true, signedByName: true,
              chiefComplaint: true, assessment: true, plan: true,
              diagnoses: { select: { icd10Code: true, icd10Label: true } },
            },
          },
          provider: { select: { firstName: true, lastName: true } },
          clinic:   { select: { name: true } },
          // labOrders excluded — uses $queryRaw below (snake_case columns in DB)
        },
        orderBy: { scheduledFor: 'desc' },
      },
    },
  });

  if (!c) notFound();

  // Lien signatures
  interface RawSig { id: string; signer_type: string; signer_name: string; signed_at: Date }
  const signatures = await db.$queryRaw<RawSig[]>`
    SELECT id, signer_type, signer_name, signed_at
    FROM   lien_signatures
    WHERE  case_id = ${caseId}
    ORDER BY signed_at ASC
  `;

  // Lab orders via raw SQL (snake_case columns, no @map on LabOrder fields)
  // Use appointment IDs already fetched by Prisma — avoids cross-column naming issues
  interface RawLab {
    id: string; appointment_id: string; study_name: string;
    order_type: string; status: string; urgency: string; ordered_at: Date;
  }
  const apptIds = c.appointments.map(a => a.id);
  const rawLabs: RawLab[] = apptIds.length === 0 ? [] : await db.$queryRaw<RawLab[]>`
    SELECT id, appointment_id, study_name, order_type, status::text, urgency::text, ordered_at
    FROM   lab_orders
    WHERE  appointment_id = ANY(${apptIds})
    ORDER BY ordered_at DESC
  `;
  const allLabs = rawLabs.map(l => ({
    id:        l.id,
    studyName: l.study_name,
    orderType: l.order_type,
    status:    l.status,
    urgency:   l.urgency,
    orderedAt: l.ordered_at.toISOString(),
  }));

  const appts       = c.appointments;
  const signedAppts = appts.filter(a => a.visitNote?.status === 'SIGNED');
  // labOrders per appointment (for the Citas tab badge)
  const labsByAppt = new Map(rawLabs.reduce((acc, l) => {
    const arr = acc.get(l.appointment_id) ?? [];
    arr.push(l);
    acc.set(l.appointment_id, arr);
    return acc;
  }, new Map<string, RawLab[]>()));
  const nextAppt    = [...appts].reverse().find(a =>
    new Date(a.scheduledFor) >= new Date() && a.status !== 'COMPLETED',
  );

  const attorneySigned = signatures.some(s => s.signer_type === 'ATTORNEY');
  const patientSigned  = signatures.some(s => s.signer_type === 'PATIENT');

  const statusColors: Record<string, string> = {
    NEW_REFERRAL: '#a78bfa', INTAKE_PENDING: '#67e8f9', INTAKE_COMPLETED: '#67e8f9',
    CONFIRMED: '#34d399', ACTIVE: '#34d399', MMI: '#fbbf24',
    CLOSED: '#fb7185', SETTLED: '#34d399', ARCHIVED: 'rgba(255,255,255,0.25)',
    CANCELLED: 'rgba(255,255,255,0.20)',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e' }}>
      {/* Header */}
      <header style={{
        padding: '0 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(244,63,94,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.60)', textDecoration: 'none', fontSize: 12,
          }}>
            <ArrowLeft size={13} /> Dashboard
          </Link>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.10)' }} />
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
              {c.patient.lastName.toUpperCase()}, {c.patient.firstName}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', marginLeft: 10 }}>{c.caseCode}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#34d399' }}>
            <ShieldCheck size={12} />
            <span>⏱ Acceso auditado HIPAA</span>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em',
            color: statusColors[c.status] ?? '#a78bfa',
            background: `${statusColors[c.status] ?? '#a78bfa'}18`,
            padding: '3px 8px', borderRadius: 6,
          }}>
            {c.status.replace(/_/g, ' ')}
          </span>
        </div>
      </header>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Case header info */}
        <div style={{
          background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.15)',
          borderRadius: 12, padding: '16px 20px',
          display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start',
        }}>
          {/* Patient */}
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 4 }}>Paciente</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>
              {c.patient.lastName.toUpperCase()}, {c.patient.firstName}
            </div>
            {c.patient.dateOfBirth && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>
                DOB: {fmtDate(c.patient.dateOfBirth)}
              </div>
            )}
          </div>

          {/* Mini KPIs */}
          {[
            {
              label: 'Próxima cita',
              value: nextAppt ? fmtDate(nextAppt.scheduledFor) : 'No agendada',
              sub:   nextAppt?.provider ? `Dr. ${nextAppt.provider.lastName} · ${nextAppt.clinic?.name ?? ''}` : '',
              color: '#67e8f9',
            },
            {
              label: 'Visitas',
              value: `${appts.length} total · ${signedAppts.length} firmadas`,
              sub:   appts[0] ? `Última: ${fmtDate(appts[0].scheduledFor)}` : '',
              color: '#a78bfa',
            },
            {
              label: 'Seguro',
              value: c.primaryInsurance?.name ?? 'Sin seguro',
              sub:   c.secondaryInsurance ? `Secundario: ${c.secondaryInsurance.name}` : '',
              color: '#fbbf24',
            },
            {
              label: 'DOL',
              value: fmtDate(c.accidentDate),
              sub:   c.accidentType?.replace(/_/g, ' ') ?? '',
              color: '#fb7185',
            },
          ].map(k => (
            <div key={k.label} style={{ flex: '1 1 130px' }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 3 }}>{k.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: k.color }}>{k.value}</div>
              {k.sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* Lien signature status */}
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap',
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', alignSelf: 'center' }}>
            Estado del Lien:
          </div>
          {[
            { label: 'Paciente firmó', ok: patientSigned },
            { label: 'Doctor firmó nota', ok: signedAppts.length > 0 },
            { label: 'HCFA generado', ok: signedAppts.length > 0 },
            { label: 'Abogado firmó', ok: attorneySigned },
          ].map(s => (
            <span key={s.label} style={{
              fontSize: 11, fontWeight: 600,
              color: s.ok ? '#34d399' : 'rgba(255,255,255,0.30)',
            }}>
              {s.ok ? '✓' : '○'} {s.label}
            </span>
          ))}
          {!attorneySigned && (
            <Link href={`/cases/${caseId}/sign`} style={{
              marginLeft: 'auto', padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700,
              background: 'linear-gradient(135deg,#f43f5e,#ec4899)',
              color: '#fff', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 5,
              boxShadow: '0 3px 10px rgba(244,63,94,0.30)',
            }}>
              ✍️ Firmar mi parte →
            </Link>
          )}
        </div>

        {/* Client tabs with interactive content */}
        <CaseDetailClient
          caseId={caseId}
          appointments={appts.map(a => ({
            id:           a.id,
            scheduledFor: a.scheduledFor.toISOString(),
            status:       a.status,
            type:         a.type,
            provider:     a.provider,
            clinic:       a.clinic,
            visitNote:    a.visitNote ? {
              id:            a.visitNote.id,
              status:        a.visitNote.status,
              signedAt:      a.visitNote.signedAt?.toISOString() ?? null,
              signedByName:  a.visitNote.signedByName,
              chiefComplaint: a.visitNote.chiefComplaint,
              assessment:    a.visitNote.assessment,
              plan:          a.visitNote.plan,
              diagnoses:     a.visitNote.diagnoses,
            } : null,
            labOrders:    (labsByAppt.get(a.id) ?? []).map(l => ({
              id:        l.id,
              studyName: l.study_name,
              orderType: l.order_type,
              status:    l.status,
              urgency:   l.urgency,
              orderedAt: l.ordered_at.toISOString(),
            })),
          }))}
          allLabs={allLabs}
          caseCode={c.caseCode}
        />

        {/* Footer actions */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <button style={{
            padding: '10px 18px', borderRadius: 9, fontSize: 12, fontWeight: 600,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.60)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Download size={13} /> Descargar paquete
          </button>
          {!attorneySigned && (
            <Link href={`/cases/${caseId}/sign`} style={{
              padding: '10px 22px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: 'linear-gradient(135deg,#f43f5e,#ec4899)',
              color: '#fff', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 4px 14px rgba(244,63,94,0.35)',
            }}>
              ✍️ Firmar mi parte del Lien →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
