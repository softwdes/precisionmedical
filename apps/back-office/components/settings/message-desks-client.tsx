'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Stethoscope, ClipboardList, Receipt, UserPlus, AlertCircle, Loader2, Clock } from 'lucide-react';
import { Section } from '@/components/ui-phoenix';
import { useToast } from '@/components/ui-phoenix/toast';
import { UserMultiSelect, type MessagingUser } from '@/components/messaging/user-multi-select';
import { ESCRITORIOS, ESCRITORIO_RESPALDO, type Escritorio } from '@/lib/mensajeria/escritorios';

/**
 * Configuración → Pedidos de bufetes: quién atiende cada escritorio.
 *
 * Tres tarjetas, una por escritorio, cada una con el selector de gente que ya
 * usa la mensajería (`UserMultiSelect`: buscador + chips). Agregar o quitar
 * GUARDA al instante: no hay botón "guardar" porque el estado natural de esta
 * pantalla es "así está hoy", no un formulario a medio llenar.
 *
 * Los candidatos salen del directorio, no de Phoenix, para que aparezca quien
 * se dio de alta hoy y todavía no entró; al asignarlo el servidor le crea la
 * fila y los pedidos se le acumulan (Brunella, 2026-09-07). Esa condición se
 * marca debajo de la tarjeta.
 */

interface Miembro {
  id: string;
  name: string;
  email: string;
  role: string;
  pendienteDePrimerIngreso: boolean;
}
interface Candidato { email: string; name: string; role: string; sinFilaPhoenix: boolean }
interface Datos { escritorios: Record<Escritorio, Miembro[]>; candidatos: Candidato[] }

const ICONO: Record<Escritorio, React.ElementType> = {
  CLINICAL:  Stethoscope,
  INTAKE:    ClipboardList,
  BILLING:   Receipt,
  REFERRALS: UserPlus,
};
const TONO: Record<Escritorio, 'violet' | 'cyan' | 'amber' | 'emerald'> = {
  CLINICAL:  'violet',
  INTAKE:    'cyan',
  BILLING:   'amber',
  REFERRALS: 'emerald',
};

export function MessageDesksClient(): React.ReactElement {
  const t = useTranslations('phoenix.settings.desks');
  const tm = useTranslations('phoenix.messaging');
  const toast = useToast();
  const [datos, setDatos] = React.useState<Datos | null>(null);
  const [error, setError] = React.useState(false);
  const [guardando, setGuardando] = React.useState<Escritorio | null>(null);

  React.useEffect(() => {
    fetch('/api/admin/message-desks')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: Datos) => setDatos(d))
      .catch(() => setError(true));
  }, []);

  // El selector habla en "usuarios" con id; acá el id ES el email, que es la
  // llave que entiende el servidor y la única que tienen los que aún no entraron.
  const candidatos: MessagingUser[] = React.useMemo(
    () => (datos?.candidatos ?? []).map((c) => ({ id: c.email, name: c.name, role: c.role })),
    [datos],
  );

  async function guardar(desk: Escritorio, seleccion: MessagingUser[]): Promise<void> {
    if (!datos) return;
    const anterior = datos.escritorios;
    // Optimista: los chips cambian ya; si el servidor dice no, vuelven.
    setDatos({
      ...datos,
      escritorios: {
        ...anterior,
        [desk]: seleccion.map((u) => ({ id: u.id, name: u.name, email: u.id, role: u.role, pendienteDePrimerIngreso: false })),
      },
    });
    setGuardando(desk);
    try {
      const r = await fetch('/api/admin/message-desks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desk, emails: seleccion.map((u) => u.id) }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string; emails?: string[] };
        setDatos((prev) => (prev ? { ...prev, escritorios: anterior } : prev));
        toast.error(d.error === 'NO_ASIGNABLES' && d.emails?.length
          ? t('notAssignable', { emails: d.emails.join(', ') })
          : t('error'));
        return;
      }
      const d = (await r.json()) as { escritorios: Record<Escritorio, Miembro[]> };
      setDatos((prev) => (prev ? { ...prev, escritorios: d.escritorios } : prev));
      toast.success(t('saved'));
    } catch {
      setDatos((prev) => (prev ? { ...prev, escritorios: anterior } : prev));
      toast.error(t('error'));
    } finally {
      setGuardando(null);
    }
  }

  if (error) {
    return (
      <div className="px-4 sm:px-6 pb-6">
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[11px] text-rose">{t('loadError')}</div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 pb-6 space-y-4">
      <div className="rounded-lg bg-bg-1 p-5 space-y-1">
        <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('title')}</h2>
        <p className="text-[12.5px] text-text-2 max-w-3xl">{t('subtitle')}</p>
        <p className="text-[11px] text-text-muted max-w-3xl">
          {t('fallbackNote', { fallback: tm(`desk${ESCRITORIO_RESPALDO}`) })}
        </p>
      </div>

      {!datos ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-brand-text" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ESCRITORIOS.map((d) => {
            const miembros = datos.escritorios[d] ?? [];
            const seleccion: MessagingUser[] = miembros.map((m) => ({ id: m.email, name: m.name, role: m.role }));
            const pendientes = miembros.filter((m) => m.pendienteDePrimerIngreso);
            return (
              <Section
                key={d}
                icon={ICONO[d]}
                title={tm(`desk${d}`)}
                count={miembros.length}
                tone={TONO[d]}
                action={guardando === d ? <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" /> : undefined}
              >
                <p className="text-[12px] text-text-muted mb-3">{t(`sub_${d}`)}</p>
                <UserMultiSelect
                  users={candidatos}
                  selected={seleccion}
                  onChange={(sel) => { void guardar(d, sel); }}
                  placeholder={t('search')}
                  disabled={guardando !== null}
                />
                {miembros.length === 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{d === ESCRITORIO_RESPALDO ? t('emptyFallback') : t('empty', { fallback: tm(`desk${ESCRITORIO_RESPALDO}`) })}</span>
                  </div>
                )}
                {pendientes.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">
                    <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{t('pending', { names: pendientes.map((p) => p.name).join(', ') })}</span>
                  </div>
                )}
              </Section>
            );
          })}
        </div>
      )}
    </div>
  );
}
