# Auditoría del tablero actual vs. «Armar el día»

Qué se queda, qué se reemplaza y qué se junta. Es una lectura del código (no hay datos de uso),
así que lo marcado «confirmar» se valida con el jefe de producción antes de borrar.

## Lo que existe hoy

**Estación de Tareas** (`views/production/TasksByTable.js`, 3 765 líneas, 56 `useState`, 2 modales propios más 5 de detalle)
- Resumen del día (6 contadores) + 3 vistas: *Operación del día*, *Cronograma*, *Redistribuir*.
- 10 botones de encabezado: Cuero, Materiales, Guía rápida, Hoja PDF, Hoja Excel, Descargar OPs, Encargados, Actualizar, Planificar hoy, y la vista.
- Filtros: chips de jornada, buscador, 4 atajos (Hoy/Atrasadas/OPL/Sin mesa), selects de Mesa/Fecha/Estado, «lista detallada» (14 columnas).
- Operación: sin asignar, listas sin mesa, por cortar, carga por mesa, pendiente de bodega PT.
- Cronograma: por fecha y mesa, más tablero de cinchos.
- Banner «Cómo fluye una tarea» (ahora con el botón «Armar el día»).

**Organizador** (`TaskOrganizer.js`, 5 pestañas)
1. Armar: buscador de OPs + borrador (carrito) + cola del día con «Planificar».
2. Por troquelar. 3. Tablero de mesas (arrastrar). 4. Atrasadas (backlog). 5. Sin terminar.

## Clasificación

### Se queda (es operación real, nadie más lo cubre)
| Pieza | Por qué |
|---|---|
| Por troquelar / marcar corte (`DieCutListPanel`) | El corte dispara la asignación de mesa; sin esto no hay mesa. |
| Tablero de mesas con arrastrar (`RedistributeBoard`) | Único lugar para mover trabajo entre mesas después del corte. |
| Entrega de cuero, Iniciar / Completar en mesa | Es la ejecución diaria. |
| Hoja del día PDF / Excel, ticket de tarea | Lo que baja a piso. |
| Encargados de mesa | Entra en la hoja. |
| Venta del día (agregar OPL a una tarea) | Flujo propio de OPL. |
| Cinchos del día (`CinchosDayBoard`) | Producción distinta, no es parte de las tareas de mesa. |
| Atrasadas y Sin terminar | Control de trabajo vencido. (Se juntan, ver abajo.) |
| Detalle de tarea | Concentra campos que la tarjeta no muestra. |

### Lo reemplaza «Armar el día» (retirar)
| Pieza | Reemplazo |
|---|---|
| `DraftTaskPanel` + `OrganizerOrderBrowser` (carrito manual) | Paso 1 y 2: elegir qué va hoy por producto, con capacidad por mesas. |
| `DayQueuePanel` (cola del día + «Planificar») | Orden de marcado = prioridad; «Llenar el día». |
| Botón «Planificar hoy» de la Estación (plan automático) | **Confirmar**: si el jefe quiere conservar el plan automático, queda como botón dentro de «Armar el día»; si no, se retira. |
| Banner «Cómo fluye una tarea» y Guía rápida | Se reescriben cortos; el flujo ya es una pantalla. |

### Se junta o se simplifica
| Hoy | Propuesta |
|---|---|
| *Redistribuir* (Estación) y *Tablero de mesas* (Organizador) | **Duplicado**: es el mismo `RedistributeBoard`. Dejar uno solo. |
| *Operación del día* y *Cronograma* (ambos listan tareas por día/mesa) | Una sola vista: el tablero del día. |
| *Lista detallada* de 14 columnas | Quitar de pantalla; si alguien la usa, es una exportación. |
| Atrasadas + Sin terminar | Una sola lista «Atrasadas». |
| 4 atajos + 3 selects + chips + buscador | Chips de jornada + buscador + un select de Mesa. |
| Cuero, Materiales, Descargar OPs, Guía, Actualizar | Menú «Más» (son navegación o ayuda, no el flujo). |
| 6 contadores del resumen | 4: Esperan troquel, Listas sin mesa, En proceso, Atrasadas; las horas del día pasan a la barra de capacidad. |

### Confirmar con el jefe antes de decidir
- *Descargar OPs* (modal): ¿se usa?
- *Cronograma* y *Lista detallada*: ¿alguien trabaja ahí o solo miran?
- *Esperando bodega PT*: ¿sigue en este tablero o es de bodega?
- ¿Se conserva el plan automático (`Planificar`) o todo pasa por «Armar el día»?

## Estructura propuesta

Tres destinos en vez de dos pantallas con ocho vistas:

1. **Armar el día** (antes del corte): elegir OPs/productos → armar → revisar → confirmar.
2. **Tablero del día** (después de confirmar): una pantalla con
   - franja superior: barra de capacidad del día (la misma de Armar el día) + 4 contadores;
   - columnas: *Por cortar* · *Sin mesa* · *Mesa 1…N* (arrastrar para mover);
   - acciones en la tarjeta: Entregar cuero, Marcar corte, Iniciar, Completar;
   - chips de jornada, un buscador, un select de Mesa; el resto en «Más».
3. **Atrasadas**: una lista (Atrasadas + Sin terminar).

## Cómo retirarlo sin riesgo
1. Confirmar la lista de arriba con el jefe.
2. **Ocultar, no borrar**: las piezas «retirar» salen del menú y de las pestañas; el código queda una semana.
3. Construir el Tablero del día reutilizando `RedistributeBoard`, `DieCutListPanel` y las acciones existentes.
4. Pasada la semana sin reclamos, borrar código muerto. Los servicios del back (plan automático, asignador de mesas) **no se tocan**: los usan el corte y el reparto.
