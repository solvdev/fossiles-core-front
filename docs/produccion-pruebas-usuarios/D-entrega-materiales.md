# Agente D — Entrega de materiales

## Qué cambió (en simple)

1. **Ya no se descuenta dos veces** el material si confirman la entrega otra vez.
2. La pantalla es más clara:
   - filtros **Pendientes hoy / Entregadas / Todas**
   - búsqueda por OP, producto o cliente
   - el detalle no abre todo de golpe (menos listado enorme)

## Quién debe probar

- Encargado(a) de la bodega de materiales

## Cómo probarlo

### 1) Encontrar lo del día

1. Entrar a **Entrega de materiales**.
2. Dejar el filtro en **Pendientes hoy**.
3. Buscar una OP del día por código, producto o cliente.

**Esperado:** la encuentran sin recorrer un listado enorme.

### 2) Entregar una vez

1. Abrir la OP/tarea.
2. Confirmar la **entrega de materiales**.
3. Revisar stock / kardex de materia prima con el encargado.

**Esperado:** el material baja **una sola vez**, en las cantidades de la receta.

### 3) Intentar entregar de nuevo

1. Volver a marcar o confirmar entrega de lo mismo.

**Esperado:** **no** vuelve a bajar el stock (o indica que ya estaba consumido).

### 4) Ver entregadas

1. Cambiar el filtro a **Entregadas**.

**Esperado:** aparece lo que ya entregaron.

## Resultado incorrecto (reportar)

- Al entregar dos veces, el stock baja dos veces.
- No encuentran la OP del día con la búsqueda.
- El filtro “Pendientes hoy” muestra un caos sin poder filtrar.

## Nota importante

Si **desmarcan** una entrega (“undeliver”), el sistema **puede no devolver** el material al inventario automáticamente.  
No usar eso como corrección de stock; si hay error, corregir por el flujo de inventario / con supervisión.