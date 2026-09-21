'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LockOpen } from 'lucide-react';

/**
 * "Cobrar antes de atender" — poner y sacar la marca roja del v2.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Es la ENTRADA de lo que CIFO avisa a la mañana. Sin un lugar donde ponerla, la
 * marca es una columna que nadie escribe y el aviso no avisa de nada: el saldo
 * solo no alcanza, porque de $1.377.546 de deuda en la base apenas $164,81 son
 * del mostrador (medido el 2026-09-16). La decisión de frenar a alguien la toma
 * una persona, y acá la escribe.
 *
 * ⚠️ NO decide quién puede escribir: eso lo resuelve el servidor. La ruta va
 * detrás de `checkPatientAccess(admin: true)`, la misma puerta que archivar.
 * `soloLectura` es lo que evita ofrecerle el botón a quien va a comerse un 403.
 */

export function MarcaCobro({ patientId, activo, nota, soloLectura = false, onCambio }: {
  patientId: string;
  activo: boolean;
  nota: string | null;
  /**
   * Se ve, no se toca — para el portal del provider.
   *
   * Él tiene que SABER que al paciente hay que cobrarle antes de atenderlo (es
   * justo el momento en que importa), pero la marca la pone recepción: la ruta
   * es admin y un provider apretando el botón se comía un 403 mudo.
   *
   * No se esconde, se explica. Es la regla de no esconder la acción bloqueada:
   * si desaparece, el provider no se entera de que la función existe ni de por
   * qué no es suya.
   */
  soloLectura?: boolean;
  /**
   * Avisa al resto de la ficha que la marca cambió — se llama DESPUÉS del 200.
   *
   * Existe porque el estado propio de este componente (ver abajo) no lo alcanza
   * nadie: al marcar, el recuadro rojo aparecía solo pero el botón "Cobrar" de
   * la cabecera —cuya condición mira el dato del servidor— no salía hasta
   * recargar, y al desmarcar se quedaba de más. Media tarjeta actualizada y
   * media no es peor que ninguna: se lee como que algo falló.
   *
   * Se pasa el estado nuevo en vez de un aviso pelado para que quien escuche no
   * tenga que volver a preguntarle a nadie.
   */
  onCambio?: (estado: { marcado: boolean; nota: string | null }) => void;
}): React.ReactElement {
  const router = useRouter();

  /**
   * El estado vive ACÁ, sembrado desde el servidor — no se lee del prop directo.
   *
   * Con el prop solo, después de marcar el botón volvía al estado sin marcar y
   * había que recargar a mano para ver el recuadro rojo (lo vio la sesión
   * Pacientes, 2026-09-20). El dato se guardaba bien: lo que no llegaba era el
   * repintado. Y para quien marca eso se lee como "no funcionó", así que vuelve
   * a marcar.
   *
   * Depender de que `router.refresh()` repinte es depender del caché del router
   * de Next, que cambia entre versiones y no se puede verificar desde acá. Con
   * el estado propio la pantalla es correcta aunque el refresh no llegue, y el
   * refresh se sigue llamando para que se actualice lo de al lado — la pastilla
   * de saldo de la cabecera sale de la misma ficha.
   */
  const [marcado, setMarcado] = React.useState(activo);
  const [notaActual, setNotaActual] = React.useState(nota);

  // Si el servidor manda un valor distinto —otra pestaña, una recarga— gana él.
  // Las deps son los props: después de un guardado optimista no vuelve a correr
  // y por eso no pisa lo que acabamos de escribir.
  React.useEffect(() => {
    setMarcado(activo);
    setNotaActual(nota);
  }, [activo, nota]);

  const [abierto, setAbierto] = React.useState(false);
  const [texto, setTexto] = React.useState(nota ?? '');
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function guardar(nuevoActivo: boolean): Promise<void> {
    // Corta el doble clic: sin esto, dos toques seguidos mandan dos PATCH.
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const notaNueva = nuevoActivo ? (texto.trim() || null) : null;
    try {
      const r = await fetch(`/api/admin/patients/${patientId}/cobro`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: nuevoActivo, nota: notaNueva }),
      });
      if (!r.ok) {
        // El 403 se nombra: es "no es tuyo", no "se rompió". Cualquier otra cosa
        // sí es una falla y se ofrece reintentar.
        setError(r.status === 403
          ? 'No tenés permiso para cambiar esto. Lo hace recepción.'
          : 'No se pudo guardar. Probá de nuevo.');
        return;
      }
      setMarcado(nuevoActivo);
      setNotaActual(notaNueva);
      setTexto(notaNueva ?? '');
      setAbierto(false);
      // El resto de la ficha, en el mismo tick: lo que depende de la marca
      // —hoy el botón "Cobrar"— tiene que moverse junto con el recuadro.
      onCambio?.({ marcado: nuevoActivo, nota: notaNueva });
      // Y el servidor igual, para lo que no escucha: la pastilla de saldo de la
      // cabecera también sale de la ficha.
      router.refresh();
    } catch {
      setError('No se pudo guardar. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  // ── Marcado: el aviso, con lo que escribió quien lo marcó ────────────────
  if (marcado && !abierto) {
    return (
      <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2">
        <div className="flex items-start gap-2 flex-wrap">
          <Lock className="w-3.5 h-3.5 text-rose shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-rose uppercase tracking-wider">
              Cobrar antes de atender
            </p>
            {notaActual && (
              <p className="text-[12.5px] text-text-1 mt-0.5 break-words">{notaActual}</p>
            )}
            {/* El provider ve la marca y por qué no la puede sacar él. */}
            {soloLectura && (
              <p className="text-[11px] text-text-muted mt-0.5">Lo saca recepción al cobrar.</p>
            )}
          </div>
          {!soloLectura && (
            <button
              type="button"
              onClick={() => void guardar(false)}
              disabled={guardando}
              className="h-10 sm:h-7 px-3.5 sm:px-2.5 rounded text-[12.5px] sm:text-[11.5px] font-semibold bg-rose/15 text-rose hover:bg-rose/25 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <LockOpen className="w-3 h-3" />
              {guardando ? 'Sacando…' : 'Ya pagó'}
            </button>
          )}
        </div>
        {error && <p className="text-[11px] text-rose mt-1.5">{error}</p>}
      </div>
    );
  }

  /**
   * Sin marca y de solo lectura: nada.
   *
   * Es la excepción a "no esconder la acción bloqueada", y es deliberada. Esa
   * regla protege a quien podría querer HACER algo; acá no hay nada que hacer ni
   * nada que saber — un cartel de "este paciente no tiene marca" en cada ficha
   * del portal médico es ruido en la pantalla que él abre todo el día.
   */
  if (soloLectura) return <></>;

  // ── El formulario, al marcar ─────────────────────────────────────────────
  if (abierto) {
    return (
      <div className="rounded-md bg-bg-2/40 p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
          Cobrar antes de atender
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={280}
          rows={2}
          autoFocus
          placeholder="Qué hay que saber al recibirlo. Ej: no atender sin un pago a cuenta del saldo."
          className="w-full rounded border border-border bg-bg-1 px-2.5 py-2 text-[12.5px] text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand resize-none"
        />
        {/* El texto es lo que de verdad sirve — el monto ya se ve solo. */}
        <p className="text-[11px] text-text-muted">
          Esto es lo que va a leer quien lo reciba, en el saludo de CIFO.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => void guardar(true)}
            disabled={guardando}
            className="w-full sm:w-auto h-10 sm:h-8 px-3.5 rounded text-[12.5px] font-semibold bg-rose/15 text-rose hover:bg-rose/25 transition-colors disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Marcar'}
          </button>
          <button
            type="button"
            onClick={() => { setAbierto(false); setTexto(notaActual ?? ''); setError(null); }}
            className="w-full sm:w-auto h-10 sm:h-8 px-3.5 rounded text-[12.5px] font-semibold text-text-2 hover:text-text-1 hover:bg-white/[0.04] transition-colors"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-[11px] text-rose">{error}</p>}
      </div>
    );
  }

  /**
   * Sin marcar: el botón se MUESTRA igual.
   *
   * No se esconde detrás de "solo si debe algo": frenar a alguien por plata es
   * una decisión que también se toma por un cheque rechazado o un acuerdo roto,
   * y el saldo del mostrador no sabe nada de eso.
   */
  return (
    <button
      type="button"
      onClick={() => setAbierto(true)}
      className="inline-flex items-center gap-1.5 h-10 sm:h-7 px-3.5 sm:px-2.5 rounded text-[12.5px] sm:text-[11.5px] font-semibold text-text-muted hover:text-rose hover:bg-rose/10 transition-colors"
    >
      <Lock className="w-3 h-3" />
      Cobrar antes de atender
    </button>
  );
}
