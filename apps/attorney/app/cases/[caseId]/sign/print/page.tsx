/**
 * B.22 — Lien agreement firmado: vista de impresión / PDF
 *
 * Ruta:   /cases/[caseId]/sign/print  (attorney portal)
 * Uso:    Ctrl+P o botón "Imprimir lien" disponible cuando ambas partes han firmado
 */

import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import type { Metadata } from 'next';

type Props = { params: Promise<{ caseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { caseId } = await params;
  const c = await db.case.findUnique({ where: { id: caseId }, select: { caseCode: true } });
  return { title: `Lien Médico · ${c?.caseCode ?? caseId}` };
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

export default async function LienPrintPage({ params }: Props) {
  const { caseId } = await params;

  const caseData = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true, caseCode: true, accidentDate: true, accidentType: true,
      patient: {
        select: { firstName: true, lastName: true, dateOfBirth: true, phone: true, patientCode: true },
      },
      lawFirm:  { select: { firmName: true, address: true, city: true, state: true } },
      attorney: { select: { firstName: true, lastName: true, email: true, barNumber: true } },
      lienSignatures: {
        orderBy: { signedAt: 'asc' },
        select: { signerType: true, signerName: true, signerEmail: true, signedAt: true, signatureSvg: true },
      },
    },
  });

  if (!caseData) notFound();

  const patientSig  = caseData.lienSignatures.find(s => s.signerType === 'PATIENT');
  const attorneySig = caseData.lienSignatures.find(s => s.signerType === 'ATTORNEY');

  const patientName  = `${caseData.patient.firstName} ${caseData.patient.lastName}`;
  const attorneyName = caseData.attorney
    ? `${caseData.attorney.firstName ?? ''} ${caseData.attorney.lastName ?? ''}`.trim()
    : '—';

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Georgia', serif; color: #111; background: #fff; }
        .page { max-width: 800px; margin: 0 auto; padding: 40px 48px; }
        .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; text-align: center; }
        .clinic-name { font-size: 20px; font-weight: bold; color: #0f172a; }
        .doc-title { font-size: 17px; font-weight: bold; margin-top: 8px; color: #0f172a; }
        .doc-sub { font-size: 12px; color: #555; margin-top: 4px; }
        .section { margin-bottom: 20px; }
        .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: bold; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 5px 8px; font-size: 13px; vertical-align: top; }
        td.label { color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; width: 36%; }
        td.value { color: #111; font-weight: 500; }
        .agreement-text { font-size: 12px; color: #333; line-height: 1.8; text-align: justify; }
        .agreement-text p { margin-bottom: 10px; }
        .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 16px; }
        .sig-card { border: 1px solid #ccc; border-radius: 4px; padding: 12px; }
        .sig-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; font-weight: bold; margin-bottom: 8px; }
        .sig-img { border-bottom: 1px solid #999; padding-bottom: 4px; min-height: 60px; display: flex; align-items: flex-end; justify-content: center; }
        .sig-img img { max-width: 100%; max-height: 80px; }
        .sig-name { font-size: 12px; font-weight: bold; margin-top: 6px; }
        .sig-meta { font-size: 10px; color: #777; margin-top: 2px; }
        .pending-box { text-align: center; color: #aaa; font-size: 12px; padding: 16px; background: #f8fafc; border-radius: 4px; border: 1px dashed #ddd; }
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
          <div className="clinic-name">Precision Medical Care</div>
          <div className="doc-title">ACUERDO DE GRAVAMEN MÉDICO</div>
          <div className="doc-sub">Medical Lien Agreement · Caso {caseData.caseCode}</div>
          <div className="doc-sub">Generado: {fmtDateTime(new Date())}</div>
        </div>

        {/* Parties */}
        <div className="section">
          <div className="section-title">Partes del acuerdo</div>
          <table>
            <tbody>
              <tr>
                <td className="label">Paciente</td>
                <td className="value">{patientName}</td>
              </tr>
              <tr>
                <td className="label">Código paciente</td>
                <td className="value" style={{ fontFamily: 'monospace' }}>{caseData.patient.patientCode}</td>
              </tr>
              {caseData.patient.phone && (
                <tr>
                  <td className="label">Teléfono</td>
                  <td className="value" style={{ fontFamily: 'monospace' }}>{caseData.patient.phone}</td>
                </tr>
              )}
              <tr>
                <td className="label">Bufete legal</td>
                <td className="value">{caseData.lawFirm?.firmName ?? '—'}</td>
              </tr>
              <tr>
                <td className="label">Abogado</td>
                <td className="value">
                  {attorneyName}
                  {caseData.attorney?.barNumber && (
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#555', marginLeft: '8px' }}>
                      · Bar #{caseData.attorney.barNumber}
                    </span>
                  )}
                </td>
              </tr>
              {caseData.accidentDate && (
                <tr>
                  <td className="label">Fecha de accidente</td>
                  <td className="value">{fmtDate(caseData.accidentDate)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Agreement text */}
        <div className="section">
          <div className="section-title">Términos del acuerdo</div>
          <div className="agreement-text">
            <p>
              Yo, <strong>{patientName}</strong>, el paciente abajo firmante, autorizo a <strong>Precision Medical Care</strong>
              a proporcionar los servicios médicos necesarios para el tratamiento de las lesiones sufridas en el
              accidente del {fmtDate(caseData.accidentDate)}, y acepto los términos de este gravamen médico (Medical Lien).
            </p>
            <p>
              Asigno irrevocablemente a Precision Medical Care el derecho a cobrar directamente del producto de
              cualquier acuerdo, sentencia o recuperación obtenida como resultado del accidente, el monto total de los
              servicios médicos prestados, hasta el monto total facturado.
            </p>
            <p>
              Autorizo al bufete <strong>{caseData.lawFirm?.firmName ?? '[Bufete]'}</strong> a retener del producto
              de cualquier recuperación el monto adeudado a Precision Medical Care y a pagar dicho monto directamente
              a la clínica.
            </p>
            <p>
              Esta asignación es vinculante sobre mí, mis herederos, cesionarios y representantes personales.
              Al firmar este documento reconozco haber leído, comprendido y aceptado todos los términos aquí descritos.
            </p>
          </div>
        </div>

        {/* Signatures */}
        <div className="section">
          <div className="section-title">Firmas digitales</div>
          <div className="sig-grid">
            {/* Patient signature */}
            <div className="sig-card">
              <div className="sig-label">Paciente</div>
              {patientSig ? (
                <>
                  <div className="sig-img">
                    {patientSig.signatureSvg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={patientSig.signatureSvg} alt="Firma del paciente" />
                    ) : (
                      <span style={{ color: '#aaa', fontSize: '12px' }}>Firma registrada digitalmente</span>
                    )}
                  </div>
                  <div className="sig-name">{patientSig.signerName}</div>
                  {patientSig.signerEmail && (
                    <div className="sig-meta">{patientSig.signerEmail}</div>
                  )}
                  <div className="sig-meta">{fmtDateTime(patientSig.signedAt)}</div>
                </>
              ) : (
                <div className="pending-box">Pendiente de firma</div>
              )}
            </div>

            {/* Attorney signature */}
            <div className="sig-card">
              <div className="sig-label">Abogado</div>
              {attorneySig ? (
                <>
                  <div className="sig-img">
                    {attorneySig.signatureSvg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={attorneySig.signatureSvg} alt="Firma del abogado" />
                    ) : (
                      <span style={{ color: '#aaa', fontSize: '12px' }}>Firma registrada digitalmente</span>
                    )}
                  </div>
                  <div className="sig-name">{attorneySig.signerName}</div>
                  {attorneySig.signerEmail && (
                    <div className="sig-meta">{attorneySig.signerEmail}</div>
                  )}
                  <div className="sig-meta">{fmtDateTime(attorneySig.signedAt)}</div>
                </>
              ) : (
                <div className="pending-box">Pendiente de firma</div>
              )}
            </div>
          </div>
        </div>

        {/* ESIGN notice */}
        <div className="section" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '12px 16px' }}>
          <p style={{ fontSize: '11px', color: '#555', lineHeight: '1.7' }}>
            Las firmas digitales en este documento son legalmente válidas conforme a la Ley ESIGN
            (15 U.S.C. § 7001) y la Ley Uniforme de Transacciones Electrónicas (UETA). Las firmas fueron
            capturadas mediante panel táctil y almacenadas con hash SHA-256 para garantizar su integridad.
            Este documento fue generado automáticamente por el sistema de Precision Medical Care.
          </p>
        </div>

        <div className="footer">
          Precision Medical Care · Medical Lien Agreement · Caso {caseData.caseCode} · {fmtDateTime(new Date())} · HIPAA compliant
        </div>
      </div>
    </>
  );
}
