# Encargo para el back: «Armar el día» (vista previa y confirmar)

Para pegar en una sesión nueva abierta sobre el repo **`fossiles-core-back`** (solvdev/fossiles-core-back), en la nube.

## Objetivo
El front de «Armar el día» ya está escrito (rama `feature/armar-el-dia` de `fossiles-core-front`, pantalla `src/views/production/dayplanner/`). Falta el back: dos endpoints nuevos que validan y crean las tareas del día en un solo paso. Diseño completo y razones en `fossiles-core-front/docs/produccion-rediseno-armar-el-dia/README.md` (§3 a §5).

## Rama
Crear `feature/armar-el-dia` **desde `origin/develop`** (no desde el `develop` local, que puede estar viejo, ni desde `main`). Sin migración SQL en esta fase. No hacer push a `develop`; el usuario mezcla. No commitear nada que no sea de esta tarea.

## Reglas que no se pueden romper (ya existen; se reutilizan)
- OPL (`VENTA_EN_LINEA` o código `OPL-*`) va primero y **no cuenta contra el límite** (`ProductionPlanningConstants.isOnlineSaleOrder`, `ProductionOrderPlanPriority`: OPL=0, OPCK=1, manual 2..99, resto 100).
- Límite por tarea: 4 h ideal (`MAX_HOURS_PER_DESK_PER_DAY`) y **5 h tope duro** (`MAX_HOURS_PER_TASK_HARD_CAP`), validado hoy solo en `TaskOrganizerService.createTask` (~`:407`) sobre horas base. Sobre 5 h no se crea.
- Una tarea no mezcla OPs base distintas (solo extras OPL). Solo lunes a viernes. Cinchos (OPC) fuera.
- **Compuerta del corte:** toda tarea manual nace con `die_cut_ready = false` (`createTask ~:434`) y no baja a mesa hasta marcar el corte; `TaskDeskAssignerService.place` le da mesa entonces. Por eso `confirm` **guarda `scheduled_date` y deja `desk = NULL`** (igual que el autoplan, `ProductionAutoPlannerService:460-467`). La mesa que devuelve la vista previa es **orientativa**.
- **No tocar** `plan-window`, `auto-plan` ni `TaskDeskAssignerService` en esta fase.

## Endpoints (`/api/tasks/organizer/day-plan/...`, controlador nuevo `TaskDayPlanController`)
No engordar `TaskController` (2 874 líneas). Rutas literales; mensajes de error en español.

### `POST /preview` (solo lectura, no guarda nada)
Request (lo que ya manda el front, `utils/dayPlanHelper.js › buildDayPlanPayload`):
```json
{ "anchorDate": "2026-10-15", "horizonDays": 5,
  "orderPriorities": { "12": 2, "15": 3 },
  "tasks": [ { "clientId": "t1", "productionOrderId": 5, "scheduledDate": null, "observations": null,
               "items": [ { "productionOrderItemId": 51, "quantity": 8, "daySaleExtra": false } ] } ] }
```
- `scheduledDate` null → el sistema propone día; con valor → se calcula la mesa para ese día.
- `orderPriorities` (solo OPs no OPL, valores 2..99) se usan para ordenar el reparto; **la vista previa no las guarda**.

Response (lo que lee el front, `StepReview.js` y `useDayPlanner.js`):
```json
{ "asOf": "2026-10-15T09:30:00", "planFingerprint": "…",
  "limits": { "idealHours": 4, "maxHours": 5, "numDesks": 12 },
  "tasks": [ { "clientId": "t1", "status": "OK|WARN|BLOCKED", "messages": ["…"],
               "baseHours": 4.0, "totalHours": 4.0, "overcapAnchor": false,
               "proposedDate": "2026-10-15", "nextDayCandidate": null, "indicativeDesk": 3 } ],
  "dayLoads": [ { "date": "2026-10-15", "desk": 1, "currentHours": 3.5, "addedHours": 0.5 } ],
  "notPlaced": [ { "clientId": "t9", "reason": "…", "nextDayCandidate": "2026-10-19" } ],
  "blocked": false }
```
- `blocked = true` si alguna tarea es BLOCKED (sobre 5 h, ítem sin restante suficiente, fin de semana, OP cincho/borrador…). El front bloquea «Confirmar» con eso.
- `limits.numDesks` sale de `ProductionDeskCountService.getDay(date)` (no de `system_config`, que `TaskController.getNumDesks :2260` lee mal).
- Usar el **restante acumulado por ítem** entre borradores (un ítem puede partirse en dos tareas).
- WARN: falta de cuero (`canCover`, como el autoplan), mesa que quedaría sobre 4 h, OPL/OPCK que pasan del cupo el día ancla (`canOvercapDeskDay`, solo informativo).

### `POST /confirm`
Mismo request más `planFingerprint` (obligatorio) y `acceptChanges` (opcional).
Response 200:
```json
{ "created": [ { "clientId": "t1", "taskId": 901, "code": "TK-00501", "scheduledDate": "2026-10-15", "indicativeDesk": 3 } ],
  "notPlaced": [] }
```
Errores 409 (el front los distingue por `code`): cuerpo `{ "code": "PLAN_CHANGED|QTY_UNAVAILABLE|LOCK_TIMEOUT", "message": "…", "failures": [ { "clientId": "…", "message": "…" } ], "preview": { … } }`.
- `PLAN_CHANGED`: el `planFingerprint` ya no coincide (carga de mesas, restantes de ítems o prioridades cambiaron). Devolver `preview` nuevo. Con `acceptChanges=true` se aplica igual.
- `QTY_UNAVAILABLE`: alguien más tomó unidades.
- `LOCK_TIMEOUT`: no se consiguió el bloqueo a tiempo.

## Diseño del servicio (`DayPlanService`, nuevo) — hallazgos de la revisión técnica
1. **Rollback:** `BusinessException` es checked y `@Transactional` no revierte por defecto. Usar `@Transactional(rollbackFor = Exception.class)` (patrón en `TaskController.java:1037`) y lanzar una `RuntimeException` propia (`DayPlanConflictException`) con los fallos por tarea. Todo o nada.
2. **Orden fijo de bloqueos** (evita interbloqueo con `createManualTask`): `productionPlanningLock.acquire()` → `ProductionOrderItemRepository.findAllByIdForUpdate` de **todos** los ítems, ordenados → crear tareas. `SET LOCAL lock_timeout='5s'` → 409 `LOCK_TIMEOUT`.
3. **`planFingerprint`:** hash de cargas por día/mesa + restantes de los ítems + prioridades. Da consistencia vista previa↔confirmar e **idempotencia** (doble clic no duplica).
4. **Dividir `TaskOrganizerService.createTask` (`:260-454`)** en `prepareDraft(request, mode, lockItems)` (validación sin persistir, `:264-413`) y la persistencia (`:415-453`). La vista previa usa `findAllById` sin `FOR UPDATE`. Mantener intacto el comportamiento de `createManualTask`.
5. **Mesa orientativa:** simular sobre las cargas actuales del día (como `TaskDeskAssignerService.place :97-121`) **más las PENDING sin mesa** (mesas virtuales, como `ProductionAutoPlannerService.loadDayLoads :676`, excluyendo cinchos), en orden `ProductionOrderPlanPriority.comparator()` con las prioridades recibidas. **Desempate determinista** (mesa menor): `DeskSlotFinder.pickDeskOnDay` desempata al azar; agregar una variante determinista sin cambiar la existente. Lo que no cabe en el día pasa al siguiente hábil dentro de `horizonDays` (mesas **por día**, `getDay(fecha)`); si no cabe en el horizonte, `notPlaced` con `nextDayCandidate`.
6. **IN_PROGRESS:** contar con `TaskDeskHoursService.remainingDeskHours` y un solo `asOf` devuelto en la vista previa; las de días previos se pliegan al primer día hábil.
7. **Prioridades:** `orderPriorities` se guardan en `confirm` bajo el candado con `mergeSchedulingPrioritiesFromRequest` (`TaskController.java:~2823`; mover el rango 2..99 a `ProductionPlanningConstants`). No usar `PUT /day-queue` (es global y dos jefes se pisarían).
8. **Observaciones:** no pueden empezar por «Auto-plan» (`isAutoPlanObservation`, `ProductionAutoPlannerService:255` haría que `regenerate` borre la tarea).
9. **`confirm` devuelve un DTO ligero** (el `toResponse` de `TaskController` es privado); el front pide `GET /api/tasks/date/{d}` para armar la hoja.

## Otros cambios
- `OrganizerItemResponse`: añadir `unitsPerTask` (`ProductEntity.unitsPerTask`, columna `units_per_task`) para que el front respete las unidades por tarea.
- **Cachés:** el `preview` es un POST bajo `/api/tasks/**` y `ProductionCenterCacheInvalidator` vaciaría cachés en cada pulsación → excluirlo. Tras `confirm` limpiar también la lista de OPs (la OP pasa a IN_PROGRESS). Ampliar `ProductionCenterCacheInvalidatorTest`. (`OnlineSalesCacheInvalidator` no existe todavía en `origin/develop`; ignorarlo.)
- Sin permisos nuevos: se reutiliza la autenticación vigente.

## Pruebas (JUnit + Mockito, como `TaskDeskHoursServiceTest`)
- `DayPlanServiceTest`: la vista previa no persiste; confirmar es todo o nada; tope 5 h; OPL primero; sábado/domingo; ítem repartido en dos tareas; las PENDING sin mesa cuentan carga; huella distinta → `PLAN_CHANGED`; `acceptChanges`; doble confirmación no duplica.
- `TaskOrganizerServiceCreateTaskTest` (hoy **no existe** prueba del tope de 5 h): tope, OP base única, OPL como extra, restante, cinchos rechazados, comportamiento intacto tras dividir `createTask`.
- `DeskSlotFinderTest`: variante determinista; la existente no cambia.
- Aviso: `TaskDieCutTest` hace `Assumptions.abort` sin datos y `build.gradle:105-117` fuerza H2 sin `pg_advisory_xact_lock`; esas pruebas no sirven de red de seguridad. Si se puede, una prueba de concurrencia con Testcontainers Postgres (como `CustomerAccountLedgerConcurrencyTest`): dos `confirm` sobre el mismo ítem → uno recibe 409; `confirm` contra `createManualTask` en paralelo → sin interbloqueo; una tarea inválida → ninguna creada y la serie TK sin avanzar.

## Hecho cuando
- Los dos endpoints responden con el contrato de arriba y las pruebas nuevas pasan (`./gradlew test --tests '*DayPlan*' --tests '*CreateTask*' --tests '*DeskSlotFinder*'`), sin romper las que ya pasaban.
- Un recorrido a mano contra una base de pruebas: vista previa → confirmar → las tareas aparecen en `GET /api/tasks/date/{fecha}` con `desk = null`, `die_cut_ready = false` y la fecha elegida.
- Resumen final con qué se probó, qué no, y cualquier decisión que se haya tomado distinta a este encargo.

## Ajuste v2: capacidad por mesas activas (prioridad alta)

1. La capacidad de una fecha = mesas activas de ESA fecha (`GET /production/desks-count?date=` ya
   existe y el front lo usa) × 4 h ideales / × 5 h tope, menos las horas base ya planificadas.
2. `preview` devuelve `capacity { date, activeDesks, idealHoursPerDesk, hardHoursPerDesk,
   plannedHours, totalHours, remainingHours }`. El front ya calcula lo mismo para llenar el día,
   pero el back manda: si difieren, gana el back.
3. `confirm` responde **409 con `code: "CAPACITY_EXCEEDED"`** y el detalle (capacidad, planificado,
   exceso) si las horas base del plan + lo planificado pasan de mesas × 5 h. El front ya maneja ese código.
4. Parcial por producto: `quantity` de cada ítem puede ser menor que `remainingQuantity`.
5. Listado de OPs ligero (resumen: código, cliente, entrega, horas totales/restantes, #productos)
   y un endpoint para traer los productos de UNA OP al abrirla, paginado.

## Ajuste v3 (implementado en el back: rama feature/armar-el-dia de fossiles-core-back)

**Migración SQL (correr ANTES del binario):** `scripts/migration-task-delay-commission.sql` del back
(columnas nuevas en `task` y tabla `task_event`; las tareas existentes quedan comisionables).

**Reparto**
- `preview.capacity` / `capacities[]`: `date, activeDesks, idealHoursPerDesk, hardHoursPerDesk, plannedHours, totalHours, remainingHours, requestedHours, excessHours` (mesas activas de la fecha × 5 h; OPL no cuentan).
- `confirm` → 409 `CAPACITY_EXCEEDED` (con `capacity[]`) si el plan + lo planificado pasa de mesas × 5 h. 422 `PLAN_BLOCKED` si hay tareas inválidas.
- Lo que no cabe en el horizonte **no se crea**: `notPlaced[]` + `leftovers[]` (por ítem con cantidad).
- OPL: si caben en el tiempo libre de una mesa (9 h − horas base de esa mesa/día) se combinan como **primera línea** de esa tarea (`tasks[].mergedInto` en la OPL, `includes[]` en la anfitriona; en `confirm.created[]` la OPL trae `mergedInto` y el mismo `taskId`). Si no caben, van como tarea aparte.
- `GET /api/tasks/organizer/day-plan/orders` (resumen sin ítems) y `/orders/{id}/items` (ítems de una OP, paginados).

**Flujo de la tarea**
- Atraso por **tarea**: trabajado (sin pausas, noches ni almuerzo) > esperado (suma de todas las líneas, OPL incluidas) + 30 min fijos → `delayed`, `commissionEligible=false` para toda la tarea. Las tareas 100 % OPL nunca se atrasan.
- `PUT /tasks/{id}/pause {reason}`, `PUT /tasks/{id}/resume`, cancelar con `PUT /tasks/{id}/status {status:"CANCELLED", reason}` (motivo obligatorio; libera mesa y unidades), `POST /tasks/{id}/forgive-delay {reason}` (solo ADMIN), `POST /tasks/{id}/items [{productionOrderItemId, quantity}]`, `GET /tasks/{id}/history`.
- Campos nuevos en la tarea: `pausedAt, expectedMinutes, delayMinutes, delayed, commissionEligible, delayForgivenBy/At/Reason`.

## Rendimiento del Tablero: `GET /api/tasks/board?date=YYYY-MM-DD`
Hoy el tablero pedía `GET /tasks` (todas las tareas) y `GET /production-orders` (más de 30 s con 1.266 órdenes).
Contrato nuevo, ya consumido por el front con respaldo (si responde 404/405/501 usa el listado completo):
```
{ "date": "2026-10-15",
  "tasks": [ TaskResponse con items ],            // activas (no CANCELLED/COMPLETED): scheduledDate == date,
                                                  // más las activas sin mesa con scheduledDate nula o <= date.
                                                  // Sin tareas/líneas de cinchos (el servidor las excluye).
  "counts": { "dieCutPending": n, "backlog": n, "unfinished": n } }   // solo COUNT, para las pestañas
```
Una consulta indexada (scheduled_date / desk / status) + items en lote, sin N+1 y sin recorrer órdenes. Objetivo < 500 ms.
Los listados de Por cortar, Atrasadas y Sin terminar se piden solo al abrir su pestaña; las órdenes de producción solo
al usar Hoja PDF/Excel, Descargar OPs o Cinchos del día.
