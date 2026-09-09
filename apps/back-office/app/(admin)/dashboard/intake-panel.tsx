'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { AlertCircle, Megaphone, Phone, MessageSquare, Mail, QrCode, ChevronRight, MonitorSmartphone } from 'lucide-react';
import { Section, TagPill, EmptyState, IconAction } from '@/components/ui-phoenix';
import { SendPortalDialog } from '@/components/cases/send-portal-dialog';
import { IntakeFormLinkDialog } from '@/components/cases/intake-form-link-dialog';
import { useTwilioDevice } from '@/lib/use-twilio-device';
import { useReloj } from '@/lib/use-reloj';
import { recalcularUrgencia } from '@/lib/intake-urgencia';

/**
 * El centinela · los que llegan sin el intake firmado.
 *
 * Va ARRIBA de los números del dashboard, y eso no es estético: el dashboard es
 * el felpudo del sistema —lo cruzan 12 de 12 personas, unos 6 minutos cada una—
 * y en un lugar de paso un número no dispara ninguna acción. Lo único que
 * aprovecha el felpudo es una lista corta de nombres con un botón al lado.
 *
 * ── Cómo escala el ruido (pedido de Erick: "algo más llamativo") ─────────────
 *
 * Cuatro señales APILADAS en lugar de una que titila: fondo teñido, riel grueso,
 * chip macizo con la hora y un latido. Un parpadeo duro deja la fila sin señal
 * la mitad del tiempo, cansa en un dashboard que está abierto todo el día, y
 * desaparece entero para quien tiene el movimiento apagado en el sistema —
 * justo la persona que más necesita la marca. Con `prefers-reduced-motion` el
 * latido se vuelve un anillo fijo (ver `globals.css`), así que nadie se queda
 * sin señal.
 *
 * Y los de 2 días en adelante van en silencio a propósito: si las 30 filas
 * gritan, ninguna grita.
 */

export interface FilaVista {
  caseId: string;
  caseCode: string;
  paciente: string | null;
  nombre: string;
  apellido: string;
  email: string | null;
  idioma?: 'es' | 'en';
  /** ISO. Se formatea en el cliente con la zona de la clínica. */
  cita: string;
  provider: string | null;
  diasHasta: number;
  /** Minutos hasta la cita. **Negativo si ya pasó.** Ver `lib/cola-intake.ts`. */
  minutosHasta: number;
  /** El momento de la fila: es lo único que decide su tratamiento visual. */
  nivel: 'TARDE' | 'AHORA' | 'HOY' | 'MANANA' | 'SEMANA';
  /** Peso del momento más los agravantes. Solo elige el titular de la pantalla. */
  prioridad: number;
  pct: number;
  faltan: string[];
  telefono: string | null;
  bloqueoEnvio: 'SIN_TUTOR' | 'SIN_TELEFONO_NI_EMAIL' | null;
  esMenor: boolean;
  ultimoContacto: { canal: 'SMS' | 'EMAIL' | 'LLAMADA'; cuando: string } | null;
}

/** Etiqueta de cada sección que falta. En duro y en español, como el resto de este tab. */
const FALTA_KEY: Record<string, string> = {
  missingPersonal: 'intakeSecPersonal',
  missingEmergency: 'intakeSecEmergency',
  missingDemographics: 'intakeSecDemographics',
  missingAccident: 'intakeSecAccident',
  missingInsurance: 'intakeSecInsurance',
  missingMedicalHistory: 'intakeSecHistory',
  missingConsents: 'intakeSecConsents',
};

const CANAL_KEY: Record<string, string> = { SMS: 'SMS', EMAIL: 'Email', LLAMADA: 'intakeChannelCall' };

/**
 * La forma que piden los dos diálogos compartidos.
 *
 * El teléfono viaja YA DESENCRIPTADO desde el servidor: los diálogos lo usan
 * para la vista previa del SMS y para decidir qué canal ofrecen. El envío real
 * lo resuelve la ruta con la ficha, así que este valor no autoriza nada.
 */
export function caseInfo(f: FilaVista) {
  return {
    id: f.caseId,
    caseCode: f.caseCode,
    patient: {
      firstName: f.nombre,
      lastName: f.apellido,
      phone: f.telefono,
      email: f.email,
      ...(f.idioma ? { preferredLanguage: f.idioma } : {}),
    },
  };
}

/**
 * La hora y el día se formatean con la zona de la CLÍNICA y el idioma de la
 * sesión — no con los del navegador de quien mira. Una recepcionista en otra
 * zona vería la hora corrida, y el nombre del día en el idioma equivocado.
 */
const hora = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hour12: false,
  }).format(new Date(iso));

const diaCorto = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'America/Denver', weekday: 'short', day: 'numeric',
  }).format(new Date(iso));

/**
 * Solo la DURACIÓN ("2 h", "20 min", "3 d"). El "hace" y el "en" los pone la
 * traducción, porque en inglés van del otro lado ("2 h ago").
 *
 * `min`, `h` y `d` no se traducen a propósito: son las mismas dos letras en los
 * dos idiomas y meterlas en el i18n solo agrega seis claves para nada.
 */
function duracionDesde(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

/** Cuenta regresiva hasta la cita. Solo para las de hoy. */
function duracionHasta(iso: string): string | null {
  const min = Math.floor((new Date(iso).getTime() - Date.now()) / 60_000);
  if (min < 0) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * El riel de urgencia, ahora por NIVEL y no por día.
 *
 * Antes era una escala de seis pasos indexada por `diasHasta`, así que las
 * diecisiete filas de hoy compartían el mismo `bg-rose` desde las ocho de la
 * mañana. Ahora el riel se enciende cuando la cita entra en la última hora
 * (`AHORA`) o cuando ya pasó (`TARDE`), y el resto del día va sin riel: si todo
 * grita, nada grita.
 *
 * `HOY` conserva un ámbar tenue —no cero— porque sigue siendo trabajo de la
 * mañana: la fila tiene que distinguirse de la de pasado mañana sin competir con
 * la que está por entrar.
 */
const RIEL: Record<FilaVista['nivel'], string> = {
  TARDE:  'bg-rose',
  AHORA:  'bg-rose',
  HOY:    'bg-amber/40',
  MANANA: 'bg-amber/20',
  SEMANA: 'bg-transparent',
};

function Fila({ f, onPedir, onQr, onLlamar }: {
  f: FilaVista;
  onPedir: (f: FilaVista) => void;
  onQr: (f: FilaVista) => void;
  onLlamar: (f: FilaVista) => void;
}): React.ReactElement {
  const t = useTranslations('phoenix.dashboard');
  const locale = useLocale();
  const router = useRouter();
  const tarde = f.nivel === 'TARDE';
  const ahora = f.nivel === 'AHORA';
  /**
   * "Urgente" ya no es "es de hoy o de mañana" — son treinta filas — sino "hay
   * que hacer algo con esto antes de que termine esta hora". Es lo que devuelve
   * el rojo a ser una señal, y lo único que cambia el tratamiento de la fila.
   */
  const urgente = tarde || ahora;
  const hoy = f.diasHasta === 0;
  const manana = f.diasHasta === 1;
  const cuenta = ahora ? duracionHasta(f.cita) : null;

  const chip = tarde
    /* El ámbar del atraso, no el rojo: el rojo es "corré a llamarlo antes de que
       llegue", y a este ya se le pasó la cita. Es un problema distinto —
       reprogramar, o marcarlo no-show— y merece otro color. */
    ? 'bg-amber/[0.18] border-amber/50 text-amber font-extrabold'
    : ahora
      ? 'bg-rose border-rose text-white font-extrabold'
      : hoy
        ? 'bg-bg-2 border-border text-text-2'
        : manana
          ? 'bg-amber/10 border-amber/25 text-amber'
          : 'bg-bg-2 border-border text-text-muted';

  const cuando = tarde
    ? t('intakeLate', { t: duracionDesde(f.cita) })
    : ahora
      ? t('intakeInShort', { t: cuenta ?? '0 min' })
      : hoy ? hora(f.cita, locale)
      : manana ? `${t('intakeTomorrow')} ${hora(f.cita, locale)}`
      : `${diaCorto(f.cita, locale)} ${hora(f.cita, locale)}`;

  const motivoBloqueo = f.bloqueoEnvio === 'SIN_TUTOR'
    ? t('intakeBlockGuardian')
    : f.bloqueoEnvio === 'SIN_TELEFONO_NI_EMAIL'
      ? t('intakeBlockNoContact')
      : null;

  return (
    <div
      className={`flex items-center gap-3 border-b border-row-sep last:border-0 transition-colors group ${
        ahora ? 'bg-rose/[0.08] hover:bg-rose/[0.12]'
          : tarde ? 'bg-amber/[0.07] hover:bg-amber/[0.11]'
          : 'hover:bg-white/[0.02]'
      }`}
    >
      {/* El riel. Sin texto encima, así que la opacidad no cuesta contraste. */}
      <span className={`self-stretch shrink-0 ${urgente ? 'w-1.5' : 'w-1'} ${RIEL[f.nivel]}`} aria-hidden="true" />

      {/* El caso abre EN el panel: el modal está montado en `page.tsx` y lee el
          `?case=`. Antes era `/patients?case=…` y te sacaba de la pantalla. */}
      <button
        type="button"
        onClick={() => router.push(`/dashboard?case=${f.caseId}`)}
        className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5 text-left"
      >
        <span className="shrink-0 w-[104px]">
          <span className="block text-sm font-semibold text-text-1">{f.caseCode}</span>
          {f.paciente && (
            <span className="block sm:hidden text-[11.5px] text-text-muted truncate">{f.paciente}</span>
          )}
        </span>

        {f.paciente && (
          <span className={`hidden sm:block shrink-0 w-[168px] text-[12.5px] truncate ${urgente ? 'text-text-1 font-semibold' : 'text-text-2'}`}>
            {f.paciente}
            {f.esMenor && <span className="ml-1.5 text-[9.5px] font-bold text-text-muted align-top">{t('intakeMinor')}</span>}
          </span>
        )}

        <span className="shrink-0 w-[124px] flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            {/* El latido queda SOLO para la última hora. Antes latían las
                diecisiete filas del día a la vez, que es una pantalla vibrando
                todo el día — y con el movimiento apagado no quedaba nada. */}
            {ahora && (
              <span
                className="shrink-0 w-[7px] h-[7px] rounded-full bg-rose animate-latido"
                aria-hidden="true"
              />
            )}
            <span className={`inline-flex items-center px-2 rounded border text-[10.5px] tracking-wide whitespace-nowrap ${chip}`}>
              {cuando}
            </span>
          </span>
          {/* El chip de arriba ya lleva el "cuándo", así que acá va la hora real
              cuando el chip la reemplazó por un relativo. Antes esta línea
              repetía la cuenta regresiva y la fila decía dos veces lo mismo. */}
          <span className="text-[11px] text-text-muted tabular-nums truncate">
            {urgente && <span className="text-text-2">{hora(f.cita, locale)} · </span>}
            {f.provider ?? '—'}
          </span>
        </span>

        {/* Estas dos columnas eran rojas en TODAS las filas del día, y eran dos
            de las seis marcas rojas por fila que volvieron el rojo un fondo.
            Ahora el color solo aparece donde el rojo ya significa algo. */}
        <span className="text-[12px] text-text-muted flex-1 min-w-0 truncate">
          {f.faltan.length >= 6
            ? <span className={urgente ? 'text-rose font-semibold' : 'text-text-2'}>{t('intakeNotStarted', { n: f.faltan.length })}</span>
            : t('intakeMissing', { lista: f.faltan.map((k) => (FALTA_KEY[k] ? t(FALTA_KEY[k]) : k)).join(', ') })}
        </span>

        <span className={`hidden lg:block shrink-0 w-[132px] text-[11.5px] tabular-nums ${
          f.ultimoContacto ? 'text-text-muted' : urgente ? 'text-rose font-semibold' : 'text-text-2'
        }`}>
          {f.ultimoContacto
            ? <>
                {f.ultimoContacto.canal === 'LLAMADA' ? t('intakeChannelCall') : CANAL_KEY[f.ultimoContacto.canal]}
                {' · '}
                {t('intakeAgo', { t: duracionDesde(f.ultimoContacto.cuando) })}
              </>
            : t('intakeNoContact')}
        </span>
      </button>

      <span className="pr-3 flex items-center gap-1 shrink-0">
        {/* En los urgentes el teléfono deja de ser un ícono: la urgencia también
            tiene que hacer más FÁCIL la acción, no solo más ruidosa. */}
        {urgente ? (
          <button
            type="button"
            onClick={() => onLlamar(f)}
            disabled={!f.telefono}
            title={f.telefono ? t('intakeCallTo', { quien: f.paciente ?? f.caseCode }) : t('intakeNoPhone')}
            className={`inline-flex items-center gap-1.5 h-[25px] px-2.5 rounded border text-[11.5px] font-bold whitespace-nowrap transition-opacity ${
              f.telefono
                ? ahora
                  ? 'bg-rose border-rose text-white hover:opacity-90'
                  : 'bg-transparent border-amber/50 text-amber hover:opacity-90'
                : 'bg-transparent border-border text-text-muted/60 line-through cursor-not-allowed'
            }`}
          >
            <Phone className="w-3 h-3" />
            {t('intakeCall')}
          </button>
        ) : (
          <IconAction
            icon={Phone}
            label={f.telefono ? t('intakeCall') : t('intakeNoPhone')}
            disabled={!f.telefono}
            stopPropagation
            onClick={() => onLlamar(f)}
          />
        )}

        <IconAction
          icon={MessageSquare}
          label={motivoBloqueo ?? t('intakeSendSms')}
          disabled={!!f.bloqueoEnvio}
          stopPropagation
          onClick={() => onPedir(f)}
        />
        <IconAction
          icon={Mail}
          label={motivoBloqueo ?? t('intakeSendEmail')}
          disabled={!!f.bloqueoEnvio}
          stopPropagation
          onClick={() => onPedir(f)}
        />
        {/* El QR nunca se bloquea: es la única vía cuando no hay teléfono ni
            correo, y justamente ahí es la más importante. */}
        <IconAction
          icon={QrCode}
          label={t('intakeShowQr')}
          stopPropagation
          onClick={() => onQr(f)}
        />
        <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    </div>
  );
}

export function IntakePanel({ filas: filasDelServidor, yaLlegaron, citasEnVentana }: {
  filas: FilaVista[];
  yaLlegaron: FilaVista[];
  citasEnVentana: number;
}): React.ReactElement {
  const t = useTranslations('phoenix.dashboard');
  const twilio = useTwilioDevice();
  const [pedir, setPedir] = React.useState<FilaVista | null>(null);
  const [qr, setQr] = React.useState<FilaVista | null>(null);

  /**
   * El reloj. `/dashboard` es un server component sin pulso, así que sin esto el
   * nivel de cada fila quedaría congelado en el momento de cargar la página — y
   * el dashboard es justo la pantalla que se deja abierta toda la mañana. Ver el
   * porqué completo en `recalcularUrgencia()`.
   */
  const ahoraMs = useReloj();
  const filas = React.useMemo(
    () => (ahoraMs === null ? filasDelServidor : filasDelServidor.map((f) => recalcularUrgencia(f, ahoraMs))),
    [filasDelServidor, ahoraMs],
  );

  /**
   * Los grupos ahora son de MOMENTO, no de día.
   *
   * "Ahora" junta a los que ya debían estar acá y a los que entran en la próxima
   * hora: son las dos cosas que se resuelven levantando el teléfono en este
   * instante, y son las únicas dos que se ven rojas. "Más tarde hoy" es la misma
   * gente que antes ocupaba las diecisiete filas rojas, pero en calma: sigue
   * siendo trabajo del día y ya no compite con lo que está por entrar.
   */
  const ahora  = filas.filter((f) => f.nivel === 'TARDE' || f.nivel === 'AHORA');
  const hoy    = filas.filter((f) => f.nivel === 'HOY');
  const manana = filas.filter((f) => f.nivel === 'MANANA');
  const resto  = filas.filter((f) => f.nivel === 'SEMANA');
  /** Para la banda y el denominador: todos los del día, en cualquier momento. */
  const totalHoy = ahora.length + hoy.length;

  const llamar = React.useCallback((f: FilaVista) => {
    if (f.telefono) twilio.connect(f.telefono);
  }, [twilio]);

  const grupo = (titulo: string, items: FilaVista[], prioritario: boolean) => items.length === 0 ? null : (
    <React.Fragment key={titulo}>
      <div className={`flex items-center gap-2 px-5 py-2 border-b border-row-sep text-[10.5px] font-bold uppercase tracking-wider ${
        prioritario ? 'bg-rose/[0.07] text-rose' : 'bg-bg-2 text-text-muted'
      }`}>
        {titulo}
        <span className="text-text-2 tabular-nums">{items.length}</span>
        {prioritario && (
          <span className="ml-auto px-1.5 rounded border border-rose/40 text-[9.5px] font-extrabold tracking-widest">
            {t('intakePriorityTag')}
          </span>
        )}
      </div>
      <div className="-mx-5">
        {items.map((f) => (
          <Fila key={f.caseId} f={f} onPedir={setPedir} onQr={setQr} onLlamar={llamar} />
        ))}
      </div>
    </React.Fragment>
  );

  return (
    <Section
      icon={AlertCircle}
      title={t('intakeTitle')}
      count={filas.length + yaLlegaron.length}
      tone="amber"
    >
      {/* La banda de prioridad. Ahora se enciende SOLO cuando hay alguien en la
          próxima hora o alguien atrasado — no por tener filas de mañana. Antes
          estaba prendida todo el día todos los días, y una alarma que nunca se
          apaga no es una alarma: es el encabezado de la tabla. */}
      {ahora.length > 0 && (
        <div className="-mx-5 flex items-center gap-2.5 flex-wrap px-5 py-2.5 bg-rose/[0.12] border-y border-rose/25" role="status">
          <span className="shrink-0 w-[7px] h-[7px] rounded-full bg-rose animate-latido" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose text-white text-[10.5px] font-extrabold uppercase tracking-wider">
            <Megaphone className="w-3 h-3" />
            {t('intakePriority')}
          </span>
          <span className="text-[13px] font-bold text-text-1">
            <span className="text-rose tabular-nums">{t('intakeAhoraBanda', { n: ahora.length })}</span>
            {totalHoy > ahora.length && (
              <span className="text-text-2"> · {t('intakeRestoDelDia', { n: totalHoy - ahora.length })}</span>
            )}
          </span>
          <span className="text-[12px] text-text-2 ml-auto hidden sm:block">
            {t('intakeCallHint')}
          </span>
        </div>
      )}

      {filas.length === 0 && yaLlegaron.length === 0 ? (
        <EmptyState.Rich
          icon={AlertCircle}
          title={t('intakeClearTitle')}
          subtitle={t('intakeClearSub', { n: citasEnVentana })}
        />
      ) : (
        <>
          {grupo(t('intakeGroupAhora'), ahora, true)}
          {grupo(t('intakeGroupToday'), hoy, false)}
          {grupo(t('intakeGroupTomorrow'), manana, false)}
          {grupo(t('intakeGroupLater'), resto, false)}

          {/* Los que ya están en la clínica no son una llamada: se firman en la
              tablet del mostrador. Van al pie y en una línea. */}
          {yaLlegaron.length > 0 && (
            <div className="-mx-5 flex items-center gap-2 px-5 py-2.5 border-t border-row-sep text-[12px] text-text-muted">
              <MonitorSmartphone className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t('intakeArrived', { n: yaLlegaron.length })}
              </span>
              <TagPill
                label={yaLlegaron.map((f) => f.caseCode).join(' · ')}
                colorClass="bg-bg-2 text-text-muted border-transparent"
                compact
              />
            </div>
          )}
        </>
      )}

      {/* Los dos diálogos que ya existen. El panel no inventa ningún envío:
          usa el mismo camino que la lista de pacientes, que reusa el token vivo
          y registra en message_logs con su estado de entrega. */}
      <SendPortalDialog
        open={!!pedir}
        onOpenChange={(o) => { if (!o) setPedir(null); }}
        caseInfo={pedir ? caseInfo(pedir) : null}
      />
      <IntakeFormLinkDialog
        open={!!qr}
        onOpenChange={(o) => { if (!o) setQr(null); }}
        caseInfo={qr ? caseInfo(qr) : null}
      />
    </Section>
  );
}
