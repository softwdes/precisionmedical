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

/**
 * `noReply` es una pieza aparte del `foot`, y con un trabajo propio.
 *
 * El pie ya decía dónde se LEE el mensaje ("solo se ve dentro del portal"),
 * pero no que contestar el correo no sirve — y no es lo mismo. Este aviso llega
 * como un mail normal de alguien con quien el bufete trabaja, y lo primero que
 * hace cualquiera con un mail así es apretar Responder.
 *
 * Esa respuesta no llega a ningún lado: no hay procesamiento de correo entrante
 * y el mensaje sale sin `reply-to`, así que cae en la casilla de
 * `EMAIL_FROM_ADDRESS`, que la app no lee. El abogado cree que contestó, del
 * lado de la clínica nunca aparece nada en el hilo, y ninguno de los dos tiene
 * cómo enterarse. Peor que un mensaje que no llega es uno que el que lo mandó
 * da por entregado.
 *
 * Va con la razón adentro ("para que quede en el caso") y no como una orden
 * seca: a alguien que entiende POR QUÉ el portal es el lugar, no hay que
 * recordárselo la próxima vez.
 */
const TEXTOS = {
  en: {
    subject: 'New message in your Precision Medical legal portal',
    body: (autor: string) => `${autor} from Precision Medical sent you a message about one of your cases.`,
    cta: 'Open the message',
    noReply: 'Please do not reply to this email — replies are not received. Answer from the portal so your reply is recorded on the case.',
    foot: 'You are receiving this because your firm has access to the Precision Medical legal portal. The message itself is only visible inside the portal.',
  },
  es: {
    subject: 'Nuevo mensaje en tu portal legal de Precision Medical',
    body: (autor: string) => `${autor}, de Precision Medical, te escribió sobre uno de tus casos.`,
    cta: 'Abrir el mensaje',
    noReply: 'No respondas a este correo — las respuestas no se reciben. Contestá desde el portal para que tu respuesta quede en el caso.',
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
    /**
     * El "no respondas" va JUSTO DEBAJO DEL BOTÓN, no en el pie.
     *
     * El pie es letra chica gris: ahí lo lee el que ya decidió qué hacer. Esta
     * línea tiene que llegar antes de esa decisión —entre "abrir el mensaje" y
     * el reflejo de apretar Responder—, así que va pegada al botón y con el
     * color del texto normal, no con el del pie.
     */
    const text = `${t.body(args.autorNombre)}\n\n${t.cta}: ${link}\n\n${t.noReply}\n\n${t.foot}`;
    const html =
      `<p style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">${esc(t.body(args.autorNombre))}</p>` +
      `<p><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#4f46e5;color:#fff;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none">${esc(t.cta)}</a></p>` +
      `<p style="font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">${esc(t.noReply)}</p>` +
      `<p style="font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#666">${esc(t.foot)}</p>`;

    const r = await sendEmail({
      to: a.email,
      toName: nombre || null,
      subject: t.subject,
      html,
      text,
      /**
       * Este es el carril sin PHI, y el de arriba es todo el contenido: los
       * textos de `TEXTOS` son fijos y lo único que se interpola es el nombre
       * de QUIEN ESCRIBE —staff de la clínica— y el id del hilo.
       *
       * ⚠️ Si algún día acá entra el nombre del paciente, el código de caso o
       * el asunto del mensaje, hay que sacar esta línea. El allowlist deja de
       * proteger este envío en cuanto está puesta.
       */
      sinPhi: true,
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
