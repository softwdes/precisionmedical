# Guía — cargar los snippets de Medusa en v3

> Para quien va a pasar los snippets a mano. Medusa no exporta, así que se
> copian y pegan uno por uno. Una vez cargados, quedan para todos los providers.
> Fecha: 2026-09-05. Plan completo en `plan-settings-portal-snippets.md`.

## Dónde se cargan

Portal del provider → menú **Configuración** (izquierda) → bajo "Snippets por
sección" está cada título de la nota. Elegí el título que corresponde y tocá
**Nuevo snippet**.

Los snippets son **globales**: lo que cargás lo ven todos los providers. Cada
uno marca sus favoritos con la estrella, y esos le salen primero.

Solo un admin puede **eliminar** un snippet. Cualquier provider puede crear y
editar.

## Qué sección de Medusa va a cuál de v3

| En Medusa (My Settings) | En v3 (Configuración) |
|---|---|
| History of Presenting Illness | Historia de la enfermedad actual |
| ROS Other | Revisión por sistemas |
| PE Other | Examen físico |
| Assessment | Evaluaciones |
| Treatment Plan | Plan |
| Chief Complaint (si hay) | Motivo de consulta |

Las demás categorías de Medusa **no se cargan todavía**: Physician
Observations, Free Text, Nurse Note, Referral, Letter, Addendum, In-Office
Procedure, OrderSet, Coder, Fax. No tienen una sección de la nota donde caer.
Erick decide si entran y dónde.

**Templates** (la nota completa: BC-MVA, NG-MVA F/U…) ya están cargados. No
hace falta repetirlos.

## Cómo se pega uno

1. En Medusa abrí el snippet (el lápiz), hacé clic dentro del editor, **Ctrl+A**
   y **Ctrl+C**.
2. En v3, en la sección correcta, **Nuevo snippet**. Poné el **mismo título**
   que tenía en Medusa (ej. `Abdomen`, `BC - MVA HPI`), así los doctores lo
   encuentran por el nombre que ya conocen.
3. Hacé clic en el cuadro **Contenido** y **Ctrl+V**.
4. Revisá que se vea igual y tocá **Crear snippet**.

### Qué viene solo al pegar

- Negritas, listas, párrafos y saltos de línea.
- **Las casillas** ☐ de Medusa. Llegan como casillas de verdad; el doctor las
  marca en la nota.
- **Los cuadritos para escribir** (Started: ▭, Last filled: ▭). Llegan como
  campos en blanco; el doctor escribe adentro en la nota.
- Los **campos del paciente** que Medusa escribe entre corchetes:
  `[Patient Name]`, `[Age]`, `[DOB]`, `[Sex]`, `[Phone]`, `[Insurance Details]`.
  Se convierten en un chip violeta. Cuando el doctor usa el snippet en una
  nota, el chip se reemplaza por el dato real del paciente.

### Qué se limpia a propósito

Fuentes, tamaños, colores y estilos de Medusa. El snippet toma la letra de v3.
Si en Medusa había una tabla, llega como texto en el mismo orden.

### Si algo no vino

- **Falta una casilla:** en la barra del editor hay un botón de casilla (☑) y
  uno de campo en blanco (▭). Poné el cursor donde va y tocá el botón.
- **Falta un campo del paciente:** a la derecha de la barra está el selector
  "Campo del paciente…". Poné el cursor y elegí el campo.
- **Se pegó como texto sin formato:** pasa si copiaste desde la vista de lista
  de Medusa y no desde adentro del editor. Volvé al paso 1.

## Cómo lo va a usar el doctor

En la nota, cada sección tiene a la izquierda su lista **Snippets
disponibles** con un buscador, igual que en Medusa. El doctor pone el cursor
donde quiere, hace clic en el snippet y el texto se agrega ahí. Puede apilar
varios. Después edita lo que haga falta: marca casillas, completa los blancos,
borra lo que no aplica. Lo que queda en la nota es lo que se imprime.

El botón **Snippets** en la barra de la nota oculta o muestra las listas.

## Para verificar que quedó bien

Abrí una cita de prueba, en la sección elegí el snippet nuevo y mirá que:

- se agregue donde estaba el cursor y no reemplace lo que había;
- las casillas se marquen con un clic y se pueda escribir en los blancos;
- los campos del paciente muestren el nombre, la edad y demás del paciente de
  esa cita.
