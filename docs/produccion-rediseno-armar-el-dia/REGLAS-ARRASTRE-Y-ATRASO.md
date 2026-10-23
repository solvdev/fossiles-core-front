# Arrastre, pausa, atraso y comisión de tareas (reglas confirmadas por el usuario)

Implementado en el back (`TaskWorkflowService`) y en el tablero de mesas del front. La regla de atraso
vive en **un solo punto** del back: `TaskWorkflowService.evaluateDelay`.

## Jornada
Lunes a viernes, 07:00–17:00, almuerzo 13:00–14:00 (9 h efectivas). Es la de `ProductionShift.java`
y `productionTimeHelper.js`; no cambia.

## Arrastre
Una tarea que no termina en el día sigue al siguiente con el tiempo que le falta (empieza 16:00 y
dura 3 h → 1 h hoy, 2 h mañana). Ese tiempo resta de la capacidad del día siguiente. Al día
siguiente se le pueden **agregar productos** a la misma tarea (`POST /tasks/{id}/items`).

## Atraso: por TAREA, no por producto
No hay forma de saber cuánto tarda cada producto dentro de una tarea, así que se mide la tarea completa.
- **Esperado** = suma de las horas de todas las líneas de la tarea (cantidad × tiempo por unidad),
  OPL combinadas incluidas.
- **Trabajado** = minutos de jornada de los tramos iniciar → pausar/completar. No cuentan noches,
  almuerzo, fines de semana ni el tiempo en pausa.
- **Atrasada** si trabajado > esperado + **30 min** (tolerancia fija; no es configurable).
- Se fija al completar y **no se revierte**, aunque después se cargue más trabajo.
- Las tareas 100 % OPL nunca se atrasan (salen el mismo día por ser venta en línea del día).

## Comisión
Si la tarea se atrasa, **la tarea entera deja de ser comisionable** (todos sus productos).
`commissionEligible` solo marca la elegibilidad; todavía no existe cálculo ni pago de comisión de producción.
Excepción: el **jefe** (rol ADMIN en el back) puede **perdonar el atraso** con motivo; queda quién,
cuándo y por qué, y la tarea vuelve a ser comisionable (`POST /tasks/{id}/forgive-delay`).

## Pausar y cancelar
- **Pausar / reanudar** con motivo (`PUT /tasks/{id}/pause`, `/resume`): el reloj se detiene.
- **Cancelar** con motivo (`PUT /tasks/{id}/status` con `status=CANCELLED` y `reason`): la tarea sale de
  la mesa, sus productos vuelven a «no asignado» y la OP regresa a PENDING si no tiene otras tareas.
- **Historial** de todo lo que pasa: `GET /tasks/{id}/history` (tabla `task_event`, solo se agrega).

## OPL
Las OPL tienen prioridad. Si caben en el tiempo libre de una mesa ese día (9 h − horas base de la mesa),
se combinan como **primera línea** de la tarea de esa mesa; si no caben, van como tarea aparte.
Una OPL lenta puede atrasar la tarea combinada: no se puede separar el tiempo de cada parte.

## Pendiente
- Cálculo/pago de la comisión de producción (hoy solo existe la bandera).
- Reparto de tiempo por producto, si algún día se marca terminado cada producto por separado.
