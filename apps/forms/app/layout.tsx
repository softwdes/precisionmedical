import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { SWRegister } from '@/components/SWRegister';
import './globals.css';

/**
 * Portal del Paciente — Layout
 *
 * El portal maneja bilingüe (ES/EN) localmente via useState en cada componente.
 * NO usa next-intl routing: los pacientes llegan via magic link,
 * no hay rutas i18n que resolver.
 */

const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  title: 'Precision Medical · Portal del Paciente',
  description: 'Precision Medical — Portal del paciente (magic link)',
  manifest: '/manifest.json',
};

/**
 * Mobile-first: el paciente entra desde su celular.
 *
 * ── Se quitó el bloqueo del zoom (2026-09-17) ──────────────────────────────
 *
 * Tenía `maximumScale: 1` y `userScalable: false`, que es pedirle al navegador
 * que NO deje agrandar la pantalla con los dedos.
 *
 * Eso está mal acá por una razón que no tiene nada que ver con lo técnico: es
 * un formulario médico y buena parte de quien lo llena es gente grande. La
 * paciente del 17-sep que se fue sin terminar nació en 1950. Si la letra le
 * queda chica, con ese bloqueo no tenía ninguna salida.
 *
 * En la práctica Safari de iOS ignora estas dos propiedades desde iOS 10,
 * justamente por accesibilidad, así que quitarlas probablemente no cambie nada
 * visible. Pero dejamos de pedir algo que no queremos, y en cualquier navegador
 * que sí las respete el paciente recupera el gesto.
 *
 * Salió mientras se buscaba por qué una iPad no respondía a los toques. No es
 * la causa de aquello —hasta donde se pudo ver— pero se encontró ahí.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#06B6D4',
};

/**
 * ⚠️ `translate="no"` NO es una preferencia: es lo que evita que el formulario
 * se caiga a la mitad.
 *
 * El 30-sep una paciente llenó el formulario entero y no pudo pasar del paso de
 * consentimientos. Ella dijo que lo intentó diez veces; el audit le cuenta
 * **50 guardados de paso** contra un promedio de 10 y un máximo de 27 entre los
 * que SÍ terminaron. En su captura se ve la causa: los
 * botones de idioma decían **"IN" / "IS"** en vez de "EN" / "ES", y el logo
 * "P.M" en vez de "PM". Nosotros no escribimos eso en ningún lado — se lo
 * escribió **el traductor automático de Chrome**.
 *
 * Con `<html lang="en-US">` fijo, el teléfono de un paciente hispanohablante ve
 * una página "en inglés" y la traduce solo. Al traducir, reemplaza los nodos de
 * texto del DOM por otros nuevos; React sigue apuntando a los viejos y la
 * primera vez que intenta actualizarlos tira
 * `NotFoundError: Failed to execute 'removeChild' on 'Node'`. Eso sube al
 * error boundary y el paciente ve "Something went wrong". Recargar no ayuda:
 * vuelve a traducir y vuelve a romper.
 *
 * Por eso pega justo en los pasos con más movimiento —consentimientos, con sus
 * casillas y su firma—: cada cambio de estado toca un nodo que ya no existe.
 *
 * Y la traducción del navegador acá no hace falta: el formulario **ya tiene su
 * propio selector ES/EN**, y el paciente elige el idioma en la primera pantalla.
 *
 * Los tres juntos, que es lo que respetan los distintos navegadores:
 *  · `translate="no"` en el `<html>` — el estándar HTML.
 *  · `class="notranslate"` — lo que mira Google Translate.
 *  · `<meta name="google" content="notranslate">` — la barra de traducción.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className={font.className} suppressHydrationWarning>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
