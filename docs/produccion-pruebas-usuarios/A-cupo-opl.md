# Agente A — OPL ya no “llena” el cupo de la mesa

## Qué cambió (en simple)

Antes, si metían una **OPL** (orden de venta en línea) en una tarea, **consumía las 4 horas** de la mesa como si fuera una OP normal (salvo que marcaran “Extra”).

Ahora las **OPL no cuentan para ese límite**: se pueden programar el día que toca sin quitarle espacio a las OP del día. Las OPL también entran en la prioridad de distribución.

Las **OP normales siguen contando** contra el cupo de la mesa.

## Quién debe probar

- Quien arma el organizador de tareas
- Jefes de mesa

## Cómo probarlo

1. Entrar a **Organizador de tareas**.
2. Armar una tarea en una mesa casi llena (cerca de 4 horas) solo con **OP normales**.
3. Agregar una **OPL** a esa misma mesa y día.
4. Guardar / revisar la carga de la mesa.

### Resultado esperado

- La OPL aparece como **sin cupo** (o equivalente: no bloquea por “se pasó de horas”).
- Las OP normales sí siguen sumando al cupo.
- La barra o carga de la mesa **no sube** (o casi no) por la OPL.
- Pueden dejar la OPL programada para ese día aunque la mesa ya esté “llena” de OP normales.

### Resultado incorrecto (reportar)

- Al meter la OPL el sistema dice que no cabe por horas.
- La carga de la mesa sube igual que con una OP normal.

## Notas

- Tareas **viejas** mezcladas (OP + OPL creadas antes del cambio) pueden comportarse distinto hasta recrearlas.
- Si solo prueban OPL puras (sin OP en la misma tarea), el cupo de esa tarea debería verse en cero para efectos del límite.