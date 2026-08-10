# Agente C — Ventas POS y traslados

## Qué cambió (en simple)

1. **Venta / anulación POS:** si el sistema ya descontó (o devolvió) stock por esa factura, un reintento **no vuelve a mover** el inventario.
2. **Traslado entre kioskos** (desde inventarios / transferencias): usa el ID del traslado para no aplicar dos veces al reintentar.
3. **Boleta de traslado manual** en inventario kiosko: no deja meter la **misma línea duplicada** (mismo producto, color, talla y cantidad) en la misma boleta.

## Quién prueba

- Caja POS + quien hace traslados

## Cómo probarlo

### Venta

1. Anotar stock → vender 1 unidad en POS → stock baja 1.
2. Si hay reintento raro de la misma venta (o anulación ya hecha), el stock **no** debe bajar/subir otra vez.

### Traslado kiosko ↔ kiosko

1. Anotar stock en origen y destino.
2. Completar un traslado de N unidades.
3. Origen baja N, destino sube N.
4. Reintentar el mismo traslado completado → **no** debe mover otra vez.

### Boleta manual

1. En Inventario kiosko → operación **Traslado**.
2. Intentar agregar dos veces la misma línea idéntica en la boleta.

**Esperado:** el sistema lo rechaza o avisa; no crea doble movimiento.

### Incorrecto (reportar)

- Stock bajó dos veces por una sola venta.
- Traslado aplicado dos veces.
- Boleta con líneas gemelas que sí se guardaron dos veces.