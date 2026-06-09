import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const STAGING_PW = process.env.STAGING_PASSWORD;
const COOKIE     = 'pm_stg';

export function middleware(req: NextRequest) {
  if (!STAGING_PW) return NextResponse.next();
  if (req.cookies.get(COOKIE)?.value === STAGING_PW) return NextResponse.next();

  const callbackUrl = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Precision Medical · Staging</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#08090f,#0f1428);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
    .card{background:#131a2e;border:1px solid rgba(99,102,241,.25);border-radius:16px;
      padding:36px 32px;width:360px;
      box-shadow:0 32px 80px rgba(0,0,0,.6),0 0 0 1px rgba(99,102,241,.06)}
    .logo{text-align:center;font-size:30px;margin-bottom:10px}
    h1{color:#fff;font-size:19px;font-weight:700;text-align:center;letter-spacing:-.3px}
    .sub{color:rgba(255,255,255,.4);font-size:12px;text-align:center;margin-top:4px;margin-bottom:28px}
    label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;
      color:rgba(255,255,255,.45);margin-bottom:6px;font-weight:700}
    input[type=password]{width:100%;padding:11px 14px;border-radius:10px;
      border:1px solid rgba(255,255,255,.10);background:#0a0e1e;color:#fff;
      font-size:14px;outline:none;transition:border-color .15s}
    input[type=password]:focus{border-color:rgba(245,158,11,.55);
      box-shadow:0 0 0 3px rgba(245,158,11,.10)}
    .btn{width:100%;margin-top:18px;padding:12px;border-radius:10px;
      background:#f59e0b;color:#000;font-size:13px;font-weight:800;
      border:none;cursor:pointer;letter-spacing:.02em;transition:background .15s}
    .btn:hover{background:#d97706}
    .footer{margin-top:22px;text-align:center;font-size:11px;color:rgba(255,255,255,.22);
      line-height:1.6}
    .dot{display:inline-block;width:6px;height:6px;border-radius:50%;
      background:#34d399;margin-right:5px;vertical-align:middle}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚕️</div>
    <h1>Precision Medical</h1>
    <div class="sub">LienMaster v2 · Entorno de staging</div>

    <form method="POST" action="/api/staging-auth">
      <input type="hidden" name="callbackUrl" value="${callbackUrl}" />
      <label>Contraseña de acceso</label>
      <input type="password" name="password" placeholder="••••••••" autofocus required />
      <button class="btn" type="submit">Entrar →</button>
    </form>

    <div class="footer">
      <span class="dot"></span>
      Base de datos de desarrollo · Sin PHI real · Solo acceso interno
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/staging-auth).*)',
  ],
};
