'use client';

/**
 * Aviso sonoro de mensaje nuevo — generado con la Web Audio API.
 *
 * Sin archivo y sin dependencia a propósito: un .mp3 en `public/` es un pedido
 * de red más (que puede llegar tarde justo cuando hay que avisar), un asset que
 * versionar y una licencia que revisar. Dos notas cortas con un oscilador son
 * dos líneas y suenan igual.
 *
 * Discreto por diseño: 0.18 de volumen y ~260ms en total. En consultorio con
 * paciente delante, un "ding" de tienda es lo que hace que pidan apagarlo.
 *
 * LÍMITE DEL NAVEGADOR: la política de autoplay bloquea el audio hasta que el
 * usuario haya interactuado con la página al menos una vez. En la práctica el
 * personal hace clic todo el tiempo, pero el primer mensaje tras abrir una
 * pestaña en limpio puede llegar en silencio. No hay forma de evitarlo, así que
 * el aviso visual (toast + parpadeo) nunca depende del sonido.
 */

const CLAVE_SILENCIO = 'pm:inbox-sound-muted';

export function inboxSoundMuted(): boolean {
  try {
    return localStorage.getItem(CLAVE_SILENCIO) === '1';
  } catch {
    return false;
  }
}

export function setInboxSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(CLAVE_SILENCIO, muted ? '1' : '0');
  } catch { /* modo privado o storage lleno — el sonido no es crítico */ }
}

/**
 * Dos notas ascendentes (A5 → E6). `urgente` sube el volumen y agrega una
 * tercera nota: el oído distingue que ese no es un mensaje más.
 */
export function playInboxChime(urgente = false): void {
  if (inboxSoundMuted()) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();

    const notas = urgente ? [880, 1174.7, 880] : [880, 1318.5];
    const volumen = urgente ? 0.26 : 0.18;
    const duracion = 0.13;

    notas.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const inicio = ctx.currentTime + i * duracion;
      // Envolvente corta: sin el fade, el corte del oscilador suena a "clic".
      gain.gain.setValueAtTime(0, inicio);
      gain.gain.linearRampToValueAtTime(volumen, inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
      osc.connect(gain).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + duracion);
    });

    // Liberar el contexto: uno por aviso, y si no se cierra el navegador
    // termina limitando la cantidad de contextos abiertos.
    window.setTimeout(() => void ctx.close().catch(() => undefined), notas.length * duracion * 1000 + 200);
  } catch { /* si el navegador lo bloquea, el aviso visual ya cumplió */ }
}
