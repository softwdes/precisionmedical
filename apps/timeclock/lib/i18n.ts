'use client';

import { useEffect, useState } from 'react';

export type Locale = 'es' | 'en';

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'es';
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

interface Dict {
  // ─── Login ──────────────────────────────────────────────────────────
  sessionExpired: string;
  invalidCredentials: string;
  signingIn: string;
  signIn: string;
  systemOnline: string;
  footer: string;

  // ─── Greeting (by hour of day) ──────────────────────────────────────
  greetMorning:   (name: string) => string;
  greetAfternoon: (name: string) => string;
  greetEvening:   (name: string) => string;
  greetNight:     (name: string) => string;

  // ─── Employee type labels ───────────────────────────────────────────
  empTypeFullTime: string;
  empTypePartTime: string;

  // ─── Schedule context card (when idle) ──────────────────────────────
  scheduleStartsIn:    (mins: number) => string;
  scheduleStartedMinAgo: (mins: number) => string;
  scheduleStarting:    string;                          // "ya es hora"
  scheduleTodayLine:   (durH: number, clinic: string, end: string) => string;

  // ─── Stats progress vs goal ────────────────────────────────────────
  statProgressOf: (pct: number, goalH: number) => string;

  // ─── Geo banner (prompt) ────────────────────────────────────────────
  geoTitle: string;
  geoBody: string;
  geoNote: string;
  geoBannerNeutral: string;       // unified one-liner replacing geoBody+geoNote

  // ─── Geo banner (denied) ────────────────────────────────────────────
  geoBlockedTitle: string;
  geoBlockedBody: string;
  geoBlockedHowTo: string;             // collapsed-state CTA "Cómo activarla"
  geoBlockedRetry: string;              // after expand: "Ya la activé, intentar de nuevo"
  geoBlockedSystemOff: string;          // when error code = POSITION_UNAVAILABLE
  // Step-by-step instructions per browser. Each is an array of short lines.
  geoStepsChromeAndroid:  string[];
  geoStepsSamsungInternet: string[];
  geoStepsIosSafari:      string[];
  geoStepsIosPwa:         string[];   // installed to home screen — must use iOS Settings
  geoStepsIosWebView:     string[];
  geoStepsDesktopChrome:  string[];
  geoStepsGeneric:        string[];

  // ─── Location warning chip ──────────────────────────────────────────
  locOutOfRange: string;
  locLowAccuracy: string;
  locNoPermission: string;
  locUnknown: string;

  // ─── Strict geofencing errors ───────────────────────────────────────
  geoStrictOutOfRange: string;
  geoStrictNoPermission: string;

  // ─── Late notice ────────────────────────────────────────────────────
  lateBy: (mins: number) => string;

  // ─── Action errors ──────────────────────────────────────────────────
  duplicateOpenShift: string;
  saveError: string;

  // ─── Wrong-role screen ──────────────────────────────────────────────
  wrongRoleTitle: string;
  wrongRoleBody: (role: string) => string;

  // ─── Profile-error screen ───────────────────────────────────────────
  profileErrorTitle: string;
  profileErrorBody: string;

  // ─── Main UI ────────────────────────────────────────────────────────
  exit: string;
  noRecordToday: string;
  working: string;
  onBreak: string;
  shiftComplete: string;
  entryLabel: string;
  breakLabel: string;
  todayShort: string;
  hoursWorkedSuffix: string;
  selectClinic: string;
  saving: string;
  backToWork: string;
  newShift: string;
  retry: string;
  signOut: string;
  clockInBtn: string;
  breakBtn: string;
  clockOutBtn: string;

  // ─── Stats bar ──────────────────────────────────────────────────────
  statToday: string;
  statWeek: string;
  statMonth: string;

  // ─── PWA install banner ─────────────────────────────────────────────
  pwaInstallTitle: string;
  pwaInstallBody: string;
  pwaInstallButton: string;
  pwaInstallDismiss: string;
  pwaIosTitle: string;
  pwaIosBody: string;
  pwaIosStep1: string;
  pwaIosStep2: string;
  pwaIosStep3: string;
  pwaIosWebViewTitle: string;
  pwaIosWebViewBody: string;

  // ─── BCP 47 tag for Intl APIs (toLocaleTimeString, etc.) ────────────
  intl: string;
}

const dict: Record<Locale, Dict> = {
  es: {
    greetMorning:   (n) => `Buenos días, ${n}`,
    greetAfternoon: (n) => `Buenas tardes, ${n}`,
    greetEvening:   (n) => `Buenas noches, ${n}`,
    greetNight:     (n) => `Hola, ${n}`,
    empTypeFullTime: 'Tiempo completo',
    empTypePartTime: 'Tiempo parcial',
    scheduleStartsIn:      (m) => `Tu turno comienza en ${m} min`,
    scheduleStartedMinAgo: (m) => `Tu turno comenzó hace ${m} min`,
    scheduleStarting:      'Tu turno es ahora',
    scheduleTodayLine:     (h, c, e) => `Hoy: ${h}h en ${c} hasta las ${e}`,
    statProgressOf:        (p, g) => `${p}% de ${g}h`,
    geoBannerNeutral: 'para verificar tu lugar de trabajo. El registro se guarda igual sin permiso.',
    sessionExpired: 'Tu sesión expiró. Inicia sesión de nuevo.',
    invalidCredentials: 'Email o contraseña incorrectos',
    signingIn: 'Ingresando...',
    signIn: 'Ingresar',
    systemOnline: 'Sistema operativo',
    footer: 'Precision Medical · PM Time Clock · Solo uso interno',

    geoTitle: 'Verificar tu ubicación',
    geoBody: 'Permite tu ubicación para verificar que estás en la clínica.',
    geoNote: 'Tu registro se guarda igual; esto solo añade verificación.',

    geoBlockedTitle: 'Ubicación bloqueada',
    geoBlockedBody: 'Tus registros se guardarán sin verificación.',
    geoBlockedHowTo: 'Cómo activarla',
    geoBlockedRetry: 'Ya la activé, intentar de nuevo',
    geoBlockedSystemOff: 'La ubicación del teléfono está apagada. Activala en Ajustes → Ubicación.',
    geoStepsChromeAndroid: [
      'Toca el candado 🔒 a la izquierda de la URL',
      'Toca «Permisos» → «Ubicación»',
      'Elige «Permitir»',
      'Recarga la página',
    ],
    geoStepsSamsungInternet: [
      'Toca el menú ≡ abajo a la derecha',
      'Configuración → Sitios y descargas → Permisos del sitio',
      'Ubicación → Permitir para este sitio',
      'Recarga la página',
    ],
    geoStepsIosSafari: [
      'Toca «aA» a la izquierda de la URL',
      '«Ajustes del sitio web» → «Ubicación»',
      'Elige «Permitir»',
      'Recarga la página',
    ],
    geoStepsIosPwa: [
      'Sal de la app (botón Home)',
      'Abre «Ajustes» del iPhone',
      'Privacidad y seguridad → Servicios de ubicación',
      'Asegúrate que «Servicios de ubicación» esté activado',
      'Busca «PM Clock» en la lista y elige «Al usar la app»',
      'Vuelve a abrir PM Clock',
    ],
    geoStepsIosWebView: [
      'Abre este link en Safari (no en Instagram/WhatsApp/etc.)',
      'En Safari, dale permiso de ubicación cuando lo pida',
    ],
    geoStepsDesktopChrome: [
      'Toca el candado 🔒 a la izquierda de la URL',
      '«Permisos del sitio» → «Ubicación» → «Permitir»',
      'Recarga la página',
    ],
    geoStepsGeneric: [
      'Busca el ícono de candado o información en tu navegador',
      'Cambia el permiso de ubicación a «Permitir»',
      'Recarga la página',
    ],

    locOutOfRange: 'Fuera del rango de la clínica',
    locLowAccuracy: 'GPS impreciso',
    locNoPermission: 'Sin permiso de ubicación',
    locUnknown: 'Ubicación no verificada',

    geoStrictOutOfRange: 'Estás fuera del rango de la clínica. Acércate al edificio e intenta de nuevo.',
    geoStrictNoPermission: 'Debes habilitar la ubicación del navegador para marcar entrada en esta clínica.',

    lateBy: (mins) => `Llegaste ${mins} min después de tu horario`,

    duplicateOpenShift: 'Ya tienes un turno abierto hoy. Sincronizando...',
    saveError: 'Error al guardar. Verifica tu conexión.',

    wrongRoleTitle: 'App solo para empleados',
    wrongRoleBody: (role) => `Estás autenticado como ${role}. Para administrar el sistema, ingresa desde el panel admin en tu navegador.`,

    profileErrorTitle: 'Cuenta no configurada',
    profileErrorBody: 'Contacta a tu administrador',

    exit: 'Salir',
    noRecordToday: 'Sin registro hoy',
    working: 'Trabajando',
    onBreak: 'En break',
    shiftComplete: 'Jornada completada',
    entryLabel: 'Entrada',
    breakLabel: 'Break',
    todayShort: 'Hoy',
    hoursWorkedSuffix: 'h trabajadas',
    selectClinic: 'Seleccionar clínica...',
    saving: 'Guardando...',
    backToWork: 'Volver al trabajo',
    newShift: '+ Nuevo turno',
    retry: 'Reintentar',
    signOut: 'Cerrar sesión',
    clockInBtn: 'Marcar entrada',
    breakBtn: 'Break',
    clockOutBtn: 'Marcar salida',

    statToday: 'Hoy',
    statWeek: 'Semana',
    statMonth: 'Mes',

    pwaInstallTitle: 'Instala PM Time Clock',
    pwaInstallBody: 'Acceso rápido desde tu pantalla de inicio.',
    pwaInstallButton: 'Instalar',
    pwaInstallDismiss: 'Cerrar',
    pwaIosTitle: 'Instala en tu iPhone',
    pwaIosBody: 'Sigue estos 3 pasos:',
    pwaIosStep1: 'Toca el ícono Compartir',
    pwaIosStep2: 'Elige «Añadir a inicio»',
    pwaIosStep3: 'Confirma con «Añadir»',
    pwaIosWebViewTitle: 'Abre en Safari para instalar',
    pwaIosWebViewBody: 'Toca el menú (•••) y selecciona «Abrir en Safari». Desde ahí podrás añadirla a tu pantalla de inicio.',

    intl: 'es',
  },
  en: {
    greetMorning:   (n) => `Good morning, ${n}`,
    greetAfternoon: (n) => `Good afternoon, ${n}`,
    greetEvening:   (n) => `Good evening, ${n}`,
    greetNight:     (n) => `Hello, ${n}`,
    empTypeFullTime: 'Full time',
    empTypePartTime: 'Part time',
    scheduleStartsIn:      (m) => `Your shift starts in ${m} min`,
    scheduleStartedMinAgo: (m) => `Your shift started ${m} min ago`,
    scheduleStarting:      'Your shift is starting now',
    scheduleTodayLine:     (h, c, e) => `Today: ${h}h at ${c} until ${e}`,
    statProgressOf:        (p, g) => `${p}% of ${g}h`,
    geoBannerNeutral: 'to verify your work location. Your record is saved either way.',
    sessionExpired: 'Your session expired. Sign in again.',
    invalidCredentials: 'Incorrect email or password',
    signingIn: 'Signing in...',
    signIn: 'Sign in',
    systemOnline: 'System online',
    footer: 'Precision Medical · PM Time Clock · Internal use only',

    geoTitle: 'Verify your location',
    geoBody: 'Allow location so we can verify you are at the clinic.',
    geoNote: 'Your record is saved either way; this just adds verification.',

    geoBlockedTitle: 'Location blocked',
    geoBlockedBody: 'Records will be saved without verification.',
    geoBlockedHowTo: 'How to enable it',
    geoBlockedRetry: 'I enabled it, try again',
    geoBlockedSystemOff: 'Your phone’s location service is off. Turn it on in Settings → Location.',
    geoStepsChromeAndroid: [
      'Tap the lock 🔒 on the left of the URL',
      'Tap "Permissions" → "Location"',
      'Choose "Allow"',
      'Reload the page',
    ],
    geoStepsSamsungInternet: [
      'Tap the menu ≡ at the bottom right',
      'Settings → Sites and downloads → Site permissions',
      'Location → Allow for this site',
      'Reload the page',
    ],
    geoStepsIosSafari: [
      'Tap "aA" on the left of the URL',
      '"Website Settings" → "Location"',
      'Choose "Allow"',
      'Reload the page',
    ],
    geoStepsIosPwa: [
      'Leave the app (Home button)',
      'Open iPhone "Settings"',
      'Privacy & Security → Location Services',
      'Make sure "Location Services" is on',
      'Find "PM Clock" in the list and choose "While Using the App"',
      'Reopen PM Clock',
    ],
    geoStepsIosWebView: [
      'Open this link in Safari (not Instagram/WhatsApp/etc.)',
      'In Safari, allow location when prompted',
    ],
    geoStepsDesktopChrome: [
      'Click the lock 🔒 on the left of the URL',
      '"Site settings" → "Location" → "Allow"',
      'Reload the page',
    ],
    geoStepsGeneric: [
      'Look for the lock or info icon in your browser',
      'Change the location permission to "Allow"',
      'Reload the page',
    ],

    locOutOfRange: 'Outside clinic range',
    locLowAccuracy: 'Low GPS accuracy',
    locNoPermission: 'No location permission',
    locUnknown: 'Location not verified',

    geoStrictOutOfRange: 'You are outside the clinic range. Move closer to the building and try again.',
    geoStrictNoPermission: 'You must enable browser location to clock in at this clinic.',

    lateBy: (mins) => `You arrived ${mins} min after your schedule`,

    duplicateOpenShift: 'You already have an open shift today. Syncing...',
    saveError: 'Save failed. Check your connection.',

    wrongRoleTitle: 'Employees only',
    wrongRoleBody: (role) => `You are signed in as ${role}. To manage the system, sign in from the admin panel in your browser.`,

    profileErrorTitle: 'Account not set up',
    profileErrorBody: 'Contact your administrator',

    exit: 'Sign out',
    noRecordToday: 'No record today',
    working: 'Working',
    onBreak: 'On break',
    shiftComplete: 'Shift complete',
    entryLabel: 'In',
    breakLabel: 'Break',
    todayShort: 'Today',
    hoursWorkedSuffix: 'h worked',
    selectClinic: 'Select clinic...',
    saving: 'Saving...',
    backToWork: 'Back to work',
    newShift: '+ New shift',
    retry: 'Retry',
    signOut: 'Sign out',
    clockInBtn: 'Clock In',
    breakBtn: 'Break',
    clockOutBtn: 'Clock Out',

    statToday: 'Today',
    statWeek: 'Week',
    statMonth: 'Month',

    pwaInstallTitle: 'Install PM Time Clock',
    pwaInstallBody: 'Quick access from your home screen.',
    pwaInstallButton: 'Install',
    pwaInstallDismiss: 'Close',
    pwaIosTitle: 'Install on your iPhone',
    pwaIosBody: 'Follow these 3 steps:',
    pwaIosStep1: 'Tap the Share icon',
    pwaIosStep2: 'Choose "Add to Home Screen"',
    pwaIosStep3: 'Confirm with "Add"',
    pwaIosWebViewTitle: 'Open in Safari to install',
    pwaIosWebViewBody: 'Tap the menu (•••) and select "Open in Safari". From there you can add it to your home screen.',

    intl: 'en',
  },
};

/**
 * Returns the dictionary for the user's browser language.
 *
 * To avoid hydration mismatch the first render uses the Spanish
 * default (matching SSR output); after mount the hook switches
 * to the detected locale. A brief flash is acceptable here since
 * this is a PWA that's mostly used from cold-load.
 */
export function useT(): { t: Dict; locale: Locale } {
  const [locale, setLocale] = useState<Locale>('es');
  useEffect(() => { setLocale(detectLocale()); }, []);
  return { t: dict[locale], locale };
}
