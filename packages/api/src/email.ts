import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM_EMAIL ?? 'LM Super Admin <onboarding@resend.dev>';

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Precision Medical</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:'Plus Jakarta Sans',system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%);border-radius:12px;padding:24px 28px;margin-bottom:24px;text-align:center;">
      <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 16px;margin-bottom:10px;">
        <span style="color:white;font-weight:800;font-size:16px;letter-spacing:0.1em;">LM</span>
      </div>
      <p style="margin:0;color:rgba(255,255,255,0.9);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Precision Medical — Super Admin</p>
    </div>
    <div style="background:#111118;border:1px solid #1E1E2E;border-radius:12px;padding:28px;">
      ${content}
    </div>
    <p style="text-align:center;color:#3D3D52;font-size:11px;margin-top:20px;">
      © ${new Date().getFullYear()} Precision Medical Care · Este es un mensaje automático
    </p>
  </div>
</body>
</html>`;
}

export async function sendWelcomeEmail({
  to,
  firstName,
  role,
  activationLink,
}: {
  to: string;
  firstName: string;
  role: string;
  activationLink: string;
}): Promise<void> {
  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', EMPLOYEE: 'Empleado',
    LAWYER: 'Abogado', PROVIDER: 'Proveedor', AUDITOR_AI: 'AI Auditor',
  };

  const html = baseTemplate(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,rgba(99,102,241,0.2) 0%,rgba(139,92,246,0.2) 100%);border:1px solid rgba(99,102,241,0.3);">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
    </div>
    <h2 style="color:#E2E2EE;font-size:22px;font-weight:700;margin:0 0 8px;text-align:center;">Bienvenido, ${firstName}</h2>
    <p style="color:#8888AA;font-size:13px;margin:0 0 24px;line-height:1.6;text-align:center;">
      Tu cuenta ha sido creada en <strong style="color:#E2E2EE;">LM Super Admin</strong> de Precision Medical.<br/>
      Activa tu cuenta para comenzar.
    </p>
    <div style="background:linear-gradient(135deg,rgba(99,102,241,0.08) 0%,rgba(139,92,246,0.08) 100%);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;gap:14px;">
      <div style="flex-shrink:0;width:36px;height:36px;border-radius:8px;background:rgba(99,102,241,0.15);display:flex;align-items:center;justify-content:center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      </div>
      <div>
        <p style="margin:0 0 2px;color:#8888AA;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;">Rol asignado</p>
        <p style="margin:0;color:#A5B4FC;font-size:14px;font-weight:600;">${roleLabels[role] ?? role}</p>
      </div>
    </div>
    <p style="color:#8888AA;font-size:13px;margin:0 0 20px;line-height:1.6;text-align:center;">
      Haz clic en el botón para crear tu contraseña y acceder al sistema.
    </p>
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${activationLink}"
         style="display:inline-block;background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 60%,#7C3AED 100%);color:white;font-weight:700;font-size:15px;padding:14px 36px;border-radius:14px;text-decoration:none;letter-spacing:0.02em;box-shadow:0 8px 24px rgba(99,102,241,0.45),0 2px 8px rgba(0,0,0,0.4);">
        Activar mi cuenta →
      </a>
    </div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,#1E1E2E,transparent);margin-bottom:16px;"></div>
    <p style="color:#3D3D52;font-size:11px;margin:0;text-align:center;line-height:1.8;">
      Este enlace expira en <strong style="color:#555568;">24 horas</strong>.<br/>
      Si no solicitaste esta cuenta, puedes ignorar este mensaje.
    </p>
  `);

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Bienvenido a LM Super Admin, ${firstName}`,
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendPasswordResetEmail({
  to,
  resetLink,
}: {
  to: string;
  resetLink: string;
}): Promise<void> {
  const html = baseTemplate(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
    </div>
    <h2 style="color:#E2E2EE;font-size:18px;font-weight:700;margin:0 0 10px;text-align:center;">Reset your password</h2>
    <p style="color:#8888AA;font-size:13px;margin:0 0 24px;line-height:1.6;text-align:center;">
      We received a request to reset your <strong style="color:#E2E2EE;">LM Super Admin</strong> password.<br/>Click the button below to create a new one.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${resetLink}"
         style="display:inline-block;background:linear-gradient(135deg,#6366F1 0%,#8B5CF6 50%,#06B6D4 100%);color:white;font-weight:700;font-size:14px;padding:13px 32px;border-radius:12px;text-decoration:none;box-shadow:0 8px 32px rgba(99,102,241,0.45);">
        Reset password
      </a>
    </div>
    <p style="color:#3D3D52;font-size:11px;margin:0;text-align:center;line-height:1.6;">
      This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
    </p>
  `);

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reset your LM Super Admin password',
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendLowBalanceEmail({
  to,
  boxName,
  balance,
  threshold,
  currency,
}: {
  to: string;
  boxName: string;
  balance: number;
  threshold: number;
  currency: string;
}): Promise<void> {
  const html = baseTemplate(`
    <div style="text-align:center;margin-bottom:20px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;background:#F59E0B1A;border:1px solid #F59E0B44;border-radius:50%;width:48px;height:48px;">
        <span style="font-size:24px;">⚠️</span>
      </div>
    </div>
    <h2 style="color:#E2E2EE;font-size:18px;font-weight:700;margin:0 0 8px;text-align:center;">Saldo bajo en caja chica</h2>
    <p style="color:#8888AA;font-size:13px;margin:0 0 20px;line-height:1.6;text-align:center;">
      La caja <strong style="color:#E2E2EE;">${boxName}</strong> ha caído por debajo del umbral mínimo configurado.
    </p>
    <div style="background:#0A0A0F;border:1px solid #F59E0B33;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <span style="color:#8888AA;font-size:12px;">Saldo actual</span>
        <span style="color:#F43F5E;font-weight:700;font-size:15px;font-family:monospace;">${currency} ${balance.toLocaleString()}</span>
      </div>
      <div style="height:1px;background:#1E1E2E;margin-bottom:10px;"></div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8888AA;font-size:12px;">Umbral mínimo</span>
        <span style="color:#F59E0B;font-weight:600;font-size:13px;font-family:monospace;">${currency} ${threshold.toLocaleString()}</span>
      </div>
    </div>
    <p style="color:#8888AA;font-size:12px;margin:0;text-align:center;line-height:1.6;">
      Ingresa al sistema para registrar un depósito y reponer el saldo de la caja.
    </p>
  `);

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `⚠️ Saldo bajo en caja "${boxName}" — ${currency} ${balance.toLocaleString()}`,
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}
