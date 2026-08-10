# Agente B — Productos sin color (una sola fila)

## Qué cambió (en simple)

Productos como el **llavero** (sin color) a veces generaban **varias filas** de stock en el mismo kiosko, y el sistema se confundía al sumar.

Ahora:

- Solo debe haber **una fila** por kiosko + producto + herraje cuando no hay color.
- Si había duplicados, al consolidar también se **juntan las tallas** correctamente (si aplica).

## Quién prueba

- Inventario de kiosko / soporte

## Cómo probarlo

1. Ir a **Inventario kiosko** del kiosko de prueba.
2. Buscar un producto **sin color** (ej. LL-12).
3. Confirmar que aparece **una sola** fila de stock.
4. Hacer una entrada o traslado pequeño y ver que el qty se mueve en esa misma fila.

### Resultado esperado

- Una fila, un qty claro.
- No “dos LL-12 sin color” en el mismo kiosko.

### Incorrecto (reportar)

- Dos o más filas iguales sin color con qty repartido.