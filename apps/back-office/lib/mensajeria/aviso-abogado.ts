/**
 * Aviso por correo al abogado cuando le llega un mensaje.
 *
 * Un abogado no vive en nuestro portal como el staff: si no se le avisa por
 * fuera, la bandeja del portal legal es una pantalla que nadie mira. Este es
 * el ladrillo que la hace existir.
 *
 * SIN PHI, a propósito y sin excepción. `lib/email.ts` sale por la Email API de
 * Twilio (SendGrid), que no firma BAA: el correo dice que HAY un mensaje y de
 * quién, y trae el link al hilo. Ni asunto, ni paciente, ni código de caso —
 * el código identifica un expediente y no hace falta para que haga clic.
 *
 * Se llama en fire-and-forget desde las rutas que crean entradas: que falle el
 * aviso no puede tumbar el mensaje, que ya está en la bandeja.
 */

import { db } from '@precision-medical/database';
import { EMAIL_ENABLED, sendEmail } from '@/lib/email';

export interface AvisoAbogadoArgs {
  threadId: string;
  /** Todos los destinatarios del hilo (o los nuevos); se filtran los abogados. */
  userIds: string[];
  /** Quien escribió: no se avisa a sí mismo. */
  autorUserId: string;
  autorNombre: string;
  caseId?: string | null;
  patientId?: string | null;
}

function portalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ATTORNEY_PORTAL_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3002'
  ).replace(/\/$/, '');
}

const TEXTOS = {
  en: {
    subject: 'New message in your Precision Medical legal portal',
    body: (autor: string) => `${autor} from Precision Medical sent you a message about one of your cases.`,
    cta: 'Open the message',
    foot: 'You are receiving this because your firm has access to the Precision Medical legal portal. The message itself is only visible inside the portal.',
  },
  es: {
    subject: 'Nuevo mensaje en tu portal legal de Precision Medical',
    body: (autor: string) => `${autor}, de Precision Medical, te escribió sobre uno de tus casos.`,
    cta: 'Abrir el mensaje',
    foot: 'Recibís este aviso porque tu bufete tiene acceso al portal legal de Precision Medical. El mensaje solo se ve dentro del portal.',
  },
} as const;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export async function avisarAbogadosPorEmail(args: AvisoAbogadoArgs): Promise<void> {
  // Con el correo apagado no se intenta: `sendEmail` registraría un FAILED en
  // `message_logs` por cada mensaje a un abogado, y eso es ruido, no historial.
  if (!EMAIL_ENABLED) return;

  const ids = [...new Set(args.userIds)].filter((id) => id !== args.autorUserId);
  if (ids.length === 0) return;

  const abogados = await db.user.findMany({
    where: { id: { in: ids }, role: 'LAWYER', status: 'ACTIVE', deletedAt: null },
    select: { id: true, email: true, firstName: true, lastName: true, preferredLocale: true },
  });
  if (abogados.length === 0) return;

  const link = `${portalUrl()}/attorney/messages?thread=${encodeURIComponent(args.threadId)}`;

  await Promise.all(abogados.map(async (a) => {
    const t = TEXTOS[a.preferredLocale === 'es' ? 'es' : 'en'];
    const nombre = `${a.firstName} ${a.lastName}`.trim();
    const text = `${t.body(args.autorNombre)}\n\n${t.cta}: ${link}\n\n${t.foot}`;
    const html =
      `<p style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">${esc(t.body(args.autorNombre))}</p>` +
      `<p><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#4f46e5;color:#fff;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none">${esc(t.cta)}</a></p>` +
      `<p style="font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#666">${esc(t.foot)}</p>`;

    const r = await sendEmail({
      to: a.email,
      toName: nombre || null,
      subject: t.subject,
      html,
      text,
      caseId: args.caseId ?? null,
      patientId: args.patientId ?? null,
      sentByUserId: args.autorUserId,
      sentByName: args.autorNombre,
    });
    if (!r.ok && r.error !== 'NOT_IN_TEST_ALLOWLIST') {
      console.error('[aviso-abogado] no salió el correo:', r.error, r.errorDetail);
    }
  }));
}
