'use client';
import { localeApp } from '@/lib/fechas';

import { useRouter } from 'next/navigation';
import {
  AlertTriangle, AlertCircle, BarChart3, CalendarDays, FileClock,
  CalendarPlus, ArrowRight,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  PageHeader, KpiCard, TagPill,
} from '@/components/ui-phoenix';
import { IntakePanel, type FilaVista } from './intake-panel';
import { TitularIntake } from './titular-intake';
import { CifoBox } from './cifo-box';
import { CifoBienvenida, type DatosBienvenida } from './cifo-bienvenida';

/**
 * B.29 — Panel de Recepción.
 *
 * ── Por qué esta pantalla se ve como Vigía ───────────────────────────────────
 *
 * Erick, 2026-09-08: «me gustó mucho más el de Vigía». Y el diagnóstico no era
 * de gusto: la versión anterior teñía de rojo las diecisiete filas del día, con
 * seis marcas rojas por fila —fondo, riel, punto que late, chip macizo, "sin
 * empezar" y "sin contacto"— y con todo gritando, nada grita. Encima la escala
 * tipográfica entera vivía entre 10,5 y 12,5 px: no había jerarquía porque no
 * había tamaños, así que el ojo no tenía dónde aterrizar.
 *
 * Lo que se copió de Vigía, en orden de importancia:
 *
 *  1. **Elegir UNO y decirlo en una frase.** `colaIntake()` devuelve un
 *     `titular` con prioridad, y `mereceTitular()` decide si se gana el
 *     encabezado. Cuando nadie lo alcanza, la tarjeta dice en verde que no hay
 *     nada urgente en vez de inventar una urgencia.
 *  2. **Una escala donde el ojo aterrice**: 24 px el saludo, 20 px el titular,
 *     13,5 px el cuerpo, 10 px las etiquetas.
 *  3. **El rojo como señal, no como fondo** — eso vive en `intake-panel.tsx`.
 *  4. **La pantalla saluda.** Es la mitad de la decisión del 2026-09-02 («Vigía
 *     es una identidad con dos alcances, y la cara de clínica va en el felpudo
 *     que cruzan 12 de 12 personas»). La otra mitad —la caja de preguntar— falta
 *     todavía: el agente está atado al bufete en las ocho herramientas, así que
 *     la cara de clínica necesita su propio alcance y era un trabajo aparte.
 *     **Ya está**: se llama CIFO y vive en `cifo-box.tsx`, arriba del
 *     saludo. Son dos agentes con dos nombres (Erick, 2026-09-08) porque el
 *     alcance se invierte: el del bufete ENCIERRA, el de la clínica no, así que
 *     CIFO no maneja nombres de pacientes y trabaja por código de caso.
 *  5. **Los KPI con burbuja de icono.** `KpiCard` ya aceptaba `icon`, `iconBg` e
 *     `iconColor` desde antes de que Vigía existiera; esta pantalla no los usaba.
 */

interface AlertItem {
  id: string;
  caseCode: string;
  patientName: string;
}

interface AlertsByKind {
  newReferralsAged: Array<AlertItem & { createdAt: Date }>;
  intakeStalled: Array<AlertItem & { sentAt: Date }>;
  confirmedNoSched: Array<AlertItem & { confirmedAt: Date }>;
}

interface Props {
  alerts: AlertsByKind;
  /** CIFO: null = esta persona no tiene la capacidad. Ver `lib/cifo-access.ts`. */
  cifo: { configurado: boolean; casoEjemplo: string | null } | null;
  /** Los tres que son una decisión. Ver el docblock de `page.tsx`. */
  numeros: { citasHoy: number; intakePendiente: number; sinAgendar: number };
  /** La cola del centinela — ver `intake-panel.tsx` y `lib/cola-intake.ts`. */
  intake: {
    filas: FilaVista[];
    yaLlegaron: FilaVista[];
    citasEnVentana: number;
    citasHoy: number;
    titular: FilaVista | null;
  };
  /** Lo que dice CIFO al abrir el panel — ver `cifo-bienvenida.tsx`. */
  bienvenida: DatosBienvenida;
}

export function DashboardClient({ alerts, numeros, intake, cifo, bienvenida }: Props) {
  const t = useTranslations('phoenix.dashboard');
  const router = useRouter();
  const totalAlerts =
    alerts.newReferralsAged.length + alerts.intakeStalled.length + alerts.confirmedNoSched.length;

  const hoy    = intake.filas.filter((f) => f.diasHasta === 0);
  const manana = intake.filas.filter((f) => f.diasHasta === 1);
  const resto  = intake.filas.filter((f) => f.diasHasta >= 2);

  return (
    <div className="space-y-6">
      {/* La bienvenida se monta primera pero se pinta ENCIMA de todo (`fixed`):
          decide sola si le toca aparecer hoy, y si no, no devuelve nada. */}
      <CifoBienvenida datos={bienvenida} />

      <PageHeader
        title={t('title')}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-text-muted text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> B.29
            </span>
            <span>· {t('subtitle')} · {formatDate(new Date())}</span>
          </span>
        }
      />

      {/* ───── El saludo ─────────────────────────────────────────────────────
          Centrado y a 24 px, la misma pieza que abre Vigía. No es adorno: es lo
          que convierte el tablero en alguien que te habla, y es lo primero que
          Erick señaló de la pantalla del bufete. */}
      <p className="text-2xl font-bold text-text-1 text-center pt-1">
        {t(saludoDelDia())}
      </p>

      {/* ───── CIFO ──────────────────────────────────────────────────────
          Debajo del saludo y ARRIBA de todo lo demás, en columna angosta: es el
          orden del portal legal, que es el que Erick aprobó. Solo aparece si la
          persona tiene la capacidad; el candado lo resuelve el servidor y acá
          llega como `null` o como datos. Esconder la caja no es esconder una
          acción bloqueada: sin la capacidad, la función no existe para esa
          cuenta. */}
      {cifo && (
        <CifoBox
          configurado={cifo.configurado}
          casoEjemplo={cifo.casoEjemplo}
        />
      )}

      {/* ───── Las dos cosas de hoy, una al lado de la otra ─────────────────
          Izquierda el caso que hay que destrabar, derecha el tamaño del trabajo.
          Mismo grid que Vigía (1.15fr / 1fr) y mismo orden invertido en mobile:
          el número primero, porque el titular es alto y empujaría la cola. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-3 items-stretch">
        <div className="order-2 lg:order-1">
          <TitularIntake fila={intake.titular} />
        </div>

        <div className="order-1 lg:order-2 relative overflow-hidden rounded-lg bg-bg-1 p-6 h-full flex flex-col">
          {/* El halo de marca de Vigía: el único acento decorativo de la
              pantalla, y va acá porque esta tarjeta es la que NO es una alarma. */}
          <div className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-brand/20 blur-2xl" />
          <div className="relative flex items-center gap-2 mb-2">
            <BarChart3 className="w-3.5 h-3.5 text-brand-text" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-text">
              {t('colaLabel')}
            </span>
          </div>
          <h2 className="relative text-text-1 text-xl font-bold">
            {/* El DENOMINADOR. "17" solo no significa nada; "17 de 41", sí. */}
            {t('colaTitulo', { sinFirmar: hoy.length, citas: numeros.citasHoy })}
          </h2>
          <p className="relative text-text-2 text-sm mt-2">
            {t('colaCuerpo', { manana: manana.length, pendientes: numeros.intakePendiente })}
          </p>
          <dl className="relative flex gap-6 mt-4 flex-wrap">
            <div>
              <dd className="text-2xl font-bold text-rose tabular-nums leading-none">{hoy.length}</dd>
              <dt className="text-[11px] text-text-muted mt-1">{t('colaHoy')}</dt>
            </div>
            <div>
              <dd className="text-2xl font-bold text-amber tabular-nums leading-none">{manana.length}</dd>
              <dt className="text-[11px] text-text-muted mt-1">{t('colaManana')}</dt>
            </div>
            <div>
              <dd className="text-2xl font-bold text-text-1 tabular-nums leading-none">{resto.length}</dd>
              <dt className="text-[11px] text-text-muted mt-1">{t('colaSemana')}</dt>
            </div>
          </dl>
          <div className="relative flex items-center gap-4 flex-wrap mt-auto pt-5">
            <a
              href="#cola-intake"
              className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-md bg-gradient-brand text-white font-semibold text-sm shadow-glow hover:opacity-90 transition-opacity w-full sm:w-auto"
            >
              {t('colaCta')}
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* ───── El centinela ─────────────────────────────────────────────────
          La cola, con el rojo calibrado. El `id` es el destino del botón de
          arriba: en una pantalla que se cruza en seis minutos, el CTA tiene que
          llevar a algún lado y ese lado es la lista, no otra página. */}
      <div id="cola-intake" className="scroll-mt-4">
        <IntakePanel
          filas={intake.filas}
          yaLlegaron={intake.yaLlegaron}
          citasEnVentana={intake.citasEnVentana}
        />
      </div>

      {/* ───── Los tres números ─────────────────────────────────────────────
          Debajo del centinela, que es donde Erick los pidió («si dejás algún
          número lo ponés abajo del sentinel»). Los tres son una decisión:
          el denominador de la cola, la pileta de la que sale la cola de mañana,
          y trabajo de recepción esperando. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          label={t('numCitasHoy')}
          value={numeros.citasHoy}
          sub={t('numCitasHoySub')}
          color="text-cyan"
          icon={CalendarDays}
          iconBg="bg-cyan/10"
          iconColor="text-cyan"
        />
        <KpiCard
          label={t('numIntakePendiente')}
          value={numeros.intakePendiente}
          sub={t('numIntakePendienteSub')}
          color="text-amber"
          icon={FileClock}
          iconBg="bg-amber/10"
          iconColor="text-amber"
        />
        <KpiCard
          label={t('numSinAgendar')}
          value={numeros.sinAgendar}
          sub={t('numSinAgendarSub')}
          color="text-emerald"
          icon={CalendarPlus}
          iconBg="bg-emerald/10"
          iconColor="text-emerald"
        />
      </div>

      {/* ───── Esperando desde antes ────────────────────────────────────────
          Se quedan porque NO son un marcador: son tres listas de casos con
          nombre y un clic que abre el caso. El nombre cambió para que no haya
          dos cajas de "atención" en la misma pantalla. */}
      <div className="rounded-lg bg-bg-1 p-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-amber" />
          <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('atrasos')}</h3>
          <TagPill
            label={String(totalAlerts)}
            colorClass={totalAlerts === 0 ? 'bg-emerald/15 text-emerald border-emerald/30' : 'bg-amber/15 text-amber border-amber/30'}
            compact
          />
        </div>
        {totalAlerts === 0 ? (
          <div className="rounded-md border border-emerald/30 bg-emerald/5 px-3 py-4 text-center">
            <div className="text-emerald font-semibold text-sm">{t('allCaughtUp')}</div>
            <div className="text-text-muted text-xs mt-1">{t('noDelayedCases')}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AlertGroup
              title={t('alertNoPortalSent')}
              tone="rose"
              items={alerts.newReferralsAged.map((c) => ({
                id: c.id, caseCode: c.caseCode, patientName: c.patientName,
                time: c.createdAt, timeLabel: t('timeLabelAgo'),
              }))}
              onClick={(id) => router.push(`/dashboard?case=${id}`)}
            />
            <AlertGroup
              title={t('alertPatientNoResponse')}
              tone="amber"
              items={alerts.intakeStalled.map((c) => ({
                id: c.id, caseCode: c.caseCode, patientName: c.patientName,
                time: c.sentAt, timeLabel: t('timeLabelSentAgo'),
              }))}
              onClick={(id) => router.push(`/dashboard?case=${id}`)}
            />
            <AlertGroup
              title={t('alertConfirmedNoSched')}
              tone="emerald"
              items={alerts.confirmedNoSched.map((c) => ({
                id: c.id, caseCode: c.caseCode, patientName: c.patientName,
                time: c.confirmedAt, timeLabel: t('timeLabelConfirmedAgo'),
              }))}
              onClick={(id) => router.push(`/dashboard?case=${id}`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Qué saludo toca.
 *
 * Con la hora del NAVEGADOR y no con la de la clínica, al revés que el resto de
 * esta pantalla. Es a propósito y es la única excepción: las citas son eventos de
 * la clínica —tienen que leerse igual desde cualquier lado— pero "buenos días"
 * habla de quien está mirando. A alguien que abre esto de noche desde otra zona
 * no se le dice "buenas tardes" porque en Utah lo sea.
 *
 * Los cortes son los mismos que usa `franjaDelDia()` en Vigía.
 */
function saludoDelDia(): 'greetMorning' | 'greetAfternoon' | 'greetEvening' {
  const h = new Date().getHours();
  if (h < 12) return 'greetMorning';
  if (h < 19) return 'greetAfternoon';
  return 'greetEvening';
}

// ─── Alert group ──────────────────────────────────────────────────────────────

function AlertGroup({
  title, tone, items, onClick,
}: {
  title: string;
  tone: 'rose' | 'amber' | 'emerald';
  items: Array<{ id: string; caseCode: string; patientName: string; time: Date; timeLabel: string }>;
  onClick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const toneClasses: Record<typeof tone, string> = {
    rose:    'text-rose bg-rose/5 border-rose/20',
    amber:   'text-amber bg-amber/5 border-amber/20',
    emerald: 'text-emerald bg-emerald/5 border-emerald/20',
  };
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1 ${tone === 'rose' ? 'text-rose' : tone === 'amber' ? 'text-amber' : 'text-emerald'}`}>
        <AlertCircle className="w-3 h-3" />
        {title} · {items.length}
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onClick(item.id)}
            className={`w-full text-left rounded-md border px-2.5 py-1.5 text-xs transition-colors ${toneClasses[tone]} hover:opacity-90`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold truncate text-text-1">{item.patientName}</span>
              <code className="text-text-muted font-mono text-[10px] shrink-0">{item.caseCode}</code>
            </div>
            <div className="text-text-muted text-[10px] mt-0.5">{item.timeLabel} {formatRelative(item.time)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString(localeApp(), { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatRelative(d: Date | string): string {
  const h = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60);
  if (h < 1) {
    const m = Math.max(1, Math.floor(h * 60));
    return `${m}m`;
  }
  if (h < 24) return `${Math.floor(h)}h`;
  if (h < 24 * 7) return `${Math.floor(h / 24)}d`;
  return new Date(d).toLocaleDateString(localeApp(), { month: 'short', day: 'numeric' });
}
