'use client';

/**
 * El editor de los mensajes automáticos, en los dos idiomas.
 *
 * Pedido de Erick (2026-09-28): que recepción pueda cambiar el texto sin
 * esperar un deploy.
 *
 * ── Por qué es una VISTA y no otro diálogo ─────────────────────────────────
 *
 * Se monta adentro del historial de SMS, que ya es un diálogo y adentro ya abre
 * la conversación de un paciente. Un tercer nivel de modal pisa una trampa
 * conocida de este proyecto: un diálogo dentro de otro roba el foco y deja los
 * campos muertos — fue lo que rompió el buscador de cargos. Acá el engranaje
 * cambia la vista dentro del mismo diálogo y la flecha vuelve.
 *
 * El mismo componente se monta también en Configuración. Una implementación,
 * dos entradas: dos editores del mismo texto se desincronizan y después nadie
 * sabe cuál es el que sale.
 *
 * ── La vista previa, y por qué era lo que faltaba ──────────────────────────
 *
 * Erick, 2026-10-09: "los usuarios no pueden editarlo porque está en código".
 * Lo que se ve como código son los bloques condicionales:
 *
 *     {?paciente}Appointment for {paciente}{/paciente}{?!paciente}Your
 *     appointment is{/!paciente}
 *
 * No se pueden sacar —sin ellos harían falta cuatro plantillas por mensaje, y
 * un paciente de una sede sin dirección cargada recibiría "Murray - Surgery, ."
 * con el hueco a la vista—. Lo que sí se puede es que **nadie los tenga que
 * leer**: abajo se muestra el mensaje ya resuelto, como le llega al paciente, y
 * los escenarios de al lado apagan un campo por vez para VER qué hace cada
 * bloque en lugar de tener que interpretarlo.
 *
 * La previa usa `renderPlantilla`, la MISMA función que usa el servidor al
 * mandar. No es una comodidad: en `send-portal-dialog.tsx` hubo una copia local
 * del texto que se desincronizó y recepción veía un mensaje mientras al
 * paciente le llegaba otro. Una previa que puede mentir es peor que no tenerla.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw, Save, Check, AlertTriangle, Loader2, Eye } from 'lucide-react';
import { Button } from '@precision/ui';
import { FilterPill, Skeleton, StatusPill } from '@/components/ui-phoenix';
import { segmentosSms } from '@/lib/sms-segmentos';
import { renderPlantilla } from '@/lib/plantillas-sms';

interface Plantilla {
  key: string;
  lang: 'es' | 'en';
  texto: string;
  original: string;
  esOriginal: boolean;
  editadaEl: string | null;
  variables: string[];
  obligatorias: string[];
  cierre: string;
}

/**
 * Datos de ejemplo para la previa. SIN ACENTOS, a propósito.
 *
 * El contador avisa cuando el texto editable tiene un acento, porque uno solo
 * pasa el SMS a UCS-2 y el segmento cae de 153 a 67 caracteres. Si los datos de
 * ejemplo trajeran acentos, la previa contaría segmentos que el aviso no
 * explica y los dos números se contradirían en pantalla.
 */
const EJEMPLOS: Record<'es' | 'en', Record<string, string>> = {
  en: {
    paciente:      'Maria Lopez',
    fecha:         'Mon Oct 13 at 9:30 AM',
    fechaAnterior: 'Thu Oct 9 at 2:00 PM',
    sede:          'Murray - Surgery',
    direccion:     '5126 S State St, Murray UT',
    horaLlegada:   '9:15 AM',
    telefono:      '(801) 448-5089',
    enlace:        'https://pmc.link/v/8a2k',
  },
  es: {
    paciente:      'Maria Lopez',
    fecha:         'lunes 13 de octubre, 9:30',
    fechaAnterior: 'jueves 9 de octubre, 14:00',
    sede:          'Murray - Surgery',
    direccion:     '5126 S State St, Murray UT',
    horaLlegada:   '9:15',
    telefono:      '(801) 448-5089',
    enlace:        'https://pmc.link/v/8a2k',
  },
};

/** Los campos que el texto envuelve en un condicional, en el orden en que aparecen. */
function camposCondicionales(texto: string): string[] {
  const vistos = [...texto.matchAll(/\{\?!?(\w+)\}/g)].map((m) => m[1] as string);
  return [...new Set(vistos)];
}

export function SmsTemplatesEditor() {
  const t = useTranslations('phoenix.sms');

  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [lang, setLang]             = useState<'es' | 'en'>('en');
  const [clave, setClave]           = useState<string | null>(null);
  const [borrador, setBorrador]     = useState('');
  const [guardando, setGuardando]   = useState(false);
  const [aviso, setAviso]           = useState<string | null>(null);
  const [guardado, setGuardado]     = useState(false);
  /** Qué campo se apaga en la previa. `null` = están todos cargados. */
  const [sinCampo, setSinCampo]     = useState<string | null>(null);

  const cajaRef = useRef<HTMLTextAreaElement | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch('/api/admin/sms-templates');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { plantillas: Plantilla[] };
      setPlantillas(data.plantillas);
      setClave((c) => c ?? data.plantillas[0]?.key ?? null);
    } catch {
      setAviso(t('tplLoadError'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => { void cargar(); }, [cargar]);

  const actual = plantillas.find((p) => p.key === clave && p.lang === lang) ?? null;

  // Al cambiar de plantilla o de idioma el borrador arranca de lo vigente.
  useEffect(() => {
    setBorrador(actual?.texto ?? ''); setAviso(null); setGuardado(false); setSinCampo(null);
  }, [clave, lang, actual?.texto]);

  /**
   * Insertar DONDE ESTÁ EL CURSOR, no al final.
   *
   * Antes se pegaba al final del texto: para meter `{direccion}` en el medio de
   * la frase había que ir a buscarla y moverla a mano, que es justo la parte en
   * la que se escribe mal la llave. Si la caja no tiene foco, el final sigue
   * siendo un destino razonable.
   */
  const insertar = (fragmento: string) => {
    const caja = cajaRef.current;
    setGuardado(false);
    if (!caja) { setBorrador((b) => b + fragmento); return; }
    const ini = caja.selectionStart ?? borrador.length;
    const fin = caja.selectionEnd ?? borrador.length;
    const texto = borrador.slice(0, ini) + fragmento + borrador.slice(fin);
    setBorrador(texto);
    // El cursor queda DESPUÉS de lo insertado, listo para seguir escribiendo.
    requestAnimationFrame(() => {
      caja.focus();
      const pos = ini + fragmento.length;
      caja.setSelectionRange(pos, pos);
    });
  };

  /** Los campos opcionales: los obligatorios no se pueden apagar ni condicionar. */
  const opcionales = useMemo(
    () => (actual?.variables ?? []).filter((v) => !actual?.obligatorias.includes(v)),
    [actual?.variables, actual?.obligatorias],
  );

  /**
   * Los escenarios de la previa salen del TEXTO, no de la lista de variables.
   *
   * Ofrecer "sin hora de llegada" cuando el texto no envuelve ese campo en un
   * condicional mostraría una frase rota —"Arrive at for check-in"— por un caso
   * que no puede pasar, y mandaría a alguien a arreglar lo que no está roto.
   */
  const escenarios = useMemo(
    () => camposCondicionales(borrador).filter((v) => opcionales.includes(v)),
    [borrador, opcionales],
  );

  // Si el campo apagado deja de estar condicionado, el escenario deja de existir.
  useEffect(() => {
    if (sinCampo && !escenarios.includes(sinCampo)) setSinCampo(null);
  }, [escenarios, sinCampo]);

  /** El mensaje como le llega al paciente, con el cierre legal pegado. */
  const previa = useMemo(() => {
    if (!actual) return '';
    const valores: Record<string, string> = { ...EJEMPLOS[lang] };
    if (sinCampo) valores[sinCampo] = '';
    return `${renderPlantilla(borrador, valores)} ${actual.cierre}`;
  }, [borrador, lang, sinCampo, actual?.cierre]);

  /** El mismo mensaje con TODOS los datos: es el caso más largo, el que se cobra. */
  const previaCompleta = useMemo(() => {
    if (!actual) return '';
    return `${renderPlantilla(borrador, EJEMPLOS[lang])} ${actual.cierre}`;
  }, [borrador, lang, actual?.cierre]);

  /**
   * El contador mide el MENSAJE, no el texto de la plantilla.
   *
   * Hasta hoy contaba el código fuente con las llaves adentro: la plantilla de
   * cita nueva en inglés decía "345 caracteres · 3 segmentos" cuando el mensaje
   * que sale son 272 y **2 segmentos**. El error iba para el lado caro —hacía
   * creer que cada aviso costaba un segmento más de lo que cuesta— y encima se
   * agrandaba justo con lo que más ocupa en la fuente, que son los
   * condicionales.
   */
  const medida = segmentosSms(previa);
  const medidaCompleta = segmentosSms(previaCompleta);
  const sucio = actual !== null && borrador.trim() !== actual.texto.trim();

  const guardar = async () => {
    if (!actual || !sucio || guardando) return;
    setGuardando(true); setAviso(null);
    try {
      const res = await fetch('/api/admin/sms-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: actual.key, lang: actual.lang, body: borrador.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; variables?: string[] };
      if (!res.ok) {
        if (data.error === 'FALTAN_VARIABLES') {
          setAviso(t('tplMissingVars', { vars: (data.variables ?? []).map((v) => `{${v}}`).join(' ') }));
          return;
        }
        if (data.error === 'VARIABLES_DESCONOCIDAS') {
          setAviso(t('tplUnknownVars', { vars: (data.variables ?? []).map((v) => `{${v}}`).join(' ') }));
          return;
        }
        setAviso(t('tplSaveError'));
        return;
      }
      setGuardado(true);
      await cargar();
    } catch {
      setAviso(t('tplSaveError'));
    } finally {
      setGuardando(false);
    }
  };

  const restaurar = async () => {
    if (!actual || guardando) return;
    setGuardando(true); setAviso(null);
    try {
      await fetch(`/api/admin/sms-templates?key=${actual.key}&lang=${actual.lang}`, { method: 'DELETE' });
      await cargar();
      setGuardado(false);
    } finally {
      setGuardando(false);
    }
  };

  const claves = [...new Set(plantillas.map((p) => p.key))];
  /** El nombre humano de un campo; si alguien agrega una variable nueva, su clave. */
  const nombreCampo = (v: string) => t.has(`tplVar_${v}`) ? t(`tplVar_${v}`) : v;

  if (cargando && plantillas.length === 0) {
    return <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-32 w-full" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('tplMessage')}</span>
        {claves.map((k) => (
          <FilterPill key={k} active={clave === k} onClick={() => setClave(k)} label={t(`tpl_${k}`)} />
        ))}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('tplLanguage')}</span>
        {(['en', 'es'] as const).map((l) => (
          <FilterPill key={l} active={lang === l} onClick={() => setLang(l)} label={t(`tplLang_${l}`)} />
        ))}
        {actual && !actual.esOriginal && (
          <StatusPill state="info" label={t('tplEdited')} />
        )}
      </div>

      {actual && (
        <>
          {/* Las variables como piezas: se tocan y se insertan donde está el
              cursor. Escribir `{fecha}` a mano es la forma más fácil de
              escribirlo mal. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('tplVariables')}</span>
            {actual.variables.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertar(`{${v}}`)}
                className={`px-2 py-0.5 rounded text-[10.5px] font-mono transition-colors ${
                  actual.obligatorias.includes(v)
                    ? 'bg-brand/15 text-brand-text hover:bg-brand/25'
                    : 'bg-bg-2 text-text-2 hover:bg-bg-2/60'
                }`}
                title={actual.obligatorias.includes(v) ? t('tplRequired') : nombreCampo(v)}
              >
                {`{${v}}`}{actual.obligatorias.includes(v) && ' *'}
              </button>
            ))}
          </div>

          {/* El bloque condicional, armado. Es la pieza que nadie escribe bien a
              mano: hay que abrirla, repetir el nombre adentro y cerrarla con la
              barra. Acá entra entera y el cursor queda listo para seguir. */}
          {opcionales.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('tplOnlyIf')}</span>
              {opcionales.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertar(`{?${v}}{${v}}{/${v}}`)}
                  title={t('tplOnlyIfHint', { campo: nombreCampo(v) })}
                  className="px-2 py-0.5 rounded text-[10.5px] bg-bg-2 text-text-2 hover:bg-bg-2/60 transition-colors"
                >
                  {nombreCampo(v)}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={cajaRef}
            value={borrador}
            onChange={(e) => { setBorrador(e.target.value); setGuardado(false); }}
            rows={5}
            className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono text-text-1 focus:outline-none focus:border-brand resize-y"
          />

          {/* ── La vista previa ───────────────────────────────────────────────
              Va DEBAJO del cuadro y siempre visible: es lo que contesta "¿qué
              le llega al paciente?", que es la pregunta que hoy nadie puede
              contestar sin saber leer los condicionales. */}
          <div className="rounded-lg bg-bg-1 p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Eye className="w-3.5 h-3.5 text-brand shrink-0" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('tplPreview')}</span>
              {escenarios.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <FilterPill active={sinCampo === null} onClick={() => setSinCampo(null)} label={t('tplCaseAll')} />
                  {escenarios.map((v) => (
                    <FilterPill
                      key={v}
                      active={sinCampo === v}
                      onClick={() => setSinCampo(v)}
                      label={t('tplCaseWithout', { campo: nombreCampo(v) })}
                    />
                  ))}
                </div>
              )}
            </div>

            <p className="rounded-md bg-bg-2/40 px-3 py-2.5 text-[12.5px] text-text-1 whitespace-pre-wrap break-words">
              {previa}
            </p>

            <p className="text-[10.5px] text-text-muted">
              {t('tplPreviewHint')}
              {/* El cierre legal lo agrega el sistema y no se puede sacar: lo
                  exige el operador (A2P 10DLC) y sin él el carrier filtra. */}
              {' · '}{t('tplLocked')}: {actual.cierre}
            </p>
          </div>

          {aviso && (
            <div className="flex items-start gap-2 rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{aviso}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] text-text-muted">
              {t('segments', { n: medida.segmentos, chars: previa.length })}
              {/* Cuando el caso que se está mirando es más corto que el de un
                  paciente con todos los datos, se dice el máximo: es el que se
                  cobra, y es el que decide si conviene acortar el texto. */}
              {medidaCompleta.segmentos > medida.segmentos && (
                <span className="ml-1.5">· {t('tplSegmentsFull', { n: medidaCompleta.segmentos })}</span>
              )}
              {!medida.gsm && (
                <span className="text-amber ml-1.5">
                  · {t('unicodeWarning', { chars: medida.culpables.slice(0, 3).join(' ') })}
                </span>
              )}
            </div>
            {/* En mobile los dos botones ocupan el ancho y se apilan; el
                `w-full` de cada uno necesita que el contenedor también lo sea,
                si no mide el ancho del contenido y no estira nada. */}
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {/* Se MUESTRA siempre y se bloquea si ya es el original: esconderlo
                  deja a alguien buscando un botón que existe. */}
              <Button
                variant="outline"
                onClick={() => void restaurar()}
                disabled={actual.esOriginal || guardando}
                title={actual.esOriginal ? t('tplAlreadyOriginal') : undefined}
                className="gap-1.5 w-full sm:w-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />{t('tplRestore')}
              </Button>
              <Button onClick={() => void guardar()} disabled={!sucio || guardando} className="gap-1.5 w-full sm:w-auto">
                {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : guardado ? <Check className="w-3.5 h-3.5" />
                  : <Save className="w-3.5 h-3.5" />}
                {guardado && !sucio ? t('tplSaved') : t('tplSave')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
