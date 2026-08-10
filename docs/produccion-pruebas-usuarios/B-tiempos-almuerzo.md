# Agente B — Tiempos en horas y hora de almuerzo

## Qué cambió (en simple)

1. En boletas y pantallas de tareas:
   - Si el tiempo es **1 hora o más** → se muestra en **horas** (ejemplo: `1h 30m`), no solo “90 min”.
   - Si es **menos de 1 hora** → sigue en **minutos** (ejemplo: `45 min`).
2. Si el trabajo **cruza de 1:00 pm a 2:00 pm**, el sistema **salta esa hora** (almuerzo) al calcular la hora de fin estimada.

## Quién debe probar

- Quien imprime boletas
- Supervisores de mesa
- Quien mira tiempos en el centro de producción

## Cómo probarlo

### 1) Tiempo largo (≥ 1 hora)

1. Abrir **Centro de producción** o imprimir una **boleta**.
2. Buscar una tarea de unos **90 minutos** (1.5 horas).

**Esperado:** se ve algo como `1h 30m`, no `90 min`.

### 2) Tiempo corto (&lt; 1 hora)

1. Mirar una tarea de unos **30–45 minutos**.

**Esperado:** se ve en minutos, por ejemplo `45 min`.

### 3) Almuerzo — empieza a las 12:30 con 2 horas

1. Revisar el **fin estimado** de una tarea que empiece a las **12:30** con **2 horas** de trabajo.

**Esperado:** fin cerca de las **3:30 pm**  
(no 2:30 pm, porque se salta 1–2 pm).

### 4) Almuerzo — cae dentro de 1:00–2:00

1. Tarea que “caiga” a la **1:30 pm** con **1 hora** de trabajo.

**Esperado:** fin cerca de las **3:00 pm**.

## Resultado incorrecto (reportar)

- Todo sigue saliendo solo en minutos cuando es más de una hora.
- El fin estimado cae **dentro** de 1:00–2:00 pm.
- El fin no respeta el salto de almuerzo.