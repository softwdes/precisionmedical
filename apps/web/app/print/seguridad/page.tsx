import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createServerClient, createAdminClient } from '@precision-medical/auth/server';
import { PrintButton } from '@/components/print-button';
import { leerSeguridad, mesCerrado, ultimosDias } from '@/app/(admin)/dashboard/seguridad/datos';
import { MODULOS, PROTECCIONES, MEDIDO_EL } from '@/app/(admin)/dashboard/seguridad/modelo';

/**
 * El reporte de seguridad, para imprimir o mandar en PDF.
 *
 * ── Por qué una página y no una librería de PDF ───────────────────────────
 *
 * Porque es como imprime todo este proyecto: la nota de la visita, la orden de
 * laboratorio, el acuerdo de cobranza. El navegador hace el PDF con Ctrl+P y no
 * entra ninguna dependencia nueva. Probado: no hay ninguna librería de PDF en
 * el repo, y agregar una por esto sería la primera.
 *
 * ── Para qué sirve de verdad ──────────────────────────────────────────────
 *
 * Erick pidió poder MANDAR el reporte del mes. El lector no es él: es un
 * auditor, una aseguradora, o el abogado de la clínica. Por eso el documento
 * dice el período en el encabezado, la fecha en que se generó, y al pie qué
 * está medido y desde cuándo — un número de seguridad sin su fecha de
 * medición no se puede auditar.
 *
 * ── Por qué vive fuera de /dashboard ──────────────────────────────────────
 *
 * Porque dentro del grupo `(admin)` hereda la barra lateral y la barra
 * superior, y eso SALE EN EL PAPEL. Se vio imprimiendo: el menú entero
 * ocupando la primera hoja. Los impresos del back-office viven en `/print/`
 * por exactamente esta razón; este sigue esa convención.
 *
 * ── Mismo guardia que la pantalla ─────────────────────────────────────────
 *
 * `SUPER_ADMIN` y nada más. Esta vista es la de seguridad en una sola hoja, o
 * sea el plan de ataque más cómodo del sistema; que sea imprimible no la hace
 * menos sensible.
 */

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const mes = (await searchParams).mes;
  // `absolute` se salta el template del layout: este título es el nombre con el
  // que el navegador guarda el PDF, no una pestaña.
  return { title: { absolute: `Security Center · ${typeof mes === 'string' ? mes : 'report'}` } };
}

const ZONA = 'America/Denver';

export default async function ImprimirSeguridad({ searchParams }: Props): Promise<React.ReactElement> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const { data: quien } = await createAdminClient()
    .from('users').select('role').eq('email', user.email).single();
  if (quien?.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const params = await searchParams;
  const mes = typeof params.mes === 'string' ? params.mes : null;
  const rango = mes ? mesCerrado(mes) : null;
  const dias = Number(params.dias) === 7 ? 7 : Number(params.dias) === 1 ? 1 : 2;

  const datos = await leerSeguridad(rango ?? ultimosDias(dias));
  const tr = await getTranslations('security');
  const idioma = await getLocale();

  const fecha = (iso: string): string =>
    new Intl.DateTimeFormat(idioma, {
      timeZone: ZONA, day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));

  const periodo = mes
    ? new Intl.DateTimeFormat(idioma, { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${mes}-01T00:00:00Z`))
    : tr(dias === 1 ? 'win24' : dias === 2 ? 'win48' : 'win7');

  const exitosos = datos.eventos.filter((e) => e.accion === 'LOGIN_SUCCESS').length;
  const fallidos = datos.eventos.filter((e) => e.accion === 'LOGIN_FAILED').length;
  const trabados = datos.eventos.filter((e) => e.accion === 'ACCOUNT_LOCKED').length;
  const soloFallos = datos.porIp.filter((x) => x.fallidos > 0 && x.exitosos === 0);

  const marca = (e: boolean | 'parcial' | undefined): string =>
    e === true ? '✓' : e === 'parcial' ? '○' : '✕';

  return (
    <>
      {/*
        * El estilo va inline y en claro: esta página se imprime en papel, donde
        * el tema oscuro del Admin gasta tinta y se lee peor. `@page` fija el
        * margen, y `.no-print` apaga el botón al imprimir.
        */}
      <style>{`
        @page { margin: 16mm; }
        .hoja { background:#fff; color:#0f172a; font-size:12px; line-height:1.55; padding:28px 32px; }
        .hoja h1 { font-size:20px; margin:0 0 2px; }
        .hoja h2 { font-size:12px; text-transform:uppercase; letter-spacing:.08em;
                   color:#64748b; margin:22px 0 8px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; }
        .hoja table { width:100%; border-collapse:collapse; }
        .hoja th, .hoja td { text-align:left; padding:5px 6px; border-bottom:1px solid #eef2f7; vertical-align:top; }
        .hoja th { color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
        .hoja .num { font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap; }
        .hoja .mono { font-family:ui-monospace,Menlo,Consolas,monospace; }
        .hoja .cifras { display:flex; flex-wrap:wrap; gap:18px; margin-top:8px; }
        .hoja .cifra b { display:block; font-size:22px; line-height:1.1; }
        .hoja .cifra span { color:#64748b; font-size:10.5px; }
        .hoja .pie { margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0;
                     color:#64748b; font-size:10.5px; line-height:1.6; }
        /* Que una tabla no se parta justo en el encabezado. */
        .hoja section { break-inside:avoid; }
        @media print { .no-print { display:none !important; } }
      `}</style>

      <PrintButton label={tr('printButton')} />

      <div className="hoja">
        <h1>{tr('title')} · Precision Medical</h1>
        <p style={{ margin: '0 0 2px', color: '#475569' }}>{periodo}</p>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: 10.5 }}>
          {tr('printGenerated', { cuando: fecha(new Date().toISOString()), quien: user.email })}
        </p>

        {!datos.ok && (
          <p style={{ marginTop: 14, color: '#b91c1c' }}>{tr('errRead')}</p>
        )}

        <section>
          <h2>{periodo}</h2>
          <div className="cifras">
            <div className="cifra"><b>{datos.eventos.length}</b><span>{tr('statAttempts')}</span></div>
            <div className="cifra"><b>{exitosos}</b><span>{tr('statSignedIn')}</span></div>
            <div className="cifra"><b>{fallidos}</b><span>{tr('statWrong')}</span></div>
            <div className="cifra"><b>{datos.porIp.length}</b><span>{tr('statIps')}</span></div>
            <div className="cifra"><b>{soloFallos.length}</b><span>{tr('statIpsBad')}</span></div>
            <div className="cifra"><b>{trabados}</b><span>{tr('statLocked')}</span></div>
          </div>
        </section>

        <section>
          <h2>{tr('matrixTitle')} · {tr('codeChecked', { fecha: MEDIDO_EL })}</h2>
          <table>
            <thead>
              <tr>
                <th>{tr('colProtection')}</th>
                {MODULOS.map((m) => <th key={m.id} style={{ textAlign: 'center' }}>{m.nombre}</th>)}
              </tr>
            </thead>
            <tbody>
              {PROTECCIONES.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div>{tr(`prot.${p.id}.nombre`)}</div>
                    <div style={{ color: '#94a3b8', fontSize: 10.5 }}>{tr(`prot.${p.id}.detalle`)}</div>
                  </td>
                  {MODULOS.map((m) => (
                    <td key={m.id} style={{ textAlign: 'center' }}>{marca(p.estado[m.id])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>{tr('ipsTitle')}</h2>
          {datos.porIp.length === 0 ? <p>{tr('noIps')}</p> : (
            <table>
              <thead>
                <tr>
                  <th>IP</th><th>{tr('colWhere')}</th><th>{tr('colModule')}</th>
                  <th className="num">{tr('colOk')}</th><th className="num">{tr('colFailed')}</th>
                  <th>{tr('colLast')}</th>
                </tr>
              </thead>
              <tbody>
                {datos.porIp.map((x) => (
                  <tr key={x.ip}>
                    <td className="mono">{x.ip}</td>
                    <td>{[x.ciudad, x.pais].filter(Boolean).join(', ') || tr('locationUnknown')}</td>
                    <td>{x.modulos.join(', ') || '—'}</td>
                    <td className="num">{x.exitosos}</td>
                    <td className="num">{x.fallidos}</td>
                    <td>{fecha(x.ultimo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2>{tr('blockedTitle', { n: datos.bloqueadas.length })}</h2>
          {datos.bloqueadas.length === 0 ? <p>{tr('blockedNone')}</p> : (
            <table>
              <thead>
                <tr><th>IP</th><th>{tr('colWhere')}</th><th>{tr('colReason')}</th><th>{tr('colUntil')}</th></tr>
              </thead>
              <tbody>
                {datos.bloqueadas.map((b) => (
                  <tr key={b.ip}>
                    <td className="mono">{b.ip}</td>
                    <td>{[b.ciudad, b.pais].filter(Boolean).join(', ') || tr('locationUnknown')}</td>
                    <td>{b.motivo || tr('blockedNoReason')}</td>
                    <td>{b.hasta ? fecha(b.hasta) : tr('blockedForever')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2>{tr('accountsTitle', { n: datos.cuentas.total })}</h2>
          <table>
            <tbody>
              <tr><td>{tr('riskMfa')}</td><td className="num">{datos.cuentas.sinMfa} / {datos.cuentas.total}</td></tr>
              <tr><td>{tr('riskPending')}</td><td className="num">{datos.cuentas.pendientesQueEntran}</td></tr>
              <tr><td>{tr('riskNever')}</td><td className="num">{datos.cuentas.nuncaEntraron}</td></tr>
              <tr><td>{tr('riskLocked')}</td><td className="num">{datos.cuentas.trabadasAhora}</td></tr>
            </tbody>
          </table>
        </section>

        <p className="pie">{tr('printNote', { desde: fecha(datos.desde), hasta: fecha(datos.hasta) })}</p>
      </div>
    </>
  );
}
