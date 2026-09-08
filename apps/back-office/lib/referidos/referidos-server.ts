/**
 * Referidos del portal legal · lado servidor.
 *
 *  · `crearReferido()`   — lo que hace el botón "¿Tenés un referido?": un hilo
 *    de tipo REFERRAL al escritorio REFERRALS + la fila estructurada en
 *    `firm_referrals` + el chequeo de teléfono/correo repetido.
 *  · `marcarReferidoCreado()` — lo que hace el wizard de nuevo caso al terminar
 *    con `referralId`: cierra el referido, ata el hilo al caso y al paciente,
 *    responde en el hilo (el abogado lo ve y le llega el aviso) y deja el audit.
 *
 * El cuerpo del mensaje es un RESUMEN para leer en la bandeja; la fuente de
 * verdad para precargar el wizard es `FirmReferral.payload`.
 */

import { db, writeAuditLog, type Prisma } from '@precision-medical/database';
import type { ResolvedActor } from '@/lib/actor';
import type { SessionLawyer } from '@/lib/get-session-lawyer';
import { reviveThread } from '@/lib/messaging';
import { destinatariosDeEscritorio } from '@/lib/mensajeria/escritorios-server';
import { avisarAbogadosPorEmail } from '@/lib/mensajeria/aviso-abogado';
import { quienUsaEsteContacto } from '@/lib/contactos-compartidos';
import { lugarDelAccidente, type ReferidoPayload, type ReferidoStatus } from './referido';

interface ActorConIdentidad extends ResolvedActor {
  actorUserId: string;
  actorName: string;
}

/** Etiquetas del resumen que va en el cuerpo del mensaje (las pone la ruta, ya traducidas). */
export interface EtiquetasResumen {
  cliente: string; telefono: string; email: string; nacimiento: string; idioma: string;
  accidente: string; fecha: string; lugar: string; descripcion: string;
  seguro: string; poliza: string; reclamo: string; ajustador: string; tercero: string;
  bufete: string; abogado: string; caseManager: string; nota: string; urgente: string;
  posibleDuplicado: string;
}

function linea(etiqueta: string, valor: string | undefined | null): string | null {
  return valor ? `${etiqueta}: ${valor}` : null;
}

/** El resumen legible del referido, en texto plano (el hilo del abogado no interpreta HTML). */
export function resumenDelReferido(
  p: ReferidoPayload,
  ctx: { firmName: string; attorneyName: string | null; duplicados: string[] },
  e: EtiquetasResumen,
): string {
  const c = p.cliente;
  const bloques: string[] = [];

  bloques.push([
    `${e.cliente}: ${c.firstName} ${c.lastName}`,
    linea(e.telefono, c.phone),
    linea(e.email, c.email),
    linea(e.nacimiento, c.dateOfBirth),
    `${e.idioma}: ${c.language === 'es' ? 'Español' : 'English'}`,
  ].filter(Boolean).join('\n'));

  bloques.push([
    `${e.accidente}`,
    linea(e.fecha, p.accidente.date),
    linea(e.lugar, lugarDelAccidente(p.accidente) || undefined),
    linea(e.descripcion, p.accidente.description),
  ].filter(Boolean).join('\n'));

  const s = p.seguro;
  if (s && (s.carrier || s.policyNumber || s.claimNumber || s.adjusterName || s.thirdPartyCarrier)) {
    bloques.push([
      `${e.seguro}`,
      linea(e.seguro, s.carrier),
      linea(e.poliza, s.policyNumber),
      linea(e.reclamo, s.claimNumber),
      linea(e.ajustador, s.adjusterName ? `${s.adjusterName}${s.adjusterPhone ? ` (${s.adjusterPhone})` : ''}` : undefined),
      linea(e.tercero, s.thirdPartyCarrier),
    ].filter(Boolean).join('\n'));
  }

  const cm = p.caseManager;
  bloques.push([
    `${e.bufete}: ${ctx.firmName}`,
    linea(e.abogado, ctx.attorneyName),
    linea(e.caseManager, cm && (cm.name || cm.phone || cm.email) ? [cm.name, cm.phone, cm.email].filter(Boolean).join(' · ') : undefined),
  ].filter(Boolean).join('\n'));

  if (p.notes) bloques.push(`${e.nota}: ${p.notes}`);
  if (p.urgente) bloques.push(`⚠ ${e.urgente}`);
  if (ctx.duplicados.length > 0) bloques.push(`⚠ ${e.posibleDuplicado}: ${ctx.duplicados.join(', ')}`);

  return bloques.join('\n\n');
}

export type ResultadoCrearReferido =
  | { ok: true; referralId: string; threadId: string; duplicados: string[]; respaldo: string | null }
  | { ok: false; error: 'SIN_DESTINATARIOS' | 'SIN_BUFETE' };

export async function crearReferido(args: {
  lawyer: SessionLawyer;
  actor: ActorConIdentidad;
  payload: ReferidoPayload;
  etiquetas: EtiquetasResumen;
  /** "[Bufete] Referido: Nombre Apellido" — lo arma la ruta con el idioma del staff. */
  asunto: string;
}): Promise<ResultadoCrearReferido> {
  const { lawyer, actor, payload } = args;
  if (!lawyer.firmId) return { ok: false, error: 'SIN_BUFETE' };

  const { destinatarios, respaldo } = await destinatariosDeEscritorio('REFERRALS');
  if (destinatarios.length === 0) return { ok: false, error: 'SIN_DESTINATARIOS' };

  /**
   * ¿Ya tenemos a esta persona? Se mira por teléfono y correo, que es lo que el
   * abogado sabe con certeza. No frena nada —el abogado no puede resolverlo—,
   * pero el aviso viaja en el mensaje para que recepción abra el wizard sabiendo
   * que quizás sea un paciente existente (y el wizard vuelve a chequear al crear).
   */
  const repetidos = await quienUsaEsteContacto({ phone: payload.cliente.phone, email: payload.cliente.email ?? null })
    .catch(() => []);
  const duplicados = repetidos.map((r) => `${r.lastName}, ${r.firstName} (${r.patientCode})`);

  const firmName = lawyer.firmName ?? `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim();
  const attorneyName = lawyer.isFirmAccount ? null : `${lawyer.firstName ?? ''} ${lawyer.lastName ?? ''}`.trim() || null;
  const now = new Date();

  const thread = await db.messageThread.create({
    data: {
      subject: args.asunto,
      type: 'REFERRAL',
      category: 'PATIENT_RELATED',
      priority: payload.urgente ? 'URGENT' : 'NORMAL',
      desk: 'REFERRALS',
      firmId: lawyer.firmId,
      createdByUserId: actor.actorUserId,
      createdByName: actor.actorName,
      lastEntryAt: now,
      entries: {
        create: {
          kind: 'MESSAGE',
          authorUserId: actor.actorUserId,
          authorName: actor.actorName,
          body: resumenDelReferido(payload, { firmName, attorneyName, duplicados }, args.etiquetas),
          sentAt: now,
        },
      },
      recipients: {
        create: [
          ...destinatarios.map((u) => ({ userId: u.id, userName: u.name, kind: 'TO' as const })),
          ...(destinatarios.some((u) => u.id === actor.actorUserId)
            ? []
            : [{ userId: actor.actorUserId, userName: actor.actorName, kind: 'SENDER' as const, lastReadAt: now }]),
        ],
      },
      referral: {
        create: {
          firmId: lawyer.firmId,
          // La ficha de la sesión, si es una persona (la cuenta del bufete no es un abogado).
          attorneyLawyerId: lawyer.isFirmAccount ? null : lawyer.id,
          sentByUserId: actor.actorUserId,
          sentByName: actor.actorName,
          payload: payload as unknown as Prisma.InputJsonValue,
          posiblesDuplicados: repetidos.length
            ? (repetidos.map((r) => ({ id: r.id, patientCode: r.patientCode, name: `${r.lastName}, ${r.firstName}` })) as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      },
    },
    select: { id: true, referral: { select: { id: true } } },
  });

  writeAuditLog(db, {
    ...actor,
    action: 'FIRM_REFERRAL_SENT',
    entityType: 'FirmReferral',
    entityId: thread.referral!.id,
    metadata: {
      threadId: thread.id,
      bufete: firmName,
      comoBufete: lawyer.id,
      urgente: payload.urgente,
      posiblesDuplicados: duplicados,
      respaldo,
      destinatarios: destinatarios.map((d) => d.name),
    },
  }).catch(() => undefined);

  return { ok: true, referralId: thread.referral!.id, threadId: thread.id, duplicados, respaldo };
}

/**
 * El wizard terminó: el referido pasa a CREATED y el hilo queda atado al caso.
 *
 * Idempotente: si otro ya lo convirtió (cuatro personas reciben el mismo
 * mensaje), no se pisa — devuelve quién fue para que la pantalla lo diga.
 */
export async function marcarReferidoCreado(args: {
  referralId: string;
  caseId: string;
  caseCode: string;
  patientId: string;
  actor: ActorConIdentidad;
  /** "Caso {code} creado" — traducido por la ruta. */
  textoRespuesta: string;
}): Promise<{ ok: true } | { ok: false; status: ReferidoStatus; convertedByName: string | null }> {
  const ref = await db.firmReferral.findUnique({
    where: { id: args.referralId },
    select: { id: true, status: true, convertedByName: true, threadId: true, thread: { select: { recipients: { select: { userId: true } } } } },
  });
  if (!ref) return { ok: false, status: 'DISCARDED', convertedByName: null };
  if (ref.status !== 'PENDING') return { ok: false, status: ref.status as ReferidoStatus, convertedByName: ref.convertedByName };

  const now = new Date();
  await db.$transaction([
    db.firmReferral.update({
      where: { id: ref.id },
      data: {
        status: 'CREATED',
        caseId: args.caseId,
        patientId: args.patientId,
        convertedByUserId: args.actor.actorUserId,
        convertedByName: args.actor.actorName,
        convertedAt: now,
      },
    }),
    // El hilo pasa a ser del caso: el chip del caso en la bandeja abre el
    // expediente, y el historial del paciente lo muestra como su primer mensaje.
    db.messageThread.update({
      where: { id: ref.threadId },
      data: { caseId: args.caseId, patientId: args.patientId },
    }),
    db.messageEntry.create({
      data: {
        threadId: ref.threadId,
        kind: 'REPLY',
        authorUserId: args.actor.actorUserId,
        authorName: args.actor.actorName,
        body: args.textoRespuesta,
        sentAt: now,
      },
    }),
    db.messageRecipient.createMany({
      data: [{ threadId: ref.threadId, userId: args.actor.actorUserId, userName: args.actor.actorName, kind: 'SENDER' as const, lastReadAt: now }],
      skipDuplicates: true,
    }),
  ]);
  await reviveThread(ref.threadId, now);
  await db.messageRecipient.updateMany({
    where: { threadId: ref.threadId, userId: args.actor.actorUserId },
    data: { lastReadAt: now },
  });

  writeAuditLog(db, {
    ...args.actor,
    action: 'FIRM_REFERRAL_CONVERTED',
    entityType: 'FirmReferral',
    entityId: ref.id,
    metadata: { caseId: args.caseId, caseCode: args.caseCode, patientId: args.patientId, threadId: ref.threadId },
  }).catch(() => undefined);

  // El abogado se entera: la respuesta "caso creado" es lo que estaba esperando.
  void avisarAbogadosPorEmail({
    threadId: ref.threadId,
    userIds: ref.thread.recipients.map((r) => r.userId),
    autorUserId: args.actor.actorUserId,
    autorNombre: args.actor.actorName,
    caseId: args.caseId,
    patientId: args.patientId,
  }).catch((e) => { console.error('[referidos] aviso al abogado:', e); });

  return { ok: true };
}
