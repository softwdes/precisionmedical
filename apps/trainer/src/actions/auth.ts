'use server';

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export async function sendPasswordResetEmail(email: string): Promise<{ error?: string }> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Look up trainer name via auth.users → trainers.business_name
    let trainerName = 'Trainer';
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = users.find(u => u.email?.toLowerCase() === email.trim().toLowerCase());
    if (authUser?.id) {
      const { data: trainer } = await admin
        .from('trainers')
        .select('business_name')
        .eq('user_id', authUser.id)
        .single();
      if (trainer?.business_name) trainerName = trainer.business_name;
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim().toLowerCase(),
      options: { redirectTo: 'https://app.neuraltrainergym.com/reset-password' },
    });

    if (error) return { error: error.message };

    const fullUrl: string = (data as any)?.properties?.action_link ?? '';
    if (!fullUrl) return { error: 'No se pudo generar el enlace de recuperación' };

    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32])
      .join('');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: insertError } = await admin
      .from('invite_links')
      .insert({ code, full_url: fullUrl, expires_at: expiresAt });

    const inviteUrl = insertError
      ? fullUrl
      : `https://app.neuraltrainergym.com/acceso/${code}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailError } = await resend.emails.send({
      from: 'Neural Trainer Gym <noreply@neuraltrainergym.com>',
      to: email.trim(),
      subject: 'Restablecé tu contraseña — Neural Trainer Gym',
      html: buildResetEmail(trainerName, inviteUrl),
    });

    if (emailError) return { error: `Error al enviar email: ${(emailError as any).message ?? 'desconocido'}` };

    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function sendStudentInvitation(
  studentId: string,
  email: string,
  fullName: string,
): Promise<{ error?: string }> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const studentAppUrl = process.env.NEXT_PUBLIC_STUDENT_APP_URL ?? 'https://student.neuraltrainergym.com';

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: email.trim().toLowerCase(),
      options: { redirectTo: `${studentAppUrl}/reset-password` },
    });

    if (error) return { error: error.message };

    const fullUrl: string = (data as any)?.properties?.action_link ?? '';
    if (!fullUrl) return { error: 'No se pudo generar el enlace de acceso' };

    // Update student user_id with the newly created auth user
    const userId: string | undefined = (data as any)?.user?.id;
    if (userId) {
      await admin.from('students').update({ user_id: userId }).eq('id', studentId);
    }

    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32])
      .join('');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await admin
      .from('invite_links')
      .insert({ code, full_url: fullUrl, expires_at: expiresAt });

    const inviteUrl = insertError
      ? fullUrl
      : `${studentAppUrl}/acceso/${code}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Neural Trainer Gym <noreply@neuraltrainergym.com>',
      to: email.trim(),
      subject: 'Tu acceso a Neural Trainer Gym',
      html: buildStudentInviteEmail(fullName, inviteUrl),
    });

    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function buildStudentInviteEmail(name: string, link: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#020c10;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding-bottom:28px">
    <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.06em;line-height:1.1">NEURAL</div>
    <div style="font-size:22px;font-weight:900;color:#00c8b4;letter-spacing:0.06em;line-height:1.2">TRAINER GYM</div>
    <div style="font-size:10px;font-weight:600;color:rgba(0,200,180,0.6);letter-spacing:2px;text-transform:uppercase;margin-top:8px">Sistema de Personal Trainer</div>
  </td></tr>
  <tr><td style="background:rgba(5,20,25,0.95);border:1px solid rgba(0,200,180,0.2);border-radius:8px;padding:32px">
    <p style="color:#c8f0eb;font-size:15px;line-height:1.7;margin:0 0 20px">¡Hola <strong>${name}</strong>!</p>
    <p style="color:#c8f0eb;font-size:15px;line-height:1.7;margin:0 0 28px">Tu cuenta en Neural Trainer Gym está lista. Hacé clic en el botón para configurar tu contraseña y acceder a la plataforma.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:28px">
      <a href="${link}" style="display:inline-block;background:#00c8b4;color:#020c10;text-decoration:none;padding:14px 36px;border-radius:6px;font-weight:900;font-size:11px;letter-spacing:3px;text-transform:uppercase">CONFIGURAR ACCESO</a>
    </td></tr></table>
    <p style="color:rgba(0,200,180,0.45);font-size:11px;text-align:center;line-height:1.7;margin:0">Este enlace es válido por 24 horas y es de uso único.<br>Si no esperabas este correo, podés ignorarlo.<br><br>Si el botón no funciona, copiá este enlace:<br><span style="word-break:break-all;color:rgba(0,200,180,0.6)">${link}</span></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function buildResetEmail(name: string, link: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#020c10;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding-bottom:28px">
    <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:0.06em;line-height:1.1">NEURAL</div>
    <div style="font-size:22px;font-weight:900;color:#00c8b4;letter-spacing:0.06em;line-height:1.2">TRAINER GYM</div>
    <div style="font-size:10px;font-weight:600;color:rgba(0,200,180,0.6);letter-spacing:2px;text-transform:uppercase;margin-top:8px">Sistema de Personal Trainer</div>
  </td></tr>
  <tr><td style="background:rgba(5,20,25,0.95);border:1px solid rgba(0,200,180,0.2);border-radius:8px;padding:32px">
    <p style="color:#c8f0eb;font-size:15px;line-height:1.7;margin:0 0 20px">¡Hola <strong>${name}</strong>!</p>
    <p style="color:#c8f0eb;font-size:15px;line-height:1.7;margin:0 0 28px">Recibimos una solicitud para restablecer tu contraseña. Hacé clic en el botón para crear una nueva contraseña y acceder a la plataforma.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:28px">
      <a href="${link}" style="display:inline-block;background:#00c8b4;color:#020c10;text-decoration:none;padding:14px 36px;border-radius:6px;font-weight:900;font-size:11px;letter-spacing:3px;text-transform:uppercase">RESTABLECER CONTRASEÑA</a>
    </td></tr></table>
    <p style="color:rgba(0,200,180,0.45);font-size:11px;text-align:center;line-height:1.7;margin:0">Este enlace es válido por 1 hora y es de uso único.<br>Si no solicitaste este cambio, podés ignorar este correo.<br><br>Si el botón no funciona, copiá este enlace:<br><span style="word-break:break-all;color:rgba(0,200,180,0.6)">${link}</span></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
