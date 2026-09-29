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
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw, Save, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@precision/ui';
import { FilterPill, Skeleton, StatusPill } from '@/components/ui-phoenix';
import { segmentosSms } from '@/lib/sms-segmentos';

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
  useEffect(() => { setBorrador(actual?.texto ?? ''); setAviso(null); setGuardado(false); }, [clave, lang, actual?.texto]);

  /**
   * El contador mide el mensaje COMPLETO, con el cierre legal pegado.
   *
   * Mostrar solo lo editable diría 2 segmentos donde se facturan 3: el HELP/STOP
   * son ~60 caracteres que salen igual y que nadie puede sacar.
   */
  const completo = actual ? `${borrador} ${actual.cierre}` : borrador;
  const medida = segmentosSms(completo);
  const sucio  = actual !== null && borrador.trim() !== actual.texto.trim();

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
          {/* Las variables como piezas: se tocan y se insertan al final. Escribir
              `{fecha}` a mano es la forma más fácil de escribirlo mal. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mr-0.5">{t('tplVariables')}</span>
            {actual.variables.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBorrador((b) => `${b}{${v}}`)}
                className={`px-2 py-0.5 rounded text-[10.5px] font-mono transition-colors ${
                  actual.obligatorias.includes(v)
                    ? 'bg-brand/15 text-brand-text hover:bg-brand/25'
                    : 'bg-bg-2 text-text-2 hover:bg-bg-2/60'
                }`}
                title={actual.obligatorias.includes(v) ? t('tplRequired') : undefined}
              >
                {`{${v}}`}{actual.obligatorias.includes(v) && ' *'}
              </button>
            ))}
          </div>

          <textarea
            value={borrador}
            onChange={(e) => { setBorrador(e.target.value); setGuardado(false); }}
            rows={5}
            className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-[12.5px] font-mono text-text-1 focus:outline-none focus:border-brand resize-y"
          />

          {/* El cierre legal, a la vista y bloqueado. Esconderlo haría creer que
              el mensaje termina antes de donde termina. */}
          <div className="flex items-start gap-2 rounded-md bg-bg-2/40 px-3 py-2">
            <span className="text-[9.5px] uppercase tracking-wider font-semibold text-text-muted shrink-0 mt-0.5">{t('tplLocked')}</span>
            <span className="text-[11px] text-text-muted">{actual.cierre}</span>
          </div>

          {aviso && (
            <div className="flex items-start gap-2 rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{aviso}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] text-text-muted">
              {t('segments', { n: medida.segmentos, chars: completo.length })}
              {!medida.gsm && (
                <span className="text-amber ml-1.5">
                  · {t('unicodeWarning', { chars: medida.culpables.slice(0, 3).join(' ') })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Se MUESTRA siempre y se bloquea si ya es el original: esconderlo
                  deja a alguien buscando un botón que existe. */}
              <Button
                variant="outline"
                onClick={() => void restaurar()}
                disabled={actual.esOriginal || guardando}
                title={actual.esOriginal ? t('tplAlreadyOriginal') : undefined}
                className="gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />{t('tplRestore')}
              </Button>
              <Button onClick={() => void guardar()} disabled={!sucio || guardando} className="gap-1.5">
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
