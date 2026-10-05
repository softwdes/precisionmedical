import type { TemplateScope } from '@precision-medical/database';

/**
 * QUIÉN VE QUÉ en las listas con alcance: snippets y plantillas.
 *
 * Las dos tablas comparten el enum `TemplateScope` y las dos columnas que acá
 * importan (`scope`, `createdById`), así que la regla es UNA sola y vive acá
 * — ver `regla-un-solo-resolvedor-por-dato`. Antes estaba escrita a mano
 * dentro del GET de snippets y **no estaba en ningún lado para plantillas**:
 * las tres consultas que leen `templates` pedían todo sin mirar el alcance, así
 * que la columna se escribía y no la leía nadie. Pedido de Devin (2026-09-25,
 * reiterado el 2026-10-04): *"Create a Global list and individual provider
 * list… All of Nate's templates can just be moved to his individual list"*.
 *
 * `PERSONAL` = solo de su autor. Todo lo demás es de la clínica.
 *
 * **Sobre los nulos:** el docblock del GET de snippets decía que un `scope` nulo
 * "entra en compartido a propósito". Es falso en SQL —`scope <> 'PERSONAL'` da
 * NULL para un nulo, así que la fila quedaría FUERA, no dentro— y además es
 * inalcanzable: la columna es NOT NULL con default en las dos tablas, y el
 * 2026-10-04 se midió en producción que hay **0 filas** con nulo en cada una.
 * No se agrega un `OR scope IS NULL` por un caso que no existe y que, si
 * existiera, querría una decisión y no un default escondido.
 *
 * **`SPECIALTY` queda visible para todos**, que es exactamente lo que hace hoy.
 * El enum lo admite y la pantalla de admin lo ofrece en el desplegable, pero no
 * hay nada que empareje la especialidad del que mira con la de la plantilla, y
 * fingir que filtra sería peor que no filtrar. En producción hay **0 filas**
 * con ese alcance (medido el 2026-10-04), así que no esconde nada hoy. Si
 * alguna vez se usa, necesita su propia decisión y su propio filtro.
 *
 * Sin `userId` (sesión sin fila en `users` de Phoenix) se devuelve solo lo
 * compartido: no hay con qué comparar al autor, y en la duda no se muestra lo
 * ajeno.
 */
const PERSONAL = 'PERSONAL' as TemplateScope & 'PERSONAL';

export function filtroPorAlcance(userId: string | null) {
  return userId
    ? { OR: [{ scope: { not: PERSONAL } }, { scope: PERSONAL, createdById: userId }] }
    : { scope: { not: PERSONAL } };
}
