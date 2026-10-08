#!/usr/bin/env node
/**
 * Cartel imprimible con el QR de la consulta de cita, con CIFO señalándolo.
 *
 *   node scripts/cartel-qr-cita.cjs
 *   node scripts/cartel-qr-cita.cjs https://otro.dominio/cita      (otro enlace)
 *
 * Escribe en docs/carteles/ (todo en INGLÉS: es el idioma de casi todos los
 * pacientes):
 *
 *   cartel-qr-cita-media-hoja-claro.pdf/.png     5,5 × 8,5 in, fondo blanco (gasta poca tinta)
 *   cartel-qr-cita-media-hoja-oscuro.pdf/.png    5,5 × 8,5 in, la de la marca
 *   cartel-qr-cita-2-por-hoja-claro.pdf          dos por hoja carta, con línea de corte
 *   cartel-qr-cita-2-por-hoja-oscuro.pdf
 *
 * El formato es MEDIA HOJA CARTA (statement, 5,5 × 8,5 in) y no una hoja entera
 * (Erick, 2026-10-05: "no tan grande"). Se imprime sobre carta, dos por hoja, y se
 * corta por la mitad: así cada cartel sale con una sola impresión.
 *
 * ── Calidad de CIFO ─────────────────────────────────────────────────────────
 *
 * Salía pixelado: se agrandaba un GIF de 200 × 356 px. Ahora sale del cuadro de
 * `cifo-saluda.gif` (300 × 533, con el brazo extendido hacia el QR): 1,5 veces más
 * resolución. Y antes de agrandarlo se le quita la TRAMA del GIF (los GIF solo
 * tienen 256 colores y los simulan con puntitos; al agrandar, esos puntitos se
 * ven como suciedad) con un filtro de mediana, y se suaviza solo el borde de la
 * transparencia, sin tocar el color. Sigue siendo una imagen chica: con un
 * original en alta resolución saldría mejor todavía.
 *
 * ── El QR ───────────────────────────────────────────────────────────────────
 *
 * Se genera con la librería `qrcode` del back-office, con corrección de errores
 * nivel H (tolera ~30 % de daño: un cartel en una pared se ensucia, se dobla y se
 * rasga) y SIN logo en el centro: cada cosa encima del QR le quita margen de
 * lectura, y este se va a escanear desde un metro, con luz de sala de espera.
 *
 * Al terminar, el script LEE el QR que quedó dibujado en la imagen final, módulo
 * por módulo, y lo compara con la matriz del enlace. Si algo no coincide, falla.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = path.resolve(__dirname, '..');
const pnpm = path.join(raiz, 'node_modules', '.pnpm');
const buscar = (prefijo) => {
  const d = fs.readdirSync(pnpm).find(n => n.startsWith(prefijo));
  if (!d) throw new Error('No encuentro ' + prefijo + ' en node_modules/.pnpm — ¿corriste pnpm install?');
  return path.join(pnpm, d, 'node_modules', prefijo.split('@')[0]);
};
const QRCode = require(buscar('qrcode@'));
const sharp = require(buscar('sharp@'));

const URL_CITA = process.argv[2] || 'https://forms.lienmaster.net/cita';
const TEL = '(801) 375-2207';
const salida = path.join(raiz, 'docs', 'carteles');
fs.mkdirSync(salida, { recursive: true });

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

/** Media hoja carta en píxeles CSS (96 por pulgada). */
const W = 528, H = 816;

/**
 * El cuadro de CIFO señalando, listo para imprimir.
 * Ver "Calidad de CIFO" arriba.
 */
async function cifoPng() {
  const gif = path.join(raiz, 'apps', 'forms', 'public', 'cifo-saluda.gif');
  const grande = await sharp(gif, { page: 28 }).ensureAlpha().resize({ height: 1066, kernel: 'lanczos3' }).png().toBuffer();
  // Borde: se suaviza y se aprieta un poco (así no quedan píxeles del halo oscuro del GIF).
  const alfa = await sharp(grande).extractChannel('alpha').blur(2.0).linear(1.6, -70).png().toBuffer();
  // Color: mediana para quitar la trama de puntitos, y un toque de nitidez para recuperar el contorno.
  const sinTrama = await sharp(await sharp(grande).removeAlpha().png().toBuffer()).median(3).png().toBuffer();
  const color = await sharp(sinTrama).sharpen({ sigma: 0.9 }).png().toBuffer();
  const buf = await sharp(color).joinChannel(alfa).png().toBuffer();
  return 'data:image/png;base64,' + buf.toString('base64');
}

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif; }
  .page { width: ${W}px; height: ${H}px; position: relative; overflow: hidden; padding: 30px 30px 22px;
    display: flex; flex-direction: column; flex-shrink: 0; }
  .dark  { background: radial-gradient(ellipse at 78% 38%, #12306b 0%, #0b1a3a 45%, #07101f 100%); color: #fff; }
  .light { background: #fff; color: #0B1F4D; }
  header { display: flex; align-items: center; gap: 10px; }
  .mark { width: 40px; height: 40px; border-radius: 11px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #1E40AF 0%, #2563EB 50%, #38BDF8 100%); }
  .brand b { display: block; font-size: 16px; letter-spacing: .02em; line-height: 1.15; }
  .brand span { font-size: 9px; letter-spacing: .16em; text-transform: uppercase; opacity: .6; }
  h1 { margin-top: 18px; font-size: 40px; line-height: 1.02; font-weight: 900; letter-spacing: -.03em; }
  .dark h1 em  { font-style: normal; color: #38BDF8; }
  .light h1 em { font-style: normal; color: #1D4ED8; }
  .lead { margin-top: 8px; font-size: 14.5px; opacity: .8; }
  .hero { position: relative; margin-top: 16px; height: 300px; display: flex; align-items: center; flex-shrink: 0; }
  .qrcard { width: 268px; padding: 16px 16px 12px; border-radius: 22px; background: #fff; color: #0B1F4D; text-align: center;
    position: relative; z-index: 2; }
  .dark  .qrcard { box-shadow: 0 14px 38px rgba(0,0,0,.45); }
  .light .qrcard { box-shadow: 0 10px 26px rgba(0,0,0,.14); border: 2.5px solid #0B1F4D; }
  .qr svg { width: 236px; height: 236px; display: block; margin: 0 auto; }
  .cap { margin-top: 9px; font-size: 14.5px; font-weight: 800; letter-spacing: .01em; }
  .cap small { display: block; margin-top: 1px; font-size: 10px; font-weight: 600; opacity: .6; letter-spacing: .04em; }
  .cifo-bg { position: absolute; right: -4px; bottom: -6px; width: 228px; height: 292px; border-radius: 28px; z-index: 0;
    background: linear-gradient(160deg, #1E40AF 0%, #2563EB 55%, #38BDF8 100%); }
  .cifo { position: absolute; right: -4px; bottom: -6px; width: 228px; height: 306px; z-index: 1; }
  .cifo img { position: absolute; right: 18px; bottom: 0; height: 290px; width: auto;
    filter: drop-shadow(0 10px 14px rgba(0,0,0,.35)); }
  .bubble { position: absolute; right: 46px; top: 0; z-index: 3; border-radius: 17px; padding: 8px 15px;
    font-size: 21px; font-weight: 900; letter-spacing: -.01em; box-shadow: 0 8px 18px rgba(0,0,0,.28); }
  .bubble:after { content: ""; position: absolute; left: 62px; bottom: -10px; border: 9px solid transparent; border-bottom: 0; }
  .dark  .bubble { background: #fff; color: #0B1F4D; }
  .dark  .bubble:after { border-top: 11px solid #fff; }
  .light .bubble { background: #1D4ED8; color: #fff; }
  .light .bubble:after { border-top: 11px solid #1D4ED8; }
  .steps { margin-top: 18px; display: flex; flex-direction: column; gap: 7px; }
  .step { display: flex; align-items: center; gap: 12px; border-radius: 14px; padding: 8px 14px 8px 10px; }
  .dark  .step { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); }
  .light .step { background: #EEF4FF; border: 1px solid #C9DBFF; }
  .step .n { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    font-weight: 900; font-size: 14px; }
  .dark  .step .n { background: #38BDF8; color: #07101f; }
  .light .step .n { background: #1D4ED8; color: #fff; }
  .step h3 { font-size: 14px; font-weight: 800; line-height: 1.2; }
  .step p { margin-top: 1px; font-size: 11px; line-height: 1.3; opacity: .75; }
  footer { margin-top: auto; padding-top: 10px; display: flex; flex-direction: column; gap: 7px; }
  .dark  footer { border-top: 1px solid rgba(255,255,255,.15); }
  .light footer { border-top: 1px solid #C9DBFF; }
  .prot { display: flex; align-items: center; gap: 8px; font-size: 11px; line-height: 1.3; }
  .prot svg { flex-shrink: 0; }
  .contact { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; }
  .contact b { font-size: 13.5px; }
  /* dos por hoja */
  .sheet { display: flex; width: ${W * 2}px; height: ${H}px; position: relative; }
  .corte { position: absolute; left: ${W}px; top: 0; bottom: 0; border-left: 1.5px dashed #9AA7C2; z-index: 5; }
  @page { margin: 0; }
`;

const iconoCandado = (color) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const logoSvg = `<svg width="22" height="22" viewBox="0 0 36 36" fill="none"><rect x="13" y="2" width="10" height="32" rx="2.5" fill="white" fill-opacity=".95"/><rect x="2" y="13" width="32" height="10" rx="2.5" fill="white" fill-opacity=".95"/><path d="M8 18 L11 18 L13 14 L15 22 L17 16 L19 20 L21 18 L28 18" stroke="#1E40AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

function poster(oscuro, qrSvg, cifo) {
  const ink = oscuro ? '#38BDF8' : '#1D4ED8';
  const mostrarUrl = URL_CITA.replace(/^https?:\/\//, '');
  return `<div class="page ${oscuro ? 'dark' : 'light'}">
  <header>
    <div class="mark">${logoSvg}</div>
    <div class="brand"><b>Precision Medical</b><span>Patient Portal</span></div>
  </header>

  <h1>Check your<br><em>appointment</em></h1>
  <p class="lead">Scan the code with your phone’s camera.</p>

  <section class="hero">
    <div class="qrcard">
      <div class="qr">${qrSvg}</div>
      <div class="cap">Point your camera here<small>No app needed</small></div>
    </div>
    ${oscuro ? '' : '<div class="cifo-bg"></div>'}
    <div class="cifo">
      <div class="bubble">Scan me!</div>
      <img src="${cifo}" alt="CIFO">
    </div>
  </section>

  <section class="steps">
    <div class="step"><div class="n">1</div><div><h3>Scan the code</h3><p>Open your phone’s camera and point it at the QR code.</p></div></div>
    <div class="step"><div class="n">2</div><div><h3>Enter your details</h3><p>Type your case code and date of birth. Your code is in your confirmation message.</p></div></div>
    <div class="step"><div class="n">3</div><div><h3>See your appointment</h3><p>We’ll show you the date, the time and where to go.</p></div></div>
  </section>

  <footer>
    <div class="prot">${iconoCandado(ink)}<span><b>Your information is protected.</b> We only show basic appointment details, never medical information.</span></div>
    <div class="contact"><b>${mostrarUrl}</b><span>Questions? Call ${TEL}</span></div>
  </footer>
</div>`;
}

const doc = (cuerpo, extraBody = '', script = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Check your appointment — Precision Medical</title><style>${css}</style></head><body${extraBody}>${cuerpo}${script}</body></html>`;

function chrome(args) {
  if (!CHROME) throw new Error('No encuentro Chrome ni Edge para sacar el PDF.');
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', ...args], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r.stdout || '';
}

const aUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

/** Cuánto se pasa el contenido del alto de la página (debe ser 0), y dónde quedó el QR. Lo mide Chrome. */
function medir(htmlPath) {
  const medidor = `<script>
    addEventListener('load', function () {
      var q = document.querySelector('.qr svg').getBoundingClientRect(), p = document.querySelector('.page');
      document.body.setAttribute('data-medida', JSON.stringify({ x: q.left, y: q.top, w: q.width, h: q.height, sobra: p.scrollHeight - p.clientHeight }));
    });
  </script>`;
  const tmp = htmlPath.replace(/\.html$/, '.medida.html');
  fs.writeFileSync(tmp, fs.readFileSync(htmlPath, 'utf8').replace('</body>', medidor + '</body>'));
  const dom = chrome(['--virtual-time-budget=4000', '--dump-dom', aUrl(tmp)]);
  fs.unlinkSync(tmp);
  const m = /data-medida="([^"]+)"/.exec(dom);
  if (!m) throw new Error('No pude medir el cartel.');
  return JSON.parse(m[1].replace(/&quot;/g, '"'));
}

/** Lee el QR de la imagen final, módulo por módulo, y lo compara con la matriz del enlace. */
async function verificarQr(pngPath, med) {
  const mat = QRCode.create(URL_CITA, { errorCorrectionLevel: 'H' }).modules;
  const n = mat.size;
  const { data, info } = await sharp(pngPath).grayscale().raw().toBuffer({ resolveWithObject: true });
  const S = info.width / W;
  const lado = med.w * S, mod = lado / n;
  let mal = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const px = Math.round(med.x * S + (c + .5) * mod), py = Math.round(med.y * S + (r + .5) * mod);
    if ((data[py * info.width + px] < 128) !== !!mat.get(r, c)) mal++;
  }
  return { n, mal };
}

(async () => {
  const qrSvg = await QRCode.toString(URL_CITA, {
    type: 'svg', errorCorrectionLevel: 'H', margin: 0, color: { dark: '#0B1F4D', light: '#FFFFFF' },
  });
  const cifo = await cifoPng();
  let fallo = false;

  for (const oscuro of [false, true]) {
    const tema = oscuro ? 'oscuro' : 'claro';

    // ── media hoja ──
    const base = path.join(salida, `cartel-qr-cita-media-hoja-${tema}`);
    fs.writeFileSync(base + '.html', doc(poster(oscuro, qrSvg, cifo)).replace('</style>', '@page { size: 5.5in 8.5in; margin: 0; }</style>'));
    const med = medir(base + '.html');
    chrome([`--print-to-pdf=${base}.pdf`, '--no-pdf-header-footer', aUrl(base + '.html')]);
    chrome([`--screenshot=${base}.png`, `--window-size=${W},${H}`, '--force-device-scale-factor=3', aUrl(base + '.html')]);
    const v = await verificarQr(base + '.png', med);
    console.log(`media hoja ${tema}: contenido que se pasa del alto = ${Math.round(med.sobra)}px | QR ${v.n}x${v.n}, módulos mal leídos: ${v.mal}`);
    if (med.sobra > 0 || v.mal > 0) fallo = true;

    // ── dos por hoja (carta horizontal) ──
    const dos = path.join(salida, `cartel-qr-cita-2-por-hoja-${tema}`);
    const p = poster(oscuro, qrSvg, cifo);
    fs.writeFileSync(dos + '.html', doc(`<div class="sheet">${p}${p}<div class="corte"></div></div>`)
      .replace('</style>', `@page { size: 11in 8.5in; margin: 0; } html, body { width: ${W * 2}px; height: ${H}px; }</style>`));
    chrome([`--print-to-pdf=${dos}.pdf`, '--no-pdf-header-footer', aUrl(dos + '.html')]);
    console.log(`2 por hoja ${tema}: listo`);
  }

  console.log('enlace del QR:', URL_CITA);
  if (fallo) { console.error('ERR: el cartel no pasó la verificación'); process.exit(1); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
