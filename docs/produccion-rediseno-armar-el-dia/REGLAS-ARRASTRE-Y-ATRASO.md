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

## Preguntas abiertas para producción
1. ¿Se marca cada producto como terminado, o solo se completa la tarea entera?
2. ¿Hay tolerancia (p. ej. 10 %) antes de marcar atraso, o es exacto?
3. ¿El atraso se mide solo en horas de jornada? (propuesto: sí, la noche y el almuerzo no cuentan)
4. ¿Un producto atrasado pierde la comisión completa o solo del excedente?
5. ¿Quién aprueba excepciones (falta de material, falla de máquina)?
