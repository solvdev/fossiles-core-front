# Rediseño de «Crear y asignar tareas» → **Armar el día**

Centro de Producción · FOSSILES CORE · documento de diseño (15/10/2026)

> **Qué es esto.** Propuesta de diseño para validar con el jefe de producción **antes de programar**. No cambia la aplicación. Acompaña a este documento el prototipo clicable [`prototipo.html`](./prototipo.html) (ábralo en el navegador; no necesita servidor).
>
> **Cómo se hizo.** Todo lo que se dice del sistema actual sale de leer el código del front (`fossiles-core-front`) y del back (`fossiles-core-back`); no se ejecutó nada contra producción. Las rutas `archivo:línea` son de esa lectura.

## Resumen

- **Hoy** el jefe pasa por **2 pantallas, 8 vistas internas y 7 modales** y necesita entre **10 y 15 clics por tarea**. Hay **dos botones** que «planifican» («Planificar hoy» y «Distribuir el día») y la hoja del día está en otro lugar.
- **Propuesta recomendada («Una página, cuatro pasos»):** una sola pantalla con **Elegir OPs → Armar tareas → Revisar → Confirmar y descargar hoja**. Las OPL van fijas arriba con marca de prioridad. El paso 2 **llega ya armado** (el sistema sugiere el agrupamiento ≤ 4 h por tarea) y el jefe solo ajusta. Cada tarea muestra una barra frente al límite (verde / ámbar / rojo) y **no se puede confirmar si pasa de 5 h**.
- **Camino rápido: 4 clics** hasta «tareas asignadas» (+1 para bajar la hoja).
- **Ninguna regla se quita:** prioridad OPL, límite por tarea/mesa (4 h ideal, 5 h tope, las OPL no cuentan), reparto automático, hoja descargable, lunes a viernes, una OP base por tarea y la compuerta del corte.

---

## 1. Diagnóstico: problemas de usabilidad del flujo actual

| # | Problema | Evidencia |
|---|---|---|
| 1 | El flujo está partido en **dos pantallas hermanas** y 8 vistas internas: Centro (Operación, Cronograma, Redistribuir) + Organizador (5 pestañas) + 7 modales. Enlaces que mandan de una a otra. | `TasksByTable.js:324,1822-1853`; `TaskOrganizer.js:19,74-137`; `TasksByTable.js:2179-2183` |
| 2 | **Dos botones para «planificar»**: «Planificar hoy» (amarillo, crea tareas automáticas) y «Distribuir el día» (reparte las pendientes). No queda claro cuál usar. | `TasksByTable.js:1983-1999`; `DayQueuePanel.js:167-174` |
| 3 | **El orden de la pantalla no sigue el orden mental del jefe.** La prioridad es una casilla suelta («cola del día») y un panel lateral. La OPL va primero solo «por debajo» (prioridad 0) y no tiene marca visible. | `OrganizerOrderBrowser.js:289-300`; `ProductionOrderPlanPriority.java` |
| 4 | **Muchos clics por tarea (10–15):** expandir la OP, cantidad + «Agregar» por cada producto, fecha, «Crear tarea», marcar corte, planificar, ir al cronograma, imprimir. | `OrganizerOrderBrowser.js:63-175`; `DraftTaskPanel.js` |
| 5 | **El límite solo se ve dentro de una tarea**, no el efecto sobre el día. La barra va a escala de 5 h con una rayita en 4 h, difícil de leer. Las reglas (una OP base por tarea; OPL como extra) se descubren por error. | `DraftTaskPanel.js:38-87`; `useTaskOrganizer.js:281-288` |
| 6 | **Saltos inesperados:** al crear la tarea la pantalla salta sola a «Por troquelar». | `TaskOrganizer.js:175-183` |
| 7 | **La mesa se ve «después»:** el listado dice «sin mesa todavía»; para verla hay que ir a «Tablero» o a «Cronograma». No hay vista previa antes de repartir. | `OrganizerOrderBrowser.js:84-94` |
| 8 | **Sobrecarga de información:** ~12 botones en 4 grupos, un banner de 4 pasos («Cómo fluye una tarea»), tres paneles siempre visibles, ~60 `useState` en un archivo de 3 762 líneas. El filtro ofrece 6 familias cuando el jefe piensa en 2 grupos (OPL / las demás). | `TasksByTable.js:1816-2001, 2173-2191`; `OrganizerOrderBrowser.js:225-231` |
| 9 | **La hoja del día está lejos:** vive en el Centro, grupo «Ayuda» (Hoja PDF, Hoja Excel, Descargar OPs), desconectada de la creación. El PDF es impresión del navegador. | `TasksByTable.js:1900-1946, 1382-1394` |
| 10 | **«Distribuir» reacomoda TODAS las pendientes con corte** (no solo las nuevas), pisa los días que se habían elegido y no tiene vista previa. | `TaskController.java:712, 815` |
| 11 | El servidor solo valida el tope de 5 h **por tarea**; no valida la carga del día ni que la mesa exista, y `createTask` con mesa ignora la compuerta del corte. | `TaskOrganizerService.java:407-413, 430` |
| 12 | Toda tarea manual **nace sin corte** y no baja a mesa hasta marcarlo en «Por troquelar»; el jefe no lo ve venir. | `TaskOrganizerService.java:434` |

### Conteo de clics hoy (un día típico, 1 tarea nueva)
Cambios de ruta: 2–3 · cambios de pestaña/vista: 4–5 · clics mínimos: 10–15 por tarea (+1 por cada producto adicional).

## 2. Tres propuestas de diseño

### Propuesta A — «Una página, cuatro pasos» (asistente en acordeón)
```
┌ Armar el día ───────── [Hoy ▾ 15/10] ───────── [⬇ Hoja del día] ┐
│ ① Elegir OPs        ✔ 5 OPs marcadas                 [Cambiar]   │
│ ② Armar tareas      ✔ 4 tareas · 13.5 h              [Cambiar]   │
│ ┌ ③ Revisar ──────────────────────────────────────────────────┐ │
│ │ (paso abierto: tareas con propuesta de día y mesa)           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ④ Confirmar y descargar hoja                                     │
│ [  ← Volver  ]                         [ CONFIRMAR Y REPARTIR ]  │
└──────────────────────────────────────────────────────────────────┘
```
**Pros:** es exactamente el flujo lineal pedido; un solo paso abierto = poca información; el jefe siempre sabe dónde está. **Contras:** volver atrás exige reabrir un paso; para un experto el acordeón se siente algo más lento.

### Propuesta B — «Tablero de dos columnas» (pendientes → tareas)
```
┌ OPs pendientes ───────────┬ Tareas del día ─────────────────────┐
│ ★ OPL-0042  (prioridad)   │ Tarea 1 ▓▓▓▓▓░ 3.6 h / 4 h           │
│ ★ OPL-0043                │ Tarea 2 ▓▓░░░░ 1.5 h / 4 h           │
│ OPCK-0107 ...             │ + Nueva tarea                         │
│ OPV-0220 ...  [→ tarea]   │ [Confirmar]  [⬇ Hoja]                 │
└───────────────────────────┴───────────────────────────────────────┘
```
**Pros:** se ve todo a la vez; arrastrar y soltar es directo; bueno para quien arma muchas tareas. **Contras:** más información simultánea (justo lo que el jefe rechaza); arrastrar es poco amigable para operarios y en pantallas táctiles; no marca un orden de pasos.

### Propuesta C — «Autopropuesta primero» (el sistema arma, el jefe aprueba)
```
┌ Propuesta del sistema para hoy ──────────────────────────────────┐
│ 7 tareas · 22.4 h · 6 mesas   [Cambiar OPs] [Ajustar]            │
│ [ CONFIRMAR PROPUESTA ]                                          │
└──────────────────────────────────────────────────────────────────┘
```
**Pros:** el mínimo de clics (2–3). **Contras:** el jefe pierde el control de «qué agrupo con qué»; se parece al botón «Planificar» que hoy genera desconfianza; difícil de auditar; no deja claro el paso «revisar OPs».

### Recomendación: **Propuesta A**, con la mejor idea de C dentro del paso 2
El paso 2 **llega ya armado**: el sistema sugiere el agrupamiento (por OP, OPL primero, ≤ 4 h por tarea) y el jefe solo ajusta. Así se conserva el flujo lineal de A, se evita la densidad de B y se logra el ahorro de clics de C sin quitarle el control.

## 3. Flujo recomendado, pantalla por pantalla

**Estructura común.** Una sola ruta nueva (`/admin/day-planner`, menú «Armar el día»). Encabezado fijo: fecha de trabajo (botones grandes «Hoy» / «Mañana» / otra fecha, solo lunes a viernes) y botón **«⬇ Hoja del día»** siempre visible. Debajo, 4 tarjetas numeradas: solo la activa está abierta; las completadas quedan en una línea de resumen con «Cambiar». Barra inferior fija con **un solo botón primario por paso**. Botones ≥ 48 px, texto ≥ 16 px, lenguaje corto. Se reutilizan reactstrap + Paper Dashboard, los colores de familia, `DatePickerField` (`soloHabiles`) y `notificationHelper`.

### Paso 1 — Elegir OPs
- **Ve:** arriba una franja verde **«OPL — PRIORIDAD»** (siempre fija; no se oculta con filtros ni paginación) con sus OPs ya marcadas; debajo **«Otras OPs»** en el orden de prioridad vigente (OPCK, cola manual, luego las más antiguas). Cada fila: casilla grande, familia, código, cliente, # de productos, horas, fecha de entrega. «Ver productos ▸» despliega el detalle (cantidades restantes, observaciones).
- **Acciones:** marcar/desmarcar; «Marcar todas» por sección; un solo cuadro de búsqueda; «Filtrar ▸» plegado (familias). **El orden en que se marcan las «otras» es su prioridad** (número en la casilla). Botón primario: **«Armar tareas (N OPs)»**.
- **Estados:** *vacío* — «No hay OPs pendientes. Todo ya está en tareas ✔» (+ «Actualizar»); *cargando* — esqueleto; *error* — «No se pudo cargar. [Reintentar]»; *fin de semana* — «Sábado y domingo no se produce» + «Ir al lunes»; *nada marcado* — botón primario deshabilitado con «Marque al menos una OP».

### Paso 2 — Armar tareas
- **Ve:** tarjetas de tarea ya sugeridas, OPL primero (marca verde «PRIORIDAD»). Cada tarjeta: título, **barra «3.2 h de 4 h»** y chip de estado. Productos plegados («Ver 4 productos ▸»).
- **Barra del límite (reglas vigentes):** verde hasta 3.2 h (80 % de 4 h) · **ámbar** de 3.2 h a 5 h («Pasa de lo ideal: permitido hasta 5 h») · **rojo y bloqueo** sobre 5 h. Las horas OPL se muestran aparte en gris («OPL: no cuentan contra el límite»).
- **Acciones:** −/+ en la cantidad de cada producto, «Mover a otra tarea ▾», quitar, «+ Producto», «+ Nueva tarea», **«Arreglar sola»** (en una tarea roja, mueve el excedente a una tarea nueva en un clic). Bandeja «Sin tarea (N)» para lo que se quitó. Una tarea no mezcla OPs base distintas (las OPL sí pueden ir como extra); si se intenta, mensaje corto con el motivo.
- **Estados:** *vacío*; *límite excedido* (tarjeta roja, «Revisar» deshabilitado con la causa); *producto ya usado por otra persona* («Alguien más ya tomó este producto. Actualicé las cantidades»); *error*.
- Botón primario: **«Revisar»**. Resumen fijo: «4 tareas · 13.5 h · 0 con problemas».

### Paso 3 — Revisar
- **Ve:** una fila por tarea: tarea/OP (OPL arriba con marca), horas (mini barra), **día propuesto** y **mesa orientativa**. Arriba un solo aviso azul sobre el corte y, plegado, «Ver carga por mesa ▸» (lo que ya tenía cada mesa + lo nuevo resaltado).
- **Qué significa «mesa» aquí (importante).** Hoy toda tarea manual nace **sin corte** y la compuerta del corte impide darle mesa hasta marcarlo (`TaskOrganizerService.java:434`; `TaskDeskAssignerService.java:97-122`). Por eso, al confirmar, el sistema **guarda el día** (como ya hace «Planificar») y la **mesa real se asigna sola al marcar el corte**. La mesa que se ve en este paso es **orientativa**: muestra que el día tiene cupo y cuántas mesas libres hay.
- **Ajuste manual, sin ser obligatorio:** el jefe puede aceptar todo sin tocar nada, **cambiar el día** de una tarea o **sacarla** del grupo. Elegir la mesa antes del corte exige una columna nueva (ver §4.6, fase posterior); mientras tanto, la mesa se mueve en el «Tablero de mesas» después del corte, como hoy.
- **Avisos por color:** ámbar — «2 tareas no caben hoy y pasan al mar 20/10»; azul — «Las 5 tareas esperan corte: la hoja del día es la que se entrega para cortar. Al marcar el corte, cada una baja a su mesa»; rojo — bloqueo si algo se pasó del límite (no debería llegar aquí; se vuelve a validar).
- **Acciones:** «← Volver» y botón primario verde **«Confirmar y repartir»**.
- **Estados:** *calculando propuesta*; *sin cupo en el horizonte* → aviso + «Dejar para otro día»; *la propuesta cambió* (otra persona repartió mientras tanto) → «La carga cambió. Recalculé la propuesta»; *error*.

### Paso 4 — Listo y hoja del día
- **Ve:** «✔ 5 tareas creadas · día asignado · bajan a mesa al marcar el corte» y una lista corta. Botones grandes: **«⬇ Descargar hoja del día (Excel)»**, **«🖨 Imprimir hoja (PDF)»**, «Ver tablero de mesas» (secundario) y «Armar otro grupo» (vuelve al paso 1 conservando la fecha).
- **La hoja** reutiliza el modelo actual: OPs y OPL programadas ese día, con o sin mesa, sin canceladas ni completadas (igual que la prueba C de `docs/produccion-pruebas-usuarios`).
- **Estados:** *éxito parcial* («4 de 5 creadas. Falló la tarea 3: <motivo>» + «Reintentar esa»; la confirmación es todo-o-nada en el servidor, este estado cubre una caída de red); *error de descarga* → «Reintentar».

### Clics del camino rápido
Abrir pantalla (ya muestra las OPs; OPL marcadas) → **1** «Marcar todas» → **2** «Armar tareas» → **3** «Revisar» → **4** «Confirmar y repartir» → tareas asignadas → **5** «Descargar hoja». Cada ajuste manual suma 1–2 clics y es opcional.

### Qué pasa con las pantallas actuales
- «Organizador de Tareas» pasa a llamarse **«Redistribuir mesas»** (excepciones: Tablero, Pendientes, No terminadas, Por troquelar). Su pestaña «Organizar», `DraftTaskPanel` y `DayQueuePanel` se retiran **solo después** de validar con el jefe.
- Centro de Producción: el banner «Cómo fluye una tarea» se cambia por el acceso **«Armar el día»**. «Planificar hoy» (también crea las tareas de cinchos) se mantiene en la primera fase.
- **«Distribuir el día» cambia de comportamiento al retirarse:** hoy reprograma todas las pendientes con corte hacia el día elegido; «Armar el día» solo reparte las nuevas. Hay que comunicarlo.

## 4. Cambios necesarios en código y base de datos

> Es la **lista para implementar después**. Fue revisada de forma independiente contra el código real (concurrencia, vista previa vs. confirmar, cachés, pruebas).

### 4.1 Principios
1. **No tocar `plan-window`, `auto-plan` ni los repartos existentes** hasta tener pruebas de caracterización. Hoy `createTask` y `plan-window` tienen cobertura efectiva cero: `TaskDieCutTest` aborta sin datos y `build.gradle:105-117` fuerza H2 en memoria, que no tiene `pg_advisory_xact_lock`, así que esas pruebas se saltan bajo Gradle.
2. **Vista previa → confirmar con revalidación**: la vista previa no guarda nada; el confirmar vuelve a validar y rechaza (409) si la carga cambió.
3. **Una sola fuente de verdad** para límites y número de mesas: el servidor (`ProductionDeskCountService.getDay`), no copias en el front ni `system_config`.

### 4.2 Base de datos
- **Fase 1: ninguna migración.** El confirmar guarda `scheduled_date` con `desk = NULL`, igual que el autoplan (`ProductionAutoPlannerService.java:460-467`); la mesa real la pone `TaskDeskAssignerService.place` al marcar el corte.
- `production_order.scheduling_priority` ya existe en producción aunque no hay script en `scripts/`; verificar en `fosstest`.
- **Fase posterior (opcional): `task.preferred_desk INTEGER NULL`** si el jefe necesita elegir mesa antes del corte. **Costo:** respetar la columna en `plan-window` (`:905-933`), `rebalance-day` (`:592`), `TaskDeskBackfillService`, `clear-desks` y `move-item`. Script `scripts/migration-task-preferred-desk.sql` (`ALTER TABLE task ADD COLUMN IF NOT EXISTS preferred_desk INTEGER;`), que debe correrse **antes** del binario porque `ddl-auto=validate` impide arrancar sin la columna. Rollback: revertir el binario; la columna sobrante es inofensiva.
- Permisos: se reutiliza `PRODUCCION.TAREAS_ESTACION.VER` (la única clave que existe) y los roles que ya usa el Centro (`canRedistribute`, `TasksByTable.js:327`).

### 4.3 Backend (`fossiles-core-back/src/main/java/com/fossiles/fossilescorebackend/`)
| Archivo | Cambio |
|---|---|
| `infrastructure/util/DeskDistributionPlanner.java` (nuevo, puro) | Extrae el greedy de `TaskController.java:866-972`. Recibe `PlanItem(key, orderId, hours, canOvercap, prevDesk, prevDate)`, la cola ya ordenada, las cargas iniciales, las mesas **por día** y `TieBreak {LOWEST, RANDOM}`. Devuelve colocaciones, `notPlaced`, cargas y fecha máxima. La carga de IN_PROGRESS y el reloj quedan **fuera** del planificador puro. |
| `application/service/DayLoadService.java` (nuevo) | Aloja `loadDayLoads` (`ProductionAutoPlannerService.java:676`) y `cinchoOnlyTaskIds`, para que «Planificar» y «Armar el día» se vean entre sí. No tocar el constructor de `ProductionAutoPlannerService` hasta la última fase (dos pruebas lo construyen con 15 argumentos). |
| `application/service/TaskOrganizerService.java` (`createTask :260-454`) | Dividir en `prepareDraft(request, mode, lockItems)` (`:264-413`, sin persistir) y la persistencia (`:415-453`). La vista previa usa `findAllById` sin `FOR UPDATE`. |
| `application/service/DayPlanService.java` (nuevo) | `preview()` y `confirm()` (ver 4.4). |
| `infrastructure/controller/TaskDayPlanController.java` (nuevo) | `/api/tasks/organizer/day-plan/{preview,confirm,candidates}` y `/organizer/limits`. No engordar `TaskController` (2 874 líneas); su `toResponse` es privado (`:2729`), así que `confirm` devuelve un DTO ligero y el front pide `GET /tasks/date/{d}`. |
| `OrganizerItemResponse` | Añadir `unitsPerTask` (el autoplan parte por `min(units_per_task, floor(4/prd))`). |
| `ProductionCenterCacheInvalidator.java:30-44` y `OnlineSalesCacheInvalidator` (+ sus pruebas) | **Excluir la vista previa**: es un POST bajo `/api/tasks/**` y vaciaría cachés en cada pulsación. Limpiar la lista de OPs tras `confirm` (la OP pasa a IN_PROGRESS). Nota: `/organizer/manual` hoy ya cambia la OP a IN_PROGRESS sin `evictOrders` (laguna previa). |
| `TaskOrganizerService.getOrganizerOrders :68-118` | Pagina **antes** de descartar OPs sin restante, así que `totalElements` engaña. El paso 1 necesita el endpoint `candidates` (solo OPs con restante, con `remainingHours`). |
| `ProductionPlanningConstants` | Subir ahí el rango de prioridad manual 2..99 (hoy privado en `TaskController.java:2819`). |

### 4.4 Contrato de `preview` y `confirm`
```java
DayPlanRequest {
  LocalDate anchorDate; Integer horizonDays;
  Map<String,Integer> orderPriorities;       // se aplican bajo el candado (no PUT /day-queue)
  String planFingerprint; Boolean acceptChanges;
  List<Draft> tasks;
}
Draft { String clientId; Long productionOrderId;
        List<CreateManualTaskRequest.ManualTaskItemRequest> items;
        LocalDate scheduledDate; String observations; }

DayPlanPreviewResponse {
  LocalDateTime asOf;          // un solo reloj para IN_PROGRESS (remainingDeskHours)
  String planFingerprint;      // hash de cargas por día + restantes de ítems + prioridades
  Limits limits;               // ideal 4, tope 5, mesas por día
  List<TaskPreview> tasks; List<DayLoad> dayLoads; List<NotPlaced> notPlaced;
}
TaskPreview { String clientId; Status status /*OK|WARN|BLOCKED*/;
              List<String> codes, messages; double baseHours, totalHours;
              boolean overcapAnchor; LocalDate proposedDate, nextDayCandidate;
              Integer indicativeLane; }
DayPlanConfirmResponse { List<Created> created /*clientId,taskId,code,scheduledDate*/;
                         List<NotPlaced> notPlaced; }
// 409: { code: PLAN_CHANGED | QTY_UNAVAILABLE | LOCK_TIMEOUT, failures[], preview }
```
Reglas de `confirm`:
1. `@Transactional(rollbackFor = Exception.class)`: `BusinessException` es checked y, por defecto, **no revierte** (patrón ya usado en `TaskController.java:1037`). Lanzar una `RuntimeException` propia (`DayPlanConflictException`) con los fallos por tarea.
2. **Orden fijo de bloqueos** para evitar interbloqueo con `createManualTask`: `productionPlanningLock.acquire()` → `findAllByIdForUpdate` de **todos** los ítems, ordenados (`ProductionOrderItemRepository.java:27-29`) → crear. Validar el restante **acumulado** por ítem entre borradores (un ítem puede partirse en dos tareas). `SET LOCAL lock_timeout='5s'` → 409.
3. `planFingerprint` obligatorio: si cambió, 409 `PLAN_CHANGED` con vista previa nueva (o aplica con `acceptChanges=true`). También da **idempotencia**: un doble clic no crea tareas duplicadas.
4. **Desempate:** hoy hay tres reglas (`pickDeskOnDay` aleatorio; `plan-window` y `rebalance-day`, la menor mesa). El camino nuevo usa `LOWEST`.
5. Las observaciones del jefe **no** pueden empezar por «Auto-plan» (`isAutoPlanObservation`, `ProductionAutoPlannerService.java:255` haría que `regenerate` borre esas tareas).
6. Las prioridades (`orderPriorities`) se guardan bajo el candado con `mergeSchedulingPrioritiesFromRequest` (`TaskController.java:~2823`). `PUT /day-queue` reemplaza la cola **global**, y dos jefes se pisarían.

### 4.5 Frontend (`fossiles-core-front/src/`)
| Archivo | Cambio |
|---|---|
| `views/production/dayplanner/DayPlanner.js` + `StepSelectOrders`, `StepBuildTasks`, `StepReview`, `StepDone`, `TaskCapacityBar`, `useDayPlanner.js` (nuevos) | Pantalla única. El hook usa debounce de 400 ms y una secuencia para descartar respuestas viejas; el borrador vive en `sessionStorage` con `try/catch`. |
| `utils/dayPlanHelper.js` (nuevo) + `utils/__tests__/dayPlanHelper.test.js` | `suggestGrouping` (por OP, OPL primero, una OP base por tarea, OPL como extra, respetando `unitsPerTask`) y `limitStatus` (verde ≤ 3.2 h, ámbar ≤ 5 h, rojo > 5 h) sobre `utils/taskHoursHelper.js`. El servidor valida siempre. |
| `views/production/organizer/FamilyBadge.js` (nuevo) | Extraído de `OrganizerOrderBrowser.js:20`. |
| `services/taskService.js` | `previewDayPlan`, `confirmDayPlan` (con error que conserve el cuerpo del 409), `getOrganizerLimits`, `getDayPlanCandidates` (patrón de `createManualTask :441`). |
| Hoja del día | Patrón de `TasksByTable.js:1366-1394` con `getTasksByDate` (`taskService.js:49`) en vez de `getTasks()` (que trae **todas** las tareas), `getOrganizerDayDeskTasks`, `buildProductionTasksSheetPrintModel` y los exports de impresión/Excel. Con varios días, selector de día. |
| `routes.js` (junto a `:685`) y `config/routePermissions.js:51` | Entrada «Armar el día» (`/day-planner`, mini «AD») con `PRODUCCION.TAREAS_ESTACION.VER`. **Hecho en la rama `feature/armar-el-dia`.** `utils/autoEnrichRoutes.js` es un script suelto que nadie importa y no hace falta tocarlo. «Organizador de Tareas» se renombra a «Redistribuir mesas» solo en la fase de limpieza. |
| `TasksByTable.js:2173-2191` | Banner «Cómo fluye una tarea» → botón «Armar el día». |
| Documentación | `docs/produccion-pruebas-usuarios/I-armar-el-dia.md`. |

### 4.6 Fases (cada una se despliega sola)
- **F0 — pruebas de caracterización** de `plan-window`, `createTask` y los invalidadores. No toca código de producción. Incluye una copia literal `LegacyPlanWindow` en `src/test` comparada con el planificador nuevo sobre ~1 000 escenarios aleatorios con semilla, más ~10 casos dorados (OPL en día ancla; OPCK arrastrada; tarea de más de 4 h en mesa vacía; fin de semana dentro del horizonte; IN_PROGRESS plegada a otro día; mesa fuera de rango; tarea sin OP; empate de prioridades).
- **F1 — back aditivo:** límites, candidatas, invalidadores. Sin migración.
- **F2 — `prepareDraft` y `DeskDistributionPlanner`;** `plan-window` delega en el planificador. Antes de desplegar, comparar su respuesta contra una copia de producción con `/sync-prod-db`. **Lo más riesgoso:** el bloque `arrastrada` (`TaskController.java:879-948`): conserva la mesa previa sin comprobar `fits`, permite sobrecupo solo en el día ancla o en la mesa previa, y el resultado depende del orden del greedy y del desempate estricto `<` con épsilon 1e-9. Conservar el JSON de respuesta (`DayQueuePanel` lee `placedTasks`, `selectedTasks`, `dieCutBlockedTasks`, `notPlaced[].{nextDayCandidate,hours,keepsDesk,reason}`).
- **F3 — vista previa + pantalla en solo lectura,** con ruta oculta (`showInSidebar: false`).
- **F4 — `confirm`, hoja y piloto** con el jefe.
- **F5 — limpieza:** retirar `DayQueuePanel`/«Planificar» solapados, unificar `DayLoadService` y actualizar las dos pruebas del autoplanner.
- **Después, si el jefe lo pide:** `preferred_desk` (ver 4.2).

### 4.7 Riesgos y casos borde
- **OPL y OPCK** pueden pasarse del cupo solo en el **día ancla** (`canOvercapDeskDay`, `ProductionPlanningConstants.java:44`; `TaskController.java:919-921`); la OPCK **sí** cuenta para el tope de 5 h. Mostrar el sobrecupo como información, no en rojo.
- **Tareas OPL** pesan 0 h para el cupo: mostrar las horas reales aparte. Un extra OPL dentro de una tarea regular hereda la prioridad 100 de la OP base → **sugerir tareas OPL puras**.
- **Horizonte multi-día:** `plan-window` usa las mesas del día de inicio para todo el horizonte (`:706`); el planificador debe recibir las mesas **por día**. Lo que no cabe va a `notPlaced` con `nextDayCandidate`; no se crea.
- **Cinchos (OPC):** excluidos (`TaskOrganizerService.java:91, 355-357`); sus tareas nacen con `die_cut_ready = true` y sin mesa, así que pasan el filtro `requireDieCut` (`TaskController.java:734`). Mantener esa paridad al refactorizar.
- **Ítem de más de 5 h:** el tope solo aplica en modo MANUAL (`:407`) → la vista previa devuelve BLOCKED.
- **«Planificar» hace dos cosas que `createTask` no:** solicita materiales (`requestMaterials`, `ProductionAutoPlannerService.java:502`) y valida cuero (`canCover`, `:400`). Si «Armar el día» lo reemplaza, decidir qué pasa con las solicitudes de materiales; la vista previa debe dar **WARN por falta de cuero**.
- **Mesa elegida a mano que pasa de 4 h:** hoy `/schedule` y `/move-item` tampoco validan cupo; el camino nuevo avisa en ámbar y solo bloquea si la tarea pasa de 5 h.
- **Reservas huérfanas** (solo si se hace `preferred_desk`): contar la reserva únicamente mientras la tarea siga PENDING sin mesa.
- **Backlog existente:** el indicador de corte aplica a tareas ya creadas. En esta propuesta el paso 1 **no** incluye el backlog (sigue en «Redistribuir mesas»).
- **Pruebas de concurrencia (Testcontainers Postgres,** como `CustomerAccountLedgerConcurrencyTest`): dos `confirm` sobre el mismo ítem → uno recibe 409; un `confirm` contra un `createManualTask` en paralelo → sin interbloqueo; una tercera tarea inválida → 0 tareas creadas y la serie TK sin avanzar.

## 5. Criterios de aceptación (para validar con el jefe de producción)

**Flujo y simplicidad**
1. Todo ocurre en **una sola ruta** y sin pestañas; el botón «Atrás» del navegador no pierde el borrador.
2. De «ver OPs» a «tareas asignadas» hay **≤ 4 clics** en el camino rápido (≤ 5 con la hoja); cada paso tiene un solo botón primario.
3. Armar un día típico (p. ej. 3 OPL + 5 OPs) toma **menos tiempo que hoy**: se mide con cronómetro antes y después, en la misma jornada. Al final el jefe responde 3 preguntas: ¿es más simple?, ¿se perdió algo?, ¿lo usaría a diario?

**Reglas que no se pierden** (cada una con prueba)
4. Las OPL están **siempre arriba** con marca «PRIORIDAD» y entran primero al reparto (prioridad 0).
5. Una tarea **sobre 5 h de carga base** no se puede revisar ni confirmar, en pantalla **y** en el servidor; entre 4 y 5 h avisa en ámbar y deja continuar.
6. Las horas OPL **no cuentan** contra el límite y se muestran aparte.
7. Una tarea **no mezcla OPs base distintas**; las OPL pueden ir como extra.
8. No se puede elegir sábado ni domingo.
9. El sistema propone día y mesa orientativa; el jefe puede aceptarlos sin tocar nada o cambiar el día.
10. Las tareas nuevas **no bajan a mesa hasta marcar el corte**; al marcarlo se asignan solas.
11. La confirmación es **todo o nada**: si falla una tarea, no queda ninguna a medias; un doble clic no duplica tareas.
12. «Armar el día» reparte **solo las tareas nuevas**; no mueve las pendientes que ya tenían mesa.

**Hoja y estados**
13. «Descargar hoja del día» está visible en todo momento y entrega Excel o PDF con **todas las OPs/OPL programadas ese día**, con o sin mesa, sin canceladas ni completadas.
14. Existen y se ven bien los estados: vacío, cargando, error con «Reintentar», límite excedido, producto ya usado por otra persona, éxito y éxito parcial.

**Interfaz**
15. Todo el texto en español de Guatemala (fechas dd/mm/aaaa; horas con punto decimal, «3.2 h»); botones ≥ 48 px; texto ≥ 16 px; usable en tableta.
16. Coherencia visual con FOSSILES CORE (colores de familia, badges, cards, notificaciones).

## 6. Puntos abiertos para decidir con el jefe (usando el prototipo)
1. ¿Las OPL se **pre-marcan** al abrir (más rápido) o se marcan a mano (más seguro)? Recomendado: pre-marcadas y visibles.
2. Las OPL no cuentan contra el límite: ¿se **parten en tareas de hasta 4 h** para que una sola mesa no cargue todo? El prototipo lo sugiere; es ajustable.
3. «Confirmar y repartir» reparte **solo las tareas nuevas**; «Distribuir el día» de hoy reacomoda todas las pendientes con corte. ¿Es lo que espera?
4. Como toda tarea nueva nace sin corte, la mesa que ve al confirmar es **orientativa** y la real llega al marcar el corte. ¿Le basta? Si necesita **elegir mesa antes del corte**, hay que hacer la fase `preferred_desk` (4.2).
5. ¿«Armar el día» **reemplaza** a «Planificar hoy»? Si sí, hay que decidir qué pasa con las solicitudes de materiales y la validación de cuero que «Planificar» hace hoy (4.7).
6. Prioridad de las «otras OPs»: ¿le sirve que el orden de marcado sea el orden de prioridad? Hoy la cola es **global** (dos jefes se pisan); en la nueva pantalla se guarda dentro de la confirmación.

## 7. Prototipo

[`prototipo.html`](./prototipo.html) — un solo archivo, sin dependencias, con datos de ejemplo. Recorra el camino rápido y use el panel «Probar estados» (al pie) para ver el vacío, el error, el límite excedido, el producto ya tomado por otra persona, el éxito parcial y el fin de semana. El contador de clics del panel sirve para comprobar el criterio 2.

**Qué es y qué no es:** muestra el flujo, la barra del límite y los textos. No habla con el servidor; el reparto de mesas del paso 3 es una simulación sencilla. Los botones de la hoja **muestran la hoja en pantalla** (con «Copiar tabla»); en la aplicación serán el Excel y el PDF que ya existen. También está publicado como Artifact privado: https://claude.ai/artifact/5QBzf7m2LEQnrRA9wzzKyj (solo lo abre quien tenga acceso; se comparte desde el menú «Compartir» de la página).
