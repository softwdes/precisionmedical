'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, cn } from '@precision/ui';
import { Ban, Clock, KeyRound, Mail, PowerOff, Printer, RefreshCw, ShieldAlert, ShieldCheck, Unlock } from 'lucide-react';
import { api as trpc } from '@/lib/trpc/client';
import {
  MEDIDO_EL, MODULOS, PROTECCIONES,
  type ConFactor, type CuentaBreve, type Cuentas, type DatosSeguridad, type Evento, type IpEchada, type PorIp,
} from './modelo';

/**
 * Security Center — la pantalla.
 *
 * ── Qué hace, además de mostrar ────────────────────────────────────────────
 *
 * La primera versión solo dibujaba. Esta responde:
 *
 *  · **Se refresca sola** cada 45 s con `router.refresh()`, que vuelve a correr
 *    la consulta del servidor y baja props nuevas sin recargar la página ni
 *    perder el filtro. Se detiene con la pestaña en segundo plano: nadie mira
 *    una pantalla que no está a la vista y cada vuelta son cuatro viajes a la
 *    base.
 *  · **Filtra por módulo.** Erick, 2026-10-05: "que todo lo controle por
 *    módulos". Tocar una tarjeta recorta las cifras, las IPs y los eventos a
 *    esa app; tocarla de nuevo vuelve a las cinco.
 *  · **Filtra por IP.** Tocar una dirección deja solo lo que hizo.
 *  · **Cambia la ventana** — 24 h, 48 h, 7 días — por la URL, así que el
 *    servidor vuelve a consultar y el enlace se puede pegar en un chat.
 *  · **Desbloquea una cuenta** contra `/api/users/[id]/unlock`.
 *
 * ── Los dibujos ────────────────────────────────────────────────────────────
 *
 * El medidor, el radar y las chispas son `<canvas>`. Los tres pasan por
 * `useLienzo`, que arrastra dos lecciones del mockup del 2026-10-05:
 *
 *  1. **Medir antes de dibujar, y volver a medir.** Montados dentro de una
 *     grilla, los canvas se midieron una vez en 0 px de ancho y el búfer quedó
 *     clavado en 1 px para siempre. Ahora, si no hay ancho no se pinta, y un
 *     `ResizeObserver` vuelve a llamar cuando lo haya.
 *  2. **El valor final se escribe primero.** `requestAnimationFrame` no corre
 *     en una pestaña de fondo: las animaciones que arrancan en cero se quedaban
 *     en cero. Los contadores nacen en su número final y la animación es lo que
 *     se agrega encima, no de lo que dependen.
 *
 * Todo respeta `prefers-reduced-motion`.
 *
 * ── El idioma ──────────────────────────────────────────────────────────────
 *
 * Sigue al selector ES/EN como el resto del Admin, bajo `security.*`.
 *
 * Nació en inglés y en duro porque estiré a esta pantalla una decisión de Erick
 * del 2026-10-03 que era para los LOGIN —"ese es el idioma oficial en el
 * login"—. Él nunca dijo eso del Centro de Seguridad, y el 2026-10-06 lo
 * señaló: el selector cambia todo el Admin menos esto. Era mi extensión, no su
 * regla.
 *
 * Las horas y los nombres de los meses también siguen el idioma activo, por
 * `useLocale()`; la zona horaria no, que es siempre la de la clínica.
 */

const ZONA = 'America/Denver';

/** Los colores de los dibujos. En canvas no hay clases de Tailwind. */
const C = {
  ok:     '#10b981',
  mal:    '#f43f5e',
  aviso:  '#f59e0b',
  cian:   '#22d3ee',
  gris:   'rgba(148,163,184,0.22)',
  grisTenue: 'rgba(148,163,184,0.10)',
};

const hora = (iso: string, idioma: string): string =>
  new Intl.DateTimeFormat(idioma, {
    timeZone: ZONA, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));

/** "octubre de 2026" / "October 2026", desde `2026-10`. */
const nombreDeMes = (mes: string, idioma: string): string =>
  new Intl.DateTimeFormat(idioma, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${mes}-01T00:00:00Z`));

/** Cuántas protecciones cubren a este módulo, y cuánto lo dejan expuesto. */
function puntaje(modulo: string): { activas: number; total: number; exposicion: number } {
  const total = PROTECCIONES.length;
  // "Parcial" cuenta como media: el paso existe pero nadie lo usa.
  const activas = PROTECCIONES.reduce((n, p) => {
    const e = p.estado[modulo];
    return n + (e === true ? 1 : e === 'parcial' ? 0.5 : 0);
  }, 0);
  return { activas, total, exposicion: Math.round(((total - activas) / total) * 100) };
}

/** La exposición de todo el sistema: lo que falta sobre lo que debería haber. */
function exposicionGeneral(): number {
  const t = MODULOS.reduce((a, m) => {
    const p = puntaje(m.id);
    return { act: a.act + p.activas, tot: a.tot + p.total };
  }, { act: 0, tot: 0 });
  return Math.round(((t.tot - t.act) / t.tot) * 100);
}

const tono = (exp: number): string =>
  exp >= 50 ? 'text-rose' : exp >= 25 ? 'text-amber' : 'text-emerald';

const color = (exp: number): string =>
  exp >= 50 ? C.mal : exp >= 25 ? C.aviso : C.ok;

/* ───────────────────────────── los enganches ───────────────────────────── */

function useQuieto(): boolean {
  const [q, setQ] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mirar = (): void => setQ(mq.matches);
    mirar();
    mq.addEventListener('change', mirar);
    return () => mq.removeEventListener('change', mirar);
  }, []);
  return q;
}

interface Pincel { ctx: CanvasRenderingContext2D; w: number; h: number }

/**
 * Un canvas que se mide solo, se redibuja cuando cambia de tamaño y —si se le
 * pide— corre un bucle de animación que se pausa con la pestaña escondida.
 *
 * El efecto va SIN lista de dependencias a propósito: así el dibujo se rehace
 * con cada render, que es justo lo que queremos cuando cambian los datos. Los
 * renders de esta pantalla son raros (cada 45 s, o al tocar un filtro), así que
 * rearmar el observador no cuesta nada.
 */
function useLienzo(
  dibujar: (p: Pincel, t: number) => void,
  animado = false,
): React.RefObject<HTMLCanvasElement | null> {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const fn  = React.useRef(dibujar);
  fn.current = dibujar;
  // El reloj sobrevive a los renders: si naciera de nuevo en cada uno, el
  // barrido del radar pegaría un salto cada vez que llegan datos.
  const t0 = React.useRef(0);

  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (!t0.current) t0.current = performance.now();

    let vivo = true;
    let marco = 0;

    const pintar = (t: number): void => {
      const r = c.getBoundingClientRect();
      // Sin ancho no se dibuja. Pintar acá dejaba el búfer en 1 px para siempre.
      if (r.width < 2 || r.height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const anchoReal = Math.round(r.width * dpr);
      const altoReal  = Math.round(r.height * dpr);
      if (c.width !== anchoReal || c.height !== altoReal) {
        c.width = anchoReal;
        c.height = altoReal;
      }
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      fn.current({ ctx, w: r.width, h: r.height }, t);
    };

    pintar(performance.now() - t0.current);

    if (animado) {
      const bucle = (ahora: number): void => {
        if (!vivo) return;
        if (document.visibilityState === 'visible') pintar(ahora - t0.current);
        marco = requestAnimationFrame(bucle);
      };
      marco = requestAnimationFrame(bucle);
    }

    const ro = new ResizeObserver(() => pintar(performance.now() - t0.current));
    ro.observe(c);

    return () => { vivo = false; cancelAnimationFrame(marco); ro.disconnect(); };
  });

  return ref;
}

/**
 * Un número que sube hasta su valor.
 *
 * Nace YA en el valor final. La animación lo baja y lo vuelve a subir, y un
 * temporizador de red lo devuelve al final pase lo que pase — los `setTimeout`
 * sí corren en una pestaña de fondo, `requestAnimationFrame` no.
 */
function useConteo(fin: number, quieto: boolean): number {
  const [v, setV] = React.useState(fin);

  React.useEffect(() => {
    if (quieto || fin === 0) { setV(fin); return; }
    const DUR = 850;
    let vivo = true;
    const t0 = performance.now();
    const paso = (ahora: number): void => {
      if (!vivo) return;
      const p = Math.min(1, (ahora - t0) / DUR);
      setV(Math.round(fin * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(paso);
    };
    const marco = requestAnimationFrame(paso);
    const red = setTimeout(() => { if (vivo) setV(fin); }, DUR + 500);
    return () => { vivo = false; cancelAnimationFrame(marco); clearTimeout(red); };
  }, [fin, quieto]);

  return v;
}

/* ───────────────────────────── los dibujos ─────────────────────────────── */

/** El medidor de exposición: un arco que se llena y una aguja. */
function Medidor({ valor, quieto }: { valor: number; quieto: boolean }): React.ReactElement {
  const tr = useTranslations('security');
  const ref = useLienzo((p, t) => {
    const { ctx, w, h } = p;
    const cx = w / 2;
    // El centro va al PIE del lienzo, no al 86 %: con el eje más arriba el
    // número de la exposición caía justo encima del arco. Visto en pantalla.
    const cy = h - 10;
    const r  = Math.min(w / 2, h) - 18;
    if (r < 10) return;

    const avance = quieto ? 1 : Math.min(1, t / 1100);
    const suave  = 1 - Math.pow(1 - avance, 3);
    const v = (valor / 100) * suave;
    const A0 = Math.PI;
    const A1 = Math.PI * 2;

    ctx.lineCap = 'round';

    // La pista
    ctx.beginPath();
    ctx.arc(cx, cy, r, A0, A1);
    ctx.strokeStyle = C.gris;
    ctx.lineWidth = 13;
    ctx.stroke();

    // Las marcas cada 10
    for (let i = 0; i <= 10; i++) {
      const a = A0 + (Math.PI * i) / 10;
      const r1 = r - 20;
      const r2 = r - (i % 5 === 0 ? 27 : 24);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.strokeStyle = C.gris;
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.stroke();
    }

    // El arco de valor
    if (v > 0.002) {
      const grad = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
      grad.addColorStop(0, C.ok);
      grad.addColorStop(0.5, C.aviso);
      grad.addColorStop(1, C.mal);
      ctx.beginPath();
      ctx.arc(cx, cy, r, A0, A0 + Math.PI * v);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 13;
      ctx.shadowColor = color(valor);
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // La aguja
    const ang = A0 + Math.PI * v;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (r - 24), cy + Math.sin(ang) * (r - 24));
    ctx.strokeStyle = color(valor);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = color(valor);
    ctx.fill();
  }, !quieto);

  const n = useConteo(valor, quieto);

  return (
    <div className="relative rounded-lg bg-bg-1 p-4">
      <div className="relative">
        <canvas
          ref={ref}
          className="block h-[150px] w-full"
          role="img"
          aria-label={tr('exposureAria', { n: valor })}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center">
          <div className={cn('text-3xl font-bold tabular-nums leading-none', tono(valor))}>{n}</div>
        </div>
      </div>
      <div className="mt-1 text-center text-tiny uppercase tracking-widest text-text-muted">{tr('exposure')}</div>
      <div className="mt-1 text-center text-tiny text-text-3">
        {tr('exposureSub', { modulos: MODULOS.length, prot: PROTECCIONES.length })}
      </div>
    </div>
  );
}

/** Un número estable por IP, para que cada una caiga siempre en el mismo rumbo. */
function rumbo(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 360) * (Math.PI / 180);
}

/** El radar: cada IP es un punto. Más al centro = más reciente. */
function Radar({ ips, quieto, desde, hasta }: {
  ips: PorIp[]; quieto: boolean; desde: string; hasta: string;
}): React.ReactElement {
  const tr = useTranslations('security');
  const t0 = new Date(desde).getTime();
  const t1 = new Date(hasta).getTime();

  const ref = useLienzo((p, t) => {
    const { ctx, w, h } = p;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 8;
    if (R < 20) return;

    // Los anillos y las cruces
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2);
      ctx.strokeStyle = i === 4 ? C.gris : C.grisTenue;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.strokeStyle = C.grisTenue;
    ctx.stroke();

    // El barrido
    const barrido = quieto ? -Math.PI / 2 : ((t / 4200) % 1) * Math.PI * 2;
    if (!quieto) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, barrido - 0.55, barrido);
      ctx.closePath();
      const rad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      rad.addColorStop(0, 'rgba(34,211,238,0.00)');
      rad.addColorStop(1, 'rgba(34,211,238,0.16)');
      ctx.fillStyle = rad;
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(barrido) * R, cy + Math.sin(barrido) * R);
      ctx.strokeStyle = 'rgba(34,211,238,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Las IPs
    const maxIntentos = Math.max(1, ...ips.map((x) => x.fallidos + x.exitosos));
    for (const x of ips) {
      const a = rumbo(x.ip);
      const edad = Math.min(1, Math.max(0, (t1 - new Date(x.ultimo).getTime()) / Math.max(1, t1 - t0)));
      const r = R * (0.16 + edad * 0.8);
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      const soloFallos = x.fallidos > 0 && x.exitosos === 0;
      const tam = 2.5 + ((x.fallidos + x.exitosos) / maxIntentos) * 5;
      const col = soloFallos ? C.mal : x.fallidos > 0 ? C.aviso : C.cian;

      // El punto se enciende cuando el barrido le pasa por encima.
      let brillo = 0.55;
      if (!quieto) {
        let d = barrido - a;
        while (d < 0) d += Math.PI * 2;
        while (d > Math.PI * 2) d -= Math.PI * 2;
        brillo = 0.55 + 0.45 * Math.max(0, 1 - d / 1.1);
      }

      ctx.globalAlpha = brillo;
      ctx.beginPath();
      ctx.arc(px, py, tam, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = soloFallos ? 14 : 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }, !quieto);

  const limpias = ips.filter((x) => x.fallidos === 0).length;
  const sucias  = ips.filter((x) => x.fallidos > 0 && x.exitosos === 0).length;
  const mixtas  = ips.length - limpias - sucias;

  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg bg-bg-1 p-4 sm:grid-cols-[minmax(0,180px)_1fr]">
      <canvas
        ref={ref}
        className="mx-auto block aspect-square w-full max-w-[180px]"
        role="img"
        aria-label={tr('radarAria', { n: ips.length })}
      />
      <div className="min-w-0 self-center">
        <h2 className="text-tiny font-bold uppercase tracking-widest text-text-muted">{tr('radarTitle')}</h2>
        <div className="mt-2.5 space-y-1.5 text-small text-text-2">
          <Clave color={C.cian}  texto={tr('radarClean', { n: limpias })} />
          <Clave color={C.aviso} texto={tr('radarMixed', { n: mixtas })} />
          <Clave color={C.mal}   texto={tr('radarBad',   { n: sucias })} />
        </div>
        <p className="mt-3 text-tiny leading-relaxed text-text-3">{tr('radarHint')}</p>
      </div>
    </div>
  );
}

function Clave({ color: col, texto }: { color: string; texto: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: col, boxShadow: `0 0 8px ${col}` }}
      />
      {texto}
    </div>
  );
}

/** La chispa de una cifra: cómo se repartió en el tiempo. */
function Chispa({ serie, col }: { serie: number[]; col: string }): React.ReactElement {
  const ref = useLienzo((p) => {
    const { ctx, w, h } = p;
    const max = Math.max(1, ...serie);
    const dx = serie.length > 1 ? w / (serie.length - 1) : w;
    const y = (v: number): number => h - 2 - (v / max) * (h - 4);

    ctx.beginPath();
    ctx.moveTo(0, h);
    serie.forEach((v, i) => ctx.lineTo(i * dx, y(v)));
    ctx.lineTo((serie.length - 1) * dx, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `${col}44`);
    g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.beginPath();
    serie.forEach((v, i) => (i ? ctx.lineTo(i * dx, y(v)) : ctx.moveTo(0, y(v))));
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const ult = serie[serie.length - 1] ?? 0;
    ctx.beginPath();
    ctx.arc((serie.length - 1) * dx, y(ult), 2.2, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 6;
    ctx.fill();
  });

  return <canvas ref={ref} className="mt-2 block h-[26px] w-full" aria-hidden="true" />;
}

/**
 * En qué cubo de la ventana cae un evento.
 *
 * El final es `hasta` y no `Date.now()`: con un mes ya terminado, "ahora" está
 * semanas más allá del último dato y todo el gráfico se apelmaza contra el
 * borde izquierdo.
 */
function cubo(cuando: string, desde: string, hasta: string, n: number): number {
  const t0 = new Date(desde).getTime();
  const paso = Math.max(1, (new Date(hasta).getTime() - t0) / n);
  const i = Math.floor((new Date(cuando).getTime() - t0) / paso);
  return Math.min(n - 1, Math.max(0, i));
}

/** Reparte los eventos en `n` cubos a lo largo de la ventana. */
function serieDe(eventos: Evento[], desde: string, hasta: string, n = 14): number[] {
  const cubos = new Array<number>(n).fill(0);
  for (const e of eventos) cubos[cubo(e.cuando, desde, hasta, n)]++;
  return cubos;
}

/**
 * Cuántas direcciones DISTINTAS se vieron en cada tramo.
 *
 * No es lo mismo que el conteo de intentos, y dibujar la misma línea en las dos
 * cifras era decir que sí lo es. Una pantalla de seguridad que repite un gráfico
 * en dos lugares distintos enseña a no mirarlos.
 */
function serieIps(eventos: Evento[], desde: string, hasta: string, n = 14): number[] {
  const vistas = Array.from({ length: n }, () => new Set<string>());
  for (const e of eventos) if (e.ip) vistas[cubo(e.cuando, desde, hasta, n)]!.add(e.ip);
  return vistas.map((s) => s.size);
}

/** Una barra que crece hasta su ancho. */
function Barra({ pct, clase, quieto, demora = 0 }: {
  pct: number; clase: string; quieto: boolean; demora?: number;
}): React.ReactElement {
  const [w, setW] = React.useState(quieto ? pct : 0);
  React.useEffect(() => {
    if (quieto) { setW(pct); return; }
    // `setTimeout` y no `requestAnimationFrame`: en una pestaña de fondo rAF no
    // corre y la barra se quedaría en cero para siempre.
    const id = setTimeout(() => setW(pct), 40 + demora);
    return () => clearTimeout(id);
  }, [pct, quieto, demora]);

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface">
      <div
        className={cn('h-full rounded-full', clase)}
        style={{ width: `${w}%`, transition: quieto ? undefined : 'width 900ms cubic-bezier(.22,1,.36,1)' }}
      />
    </div>
  );
}

/** Los siete cuadritos de un módulo: uno por protección, encendiéndose en fila. */
function Cuadros({ modulo, quieto }: { modulo: string; quieto: boolean }): React.ReactElement {
  const tr = useTranslations('security');
  const [on, setOn] = React.useState(quieto);
  React.useEffect(() => {
    if (quieto) { setOn(true); return; }
    const id = setTimeout(() => setOn(true), 60);
    return () => clearTimeout(id);
  }, [quieto]);

  return (
    <div className="mt-2 flex gap-1">
      {PROTECCIONES.map((p, i) => {
        const e = p.estado[modulo];
        return (
          <span
            key={p.id}
            title={`${tr(`prot.${p.id}.nombre`)} — ${e === true ? tr('markOk') : e === 'parcial' ? tr('markPartial') : tr('markOpen')}`}
            className={cn(
              'h-2 flex-1 rounded-sm',
              e === true ? 'bg-emerald' : e === 'parcial' ? 'bg-amber' : 'bg-rose/40',
            )}
            style={{
              opacity: on ? 1 : 0.08,
              transform: on ? 'scaleY(1)' : 'scaleY(0.35)',
              transition: quieto ? undefined : `opacity 420ms ease ${i * 70}ms, transform 420ms ease ${i * 70}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ───────────────────────────── la pantalla ─────────────────────────────── */

const COLOR: Record<string, string> = {
  LOGIN_SUCCESS: 'text-emerald', LOGIN_FAILED: 'text-rose',
  ACCOUNT_LOCKED: 'text-rose', ACCOUNT_UNLOCKED: 'text-brand-text',
};

const VENTANAS = [1, 2, 7] as const;

/**
 * Quién usa cada dirección, y si hay algo que no cierra.
 *
 * ── Por qué sale de los eventos y no de una consulta nueva ──────────────
 *
 * Porque ya está todo acá: cada evento trae `ip` y `correo`. Pedirle al
 * servidor "¿quién usa esta IP?" sería preguntar por algo que la pantalla
 * tiene en la mano.
 *
 * ── El cuidado con "país nuevo" ─────────────────────────────────────────
 *
 * Esta marca ya nos mintió una vez. El 2026-10-05 el cron de alertas tiró 33
 * avisos de "país nuevo" sobre 69 eventos, porque el país se empezó a
 * registrar ESE DÍA: sin historia, todo país es nuevo. Así que acá la
 * referencia son los países desde donde alguien ENTRÓ de verdad, y si no hay
 * ninguno la marca no se usa. Una señal sin línea de base no es una señal.
 *
 * Y se calcula sobre los eventos SIN filtrar, no sobre los que se están
 * mirando: con el filtro de módulo puesto, la referencia se encogería y un
 * país de todos los días pasaría por nuevo.
 */
/**
 * Qué hizo cada protección en la ventana que se está mirando.
 *
 * Erick, 2026-10-07: *"en protecciones solo pone un check (...) algo que
 * pueda hacer realmente, como que la protección está operativa"*. Tiene razón
 * y el tilde es la mitad de la respuesta: dice que la protección EXISTE. Lo
 * que nadie podía ver es si corrió.
 *
 * Un cero acá es buena noticia, no una falla —"ninguna cuenta se trabó"— y
 * por eso cada caso tiene su frase en vez de un número suelto.
 *
 * Dos de las siete no tienen nada que medir: `origen` (el endpoint viejo ya
 * no existe) y `cabeceras`. Devuelven `null` y la fila se queda con su tilde
 * y la fecha de revisión del código, que es lo honesto — inventarles un
 * número sería exactamente la clase de tranquilidad falsa que esta pantalla
 * existe para no dar.
 */
/** La clave i18n y sus números: el texto lo arma quien dibuja. */
interface Prueba { clave: string; valores: Record<string, number>; tono: string }

function pruebasDe(
  eventos: Evento[],
  cuentas: Cuentas,
  echadas: number,
): Record<string, Prueba | null> {
  const trabadas = eventos.filter((e) => e.accion === 'ACCOUNT_LOCKED').length;
  // El aviso sale en el SEGUNDO fallo, que es cuando queda un intento.
  const avisos = eventos.filter(
    (e) => e.accion === 'LOGIN_FAILED' && e.intentos !== null && e.intentos >= 2,
  ).length;
  const conOrigen = eventos.filter((e) => e.ip !== null && e.ip !== '' && e.pais !== null).length;
  const conMfa = cuentas.conMfa.length;

  return {
    // Trabar una cuenta es la protección haciendo su trabajo, pero también
    // alguien que no pudo entrar: ámbar, no verde.
    candado: trabadas > 0
      ? { clave: 'proofLockYes', valores: { n: trabadas }, tono: 'text-amber' }
      : { clave: 'proofLockNo', valores: {}, tono: 'text-emerald' },
    aviso: avisos > 0
      ? { clave: 'proofWarnYes', valores: { n: avisos }, tono: 'text-emerald' }
      : { clave: 'proofWarnNo', valores: {}, tono: 'text-text-3' },
    registro: {
      clave: 'proofLog',
      valores: { ok: conOrigen, total: eventos.length },
      tono: eventos.length > 0 && conOrigen === eventos.length ? 'text-emerald' : 'text-amber',
    },
    freno: echadas > 0
      ? { clave: 'proofBlockYes', valores: { n: echadas }, tono: 'text-emerald' }
      : { clave: 'proofBlockNo', valores: {}, tono: 'text-text-3' },
    mfa: {
      clave: 'proofMfa',
      valores: { n: conMfa, total: cuentas.total },
      tono: conMfa === 0 ? 'text-rose' : 'text-emerald',
    },
    // Sin nada que medir en vivo: el tilde y la fecha de revisión del código
    // son toda la respuesta honesta que hay.
    origen: null,
    cabeceras: null,
  };
}

interface Senas {
  /** Quiénes ENTRARON desde acá, por el nombre antes del arroba. */
  quienes: string[];
  /** Cuentas que se probaron y no entraron. */
  probados: string[];
  /** Al menos un ingreso bueno: la dirección es de alguien. */
  conocida: boolean;
  /** Su país no aparece en ningún ingreso bueno de la ventana. */
  paisNuevo: boolean;
}

const nombreDeCorreo = (c: string): string => (c.split("@")[0] ?? c).toLowerCase();

function senasPorIp(eventos: Evento[]): Map<string, Senas> {
  const paisesConocidos = new Set(
    eventos
      .filter((e) => e.accion === 'LOGIN_SUCCESS' && e.pais !== null && e.pais !== '')
      .map((e) => e.pais as string),
  );

  const porIp = new Map<string, { ok: Set<string>; mal: Set<string>; pais: string | null }>();
  for (const e of eventos) {
    if (e.ip === null || e.ip === '') continue;
    const fila = porIp.get(e.ip) ?? { ok: new Set<string>(), mal: new Set<string>(), pais: e.pais };
    if (e.correo !== null && e.correo !== '') {
      (e.accion === 'LOGIN_SUCCESS' ? fila.ok : fila.mal).add(nombreDeCorreo(e.correo));
    }
    if (fila.pais === null) fila.pais = e.pais;
    porIp.set(e.ip, fila);
  }

  const salida = new Map<string, Senas>();
  for (const [ip, f] of porIp) {
    const conocida = f.ok.size > 0;
    salida.set(ip, {
      quienes: [...f.ok].sort(),
      // Quien entró alguna vez no cuenta como "probada y rechazada": casi
      // siempre es la misma persona que se equivocó antes de acertar.
      probados: [...f.mal].filter((n) => !f.ok.has(n)).sort(),
      conocida,
      paisNuevo:
        !conocida
        && paisesConocidos.size > 0
        && f.pais !== null && f.pais !== ''
        && !paisesConocidos.has(f.pais),
    });
  }
  return salida;
}

/**
 * Las cuatro pestañas, una por PREGUNTA y no por widget.
 *
 * Protecciones va PRIMERO. Erick, 2026-10-07: "son nuestras protecciones
 * activas". Y tiene razón sobre el orden: lo primero que uno quiere saber al
 * abrir un centro de seguridad no es cuántos entraron hoy, es si lo que nos
 * cubre sigue en pie. Las otras tres contestan, en ese orden, qué está
 * pasando, desde dónde entran y quién puede entrar.
 */
const PESTANAS = ['protecciones', 'resumen', 'accesos', 'cuentas'] as const;
type Pestana = (typeof PESTANAS)[number];

export function SeguridadClient({ datos, dias, mes, meses }: {
  datos: DatosSeguridad; dias: number; mes: string | null; meses: string[];
}): React.ReactElement {
  const { cuentas, desde, hasta, ok } = datos;
  const tr = useTranslations('security');
  const idioma = useLocale();
  const quieto = useQuieto();
  const router = useRouter();
  const ruta = usePathname();

  const [modulo, setModulo] = React.useState<string | null>(null);
  const [ip, setIp] = React.useState<string | null>(null);
  const [pestana, setPestana] = React.useState<Pestana>('protecciones');

  /*
   * De quién es cada dirección. Sobre los eventos SIN filtrar: la referencia
   * de "país conocido" no puede encogerse por el filtro de módulo (ver
   * `senasPorIp`).
   */
  const senas = React.useMemo(() => senasPorIp(datos.eventos), [datos.eventos]);

  /* ── el refresco ──────────────────────────────────────────────────────── */
  const [pendiente, empezar] = React.useTransition();
  const [refrescado, setRefrescado] = React.useState(0);
  const [ahora, setAhora] = React.useState(0);

  const refrescar = React.useCallback(() => {
    empezar(() => {
      router.refresh();
      setRefrescado(Date.now());
    });
  }, [router]);

  // El reloj arranca DESPUÉS de montar: `Date.now()` en el render haría que el
  // servidor y el navegador escriban números distintos en el mismo lugar.
  React.useEffect(() => {
    const t = Date.now();
    setRefrescado(t);
    setAhora(t);
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refrescar();
    }, 45_000);
    return () => clearInterval(id);
  }, [refrescar]);

  const segundos = refrescado ? Math.floor((ahora - refrescado) / 1000) : null;

  /* ── los filtros ──────────────────────────────────────────────────────── */
  const eventos = React.useMemo(
    () => datos.eventos.filter((e) =>
      (!modulo || e.modulo === modulo) && (!ip || e.ip === ip)),
    [datos.eventos, modulo, ip],
  );
  const porIp = React.useMemo(
    () => (modulo ? datos.porIp.filter((x) => x.modulos.includes(modulo)) : datos.porIp),
    [datos.porIp, modulo],
  );

  const ventana     = mes
    ? nombreDeMes(mes, idioma)
    : tr(dias === 1 ? 'win24' : dias === 2 ? 'win48' : 'win7');
  const nombreModulo = modulo ? MODULOS.find((m) => m.id === modulo)?.nombre ?? modulo : null;
  const queFiltra   = [nombreModulo, ip].filter(Boolean).join(' · ');
  /* Qué hizo cada protección en lo que se está mirando. */
  const pruebas = React.useMemo(
    () => pruebasDe(eventos, cuentas, datos.bloqueadas.length),
    [eventos, cuentas, datos.bloqueadas],
  );

  const fallidos    = eventos.filter((e) => e.accion === 'LOGIN_FAILED').length;
  const exitosos    = eventos.filter((e) => e.accion === 'LOGIN_SUCCESS').length;
  const sospechosas = porIp.filter((x) => x.fallidos > 0 && x.exitosos === 0);
  const filtrado    = Boolean(modulo || ip);

  const cambiarVentana = (d: number): void => {
    empezar(() => {
      router.push(`${ruta}?dias=${d}`);
      setRefrescado(Date.now());
    });
  };

  /** Un mes cerrado, o volver a la ventana corta cuando eligen el vacío. */
  const cambiarMes = (m: string): void => {
    empezar(() => {
      router.push(m ? `${ruta}?mes=${m}` : `${ruta}?dias=${dias}`);
      setRefrescado(Date.now());
    });
  };

  return (
    <div className="space-y-7">
      {/* ── La cabecera ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-1">{tr('title')}</h1>
          <p className="mt-1 text-small text-text-2">{tr('subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-tiny tabular-nums',
            pendiente ? 'border-brand-text/40 text-brand-text' : 'border-emerald/30 text-emerald',
          )}>
            <span className={cn(
              'inline-block h-1.5 w-1.5 rounded-full',
              pendiente ? 'bg-brand-text' : 'bg-emerald',
              quieto ? '' : 'animate-pulse',
            )} />
            {pendiente ? tr('reading') : `${tr('live')} · ${segundos ?? 0}s`}
          </span>

          <div className="inline-flex overflow-hidden rounded-lg border border-row-sep">
            {VENTANAS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => cambiarVentana(d)}
                className={cn(
                  'px-3 py-1 text-tiny transition-colors',
                  !mes && d === dias ? 'bg-brand text-white' : 'text-text-3 hover:bg-bg-1 hover:text-text-1',
                )}
              >
                {tr(d === 1 ? 'btn24' : d === 2 ? 'btn48' : 'btn7')}
              </button>
            ))}
          </div>

          {/*
            * El reporte por mes. Pedido de Erick el 2026-10-06.
            *
            * Un `<select>` del sistema y no un desplegable propio: son doce
            * opciones sin estado, y el nativo ya sabe de teclado, de pantalla
            * chica y de lector de pantalla.
            *
            * Las etiquetas se arman acá con el idioma activo; la LISTA viene del
            * servidor para que los dos lados no discrepen por huso horario.
            */}
          <select
            value={mes ?? ''}
            onChange={(e) => cambiarMes(e.target.value)}
            aria-label={tr('monthLabel')}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-tiny transition-colors',
              mes ? 'border-brand bg-brand/20 text-brand-text' : 'border-row-sep bg-transparent text-text-3 hover:text-text-1',
            )}
          >
            <option value="">{tr('monthNone')}</option>
            {meses.map((m) => (
              <option key={m} value={m}>{nombreDeMes(m, idioma)}</option>
            ))}
          </select>

          {/*
            * El módulo, acá arriba y no abajo.
            *
            * Vivía en las cinco tarjetas del medio de la página, que decían
            * "elegí uno para filtrar todo lo de abajo" y filtraban también
            * todo lo de ARRIBA: el chip "filtrado: Clinic" salía antes que el
            * control que lo ponía. Un filtro global va con los otros filtros
            * globales, y se ve desde cualquier pestaña.
            *
            * El mismo estado hace dos cosas según dónde estés: filtra en
            * Resumen y Accesos, y resalta la columna en Protecciones. Es un
            * solo lugar donde tocar.
            */}
          <select
            value={modulo ?? ''}
            onChange={(e) => { setModulo(e.target.value === '' ? null : e.target.value); setIp(null); }}
            aria-label={tr('byModule')}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-tiny transition-colors',
              modulo ? 'border-brand bg-brand/20 text-brand-text' : 'border-row-sep bg-transparent text-text-3 hover:text-text-1',
            )}
          >
            <option value="">{tr('moduleAll')}</option>
            {MODULOS.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={refrescar}
            title={tr('refreshTitle')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-row-sep px-3 py-1 text-tiny text-text-3 transition-colors hover:bg-bg-1 hover:text-text-1"
          >
            <RefreshCw className={cn('h-3 w-3', pendiente && !quieto && 'animate-spin')} />
            {tr('refresh')}
          </button>

          {/*
            * El reporte imprimible. Enlace y no botón: se abre en otra pestaña
            * y lleva la MISMA ventana que se está mirando, para que lo que se
            * manda sea lo que se vio.
            */}
          <a
            href={mes ? `/print/seguridad?mes=${mes}` : `/print/seguridad?dias=${dias}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-row-sep px-3 py-1 text-tiny text-text-3 transition-colors hover:bg-bg-1 hover:text-text-1"
          >
            <Printer className='h-3 w-3' />
            {tr('printLink')}
          </a>
        </div>
      </div>

      {/*
        * Las pestañas.
        *
        * `role="tablist"` de verdad y no una fila de botones: con flechas se
        * recorren, y un lector de pantalla anuncia "pestaña 2 de 4". Lo que
        * no se muestra se DESMONTA —no se esconde con CSS— porque los lienzos
        * del radar y del medidor se repintan por animación y seguirían
        * corriendo invisibles.
        */}
      <div role="tablist" aria-label={tr('title')} className="flex gap-1 overflow-x-auto border-b border-row-sep">
        {PESTANAS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pestana === p}
            onClick={() => setPestana(p)}
            className={cn(
              '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-small font-medium transition-colors',
              pestana === p
                ? 'border-brand text-text-1'
                : 'border-transparent text-text-3 hover:text-text-1',
            )}
          >
            {tr(`tab.${p}`)}
          </button>
        ))}
      </div>

      {!ok && (
        <div className="rounded-lg border border-rose/30 bg-rose/10 px-4 py-3 text-small text-rose">
          {tr('errRead')}
        </div>
      )}

      {/*
        * Cuando el filtro no deja nada, decirlo.
        *
        * Erick, 2026-10-06: eligió 7 días con Attorneys puesto y vio seis ceros
        * y un radar en blanco. Lo leyó como una falla de la ventana. No lo era
        * —había 66 intentos en esos 7 días— pero la pantalla no daba forma de
        * saberlo. Los ceros eran del filtro, no del sistema, y eso hay que
        * escribirlo, no dejarlo deducir.
        */}
      {filtrado && eventos.length === 0 && (
        <div className="rounded-lg border border-amber/30 bg-amber/10 px-4 py-3">
          <p className="text-small text-text-1">
            {tr.rich('emptyFor', {
              que: queFiltra, ventana,
              b: (c) => <b>{c}</b>,
            })}
          </p>
          {(modulo === 'providers' || modulo === 'attorneys') && (
            <p className="mt-1.5 text-tiny leading-relaxed text-text-2">{tr('emptyNote')}</p>
          )}
          <button
            type="button"
            onClick={() => { setModulo(null); setIp(null); }}
            className="mt-2.5 rounded-lg border border-row-sep bg-bg-1 px-3 py-1 text-tiny text-text-1 transition-colors hover:bg-surface"
          >
            {tr('showAllModules')}
          </button>
        </div>
      )}

      {pestana === 'resumen' && (<>
      {/* ── El medidor y el radar ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,300px)_1fr]">
        <Medidor key={exposicionGeneral()} valor={exposicionGeneral()} quieto={quieto} />
        <Radar ips={porIp} quieto={quieto} desde={desde} hasta={hasta} />
      </div>

      {/* ── Las cifras ────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
          {ventana}
          {filtrado && (
            <button
              type="button"
              onClick={() => { setModulo(null); setIp(null); }}
              title={tr('removeFilter')}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand/20 px-2.5 py-0.5 normal-case tracking-normal text-brand-text transition-colors hover:bg-brand/30"
            >
              {tr('filtered', { que: queFiltra })}
              <span aria-hidden="true">×</span>
            </button>
          )}
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Cifra n={eventos.length} l={tr('statAttempts')} col={C.cian} quieto={quieto}
                 serie={serieDe(eventos, desde, hasta)} />
          <Cifra n={exitosos} l={tr('statSignedIn')} tonoClase="text-emerald" col={C.ok} quieto={quieto}
                 serie={serieDe(eventos.filter((e) => e.accion === 'LOGIN_SUCCESS'), desde, hasta)} />
          <Cifra n={fallidos} l={tr('statWrong')} tonoClase={fallidos ? 'text-rose' : undefined} col={C.mal} quieto={quieto}
                 serie={serieDe(eventos.filter((e) => e.accion === 'LOGIN_FAILED'), desde, hasta)} />
          <Cifra n={porIp.length} l={tr('statIps')} col={C.cian} quieto={quieto}
                 serie={serieIps(eventos, desde, hasta)} />
          <Cifra n={sospechosas.length} l={tr('statIpsBad')}
                 tonoClase={sospechosas.length ? 'text-rose' : 'text-emerald'} col={C.mal} quieto={quieto}
                 serie={serieIps(eventos.filter((e) => e.accion === 'LOGIN_FAILED'), desde, hasta)} />
          <Cifra n={cuentas.trabadasAhora} l={tr('statLocked')}
                 tonoClase={cuentas.trabadasAhora ? 'text-amber' : 'text-emerald'} col={C.aviso} quieto={quieto}
                 serie={serieDe(eventos.filter((e) => e.accion === 'ACCOUNT_LOCKED'), desde, hasta)} />
        </div>
      </section>

      {/* ── Quién entró y desde dónde ─────────────────────────────────── */}
      <QuienEntro eventos={eventos} ahora={ahora} idioma={idioma} />
      </>)}

      {pestana === 'protecciones' && (<>
      {/* ── Por módulo: acá se filtra todo ────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
          {tr('byModule')}
          <span className="normal-case tracking-normal font-medium text-text-3">
            · {tr('byModuleHint')}
          </span>
          {modulo && (
            <button
              type="button"
              onClick={() => setModulo(null)}
              className="rounded-full border border-row-sep px-2 py-0.5 normal-case tracking-normal font-medium text-text-3 transition-colors hover:text-text-1"
            >
              {tr('showAllShort')}
            </button>
          )}
        </h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {MODULOS.map((m, i) => {
            const p = puntaje(m.id);
            const vistos = datos.eventos.filter((e) => e.modulo === m.id).length;
            const malos  = datos.eventos.filter((e) => e.modulo === m.id && e.accion === 'LOGIN_FAILED').length;
            const activo = modulo === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={activo}
                onClick={() => { setModulo(activo ? null : m.id); setIp(null); }}
                className={cn(
                  'min-w-0 rounded-lg bg-bg-1 p-4 text-left transition-all',
                  'border hover:-translate-y-0.5 hover:shadow-lg',
                  activo ? 'border-brand ring-1 ring-brand' : 'border-transparent hover:border-row-sep',
                  modulo && !activo && 'opacity-50',
                )}
              >
                <div className="font-semibold text-text-1">{m.nombre}</div>
                <div className="mt-0.5 truncate font-mono text-tiny text-text-3">{m.host}</div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className={cn('text-xl font-bold tabular-nums', tono(p.exposicion))}>{p.activas}</span>
                  <span className="text-tiny text-text-3">{tr('ofExposure', { total: p.total, exp: p.exposicion })}</span>
                </div>
                <div className="mt-2">
                  <Barra
                    pct={(p.activas / p.total) * 100}
                    quieto={quieto}
                    demora={i * 90}
                    clase={p.exposicion >= 50 ? 'bg-rose' : p.exposicion >= 25 ? 'bg-amber' : 'bg-emerald'}
                  />
                </div>
                <Cuadros modulo={m.id} quieto={quieto} />
                <div className="mt-2.5 text-tiny text-text-3">
                  {vistos > 0
                    ? <>{tr('nAttempts', { n: vistos })}{malos > 0 && <span className="text-rose"> · {tr('nFailed', { n: malos })}</span>}</>
                    : tr('noAttempts')}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── La matriz ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
          {tr('matrixTitle')}
          <span className="inline-flex items-center gap-1 normal-case tracking-normal font-medium text-text-3">
            <Clock className="h-3 w-3" /> {tr('codeChecked', { fecha: MEDIDO_EL })}
          </span>
        </h2>

        {/* Tres de las cinco columnas son la misma app. Decirlo, para que
            nadie lea "repetido" donde dice "es el mismo código". */}
        <p className="mb-3 text-tiny leading-relaxed text-text-3">{tr('sameApp')}</p>
        <div className="overflow-x-auto rounded-lg bg-bg-1">
          <table className="w-full min-w-[640px] text-small">
            <thead>
              <tr className="border-b border-row-sep">
                <th className="px-4 py-3 text-left text-tiny font-bold uppercase tracking-wider text-text-muted">{tr('colProtection')}</th>
                {MODULOS.map((m) => (
                  <th
                    key={m.id}
                    className={cn(
                      'px-3 py-3 text-tiny font-bold uppercase tracking-wider',
                      modulo === m.id ? 'text-brand-text' : 'text-text-muted',
                      modulo && modulo !== m.id && 'opacity-40',
                    )}
                  >
                    {m.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROTECCIONES.map((p) => (
                <tr key={p.id} className="border-b border-row-sep last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-text-1">{tr(`prot.${p.id}.nombre`)}</div>
                    <div className="mt-0.5 text-tiny text-text-3">{tr(`prot.${p.id}.detalle`)}</div>
                    {/* Lo que hizo en la ventana que se está mirando. El tilde
                        dice que existe; esto, que corrió. */}
                    {pruebas[p.id] != null && (
                      <div className={cn('mt-1 flex items-center gap-1.5 text-tiny', pruebas[p.id]?.tono)}>
                        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                        <span className="text-text-2">{ventana}:</span>
                        <span>{tr(pruebas[p.id]?.clave ?? '', pruebas[p.id]?.valores)}</span>
                      </div>
                    )}
                  </td>
                  {MODULOS.map((m) => (
                    <td
                      key={m.id}
                      className={cn('px-3 py-3 text-center', modulo && modulo !== m.id && 'opacity-40')}
                    >
                      <Marca estado={p.estado[m.id]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      </>)}

      {pestana === 'accesos' && (<>
      {/* ── IPs y eventos ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="min-w-0">
          <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
            {tr('ipsTitle')}
            {ip && (
              <button
                type="button"
                onClick={() => setIp(null)}
                className="rounded-full border border-row-sep px-2 py-0.5 normal-case tracking-normal font-medium text-text-3 transition-colors hover:text-text-1"
              >
                {tr('clearIp', { ip })}
              </button>
            )}
          </h2>
          <div className="rounded-lg bg-bg-1 px-4 py-1">
            {porIp.length === 0 && <p className="py-4 text-small text-text-3">{tr('noIps')}</p>}
            {porIp.map((x) => (
              <FilaIp
                key={x.ip}
                x={x}
                senas={senas.get(x.ip) ?? null}
                quieto={quieto}
                activa={ip === x.ip}
                onClick={() => setIp(ip === x.ip ? null : x.ip)}
                onBloqueada={refrescar}
              />
            ))}
          </div>
        </section>

        <section className="min-w-0">
          <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">{tr('eventsTitle')}</h2>
          <div className="rounded-lg bg-bg-1 px-4 py-1">
            {eventos.length === 0 && <p className="py-4 text-small text-text-3">{tr('noEvents')}</p>}
            {eventos.slice(0, 16).map((e, i) => <FilaEvento key={i} e={e} />)}
            {eventos.length > 16 && (
              <p className="py-2.5 text-tiny text-text-3">{tr('andMore', { n: eventos.length - 16 })}</p>
            )}
          </div>
        </section>
      </div>

      {/* ── IPs echadas ───────────────────────────────────────────────── */}
      <Echadas lista={datos.bloqueadas} onCambio={refrescar} />
      </>)}

      {pestana === 'cuentas' && (<>
      {/* ── Cortar el acceso ──────────────────────────────────────────── */}
      <CortarAcceso cuentas={cuentas.todas} onCambio={refrescar} />

      {/* ── Doble factor ──────────────────────────────────────────────── */}
      <DobleFactor lista={cuentas.conMfa} total={cuentas.total} onCambio={refrescar} />

      {/* ── Cuentas ───────────────────────────────────────────────────── */}
      <Riesgos cuentas={cuentas} onCambio={refrescar} />
      </>)}

      <p className="border-t border-row-sep pt-4 text-tiny leading-relaxed text-text-3">
        {tr.rich('footer', { b: (c) => <b className="text-text-2">{c}</b> })}
      </p>
    </div>
  );
}

/* ───────────────────────────── las piezas ──────────────────────────────── */

function Cifra({ n, l, tonoClase, col, serie, quieto }: {
  n: number; l: string; tonoClase?: string; col: string; serie: number[]; quieto: boolean;
}): React.ReactElement {
  const v = useConteo(n, quieto);
  return (
    <div className="min-w-0 rounded-lg bg-bg-1 p-4">
      <div className={cn('text-2xl font-bold tabular-nums leading-none', tonoClase ?? 'text-text-1')}>{v}</div>
      <div className="mt-1.5 text-tiny text-text-3">{l}</div>
      <Chispa serie={serie} col={col} />
    </div>
  );
}

function Marca({ estado }: { estado: boolean | 'parcial' | undefined }): React.ReactElement {
  const tr = useTranslations('security');
  if (estado === true) {
    return <span title={tr('markOk')} className="inline-block rounded px-1.5 py-0.5 text-tiny font-bold bg-emerald/15 text-emerald">✓</span>;
  }
  if (estado === 'parcial') {
    return <span title={tr('markPartial')} className="inline-block rounded px-1.5 py-0.5 text-tiny font-bold bg-amber/15 text-amber">○</span>;
  }
  return <span title={tr('markOpen')} className="inline-block rounded px-1.5 py-0.5 text-tiny font-bold bg-rose/15 text-rose">✕</span>;
}

function FilaIp({ x, senas, quieto, activa, onClick, onBloqueada }: {
  x: PorIp; senas: Senas | null; quieto: boolean; activa: boolean;
  onClick: () => void; onBloqueada: () => void;
}): React.ReactElement {
  const tr = useTranslations('security');
  const idioma = useLocale();
  const soloFallos = x.fallidos > 0 && x.exitosos === 0;
  const donde = [x.ciudad, x.pais].filter(Boolean).join(', ');
  const total = Math.max(1, x.fallidos + x.exitosos);

  return (
    <div
      className={cn(
        'border-b border-row-sep py-2.5 transition-colors last:border-0',
        activa ? 'bg-brand/10' : '',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={onClick}
          aria-pressed={activa}
          className="flex items-center gap-2 rounded font-mono text-small tabular-nums text-text-1 transition-colors hover:text-brand-text"
        >
          {soloFallos
            ? <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose" />
            : <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald" />}
          {x.ip}
        </button>
        <span className="flex items-center gap-2 font-mono text-tiny tabular-nums text-text-3">
          {x.fallidos > 0 && <span className="text-rose">{tr('nFailed', { n: x.fallidos })}</span>}
          {x.fallidos > 0 && x.exitosos > 0 && ' · '}
          {x.exitosos > 0 && <span>{tr('nOk', { n: x.exitosos })}</span>}
          <BotonBloquear x={x} onListo={onBloqueada} />
        </span>
      </div>

      {/* La proporción, dibujada: verde lo que entró, rojo lo que falló. */}
      <div className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {x.exitosos > 0 && (
          <Franja pct={(x.exitosos / total) * 100} clase="bg-emerald" quieto={quieto} />
        )}
        {x.fallidos > 0 && (
          <Franja pct={(x.fallidos / total) * 100} clase="bg-rose" quieto={quieto} />
        )}
      </div>

      {/*
        * De quién es esta dirección.
        *
        * Erick, 2026-10-07: *"sabemos de quiénes son, por qué no ponemos sus
        * nombres en pequeño"*. Una IP sola no se puede juzgar; con los nombres
        * al lado, `76.8.206.26` deja de ser un número y se lee como "la
        * oficina". Va el nombre antes del arroba y no el correo entero:
        * entran seis en una línea y nadie necesita el dominio, que es el
        * mismo para todos.
        */}
      {senas !== null && senas.quienes.length > 0 && (
        <p className="mt-1 truncate text-tiny text-text-2" title={senas.quienes.join(', ')}>
          {senas.quienes.slice(0, 5).join(' · ')}
          {senas.quienes.length > 5 && (
            <span className="text-text-3"> {tr('ipMore', { n: senas.quienes.length - 5 })}</span>
          )}
        </p>
      )}

      {/*
        * Y la que no es de nadie.
        *
        * Tres hechos, no un veredicto: nadie entró, probó N cuentas, el país
        * no es de los nuestros. Juntos se leen como lo que suele ser, pero la
        * pantalla no dice "es un bot" — eso lo decide quien mira, que tiene el
        * botón de Bloquear a dos centímetros. Un cartel que acusa solo se
        * ignora en cuanto se equivoca una vez.
        */}
      {senas !== null && !senas.conocida && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-rose/30 bg-rose/10 px-2 py-0.5 text-tiny text-rose">
            {tr('ipNobody')}
          </span>
          {senas.probados.length > 1 && (
            <span className="rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-tiny text-amber">
              {tr('ipTried', { n: senas.probados.length })}
            </span>
          )}
          {senas.paisNuevo && x.pais !== null && (
            <span className="rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-tiny text-amber">
              {tr('ipNewCountry', { pais: x.pais })}
            </span>
          )}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-tiny text-text-3">
        <span>{hora(x.ultimo, idioma)}{x.modulos.length > 0 && ` · ${x.modulos.join(', ')}`}</span>
        {/* Sin ubicación no se inventa nada: se dice que no se sabe. */}
        <span className="font-mono">{donde || tr('locationUnknown')}</span>
      </div>
    </div>
  );
}

/**
 * Echar una IP.
 *
 * ── Por qué pide motivo y plazo, en vez de un clic solo ───────────────────
 *
 * Porque dentro de seis meses alguien va a mirar la lista y preguntar "¿y esta
 * por qué está?". Y porque una IP echada "para siempre" por un incidente de un
 * martes sigue echada dos años después: nadie limpia la lista. El plazo por
 * defecto son 7 días y lo permanente hay que elegirlo.
 *
 * ── El aviso ──────────────────────────────────────────────────────────────
 *
 * Si la dirección tiene ingresos EXITOSOS, es casi seguro la salida a internet
 * de la clínica —medido el 2026-10-06: `76.8.206.26` tiene 11 buenos y 4
 * fallidos, compartida por todo el personal— y echarla deja a todos afuera. El
 * aviso dice cuántos ingresos buenos tiene antes de dejar confirmar.
 */
function BotonBloquear({ x, onListo }: { x: PorIp; onListo: () => void }): React.ReactElement {
  const tr = useTranslations('security');
  const [abierto, setAbierto] = React.useState(false);
  const [motivo, setMotivo] = React.useState('');
  const [dias, setDias] = React.useState('7');
  const [estado, setEstado] = React.useState<'listo' | 'yendo' | 'error'>('listo');

  const confirmar = async (): Promise<void> => {
    setEstado('yendo');
    try {
      const r = await fetch('/api/seguridad/ips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ip: x.ip, motivo, dias: Number(dias), pais: x.pais, ciudad: x.ciudad,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setAbierto(false);
      setEstado('listo');
      onListo();
    } catch {
      setEstado('error');
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={tr('blockTitle')}
        className="inline-flex items-center gap-1 rounded border border-row-sep px-1.5 py-0.5 text-tiny text-text-3 transition-colors hover:border-rose/40 hover:text-rose"
      >
        <Ban className="h-3 w-3" />
        {tr('blockBtn')}
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-rose/30 bg-rose/5 p-3">
      {x.exitosos > 0 && (
        <p className="mb-2 text-tiny leading-relaxed text-amber">{tr('blockWarn', { n: x.exitosos })}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={tr('blockReason')}
          maxLength={300}
          className="min-w-0 flex-1 rounded border border-row-sep bg-bg-1 px-2 py-1 text-tiny text-text-1"
        />
        <select
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          aria-label={tr('blockDays')}
          className="rounded border border-row-sep bg-bg-1 px-2 py-1 text-tiny text-text-1"
        >
          <option value="7">{tr('block7')}</option>
          <option value="30">{tr('block30')}</option>
          <option value="0">{tr('blockForever')}</option>
        </select>
        <button
          type="button"
          disabled={estado === 'yendo'}
          onClick={() => { void confirmar(); }}
          className="rounded border border-rose/40 bg-rose/10 px-2.5 py-1 text-tiny text-rose transition-colors hover:bg-rose/20 disabled:opacity-50"
        >
          {estado === 'yendo' ? tr('blocking') : estado === 'error' ? tr('blockFailed') : tr('blockConfirm')}
        </button>
        <button
          type="button"
          onClick={() => { setAbierto(false); setEstado('listo'); }}
          className="rounded px-2 py-1 text-tiny text-text-3 transition-colors hover:text-text-1"
        >
          {tr('blockCancel')}
        </button>
      </div>
    </div>
  );
}

/** Las que están echadas ahora, con el botón para dejarlas volver. */
function Echadas({ lista, onCambio }: { lista: IpEchada[]; onCambio: () => void }): React.ReactElement {
  const tr = useTranslations('security');

  return (
    <section>
      <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">
        {tr('blockedTitle', { n: lista.length })}
      </h2>
      <div className="rounded-lg bg-bg-1 px-4 py-1">
        {lista.length === 0 && <p className="py-4 text-small text-text-3">{tr('blockedNone')}</p>}
        {lista.map((b) => <FilaEchada key={b.ip} b={b} onCambio={onCambio} />)}
      </div>
    </section>
  );
}

function FilaEchada({ b, onCambio }: { b: IpEchada; onCambio: () => void }): React.ReactElement {
  const tr = useTranslations('security');
  const idioma = useLocale();
  const [estado, setEstado] = React.useState<'listo' | 'yendo' | 'error'>('listo');
  const vencida = Boolean(b.hasta) && new Date(b.hasta as string).getTime() <= Date.now();

  const sacar = async (): Promise<void> => {
    setEstado('yendo');
    try {
      const r = await fetch(`/api/seguridad/ips?ip=${encodeURIComponent(b.ip)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(String(r.status));
      onCambio();
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  };

  const donde = [b.ciudad, b.pais].filter(Boolean).join(', ');

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-row-sep py-2.5 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Ban className={cn('h-3.5 w-3.5 shrink-0', vencida ? 'text-text-3' : 'text-rose')} />
          <span className="font-mono text-small tabular-nums text-text-1">{b.ip}</span>
          {donde && <span className="font-mono text-tiny text-text-3">{donde}</span>}
        </div>
        <div className="mt-0.5 text-tiny text-text-3">
          {b.motivo || tr('blockedNoReason')}
          {' · '}
          {/* Una fila vencida sigue en la lista pero ya no frena nada: decirlo. */}
          {vencida
            ? tr('blockedExpired', { cuando: hora(b.hasta as string, idioma) })
            : b.hasta
              ? tr('blockedUntil', { cuando: hora(b.hasta, idioma) })
              : tr('blockedForever')}
        </div>
      </div>
      <button
        type="button"
        disabled={estado === 'yendo'}
        onClick={() => { void sacar(); }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-row-sep px-2.5 py-1 text-tiny text-text-3 transition-colors hover:bg-surface hover:text-text-1 disabled:opacity-50"
      >
        <Unlock className="h-3 w-3" />
        {estado === 'yendo' ? tr('unblocking') : estado === 'error' ? tr('blockFailed') : tr('unblockBtn')}
      </button>
    </div>
  );
}

function Franja({ pct, clase, quieto }: { pct: number; clase: string; quieto: boolean }): React.ReactElement {
  const [w, setW] = React.useState(quieto ? pct : 0);
  React.useEffect(() => {
    if (quieto) { setW(pct); return; }
    const id = setTimeout(() => setW(pct), 40);
    return () => clearTimeout(id);
  }, [pct, quieto]);
  return (
    <span
      className={cn('block h-full rounded-full', clase)}
      style={{ width: `${w}%`, transition: quieto ? undefined : 'width 800ms cubic-bezier(.22,1,.36,1)' }}
    />
  );
}

function FilaEvento({ e }: { e: Evento }): React.ReactElement {
  const tr = useTranslations('security');
  const idioma = useLocale();
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-row-sep py-2 text-small last:border-0">
      <time className="font-mono text-tiny tabular-nums text-text-3">{hora(e.cuando, idioma)}</time>
      <span className={cn('font-semibold', COLOR[e.accion] ?? 'text-text-2')}>{tr(`act.${e.accion}`)}</span>
      {e.intentos !== null && e.accion === 'LOGIN_FAILED' && (
        <span className="text-tiny text-text-3">{tr('ofThree', { n: e.intentos })}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-tiny text-text-3">{e.correo ?? '—'}</span>
      {e.modulo && <span className="rounded bg-surface px-1.5 text-tiny text-text-3">{e.modulo}</span>}
      <span className="font-mono text-tiny text-text-3">{e.ip ?? '—'}</span>
    </div>
  );
}

function Riesgos({ cuentas, onCambio }: { cuentas: Cuentas; onCambio: () => void }): React.ReactElement {
  const tr = useTranslations('security');
  const idioma = useLocale();
  return (
    <section>
      <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">
        {tr('accountsTitle', { n: cuentas.total })}
      </h2>
      <div className="rounded-lg bg-bg-1 px-4 py-1">
        <Riesgo
          titulo={tr('riskMfa')}
          detalle={cuentas.adminsSinMfa > 0 ? tr('riskMfaAdmins', { n: cuentas.adminsSinMfa }) : tr('riskMfaNone')}
          v={`${cuentas.sinMfa} / ${cuentas.total}`} malo={cuentas.sinMfa > 0}
        />
        <Riesgo
          titulo={tr('riskPending')}
          detalle={tr('riskPendingD')}
          v={cuentas.pendientesQueEntran} malo={cuentas.pendientesQueEntran > 0}
        />
        <Riesgo
          titulo={tr('riskNever')}
          detalle={tr('riskNeverD')}
          v={cuentas.nuncaEntraron} aviso={cuentas.nuncaEntraron > 0}
        />
        <Riesgo
          titulo={tr('riskLocked')}
          detalle={tr('riskLockedD')}
          v={cuentas.trabadasAhora} aviso={cuentas.trabadasAhora > 0}
        />
      </div>

      {cuentas.conIntentos.length > 0 && (
        <div className="mt-2.5 rounded-lg bg-bg-1 px-4 py-3">
          <div className="mb-2 text-tiny font-bold uppercase tracking-wider text-text-muted">
            {tr('withAttempts')}
          </div>
          {cuentas.conIntentos.map((c) => {
            const trabada = Boolean(c.hasta) && new Date(c.hasta as string).getTime() > Date.now();
            return (
              <div key={c.correo} className="flex flex-wrap items-center justify-between gap-2 border-b border-row-sep py-2 last:border-0">
                <span className="text-small text-text-1">{c.correo}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-small tabular-nums text-text-2">{tr('ofThree', { n: c.intentos })}</span>
                  {trabada && <Badge variant="destructive">{tr('lockedUntil', { cuando: hora(c.hasta as string, idioma) })}</Badge>}
                  <Desbloquear id={c.id} activo={trabada || c.intentos > 0} onListo={onCambio} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * El botón que levanta el candado.
 *
 * Se muestra SIEMPRE, también cuando no hay nada que levantar: un botón que
 * aparece y desaparece deja a quien mira sin saber si la acción existe
 * (`feedback-no-esconder-la-accion-bloqueada`). Cuando no hay nada que hacer va
 * apagado y lo dice.
 */
function Desbloquear({ id, activo, onListo }: {
  id: string; activo: boolean; onListo: () => void;
}): React.ReactElement {
  const tr = useTranslations('security');
  const [estado, setEstado] = React.useState<'listo' | 'yendo' | 'hecho' | 'error'>('listo');

  const tocar = async (): Promise<void> => {
    setEstado('yendo');
    try {
      const r = await fetch(`/api/users/${id}/unlock`, { method: 'POST' });
      if (!r.ok) throw new Error(String(r.status));
      setEstado('hecho');
      onListo();
    } catch {
      setEstado('error');
    }
  };

  return (
    <button
      type="button"
      disabled={!activo || estado === 'yendo' || estado === 'hecho'}
      onClick={() => { void tocar(); }}
      title={activo ? tr('unlockTitle') : tr('unlockNothing')}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-tiny transition-colors',
        estado === 'error' ? 'border-rose/40 text-rose'
          : estado === 'hecho' ? 'border-emerald/40 text-emerald'
          : 'border-row-sep text-text-3 hover:bg-surface hover:text-text-1',
        !activo && 'cursor-not-allowed opacity-40',
      )}
    >
      <Unlock className="h-3 w-3" />
      {estado === 'yendo' ? tr('unlocking') : estado === 'hecho' ? tr('unlocked') : estado === 'error' ? tr('unlockFailed') : tr('unlock')}
    </button>
  );
}

/**
 * Quién entró, y desde dónde.
 *
 * ── Lo que esto SÍ dice, y lo que no ──────────────────────────────────────
 *
 * Dice el ÚLTIMO INGRESO de cada persona dentro de la ventana elegida, con su
 * ubicación. **No dice quién tiene la sesión abierta ahora mismo**, y la
 * diferencia importa: el sistema registra ingresos, no sesiones vivas. Alguien
 * que entró a las 8 y cerró el navegador a las 9 sigue apareciendo como su
 * último ingreso a las 8.
 *
 * Supabase guarda las sesiones activas en su esquema `auth`, que no se puede
 * consultar por la API REST. Por eso el encabezado dice "último ingreso" y
 * cada fila dice hace cuánto fue: así nadie lee una lista de presentes donde
 * hay una lista de entradas.
 *
 * ── De dónde salen los datos ──────────────────────────────────────────────
 *
 * De `eventos`, que la pantalla ya tiene. Cero consultas nuevas: es la misma
 * información mirada por persona en vez de por orden cronológico. Y respeta
 * los filtros de módulo y de IP, como todo lo demás.
 */
function QuienEntro({ eventos, ahora, idioma }: {
  eventos: Evento[]; ahora: number; idioma: string;
}): React.ReactElement {
  const tr = useTranslations('security');

  /** El último ingreso de cada persona. Los eventos ya vienen de más nuevo a más viejo. */
  const ultimos = React.useMemo(() => {
    const porPersona = new Map<string, Evento>();
    for (const e of eventos) {
      if (e.accion !== 'LOGIN_SUCCESS' || !e.correo) continue;
      if (!porPersona.has(e.correo)) porPersona.set(e.correo, e);
    }
    return [...porPersona.values()].sort((a, b) => (a.cuando < b.cuando ? 1 : -1));
  }, [eventos]);

  /**
   * "hace 2 h". Solo después de montar: `ahora` nace en 0 y se llena en un
   * efecto, porque calcular la hora durante el render haría que el servidor y
   * el navegador escriban números distintos en el mismo lugar.
   */
  const desdeHace = (cuando: string): string | null => {
    if (!ahora) return null;
    const min = Math.round((ahora - new Date(cuando).getTime()) / 60_000);
    if (min < 1) return tr('agoNow');
    return min < 60 ? tr('agoMin', { n: min }) : tr('agoHour', { n: Math.round(min / 60) });
  };

  return (
    <section>
      <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
        {tr('whoTitle', { n: ultimos.length })}
        <span className="normal-case tracking-normal font-medium text-text-3">· {tr('whoHint')}</span>
      </h2>
      <div className="overflow-x-auto rounded-lg bg-bg-1">
        <table className="w-full min-w-[640px] text-small">
          <thead>
            <tr className="border-b border-row-sep">
              {['whoCol', 'whoWhen', 'whoModule', 'whoWhere', 'whoIp'].map((k) => (
                <th key={k} className="px-4 py-3 text-left text-tiny font-bold uppercase tracking-wider text-text-muted">
                  {tr(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ultimos.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-5 text-small text-text-3">{tr('whoEmpty')}</td></tr>
            )}
            {ultimos.map((e) => {
              const donde = [e.ciudad, e.pais].filter(Boolean).join(', ');
              const hace = desdeHace(e.cuando);
              return (
                <tr key={e.correo} className="border-b border-row-sep last:border-0">
                  <td className="px-4 py-2.5 text-text-1">{e.correo}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-tiny text-text-3">
                    {hora(e.cuando, idioma)}
                    {hace && <span className="ml-1.5 text-text-muted">· {hace}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-tiny text-text-2">{e.modulo ?? '—'}</td>
                  {/* Sin ubicación no se inventa nada: se dice que no se sabe. */}
                  <td className={cn('px-4 py-2.5 text-tiny', donde ? 'text-text-2' : 'text-text-3')}>
                    {donde || tr('locationUnknown')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-tiny text-text-3">{e.ip ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Cortarle el acceso a una cuenta, ya.
 *
 * ── Por qué un selector y no un botón por fila ────────────────────────────
 *
 * Porque suspender es una acción de incidente: la cuenta comprometida puede ser
 * cualquiera de las 30, no solo una de las que aparecen en las listas de
 * arriba. Esas listas muestran a quién le pasó algo; acá se actúa sobre quien
 * haga falta.
 *
 * ── Qué hace, dicho sin adornos ───────────────────────────────────────────
 *
 * Bloquea el ingreso Y tumba la sesión que esa persona tenga abierta ahora
 * mismo. El corte es inmediato porque el middleware le pregunta a Supabase en
 * cada pedido: en el siguiente ya está afuera.
 *
 * Es reversible desde el mismo lugar — comprobado el 2026-10-06 contra una
 * cuenta sin uso: se bloquea y se desbloquea sin dejar rastro.
 */
function CortarAcceso({ cuentas, onCambio }: {
  cuentas: CuentaBreve[]; onCambio: () => void;
}): React.ReactElement {
  const tr = useTranslations('security');
  const [elegida, setElegida] = React.useState('');
  const [estado, setEstado] = React.useState<'listo' | 'yendo' | 'error' | 'yo'>('listo');

  /*
   * El enlace de contraseña NO se arma acá: lo hace `users.sendPasswordReset`,
   * que ya existe, ya es `superAdminProcedure`, y ya distingue primer acceso
   * de reseteo. Esta pantalla solo lo pone donde se ve el problema.
   */
  const reset = trpc.users.sendPasswordReset.useMutation();

  const cuenta = cuentas.find((c) => c.id === elegida) ?? null;
  const suspendida = cuenta?.estado === 'SUSPENDED';

  const actuar = async (): Promise<void> => {
    if (!cuenta) return;
    setEstado('yendo');
    try {
      const r = await fetch(`/api/users/${cuenta.id}/suspender`, {
        method: suspendida ? 'DELETE' : 'POST',
      });
      // 400 = es tu propia cuenta; lo dice la ruta y lo explica la pantalla.
      if (r.status === 400) { setEstado('yo'); return; }
      if (!r.ok) throw new Error(String(r.status));
      setEstado('listo');
      onCambio();
    } catch {
      setEstado('error');
    }
  };

  return (
    <section>
      <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">
        {tr('cutTitle')}
      </h2>
      <div className="rounded-lg bg-bg-1 p-4">
        <p className="mb-3 text-tiny leading-relaxed text-text-3">{tr('cutHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={elegida}
            onChange={(e) => { setElegida(e.target.value); setEstado('listo'); reset.reset(); }}
            aria-label={tr('cutPick')}
            className="min-w-0 flex-1 rounded-lg border border-row-sep bg-bg-1 px-2.5 py-1.5 text-small text-text-1"
          >
            <option value="">{tr('cutPick')}</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.correo}
                {c.estado === 'SUSPENDED' ? ' · ' + tr('cutSuspended') : ''}
                {c.esAdmin ? ' · ' + tr('mfaAdmin') : ''}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={!cuenta || estado === 'yendo'}
            onClick={() => { void actuar(); }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-tiny transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              suspendida
                ? 'border-emerald/40 bg-emerald/10 text-emerald hover:bg-emerald/20'
                : 'border-rose/40 bg-rose/10 text-rose hover:bg-rose/20',
            )}
          >
            {suspendida ? <Unlock className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
            {estado === 'yendo' ? tr('cutGoing')
              : estado === 'error' ? tr('mfaFailed')
              : suspendida ? tr('cutRestore') : tr('cutNow')}
          </button>

          <button
            type="button"
            disabled={!cuenta || reset.isPending}
            onClick={() => { if (cuenta) reset.mutate({ id: cuenta.id }); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-row-sep px-3 py-1.5 text-tiny text-text-3 transition-colors hover:bg-surface hover:text-text-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Mail className="h-3 w-3" />
            {reset.isPending ? tr('pwGoing')
              : reset.isError ? tr('mfaFailed')
              : reset.isSuccess ? tr('pwSent')
              : tr('pwSend')}
          </button>
        </div>

        {estado === 'yo' && (
          <p className="mt-2.5 text-tiny text-rose">{tr('cutNotYourself')}</p>
        )}
        {cuenta && !suspendida && estado !== 'yo' && (
          <p className="mt-2.5 text-tiny leading-relaxed text-text-3">
            {cuenta.esAdmin ? tr('cutWarnAdmin') : tr('cutWarn')}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * El doble factor: quiénes lo tienen y cómo rescatarlos.
 *
 * ── Por qué esta sección existe aunque esté vacía ──────────────────────────
 *
 * Hoy la lista tiene cero personas (medido el 2026-10-06: 0 de 30, los 3
 * administradores incluidos). Una sección vacía igual dice algo que importa:
 * que la red de rescate ya está puesta, y que por eso ahora SÍ se le puede
 * pedir a alguien que lo active.
 *
 * Antes de esto, cada persona que activaba el doble factor era un bloqueo
 * permanente esperando: el único botón para quitarlo exigía estar adentro.
 */
function DobleFactor({ lista, total, onCambio }: {
  lista: ConFactor[]; total: number; onCambio: () => void;
}): React.ReactElement {
  const tr = useTranslations('security');
  return (
    <section>
      <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">
        {tr('mfaTitle', { n: lista.length, total })}
      </h2>
      <div className="rounded-lg bg-bg-1 px-4 py-1">
        {lista.length === 0 && (
          <p className="py-4 text-small leading-relaxed text-text-3">{tr('mfaNone')}</p>
        )}
        {lista.map((c) => <FilaFactor key={c.id} c={c} onCambio={onCambio} />)}
      </div>
    </section>
  );
}

function FilaFactor({ c, onCambio }: { c: ConFactor; onCambio: () => void }): React.ReactElement {
  const tr = useTranslations('security');
  const [confirmando, setConfirmando] = React.useState(false);
  const [estado, setEstado] = React.useState<'listo' | 'yendo' | 'error'>('listo');

  const quitar = async (): Promise<void> => {
    setEstado('yendo');
    try {
      const r = await fetch(`/api/users/${c.id}/mfa`, { method: 'DELETE' });
      if (!r.ok) throw new Error(String(r.status));
      setConfirmando(false);
      setEstado('listo');
      onCambio();
    } catch {
      setEstado('error');
    }
  };

  return (
    <div className="border-b border-row-sep py-2.5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-small text-text-1">
          <KeyRound className="h-3.5 w-3.5 shrink-0 text-emerald" />
          {c.correo}
          {c.esAdmin && (
            <span className="rounded bg-amber/15 px-1.5 text-tiny text-amber">{tr('mfaAdmin')}</span>
          )}
        </span>
        {!confirmando && (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            title={tr('mfaRemoveTitle')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-row-sep px-2.5 py-1 text-tiny text-text-3 transition-colors hover:border-rose/40 hover:text-rose"
          >
            {tr('mfaRemove')}
          </button>
        )}
      </div>

      {/*
        * Pide confirmar porque es lo contrario de las otras acciones de esta
        * pantalla: todas suben la seguridad y esta la BAJA. Y además tira
        * todas las sesiones de esa persona, que conviene decirlo antes y no
        * después.
        */}
      {confirmando && (
        <div className="mt-2 rounded-lg border border-rose/30 bg-rose/5 p-3">
          <p className="text-tiny leading-relaxed text-text-2">
            {c.esAdmin ? tr('mfaConfirmAdmin') : tr('mfaConfirm')}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={estado === 'yendo'}
              onClick={() => { void quitar(); }}
              className="rounded border border-rose/40 bg-rose/10 px-2.5 py-1 text-tiny text-rose transition-colors hover:bg-rose/20 disabled:opacity-50"
            >
              {estado === 'yendo' ? tr('mfaRemoving') : estado === 'error' ? tr('mfaFailed') : tr('mfaRemoveConfirm')}
            </button>
            <button
              type="button"
              onClick={() => { setConfirmando(false); setEstado('listo'); }}
              className="rounded px-2 py-1 text-tiny text-text-3 transition-colors hover:text-text-1"
            >
              {tr('blockCancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Riesgo({ titulo, detalle, v, malo, aviso }: {
  titulo: string; detalle: string; v: number | string; malo?: boolean; aviso?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-row-sep py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-small text-text-1">{titulo}</div>
        <div className="mt-0.5 text-tiny text-text-3">{detalle}</div>
      </div>
      <div className={cn('font-mono text-base font-bold tabular-nums', malo ? 'text-rose' : aviso ? 'text-amber' : 'text-emerald')}>{v}</div>
    </div>
  );
}
