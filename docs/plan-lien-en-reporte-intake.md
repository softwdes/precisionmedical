# Plan · El gravamen médico en el reporte de intake (casos MVA)

> Reportado por Erick el 27-ago-2026. **Análisis cerrado, sin escribir código**:
> los archivos que hay que tocar están en la zona que otra sesión está editando.
> Este documento es para revisarlo cuando esa sesión termine.

---

## 1 · El reporte y sus dos generadores

Hay **dos** documentos distintos y conviene no confundirlos:

| Archivo | Qué es | ¿Tiene lien? |
|---|---|---|
| `apps/back-office/app/api/admin/cases/[id]/pdf/route.tsx` (740 líneas) | **El "Patient Intake Form"** — el PDF de 3 páginas de la captura, con los consentimientos y las firmas | ❌ |
| `apps/back-office/app/(admin)/front-office/[id]/intake-print/page.tsx` (232 líneas) | Una **hoja resumen interna** en español (Datos Personales, Accidente, Seguro, Información Legal). No lleva consentimientos | ❌ |

El del reporte es **el primero**. El segundo es un resumen de datos, no un paquete de
consentimientos: ahí el lien no corresponde (aunque su sección "Información Legal"
tampoco menciona el gravamen, y vale mirarlo aparte).

## 2 · Qué tiene hoy el PDF, y qué le falta

Cinco consentimientos, en este orden (constantes `CONSENT_TEXTS`, línea 32):

| | Sección | Página |
|---|---|---|
| C1 | Medical Information Release | 2 |
| C2 | Assigned Parties (+ personas autorizadas) | 2 |
| C3 | Consent for Treatment | 2 |
| C4 | Financial Policy (+ firma digital) | 3 |
| C5 | Medical History Authority | 3 |

**No hay sección de gravamen, y no es que esté mal renderizada: no está el dato.**
La consulta de la ruta (línea 674) no selecciona `lienSignatures` en ningún momento.
Aunque se agregara el texto, no habría con qué llenar la firma.

> **Ojo con la captura:** es el caso **GM**-3264. Los casos GM **no llevan lien
> por diseño** (`intake-wizard.tsx:1826` — "Solo MVA lleva lien"), así que en ese
> PDF la ausencia es correcta. El faltante es en los MVA, y la sección tiene que
> ser **condicional por tipo de caso**, no fija.

## 3 · El texto del lien YA existe — y hay dos, que se contradicen

Esto es lo que bloquea el trabajo, y **no es una decisión técnica.**

**(a) El contrato canónico** — `apps/back-office/app/api/attorney/cases/[id]/lien/route.tsx`,
constante `LIEN_PARAGRAPHS`. Seis párrafos, el texto legal literal que pasó Erick el
25-ago-2026. Es el papel que el bufete descarga. Su docblock ya explica por qué vive
como constante y no en base de datos: cambiarlo es una decisión legal, y si se
pudiera editar desde una pantalla los documentos firmados y los nuevos dirían cosas
distintas sin rastro de cuál se firmó.

**(b) El texto que firma el paciente** — `apps/forms/app/c/[token]/intake-wizard.tsx`,
clave `lienLegalBody` (es/en). Cuatro viñetas, mucho más corto.

**Se contradicen en un punto que importa:**

- El que firma el paciente dice: *"Puedo retirar este consentimiento en cualquier
  momento mediante aviso escrito."*
- El párrafo 5 del canónico dice lo contrario: *"I agree to not rescind this
  document, and any attempted rescission will not be honored by my attorney."*

**Decisión de Erick antes de escribir una línea:** ¿qué texto va en el reporte de
intake? Y más de fondo: ¿cuál de los dos es el acuerdo que rige? Porque hoy el
paciente firma uno y el bufete recibe otro. **Yo no elijo esto.**

La respuesta cambia el trabajo:

- **Si va el canónico** → la sección son 6 párrafos, ocupa su propia página, y hay
  que decidir si el intake reproduce el contrato entero o lo referencia.
- **Si va el que firmó el paciente** → es corto, entra en la página 3, y es lo
  honesto: el reporte muestra lo que la persona efectivamente aceptó.
- **Si van los dos** → el reporte deja el desacuerdo por escrito, lo cual puede ser
  exactamente lo que NO se quiere en un documento que va al expediente.

## 4 · Los datos, cuando estén

Todo existe en la base; es solo agregarlo a la consulta:

```
lienSignatures: {
  select: { signerType: true, signerName: true, signerEmail: true,
            signatureSvg: true, signedAt: true },
  orderBy: { signedAt: 'asc' },
}
```

- `LienSignature.signerType` es un enum: `PATIENT | GUARDIAN | ATTORNEY | DOCTOR | CLINIC`.
- El **GUARDIAN** importa: un menor no firma, firma el apoderado, y el reporte tiene
  que decir *quién* firmó y *en representación de quién* — ya hay un `resolveGuardian`
  y el PDF ya trae una sección "Responsable Legal" en la versión HTML.
- `signatureSvg` es base64 PNG o path SVG. El PDF ya sabe pintar una firma
  (`consentSignaturePng`, C4), así que hay patrón que copiar.
- Puede haber **varias firmas del mismo tipo**; `case-detail-data.ts:192` ya
  desduplica por tipo quedándose con la última. Usar el mismo criterio, no inventar otro.

## 5 · La sección propuesta

- **Título**: `MEDICAL LIEN AGREEMENT` / `ACUERDO DE GRAVAMEN MÉDICO`, con el mismo
  estilo de `consentTitle` que los otros cinco.
- **Condicional**: solo si el caso es MVA. El criterio del sistema es
  `caseType === 'MVA'` (el wizard usa `acc.type === 'MVA'`; el PDF hoy tiene un mapa
  de etiquetas con `AUTO_ACCIDENT` — **hay que unificar cuál se mira**, porque son
  dos vocabularios distintos en el mismo archivo).
- **Ubicación**: después de C5, en su propia página. Es un contrato aparte, no un
  consentimiento más de la lista.
- **Firmas**: la del paciente (o del apoderado, dicho como tal) y la del abogado. Si
  el abogado no firmó, **decirlo explícitamente** — "Pending attorney signature" — y
  no dejar la línea en blanco: una línea vacía se lee como "acá no firma nadie", y
  este es el dato que el bufete persigue.
- **Exención**: `Case.signatureExempt` existe y significa que ese caso no requiere
  firma del abogado. Si está puesto, la sección tiene que decirlo, no mostrar
  "pendiente" para siempre.

## 6 · Lo que NO hay que hacer

- **No copiar y pegar `LIEN_PARAGRAPHS`.** Es el contrato vigente y duplicarlo
  garantiza que dentro de un año haya dos versiones distintas del mismo papel. Va a
  un módulo compartido, y las dos rutas lo importan.
- **No poner la sección en los GM.** Hoy la ausencia ahí es correcta.
- **No tocar el texto del wizard** para "alinearlo" con el canónico: eso cambia lo
  que los pacientes firman de acá en adelante y es decisión de Erick, no de una
  sesión de correcciones.

## 7 · Coordinación

Al 27-ago-2026 otra sesión está editando `calendar-client.tsx`,
`appointment-detail-panel.tsx`, `api/admin/admission/route.ts` y creó
`lib/appointment-outcome.ts` y `lib/appointment-style.ts`. Nada de eso se cruza con
los archivos de este plan (`cases/[id]/pdf/route.tsx`, `attorney/cases/[id]/lien/route.tsx`),
así que el trabajo se puede hacer sin esperarlas — **pero conviene reconfirmar el
`git status` antes de empezar**, porque la lista cambió tres veces en el día.

## 8 · Orden sugerido

1. Erick decide **qué texto** va (sección 3). Sin eso, lo demás es adivinar.
2. Extraer el texto elegido a un módulo compartido.
3. Agregar `lienSignatures` (+ `signatureExempt`) a la consulta del PDF.
4. La sección condicional por MVA, con las dos firmas y sus estados.
5. Unificar `caseType`: `'MVA'` contra `'AUTO_ACCIDENT'` en el mismo archivo.
6. Mirar aparte la "Información Legal" del `intake-print` en español.
