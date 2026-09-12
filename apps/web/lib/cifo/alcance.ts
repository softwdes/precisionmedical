/**
 * El alcance de CIFO en el Admin.
 *
 * Deliberadamente diminuto, por el mismo motivo que el de la clínica: lo que no
 * está acá no puede llegar al prompt ni a una herramienta por accidente. El
 * alcance no filtra nada —las herramientas del Admin ven la empresa entera—
 * así que su único trabajo es identificar a quién le está hablando.
 *
 * ── Por qué no lleva permisos ───────────────────────────────────────────────
 *
 * Porque el permiso se resuelve ANTES, en la puerta (`lib/cifo/acceso.ts`), y
 * no dentro del agente. Un alcance con banderas invita a que alguna herramienta
 * las mire y decida por su cuenta, y ahí el candado pasa a estar repartido en
 * seis lugares en vez de uno.
 */
export interface AlcanceAdmin {
  /** Para saludar. Puede faltar. */
  nombre: string | null;
  /** El rol, solo para el registro de auditoría. */
  rol: string;
}
