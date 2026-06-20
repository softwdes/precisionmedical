/**
 * B.28 — Comprobante de settlement: vista de impresión / PDF
 *
 * Ruta:   /billing/[caseId]/settlement/print
 * Uso:    Botón "Imprimir comprobante" en la pantalla de settlement procesado
 */

import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import type { Metadata } from 'next';

type Props = { params: Promise<{ caseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { caseId } = await params;
  const c = await db.case.findUnique({ where: { id: caseId }, select: { caseCode: true } });
  return { title: `Settlement · ${c?.caseCode ?? caseId}` };
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function fmtUSD(n: number | undefined | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const METHOD_LABEL: Record<string, string> = {
  check: 'Cheque', wire: 'Transferencia bancaria', ach: 'ACH',
};

export default async function SettlementPrintPage({ params }: Props) {
  const { caseId } = await params;

  const caseData = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true, caseCode: true, status: true, accidentDate: true,
      patient: {
        select: { firstName: true, lastName: true, dateOfBirth: true, phone: true, patientCode: true },
      },
      lawFirm:  { select: { firmName: true, email: true, phone: true } },
      attorney: { select: { firstName: true, lastName: true } },
      primaryInsurance: { select: { name: true } },
      notes: {
        where: { content: { startsWith: '🎯' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, createdAt: true, authorName: true },
      },
    },
  });

  if (!caseData || caseData.status !== 'SETTLED') notFound();

  // Get settlement metadata from audit log
  const auditEntry = await db.auditLog.findFirst({
    where: { entityId: caseId, action: 'SETTLEMENT_PROCESSED' },
    select: { metadata: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const meta = auditEntry?.metadata as {
    amount?: number;
    method?: string;
    reference?: string;
    payor?: string;
    receivedAt?: string;
  } | null;

  const settlement = caseData.notes[0];
  const settledAt  = auditEntry?.createdAt ?? settlement?.createdAt;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Georgia', serif; color: #111; background: #fff; }
        .page { max-width: 800px; margin: 0 auto; padding: 40px 48px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
        .clinic-name { font-size: 22px; font-weight: bold; color: #0f172a; }
        .clinic-sub { font-size: 11px; color: #555; margin-top: 3px; }
        .doc-title { text-align: right; }
        .doc-title h2 { font-size: 16px; font-weight: bold; color: #0f172a; }
        .doc-title .sub { font-size: 11px; color: #555; margin-top: 4px; }
        .amount-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 20px 24px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; }
        .amount-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #166534; font-weight: bold; }
        .amount-value { font-size: 32px; font-weight: bold; color: #15803d; }
        .section { margin-bottom: 20px; }
        .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: bold; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 5px 8px; font-size: 13px; vertical-align: top; }
        td.label { color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; width: 36%; }
        td.value { color: #111; font-weight: 500; }
        .status-badge { display: inline-block; background: #dcfce7; color: #166534; border: 1px solid #86efac; border-radius: 4px; padding: 3px 10px; font-size: 12px; font-weight: bold; }
        .note-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px 16px; font-size: 12px; color: #555; line-height: 1.7; }
        .footer { margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px; font-size: 10px; color: #888; text-align: center; line-height: 1.6; }
        @media print {
          .no-print { display: none !important; }
          .page { padding: 20px 32px; }
        }
      `}</style>

      <div className="no-print" style={{ background: '#f1f5f9', padding: '12px 48px', borderBottom: '1px solid #e2e8f0' }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#0f172a', color: '#fff', padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px' }}
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div>
            <div className="clinic-name">Precision Medical Care</div>
            <div className="clinic-sub">Billing &amp; Settlement Department</div>
          </div>
          <div className="doc-title">
            <h2>Comprobante de Settlement</h2>
            <div className="sub">Caso: {caseData.caseCode}</div>
            <div className="sub">Generado: {fmtDateTime(new Date())}</div>
          </div>
        </div>

        {/* Status + amount highlight */}
        <div className="amount-box">
          <div>
            <div className="amount-label">Monto liquidado</div>
            <div className="amount-value">{fmtUSD(meta?.amount)}</div>
            {settledAt && (
              <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                Procesado el {fmtDate(settledAt)}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="status-badge">🎯 SETTLED</span>
          </div>
        </div>

        {/* Settlement details */}
        <div className="section">
          <div className="section-title">Datos del pago</div>
          <table>
            <tbody>
              <tr>
                <td className="label">Método</td>
                <td className="value">{meta?.method ? (METHOD_LABEL[meta.method] ?? meta.method) : '—'}</td>
              </tr>
              {meta?.reference && (
                <tr>
                  <td className="label">Referencia</td>
                  <td className="value" style={{ fontFamily: 'monospace' }}>{meta.reference}</td>
                </tr>
              )}
              {meta?.payor && (
                <tr>
                  <td className="label">Pagador / Cuenta</td>
                  <td className="value">{meta.payor}</td>
                </tr>
              )}
              {meta?.receivedAt && (
                <tr>
                  <td className="label">Fecha recibido</td>
                  <td className="value">{fmtDate(meta.receivedAt)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Case info */}
        <div className="section">
          <div className="section-title">Información del caso</div>
          <table>
            <tbody>
              <tr>
                <td className="label">Código de caso</td>
                <td className="value" style={{ fontFamily: 'monospace' }}>{caseData.caseCode}</td>
              </tr>
              <tr>
                <td className="label">Paciente</td>
                <td className="value">{caseData.patient.firstName} {caseData.patient.lastName}</td>
              </tr>
              <tr>
                <td className="label">Código paciente</td>
                <td className="value" style={{ fontFamily: 'monospace' }}>{caseData.patient.patientCode}</td>
              </tr>
              {caseData.accidentDate && (
                <tr>
                  <td className="label">Fecha de accidente</td>
                  <td className="value">{fmtDate(caseData.accidentDate)}</td>
                </tr>
              )}
              {caseData.primaryInsurance && (
                <tr>
                  <td className="label">Aseguradora</td>
                  <td className="value">{caseData.primaryInsurance.name}</td>
                </tr>
              )}
              {caseData.lawFirm && (
                <tr>
                  <td className="label">Bufete</td>
                  <td className="value">{caseData.lawFirm.firmName}</td>
                </tr>
              )}
              {caseData.attorney && (
                <tr>
                  <td className="label">Abogado</td>
                  <td className="value">{caseData.attorney.firstName} {caseData.attorney.lastName}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Original note */}
        {settlement && (
          <div className="section">
            <div className="section-title">Nota de settlement</div>
            <div className="note-box">{settlement.content}</div>
            <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px' }}>
              Registrado por {settlement.authorName} · {fmtDateTime(settlement.createdAt)}
            </div>
          </div>
        )}

        {/* Legal footer */}
        <div className="section" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '12px 16px' }}>
          <p style={{ fontSize: '11px', color: '#555', lineHeight: '1.7' }}>
            Este comprobante acredita que el settlement del caso {caseData.caseCode} fue procesado y registrado
            en el sistema de Precision Medical Care. Documento generado automáticamente con fines de archivo.
            El monto y los datos de pago provienen del registro de auditoría inmutable (HIPAA).
          </p>
        </div>

        <div className="footer">
          Precision Medical Care · Settlement Receipt · {fmtDateTime(new Date())} · HIPAA compliant
        </div>
      </div>
    </>
  );
}
