'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Badge, cn } from '@precision/ui';
import { Clock, RefreshCw, ShieldAlert, ShieldCheck, Unlock } from 'lucide-react';
import {
  MEDIDO_EL, MODULOS, PROTECCIONES,
  type Cuentas, type DatosSeguridad, type Evento, type PorIp,
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
 * ── Por qué en inglés y en duro ────────────────────────────────────────────
 *
 * Erick, 2026-10-03: las vistas de seguridad hablan inglés, igual que los
 * logins. No van por `messages/` — poner el mismo texto en los dos idiomas
 * sería trabajo sin resultado.
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

const hora = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));

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
          aria-label={`Overall exposure: ${valor} out of 100`}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center">
          <div className={cn('text-3xl font-bold tabular-nums leading-none', tono(valor))}>{n}</div>
        </div>
      </div>
      <div className="mt-1 text-center text-tiny uppercase tracking-widest text-text-muted">Overall exposure</div>
      <div className="mt-1 text-center text-tiny text-text-3">
        {MODULOS.length} modules × {PROTECCIONES.length} protections
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
function Radar({ ips, quieto, desde }: {
  ips: PorIp[]; quieto: boolean; desde: string;
}): React.ReactElement {
  const t0 = new Date(desde).getTime();
  const t1 = Date.now();

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
        aria-label={`Radar of the ${ips.length} IPs seen in this window`}
      />
      <div className="min-w-0 self-center">
        <h2 className="text-tiny font-bold uppercase tracking-widest text-text-muted">Where sign-ins come from</h2>
        <div className="mt-2.5 space-y-1.5 text-small text-text-2">
          <Clave color={C.cian}  texto={`${limpias} IP${limpias === 1 ? '' : 's'} with no failures`} />
          <Clave color={C.aviso} texto={`${mixtas} that failed and then got in`} />
          <Clave color={C.mal}   texto={`${sucias} that only ever failed`} />
        </div>
        <p className="mt-3 text-tiny leading-relaxed text-text-3">
          Closer to the center means more recent. Dot size is the number of attempts.
        </p>
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

/** En qué cubo de la ventana cae un evento. */
function cubo(cuando: string, desde: string, n: number): number {
  const t0 = new Date(desde).getTime();
  const paso = Math.max(1, (Date.now() - t0) / n);
  const i = Math.floor((new Date(cuando).getTime() - t0) / paso);
  return Math.min(n - 1, Math.max(0, i));
}

/** Reparte los eventos en `n` cubos a lo largo de la ventana. */
function serieDe(eventos: Evento[], desde: string, n = 14): number[] {
  const cubos = new Array<number>(n).fill(0);
  for (const e of eventos) cubos[cubo(e.cuando, desde, n)]++;
  return cubos;
}

/**
 * Cuántas direcciones DISTINTAS se vieron en cada tramo.
 *
 * No es lo mismo que el conteo de intentos, y dibujar la misma línea en las dos
 * cifras era decir que sí lo es. Una pantalla de seguridad que repite un gráfico
 * en dos lugares distintos enseña a no mirarlos.
 */
function serieIps(eventos: Evento[], desde: string, n = 14): number[] {
  const vistas = Array.from({ length: n }, () => new Set<string>());
  for (const e of eventos) if (e.ip) vistas[cubo(e.cuando, desde, n)]!.add(e.ip);
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
            title={`${p.nombre} — ${e === true ? 'covered' : e === 'parcial' ? 'built in, unused' : 'open'}`}
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

const ETIQUETA: Record<string, string> = {
  LOGIN_SUCCESS: 'Signed in', LOGIN_FAILED: 'Wrong password',
  ACCOUNT_LOCKED: 'Account locked', ACCOUNT_UNLOCKED: 'Manual unlock',
};
const COLOR: Record<string, string> = {
  LOGIN_SUCCESS: 'text-emerald', LOGIN_FAILED: 'text-rose',
  ACCOUNT_LOCKED: 'text-rose', ACCOUNT_UNLOCKED: 'text-brand-text',
};

const VENTANAS: Array<{ dias: number; texto: string }> = [
  { dias: 1, texto: '24 h' },
  { dias: 2, texto: '48 h' },
  { dias: 7, texto: '7 days' },
];

export function SeguridadClient({ datos, dias }: {
  datos: DatosSeguridad; dias: number;
}): React.ReactElement {
  const { cuentas, desde, ok } = datos;
  const quieto = useQuieto();
  const router = useRouter();
  const ruta = usePathname();

  const [modulo, setModulo] = React.useState<string | null>(null);
  const [ip, setIp] = React.useState<string | null>(null);

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

  return (
    <div className="space-y-7">
      {/* ── La cabecera ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-1">Security Center</h1>
          <p className="mt-1 text-small text-text-2">
            All five modules — what protects them, and who is trying to get in.
          </p>
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
            {pendiente ? 'READING…' : `LIVE · ${segundos ?? 0}s`}
          </span>

          <div className="inline-flex overflow-hidden rounded-lg border border-row-sep">
            {VENTANAS.map((v) => (
              <button
                key={v.dias}
                type="button"
                onClick={() => cambiarVentana(v.dias)}
                className={cn(
                  'px-3 py-1 text-tiny transition-colors',
                  v.dias === dias ? 'bg-brand text-white' : 'text-text-3 hover:bg-bg-1 hover:text-text-1',
                )}
              >
                {v.texto}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={refrescar}
            title="Read it again now"
            className="inline-flex items-center gap-1.5 rounded-lg border border-row-sep px-3 py-1 text-tiny text-text-3 transition-colors hover:bg-bg-1 hover:text-text-1"
          >
            <RefreshCw className={cn('h-3 w-3', pendiente && !quieto && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {!ok && (
        <div className="rounded-lg border border-rose/30 bg-rose/10 px-4 py-3 text-small text-rose">
          Could not read the security log. The figures below are not zero — they are unknown.
        </div>
      )}

      {/* ── El medidor y el radar ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,300px)_1fr]">
        <Medidor key={exposicionGeneral()} valor={exposicionGeneral()} quieto={quieto} />
        <Radar ips={porIp} quieto={quieto} desde={desde} />
      </div>

      {/* ── Las cifras ────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
          Last {dias === 1 ? '24 hours' : dias === 2 ? '48 hours' : '7 days'}
          {filtrado && (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 normal-case tracking-normal text-brand-text">
              {[modulo && MODULOS.find((m) => m.id === modulo)?.nombre, ip].filter(Boolean).join(' · ')}
            </span>
          )}
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Cifra n={eventos.length} l="sign-in attempts" col={C.cian} quieto={quieto}
                 serie={serieDe(eventos, desde)} />
          <Cifra n={exitosos} l="signed in" t="text-emerald" col={C.ok} quieto={quieto}
                 serie={serieDe(eventos.filter((e) => e.accion === 'LOGIN_SUCCESS'), desde)} />
          <Cifra n={fallidos} l="wrong password" t={fallidos ? 'text-rose' : undefined} col={C.mal} quieto={quieto}
                 serie={serieDe(eventos.filter((e) => e.accion === 'LOGIN_FAILED'), desde)} />
          <Cifra n={porIp.length} l="distinct IPs" col={C.cian} quieto={quieto}
                 serie={serieIps(eventos, desde)} />
          <Cifra n={sospechosas.length} l="IPs that only failed"
                 t={sospechosas.length ? 'text-rose' : 'text-emerald'} col={C.mal} quieto={quieto}
                 serie={serieIps(eventos.filter((e) => e.accion === 'LOGIN_FAILED'), desde)} />
          <Cifra n={cuentas.trabadasAhora} l="accounts locked now"
                 t={cuentas.trabadasAhora ? 'text-amber' : 'text-emerald'} col={C.aviso} quieto={quieto}
                 serie={serieDe(eventos.filter((e) => e.accion === 'ACCOUNT_LOCKED'), desde)} />
        </div>
      </section>

      {/* ── Por módulo: acá se filtra todo ────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
          By module
          <span className="normal-case tracking-normal font-medium text-text-3">
            · pick one to filter everything below
          </span>
          {modulo && (
            <button
              type="button"
              onClick={() => setModulo(null)}
              className="rounded-full border border-row-sep px-2 py-0.5 normal-case tracking-normal font-medium text-text-3 transition-colors hover:text-text-1"
            >
              show all five
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
                  <span className="text-tiny text-text-3">of {p.total} · exposure {p.exposicion}</span>
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
                    ? <>{vistos} attempt{vistos === 1 ? '' : 's'}{malos > 0 && <span className="text-rose"> · {malos} failed</span>}</>
                    : 'no attempts in this window'}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── La matriz ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
          What protects each module
          <span className="inline-flex items-center gap-1 normal-case tracking-normal font-medium text-text-3">
            <Clock className="h-3 w-3" /> code checked {MEDIDO_EL}
          </span>
        </h2>
        <div className="overflow-x-auto rounded-lg bg-bg-1">
          <table className="w-full min-w-[640px] text-small">
            <thead>
              <tr className="border-b border-row-sep">
                <th className="px-4 py-3 text-left text-tiny font-bold uppercase tracking-wider text-text-muted">Protection</th>
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
                    <div className="text-text-1">{p.nombre}</div>
                    <div className="mt-0.5 text-tiny text-text-3">{p.detalle}</div>
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

      {/* ── IPs y eventos ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="min-w-0">
          <h2 className="mb-3 flex flex-wrap items-center gap-2 text-tiny font-bold uppercase tracking-widest text-text-muted">
            Where they come from
            {ip && (
              <button
                type="button"
                onClick={() => setIp(null)}
                className="rounded-full border border-row-sep px-2 py-0.5 normal-case tracking-normal font-medium text-text-3 transition-colors hover:text-text-1"
              >
                clear {ip}
              </button>
            )}
          </h2>
          <div className="rounded-lg bg-bg-1 px-4 py-1">
            {porIp.length === 0 && <p className="py-4 text-small text-text-3">No sign-in attempts in this window.</p>}
            {porIp.map((x) => (
              <FilaIp
                key={x.ip}
                x={x}
                quieto={quieto}
                activa={ip === x.ip}
                onClick={() => setIp(ip === x.ip ? null : x.ip)}
              />
            ))}
          </div>
        </section>

        <section className="min-w-0">
          <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">What happened</h2>
          <div className="rounded-lg bg-bg-1 px-4 py-1">
            {eventos.length === 0 && <p className="py-4 text-small text-text-3">Nothing recorded in this window.</p>}
            {eventos.slice(0, 16).map((e, i) => <FilaEvento key={i} e={e} />)}
            {eventos.length > 16 && (
              <p className="py-2.5 text-tiny text-text-3">
                and {eventos.length - 16} more in this window
              </p>
            )}
          </div>
        </section>
      </div>

      {/* ── Cuentas ───────────────────────────────────────────────────── */}
      <Riesgos cuentas={cuentas} onCambio={refrescar} />

      <p className="border-t border-row-sep pt-4 text-tiny leading-relaxed text-text-3">
        <b className="text-text-2">Reads itself every 45 seconds</b> while this tab is open, straight from the
        Admin project — the same place the lockout writes to.{' '}
        <b className="text-text-2">Still missing:</b> a blocked-IP list. Today a bad IP gets throttled, not banned.
      </p>
    </div>
  );
}

/* ───────────────────────────── las piezas ──────────────────────────────── */

function Cifra({ n, l, t, col, serie, quieto }: {
  n: number; l: string; t?: string; col: string; serie: number[]; quieto: boolean;
}): React.ReactElement {
  const v = useConteo(n, quieto);
  return (
    <div className="min-w-0 rounded-lg bg-bg-1 p-4">
      <div className={cn('text-2xl font-bold tabular-nums leading-none', t ?? 'text-text-1')}>{v}</div>
      <div className="mt-1.5 text-tiny text-text-3">{l}</div>
      <Chispa serie={serie} col={col} />
    </div>
  );
}

function Marca({ estado }: { estado: boolean | 'parcial' | undefined }): React.ReactElement {
  if (estado === true)      return <span className="inline-block rounded px-1.5 py-0.5 text-tiny font-bold bg-emerald/15 text-emerald">✓</span>;
  if (estado === 'parcial') return <span className="inline-block rounded px-1.5 py-0.5 text-tiny font-bold bg-amber/15 text-amber" title="Built in, but nobody uses it">○</span>;
  return <span className="inline-block rounded px-1.5 py-0.5 text-tiny font-bold bg-rose/15 text-rose">✕</span>;
}

function FilaIp({ x, quieto, activa, onClick }: {
  x: PorIp; quieto: boolean; activa: boolean; onClick: () => void;
}): React.ReactElement {
  const soloFallos = x.fallidos > 0 && x.exitosos === 0;
  const donde = [x.ciudad, x.pais].filter(Boolean).join(', ');
  const total = Math.max(1, x.fallidos + x.exitosos);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'w-full border-b border-row-sep py-2.5 text-left transition-colors last:border-0',
        activa ? 'bg-brand/10' : 'hover:bg-surface/50',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 font-mono text-small tabular-nums text-text-1">
          {soloFallos
            ? <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose" />
            : <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald" />}
          {x.ip}
        </span>
        <span className="font-mono text-tiny tabular-nums text-text-3">
          {x.fallidos > 0 && <span className="text-rose">{x.fallidos} failed</span>}
          {x.fallidos > 0 && x.exitosos > 0 && ' · '}
          {x.exitosos > 0 && <span>{x.exitosos} ok</span>}
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

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-tiny text-text-3">
        <span>{hora(x.ultimo)}{x.modulos.length > 0 && ` · ${x.modulos.join(', ')}`}</span>
        {/* Sin ubicación no se inventa nada: se dice que no se sabe. */}
        <span className="font-mono">{donde || 'location unknown'}</span>
      </div>
    </button>
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
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-row-sep py-2 text-small last:border-0">
      <time className="font-mono text-tiny tabular-nums text-text-3">{hora(e.cuando)}</time>
      <span className={cn('font-semibold', COLOR[e.accion] ?? 'text-text-2')}>{ETIQUETA[e.accion] ?? e.accion}</span>
      {e.intentos !== null && e.accion === 'LOGIN_FAILED' && (
        <span className="text-tiny text-text-3">{e.intentos} of 3</span>
      )}
      <span className="min-w-0 flex-1 truncate text-tiny text-text-3">{e.correo ?? '—'}</span>
      {e.modulo && <span className="rounded bg-surface px-1.5 text-tiny text-text-3">{e.modulo}</span>}
      <span className="font-mono text-tiny text-text-3">{e.ip ?? '—'}</span>
    </div>
  );
}

function Riesgos({ cuentas, onCambio }: { cuentas: Cuentas; onCambio: () => void }): React.ReactElement {
  return (
    <section>
      <h2 className="mb-3 text-tiny font-bold uppercase tracking-widest text-text-muted">
        Accounts · all {cuentas.total}, across the five modules
      </h2>
      <div className="rounded-lg bg-bg-1 px-4 py-1">
        <Riesgo
          t="No two-factor"
          d={cuentas.adminsSinMfa > 0
            ? `Including ${cuentas.adminsSinMfa} administrator account${cuentas.adminsSinMfa > 1 ? 's' : ''}`
            : 'Every account has it'}
          v={`${cuentas.sinMfa} / ${cuentas.total}`} malo={cuentas.sinMfa > 0}
        />
        <Riesgo
          t="Pending verification, and can sign in anyway"
          d="Inactive and suspended accounts are blocked. Pending is not — it looks like a lock and holds nothing"
          v={cuentas.pendientesQueEntran} malo={cuentas.pendientesQueEntran > 0}
        />
        <Riesgo
          t="Never signed in"
          d="Created and unused. Each one is a live password nobody watches"
          v={cuentas.nuncaEntraron} aviso={cuentas.nuncaEntraron > 0}
        />
        <Riesgo
          t="Locked right now"
          d="They clear at midnight, or with the Unlock button below"
          v={cuentas.trabadasAhora} aviso={cuentas.trabadasAhora > 0}
        />
      </div>

      {cuentas.conIntentos.length > 0 && (
        <div className="mt-2.5 rounded-lg bg-bg-1 px-4 py-3">
          <div className="mb-2 text-tiny font-bold uppercase tracking-wider text-text-muted">
            Accounts with failed attempts
          </div>
          {cuentas.conIntentos.map((c) => {
            const trabada = Boolean(c.hasta) && new Date(c.hasta as string).getTime() > Date.now();
            return (
              <div key={c.correo} className="flex flex-wrap items-center justify-between gap-2 border-b border-row-sep py-2 last:border-0">
                <span className="text-small text-text-1">{c.correo}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-small tabular-nums text-text-2">{c.intentos} of 3</span>
                  {trabada && <Badge variant="destructive">locked until {hora(c.hasta as string)}</Badge>}
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
      title={activo ? 'Clear the lock and the failed attempts' : 'Nothing to clear on this account'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-tiny transition-colors',
        estado === 'error' ? 'border-rose/40 text-rose'
          : estado === 'hecho' ? 'border-emerald/40 text-emerald'
          : 'border-row-sep text-text-3 hover:bg-surface hover:text-text-1',
        !activo && 'cursor-not-allowed opacity-40',
      )}
    >
      <Unlock className="h-3 w-3" />
      {estado === 'yendo' ? 'Unlocking…' : estado === 'hecho' ? 'Unlocked' : estado === 'error' ? 'Failed' : 'Unlock'}
    </button>
  );
}

function Riesgo({ t, d, v, malo, aviso }: {
  t: string; d: string; v: number | string; malo?: boolean; aviso?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-row-sep py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-small text-text-1">{t}</div>
        <div className="mt-0.5 text-tiny text-text-3">{d}</div>
      </div>
      <div className={cn('font-mono text-base font-bold tabular-nums', malo ? 'text-rose' : aviso ? 'text-amber' : 'text-emerald')}>{v}</div>
    </div>
  );
}
