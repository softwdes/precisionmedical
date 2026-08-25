/**
 * Traducción de las notas al inglés, al vuelo y una sola vez.
 *
 * Los commits de este repo están escritos en español y siempre lo van a estar.
 * Pedir la traducción a mano no funcionó —es la misma lección que el gate de
 * publicación: lo que hay que atender en cada deploy no se atiende— y mostrarle
 * texto en español a alguien que tiene la app en inglés se veía roto.
 *
 * Se traduce cuando un usuario en `en` realmente abre el aviso, no en el build:
 * así no se le mete una dependencia de red al deploy, y sólo se paga por las
 * notas que alguien va a leer. El resultado se GUARDA en `textEn`, así que cada
 * nota se traduce una vez en su vida.
 *
 * Si no hay proveedor configurado, o falla, o devuelve algo que no cuadra, se
 * cae al español — que es lo que se mostraba antes. Nunca tira.
 */
import { db } from './index';

interface Pendiente {
  id: string;
  textEs: string;
}

/** Mismo gate que `runAuditScan` de apps/web: sin proveedor, no se intenta. */
function proveedorListo(): boolean {
  return process.env.AI_PROVIDER === 'openrouter' && Boolean(process.env.OPENROUTER_API_KEY);
}

const PROMPT = [
  'Translate each numbered clinical-software release note from Spanish to English.',
  'These are short UI changelog lines for medical clinic staff.',
  'Keep the same terse, plain register — do not add words, do not explain, do not',
  'add punctuation that is not there. Keep product names, codes and quoted UI',
  'labels verbatim (Brunella, ScriptSure, CPT, lien, no-show, "Guardar").',
  'Answer with ONLY a JSON array of strings, same length and order as the input.',
].join(' ');

async function pedirTraduccion(textos: string[]): Promise<string[] | null> {
  const model = process.env.OPENROUTER_MODEL ?? 'poolside/laguna-m.1:free';
  const numeradas = textos.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: `${PROMPT}\n\n${numeradas}` }],
      temperature: 0,
    }),
    // El aviso se muestra despues del reload: si tarda mas que esto, mejor
    // mostrar el español que dejar al usuario mirando la nada.
    signal: AbortSignal.timeout(12000),
  });

  if (!resp.ok) return null;

  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') return null;

  // El modelo suele envolver el JSON en ```json … ```
  const match = /\[[\s\S]*\]/.exec(raw);
  if (match === null) return null;

  const parsed = JSON.parse(match[0]) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== textos.length) return null;
  if (!parsed.every((x): x is string => typeof x === 'string' && x.trim() !== '')) return null;

  return parsed;
}

/**
 * Traduce y persiste las que falten. Devuelve `id → textEn` sólo de las que
 * salieron bien; el resto lo resuelve el fallback al español de `getChangelog`.
 */
export async function traducirPendientes(
  pendientes: Pendiente[],
): Promise<Map<string, string>> {
  const listo = new Map<string, string>();
  if (pendientes.length === 0 || !proveedorListo()) return listo;

  // Techo por si alguien vuelve despues de meses: una tanda, no cien.
  const tanda = pendientes.slice(0, 25);

  try {
    const traducidas = await pedirTraduccion(tanda.map((p) => p.textEs));
    if (traducidas === null) return listo;

    await Promise.all(
      tanda.map(async (p, i) => {
        const textEn = traducidas[i].trim();
        listo.set(p.id, textEn);
        // Se guarda para no volver a pagarla nunca. Si el update falla, el
        // usuario igual ve su traduccion en esta vuelta.
        await db.releaseEntry.update({ where: { id: p.id }, data: { textEn } });
      }),
    );
  } catch (err) {
    console.warn(
      '[release-notes] no se pudo traducir:',
      err instanceof Error ? err.message : String(err),
    );
  }

  return listo;
}
