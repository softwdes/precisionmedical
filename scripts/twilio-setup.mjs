/**
 * Script de setup Twilio — ejecutar UNA sola vez.
 * Crea el TwiML App que necesita el Voice SDK para llamadas outbound.
 *
 * Uso:
 *   node scripts/twilio-setup.mjs
 *
 * Requiere estas variables en el entorno (o en scripts/.env.twilio):
 *   TWILIO_ACCOUNT_SID=AC...
 *   TWILIO_API_KEY_SID=SK...
 *   TWILIO_API_KEY_SECRET=...
 *   BACK_OFFICE_URL=https://admin.lienmaster.net   (sin slash al final)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Cargar .env.twilio si existe
try {
  const env = readFileSync(join(__dir, '.env.twilio'), 'utf8');
  for (const line of env.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  }
} catch { /* sin archivo local, usa env del sistema */ }

const ACCOUNT_SID    = process.env.TWILIO_ACCOUNT_SID;
const API_KEY_SID    = process.env.TWILIO_API_KEY_SID;
const API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;
const BASE_URL       = process.env.BACK_OFFICE_URL ?? 'https://admin.lienmaster.net';

if (!ACCOUNT_SID || !API_KEY_SID || !API_KEY_SECRET) {
  console.error('❌  Faltan variables: TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET');
  process.exit(1);
}

const auth = Buffer.from(`${API_KEY_SID}:${API_KEY_SECRET}`).toString('base64');
const voiceUrl = `${BASE_URL}/api/twilio/voice`;
const statusUrl = `${BASE_URL}/api/twilio/call-status`;

console.log('🔧  Creando TwiML App...');
console.log(`   Voice URL:  ${voiceUrl}`);
console.log(`   Status URL: ${statusUrl}`);

const res = await fetch(
  `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Applications.json`,
  {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      FriendlyName:            'Precision Medical Back-Office Voice',
      VoiceUrl:                voiceUrl,
      VoiceMethod:             'POST',
      StatusCallback:          statusUrl,
      StatusCallbackMethod:    'POST',
    }),
  }
);

if (!res.ok) {
  const body = await res.text();
  console.error('❌  Error al crear la app:', res.status, body);
  process.exit(1);
}

const app = await res.json();
console.log('\n✅  TwiML App creado exitosamente');
console.log('━'.repeat(50));
console.log(`   TWILIO_TWIML_APP_SID=${app.sid}`);
console.log('━'.repeat(50));
console.log('\n👉  Agrega esta variable en Vercel → back-office → Environment Variables');
console.log('    y en tu .env.local si pruebas en local.\n');
