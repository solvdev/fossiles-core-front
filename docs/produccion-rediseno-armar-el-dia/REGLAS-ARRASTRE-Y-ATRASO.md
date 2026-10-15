# Arrastre de tareas y atraso por producto (borrador, falta validar con el back)

## Reglas que dio producción
1. **Jornada**: lunes a viernes, 07:00–17:00, con almuerzo de 13:00 a 14:00 (9 h efectivas).
   Confirmado por producción; coincide con `productionTimeHelper.js` y `ProductionShift.java`. No se cambia.
2. **Arrastre**: una tarea que no termina en el día sigue al siguiente con el tiempo que le falta.
   Ejemplo: empieza 16:00 y dura 3 h → 1 h hoy, 2 h mañana. Mañana se le pueden agregar productos.
3. **Capacidad**: el tiempo arrastrado resta de la capacidad del día siguiente.
4. **Atraso por producto**: un producto que tarda más que su tiempo establecido
   (cantidad × tiempo por unidad, medido en horas de jornada, sin noches ni almuerzo) queda
   **atrasado** y **no puede llevar comisión**.
5. Los productos agregados al día siguiente a una tarea arrastrada **no heredan** el atraso de los
   del primer día: su tiempo esperado empieza cuando se agregan.

## Lo que ya existe en el front (se reutiliza)
- `addWorkingTime(inicio, horas)`: fin esperado respetando almuerzo, cierre y fin de semana.
- `workingMinutesBetween(inicio, fin)`: tiempo real de jornada entre dos momentos (la noche no cuenta).
- La boleta ya calcula «entrega esperada» y marca entrega tardía a nivel de **tarea** (`isLateDelivery`).
- Falta: el atraso a nivel de **producto**, y cualquier regla de comisión (no hay nada de comisión de producción en el front).

## Modelo propuesto (a confirmar con lo que responda el back)
- Por producto de la tarea: `expectedMinutes`, `expectedEndAt`, `addedAt`, `delayMinutes`,
  `delayed` y `commissionEligible = !delayed`.
- Esperado por producto en una tarea con varios: **secuencial acumulado** desde su `addedAt`
  (cada producto arranca cuando termina el anterior); si el trabajador no los hace en orden,
  se mide contra la hora de fin del producto (requiere que se marque por producto).
- Se calcula **al completar** el producto o la tarea, con la misma regla de jornada que el front.
- Arrastre: al cierre del día, la tarea abierta conserva su `startedAt` y el tiempo trabajado; el
  día siguiente el planificador descuenta `restante = estimado − trabajado` de la capacidad.

## Respuestas de producción
1. **Cada producto se marca terminado por separado.** Un producto que pasa al día siguiente sigue
   siendo válido para comisión si no excede su tiempo. A esas tareas arrastradas normalmente se les
   combinan líneas de **OPL** para que la persona asignada no se quede sin trabajo ese día.
2. **Tolerancia: 30 minutos.** Un producto que pasa más de media hora de su tiempo establecido
   pierde la comisión; hasta 30 min de exceso no se marca atraso.
3. **Se pierde la comisión de «toda la tarea»** (ver la pregunta abierta de abajo).
4. **Las excepciones las aprueba el jefe de producción** (falta de material, falla de máquina, etc.).

## Regla resultante (borrador)
- Por producto: `esperado = cantidad × tiempo por unidad` (horas de jornada). Atrasado si
  `real > esperado + 30 min`. El real corre desde que arranca ese producto hasta que se marca terminado.
- Un producto agregado al día siguiente a una tarea arrastrada arranca su reloj al agregarse y no
  hereda el atraso de los anteriores.
- Las líneas OPL combinadas no consumen cupo de mesa (regla existente de `daySaleExtra`).
- **Excepción**: el jefe de producción puede perdonar un atraso con motivo escrito. Queda
  registrado quién, cuándo y por qué; solo con el permiso del jefe. Al perdonar, vuelve a ser elegible.

## Pregunta abierta
«Toda la tarea» puede significar dos cosas distintas:
- **A)** Si un producto se atrasa, **todos los productos de esa tarea** pierden la comisión.
- **B)** Se pierde la comisión **completa de ese producto** (no solo del exceso), pero los demás conservan la suya.

La regla 5 (los productos agregados al día siguiente no heredan el atraso) solo cuadra con **B**.
Con **A** habría que decidir si esos productos agregados también pierden la comisión.
