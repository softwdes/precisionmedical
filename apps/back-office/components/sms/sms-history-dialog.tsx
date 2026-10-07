'use client';

/**
 * Historial de SMS enviados.
 *
 * Hermano del historial de llamadas, con una diferencia clave: acá la columna
 * que importa es el ESTADO DE ENTREGA. Un SMS "enviado" no es un SMS recibido —
 * Twilio responde `queued` y el operador confirma (o rechaza) minutos después.
 * Sin esa columna, "no le llegó el link al paciente" no se puede diagnosticar.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@precision/ui';
import { ChevronLeft, ChevronRight, Mail, MessageSquare, RefreshCw, MessageSquareOff, SlidersHorizontal, Search, CornerUpLeft, Settings, ArrowLeft, PenSquare } from 'lucide-react';
import { EmptyState, FilterPill, PersonAvatar, StatusPill, TableFooter, Skeleton } from '@/components/ui-phoenix';
import { formatUsPhone } from '@/lib/phone';
import { PatientThreadDialog, type PacienteDelHilo } from './patient-thread-dialog';
import { SmsTemplatesEditor } from './sms-templates-editor';
import { ConversacionesPendientes } from './conversaciones-pendientes';
import { NuevoSmsDialog } from './nuevo-sms-dialog';

const CLINIC_TZ = 'America/Denver';
const PAGE_SIZE = 10;

type Status = 'QUEUED' | 'SENT' | 'DELIVERED' | 'UNDELIVERED' | 'FAILED';
type StatusFilter = 'all' | 'DELIVERED' | 'NOT_DELIVERED';
/**
 * Esta pantalla tenia CINCO grupos de filtros y quedaron TRES.
 *
 * Reagan, 2026-10-04: "I think it is confusing to have so many filters".
 * Se fueron los dos que no contestaban ninguna pregunta que la tabla no
 * contestara sola:
 *
 *  · QUIEN LO MANDO — la columna "Enviado por" ya lo dice en cada fila, y
 *    filtrar por eso era pedirle a la pantalla algo que ya estaba a la vista.
 *    Ademas traia un bug propio: quedaba pegado en "Mis mensajes" y las
 *    respuestas de los pacientes desaparecian.
 *  · EL TIEMPO — la lista va de hoy hacia atras y se pagina. Acotar a 7 dias
 *    no ayuda a encontrar nada que el orden no ponga arriba igual.
 *
 * Quedan los tres que SI pueden contradecir lo que se ve: direccion, canal y
 * entrega.
 */
type DirFilter = 'ALL' | 'IN' | 'OUT';
type Channel = 'SMS' | 'EMAIL';
type ChannelFilter = Channel | 'ALL';

interface Row {
  id: string;
  status: Status;
  channel: Channel;
  toAddress: string;
  body: string;
  errorCode: number | null;
  errorMessage: string | null;
  createdAt: string;
  deliveredAt: string | null;
  patient: { id: string; patientCode: string | null; firstName: string; lastName: string; phone: string | null } | null;
  direction: 'INBOUND' | 'OUTBOUND';
  readAt: string | null;
  /** El numero del paciente, ya resuelto segun la direccion. Lo manda la API. */
  contraparte: string;
  fromAddress: string;
  patientMatchedByPhone: boolean;
  patientMatchCount: number;
  case: { id: string; caseCode: string } | null;
  sentByName: string | null;
  sentByMe: boolean;
}

interface Response {
  messages: Row[];
  total: number;
  totalPages: number;
  counts: { all: number; notDelivered: number; inbound: number; unread: number; pendientes: number };
}

function clinicDayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

/** Solo DELIVERED prueba que llegó; el resto es "todavía no" o "no llegó". */
function statusState(s: Status) {
  if (s === 'DELIVERED')                     return 'active' as const;
  if (s === 'UNDELIVERED' || s === 'FAILED') return 'danger' as const;
  return 'warning' as const;
}

/**
 * El historial de SMS, SIN envoltorio.
 *
 * Se monta en dos lugares y es el mismo componente, no dos copias: la seccion
 * `/sms` del menu y el dialogo que abre el boton de Pacientes. Dos pantallas
 * con el mismo contenido terminan desincronizadas — la de Pacientes ya lo
 * estuvo con el buscador de cargos.
 *
 * No trae titulo: lo pone quien lo monta, porque una seccion usa `PageHeader`
 * y un dialogo necesita `DialogTitle` para que el lector de pantalla lo anuncie.
 */
export function SmsHistoryPanel({ onTitulo }: {
  /** Avisa al contenedor si se esta editando plantillas, para el titulo. */
  onTitulo?: (editando: boolean) => void;
}) {
  const t      = useTranslations('phoenix.sms');
  const locale = useLocale();


  const [status, setStatus]     = useState<StatusFilter>('all');

  /**
   * Arranca en SMS, que es lo que esta pantalla mostró siempre. El correo
   * estaba en la misma tabla y el endpoint lo filtraba: cada envío del portal
   * por email dejaba su fila con su estado y su motivo de falla, y no había
   * dónde verla.
   */
  const [channel, setChannel]   = useState<ChannelFilter>('SMS');
  const [page, setPage]         = useState(0);
  const [data, setData]         = useState<Response | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(false);
  const [openBody, setOpenBody] = useState<string | null>(null);
  const [dir, setDir]           = useState<DirFilter>('ALL');
  /** Se incrementa para forzar una recarga cuando algo local quedo dudoso. */
  const [recargar, setRecargar] = useState(0);
  const router = useRouter();

  /**
   * Recargar los datos Y el badge del menu de la izquierda.
   *
   * Son dos cosas distintas: lo de esta pantalla se pide por `fetch`, pero el
   * numero rojo del menu lo calcula el SERVIDOR en el layout, asi que no se
   * entera de nada hasta que se navegue. Verificado en pantalla el 2026-10-03:
   * al descartar una conversacion la pestaña bajaba a 2 y el menu seguia
   * diciendo 3, uno al lado del otro.
   *
   * Va junto en una sola funcion porque los dos sitios que mueven ese numero
   * —descartar y responder— necesitan las dos mitades. Arreglar una sola deja
   * la otra mintiendo.
   */
  const refrescar = useCallback(() => {
    setRecargar((n) => n + 1);
    router.refresh();
  }, [router]);
  /** El paciente cuya conversacion se esta mirando. */
  const [hilo, setHilo] = useState<PacienteDelHilo | null>(null);
  /** El editor de plantillas reemplaza la lista DENTRO del mismo dialogo.
      Un tercer modal encima robaria el foco — ya paso con el buscador de cargos. */
  const [editando, setEditando] = useState(false);
  /** El buscador de "a quien le escribo". Solo ELIGE; no manda nada. */
  const [eligiendo, setEligiendo] = useState(false);
  /**
   * Arranca en `pendientes`, que ademas va PRIMERA (Erick, 2026-10-01).
   *
   * Es lo unico de esta pantalla que pide hacer algo; el resto es consulta.
   * Vacia no es un estado malo: dice "no hay nadie esperando", que es una
   * respuesta util y no un error.
   *
   * ⚠️ Antes el comentario decia esto y el codigo arrancaba en `todos`. El
   * comentario mentia, que es peor que no tenerlo.
   */
  const [vista, setVista] = useState<'todos' | 'pendientes'>('pendientes');
  /** Lo tecleado. `q` es lo que ya se consultó: separarlos es lo que permite el debounce. */
  const [texto, setTexto]       = useState('');
  const [q, setQ]               = useState('');

  /**
   * Abrir un entrante lo marca leido.
   *
   * Es la accion que YA hace la persona para enterarse, asi que no hace falta
   * un boton aparte: un "marcar como leido" separado se convierte en la cosa
   * que nadie aprieta, y el contador queda mintiendo para siempre.
   *
   * Se baja el contador en pantalla sin esperar la respuesta —el badge tiene
   * que reaccionar al clic— y si el PATCH falla se recarga, que devuelve la
   * verdad del servidor.
   */
  const abrirCuerpo = useCallback((r: Row) => {
    const cerrando = openBody === r.id;
    setOpenBody(cerrando ? null : r.id);
    if (cerrando || r.direction !== 'INBOUND' || r.readAt) return;

    setData(prev => prev && ({
      ...prev,
      messages: prev.messages.map(m => m.id === r.id ? { ...m, readAt: new Date().toISOString() } : m),
      counts: { ...prev.counts, unread: Math.max(0, prev.counts.unread - 1) },
    }));

    void fetch('/api/admin/message-logs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [r.id] }),
    }).catch(() => setRecargar(n => n + 1));
  }, [openBody]);

  const filtered = status !== 'all';

  /**
   * El buscador espera 300 ms. Sin esto cada tecla es una consulta con un LIKE
   * sobre cinco columnas, y el resultado que se pinta es el de la carrera que
   * gane, no el de lo último que escribieron.
   */
  useEffect(() => {
    const id = setTimeout(() => { setQ(texto.trim()); setPage(0); }, 300);
    return () => clearTimeout(id);
  }, [texto]);

  const load = useCallback(async (p: number, st: StatusFilter, ch: ChannelFilter, d: DirFilter, busca: string) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ page: String(p), size: String(PAGE_SIZE), channel: ch, direction: d });
      if (busca) params.set('q', busca);
      if (st !== 'all') params.set('status', st);
      const res = await fetch(`/api/admin/message-logs?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json() as Response);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(page, status, channel, dir, q);
  }, [open, page, status, channel, dir, q, recargar, load]);

  const rows       = data?.messages ?? [];
  const totalPages = data?.totalPages ?? 1;
  const counts     = data?.counts;

  const whenLabel = (iso: string) => {
    const d    = new Date(iso);
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: CLINIC_TZ });
    const day  = clinicDayKey(d);
    if (day === clinicDayKey(new Date()))                        return `${t('today')} ${time}`;
    if (day === clinicDayKey(new Date(Date.now() - 86_400_000))) return `${t('yesterday')} ${time}`;
    return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: CLINIC_TZ })} ${time}`;
  };

  /**
   * El CANAL cambia lo que significa "QUEUED".
   *
   * En un SMS es de verdad "en cola": Twilio lo aceptó y el acuse llega
   * minutos después, y llega — 421 de 486 salientes lo tienen.
   *
   * En un CORREO no. Ahí la Email API devuelve 202 "aceptado" y ese es el
   * final del camino: el acuse vendría del Event Webhook de SendGrid, que
   * nunca estuvo enchufado. Medido el 2026-10-07: **240 correos y CERO**
   * acuses, desde el 14 de septiembre.
   *
   * O sea que decir "En cola" en un correo es afirmar algo falso: no está
   * esperando salir, ya salió. Lo que no sabemos es si llegó. Eso hacía que
   * el mostrador leyera la pantalla como un sistema atascado, cuando el
   * problema real es que no tenemos noticias.
   *
   * El día que el webhook se conecte, estos correos empiezan a moverse a
   * Entregado o No llegó solos, y esta etiqueta deja de aparecer.
   */
  const statusLabel = (s: Status, canal: Channel) => {
    if (canal === 'EMAIL' && s === 'QUEUED') return t('statusEmailSentUnknown');
    switch (s) {
      case 'DELIVERED':   return t('statusDelivered');
      case 'UNDELIVERED': return t('statusUndelivered');
      case 'FAILED':      return t('statusFailed');
      case 'SENT':        return t('statusSent');
      case 'QUEUED':      return t('statusQueued');
    }
  };

  return (
    <>
      {/* Nuevo SMS + el engranaje. El TITULO lo pone quien monta este panel. */}
      <div className="flex items-center justify-end gap-2 px-4 sm:px-6 pt-3 shrink-0">
        {/* Fuera del editor de plantillas: ahi no hay a quien escribirle. */}
        {!editando && (
          <button
            type="button"
            onClick={() => setEligiendo(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand/15 text-brand-text text-[11px] font-medium hover:bg-brand/25 transition-colors"
          >
            <PenSquare className="w-3 h-3" />{t('newSms')}
          </button>
        )}
        <button
          type="button"
          onClick={() => { const v = !editando; setEditando(v); onTitulo?.(v); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-text-2 text-[11px] font-medium hover:border-brand hover:text-brand-text transition-colors"
        >
          {editando ? <><ArrowLeft className="w-3 h-3" />{t('tplBack')}</> : <><Settings className="w-3 h-3" />{t('tplOpen')}</>}
        </button>
      </div>

        {/* Las dos pestanas. Van ARRIBA de los filtros porque eligen QUE lista
            se mira; los filtros de abajo recortan la que ya se eligio. */}
        {!editando && (
          <div className="flex items-center gap-1.5 px-4 sm:px-6 pt-3 border-b border-border">
            {([['pendientes', t('tabActionable')], ['todos', t('tabAll')]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setVista(k)}
                className={`px-3 py-2 text-[12.5px] font-medium border-b-2 -mb-px transition-colors ${vista === k ? 'border-brand text-brand-text' : 'border-transparent text-text-2 hover:text-text-1'}`}
              >
                {l}
                {k === 'pendientes' && (counts?.pendientes ?? 0) > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose/15 text-rose text-[10px] font-semibold">
                    {counts?.pendientes}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Filtros — pills, no un formulario: son decisiones rápidas */}
        {!editando && vista === 'todos' && (
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-4 sm:px-6 pt-3 pb-1 shrink-0">
          {/* Entrantes. Va primero y con el contador de sin leer porque es lo
              unico de esta pantalla que pide una ACCION: lo demas es consulta. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('filterDirection')}</span>
            {([['ALL', t('dirAll'), undefined], ['IN', t('dirIn'), counts?.unread], ['OUT', t('dirOut'), undefined]] as [DirFilter, string, number | undefined][]).map(([k, l, n]) => (
              <FilterPill key={k} active={dir === k} onClick={() => { setDir(k); setPage(0); }} label={l} count={n || undefined} />
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('filterChannel')}</span>
            {([['SMS', t('channelSms')], ['EMAIL', t('channelEmail')], ['ALL', t('channelAll')]] as [ChannelFilter, string][]).map(([k, l]) => (
              <FilterPill key={k} active={channel === k} onClick={() => { setChannel(k); setPage(0); }} label={l} />
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('filterStatus')}</span>
            {([['all', t('filterAllStatus')], ['DELIVERED', t('statusDelivered')], ['NOT_DELIVERED', t('filterNotDelivered')]] as [StatusFilter, string][]).map(([k, l]) => (
              <FilterPill key={k} active={status === k} onClick={() => { setStatus(k); setPage(0); }} label={l} />
            ))}
          </div>

          {/* "And can we search the patient in all the messages?" — la clinica,
              2026-09-28. Busca por nombre, codigo y numero. */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-bg-2 border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>
        </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-2 pb-4">
          {editando ? (
            <SmsTemplatesEditor />
          ) : vista === 'pendientes' ? (
            <ConversacionesPendientes
              onAbrir={(p) => setHilo(p)}
              recargar={recargar}
              /* Descartar baja el numero de la pestaña. Sin esto el badge
                 seguiria diciendo 3 con la lista en 2, y un indicador que
                 miente se deja de mirar. */
              onCambio={refrescar}
            />
          ) : loading && !data ? (
            <SmsSkeleton />
          ) : error ? (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose flex items-center justify-between gap-3 flex-wrap">
              <span>{t('loadError')}</span>
              <button
                type="button"
                onClick={() => void load(page, status, channel, dir, q)}
                className="inline-flex items-center gap-1.5 font-semibold hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                {t('retry')}
              </button>
            </div>
          ) : rows.length === 0 ? (
            filtered
              ? <EmptyState.Rich icon={SlidersHorizontal} title={t('emptyFilteredTitle')} subtitle={t('emptyFilteredHint')} />
              : <EmptyState.Rich icon={MessageSquareOff} title={t('emptyTitle')} subtitle={t('emptyHint')} />
          ) : (
            <>
              {/* Desktop — la 1ra columna fija; el mensaje es lo que puede crecer */}
              <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                <div className={`overflow-x-auto transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}>
                  <table className="w-full text-sm min-w-[820px] table-fixed">
                    <thead>
                      <tr className="border-b border-row-sep bg-bg-2 text-text-muted text-[10px] uppercase tracking-wider">
                        <th className="sticky left-0 z-10 bg-bg-2 text-left px-4 py-2.5 font-semibold w-[230px]">{t('colTo')}</th>
                        <th className="text-left px-4 py-2.5 font-semibold w-[130px]">{t('colStatus')}</th>
                        <th className="text-left px-4 py-2.5 font-semibold w-[150px]">{t('colSentBy')}</th>
                        <th className="text-left px-4 py-2.5 font-semibold w-[130px]">{t('colWhen')}</th>
                        <th className="text-left px-4 py-2.5 font-semibold">{t('colMessage')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Un entrante SIN LEER se resalta. El fondo lo separa del resto
                          sin agregar una columna: la lista sigue siendo una. */}
                      {rows.map(r => (
                        <tr
                          key={r.id}
                          className={`border-b border-row-sep hover:bg-white/[0.02] transition-colors align-top ${r.direction === 'INBOUND' && !r.readAt ? 'bg-brand/[0.06]' : ''}`}
                        >
                          <td className="sticky left-0 z-10 bg-bg-0 px-4 py-2">
                            {/* El nombre abre la conversacion. Es el gesto que ya
                                intentan hacer: el nombre se lee como un link. */}
                            {r.patient ? (
                              <button
                                type="button"
                                onClick={() => setHilo({
                                  /**
                                   * Por PACIENTE solo cuando el mensaje esta de verdad
                                   * vinculado. Si el paciente se reconocio por el telefono,
                                   * la clave va por NUMERO.
                                   *
                                   * Verificado en pantalla el 2026-10-03: el hilo de
                                   * (801) 638-1400 abria con 2 mensajes y faltaba el "Ok"
                                   * del paciente, porque esa fila tiene `patientId` null y
                                   * la busqueda por `pac:` filtra justo por esa columna.
                                   * Mostraba media conversacion sin avisar que faltaba la
                                   * otra mitad.
                                   *
                                   * Por numero es ademas lo que hace la pestaña de al lado,
                                   * asi que las dos entradas abren lo mismo.
                                   */
                                  clave: r.patient && !r.patientMatchedByPhone
                                    ? `pac:${r.patient.id}`
                                    : `tel:${r.contraparte.replace(/[^0-9]/g, '').slice(-10)}`,
                                  id: r.patient?.id ?? null,
                                  nombre: r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : null,
                                  numero: r.contraparte,
                                })}
                                className="text-left w-full hover:opacity-80 transition-opacity"
                                title={t('openThread')}
                              >
                                <Recipient row={r} unknownLabel={t('unregistered')} mostrarCanal={channel === 'ALL'} />
                              </button>
                            ) : (
                              <Recipient row={r} unknownLabel={t('unregistered')} mostrarCanal={channel === 'ALL'} />
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <StatusPill state={statusState(r.status)} label={statusLabel(r.status, r.channel)} />
                            {/* El código de Twilio es lo que permite diagnosticar:
                                30007 = filtrado por el operador · 21610 = se dio de baja */}
                            {r.errorCode != null && (
                              <div className="mt-1 font-mono text-[9.5px] text-rose">#{r.errorCode}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-[12px] text-text-2 truncate">
                            {r.direction === 'INBOUND' ? (
                              <span className="inline-flex items-center gap-1 text-brand-text font-medium">
                                <CornerUpLeft className="w-3 h-3" />{t('fromPatient')}
                              </span>
                            ) : (
                              <>
                                {r.sentByName ?? <span className="text-text-muted">—</span>}
                                {r.sentByMe && <span className="text-text-muted"> ({t('me')})</span>}
                              </>
                            )}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-text-muted whitespace-nowrap">{whenLabel(r.createdAt)}</td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => abrirCuerpo(r)}
                              className="text-left text-[11.5px] text-text-2 hover:text-text-1 transition-colors"
                            >
                              {openBody === r.id
                                ? <span className="whitespace-pre-wrap">{r.body}</span>
                                : <span className="line-clamp-2">{r.body}</span>}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TableFooter
                  left={t('footerCount', { shown: rows.length, total: data?.total ?? 0 })}
                  right={counts && counts.notDelivered > 0
                    ? <span className="text-rose font-semibold">{t('footerNotDelivered', { count: counts.notDelivered })}</span>
                    : undefined}
                />
              </div>

              {/* Mobile — cards: 5 columnas no entran en 375px */}
              <ul className={`md:hidden space-y-2 transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}>
                {rows.map(r => (
                  <li key={r.id} className="rounded-lg border border-border bg-bg-1 p-3 space-y-2">
                    <Recipient row={r} unknownLabel={t('unregistered')} mostrarCanal={channel === 'ALL'} />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusPill state={statusState(r.status)} label={statusLabel(r.status, r.channel)} />
                      {r.errorCode != null && <span className="font-mono text-[9.5px] text-rose">#{r.errorCode}</span>}
                      <span className="text-[11px] text-text-muted ml-auto">{whenLabel(r.createdAt)}</span>
                    </div>
                    <p className="text-[11.5px] text-text-2 whitespace-pre-wrap">{r.body}</p>
                    {r.sentByName && <p className="text-[11px] text-text-muted">{r.sentByName}</p>}
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <nav aria-label={t('paginationNav')} className="flex items-center justify-between gap-2 pt-3">
                  <span className="text-[11px] text-text-muted" aria-live="polite">
                    {t('pageInfo', { page: page + 1, total: totalPages })}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0 || loading}
                      aria-label={t('prevPage')}
                      className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1 || loading}
                      aria-label={t('nextPage')}
                      className="p-2 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
        </div>
      {/* El hilo del paciente. Se monta ACA adentro para que viaje con el
          panel: en la seccion y en el dialogo funciona igual. */}
      <PatientThreadDialog
        patient={hilo}
        onOpenChange={(o) => { if (!o) setHilo(null); }}
        onEnviado={refrescar}
      />

      {/* Elige a quien escribirle y se lo entrega al dialogo de arriba. No
          manda nada: la caja de texto, el contador y el envio ya viven alla. */}
      <NuevoSmsDialog
        abierto={eligiendo}
        onOpenChange={setEligiendo}
        onElegir={(p) => setHilo(p)}
      />
    </>
  );
}

/**
 * A quién se le mandó. Con paciente reconocido: nombre + código. Sin reconocer:
 * el número en ámbar — mismo criterio que el historial de llamadas.
 */
/**
 * El mismo panel, dentro de un dialogo. Lo usa el boton de Pacientes.
 *
 * No duplica nada: es `SmsHistoryPanel` con el envoltorio que un dialogo
 * necesita, incluido el `DialogTitle` que Radix exige para anunciarlo.
 */
export function SmsHistoryDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('phoenix.sms');
  const [editando, setEditando] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-0 shrink-0">
          <DialogTitle className="text-text-1 flex items-center gap-2 text-base">
            {editando ? <Settings className="w-4 h-4 text-brand-text" /> : <MessageSquare className="w-4 h-4 text-brand-text" />}
            {editando ? t('tplTitle') : t('title')}
          </DialogTitle>
          <DialogDescription className="text-text-muted text-xs">{editando ? t('tplSubtitle') : t('subtitle')}</DialogDescription>
        </DialogHeader>
        <SmsHistoryPanel onTitulo={setEditando} />
      </DialogContent>
    </Dialog>
  );
}

function Recipient({ row, unknownLabel, mostrarCanal }: {
  row: Row;
  unknownLabel: string;
  /** Solo con el filtro en "Todos": con un canal elegido, repetirlo por fila sobra. */
  mostrarCanal?: boolean;
}) {
  /**
   * `toAddress` no siempre es un teléfono. En una fila de EMAIL es una
   * dirección de correo, y `formatUsPhone` sobre "juan@gmail.com" no devuelve
   * un correo legible — devuelve el resultado de tratar sus dígitos como un
   * número.
   */
  /**
   * Se muestra el numero del PACIENTE, no el destino.
   *
   * En un entrante el destino somos nosotros, asi que mostrar `toAddress`
   * ponia el numero de la clinica en la columna donde se busca al paciente.
   * La API ya resuelve de que lado esta — aca no se repite la regla.
   */
  const otroLado = row.contraparte ?? row.toAddress;
  const destino = row.channel === 'EMAIL' ? otroLado : formatUsPhone(otroLado);

  const marca = mostrarCanal
    ? <Mail className="w-3 h-3 shrink-0 text-text-muted" aria-hidden />
    : null;
  const marcaSms = mostrarCanal
    ? <MessageSquare className="w-3 h-3 shrink-0 text-text-muted" aria-hidden />
    : null;
  const icono = row.channel === 'EMAIL' ? marca : marcaSms;

  if (!row.patient) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 shrink-0 rounded-full bg-amber/20 border border-amber/40 flex items-center justify-center text-[10px] font-bold text-amber">
          ?
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {icono}
            <span className="font-mono text-[12px] text-amber truncate">{destino}</span>
          </div>
          <div className="text-[10px] text-text-muted">{unknownLabel}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <PersonAvatar firstName={row.patient.firstName} lastName={row.patient.lastName} size={6} />
      <div className="min-w-0">
        <div className="font-semibold text-text-1 text-[12.5px] truncate">
          {row.patient.firstName} {row.patient.lastName}
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          {icono}
          <span className="font-mono text-[10px] text-text-muted truncate">
            {[row.patient.patientCode, destino].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>
    </div>
  );
}

function SmsSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="border-b border-row-sep px-4 py-2.5 flex items-center gap-3"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <Skeleton.Circle size={6} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-2.5 w-44" />
          </div>
          <Skeleton className="h-4 w-20 rounded-md hidden sm:block" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
