# Pruebas de inventario de kioskos (usuarios)

Tutoriales no técnicos para validar que los movimientos no se dupliquen ni descuadren el stock.

## Antes de empezar

1. Reiniciar backend y recargar el front (Ctrl+F5).
2. Tener un kiosko de prueba, un envío ENVI en tránsito (o crear uno), y un producto con y sin color (ej. llavero).
3. Anotar stock **antes** y **después** de cada prueba (Inventario kiosko + movimientos).

## Documentos

| Archivo | Tema | Quién prueba |
|---------|------|----------------|
| [A-recepcion-envios.md](./A-recepcion-envios.md) | Recibir distribución sin doble entrada | Bodega / kiosko que recibe |
| [B-stock-sin-color.md](./B-stock-sin-color.md) | Productos sin color (una sola fila) | Inventario kiosko |
| [C-ventas-y-traslados.md](./C-ventas-y-traslados.md) | Ventas POS y traslados | Caja + inventario |
| [D-tallas-y-replay.md](./D-tallas-y-replay.md) | Tallas y Replay en Ledger Lab | Admin / soporte |
| [E-doble-clic-pantallas.md](./E-doble-clic-pantallas.md) | Confirmaciones anti doble clic | Todos |
| [F-checklist-rapido.md](./F-checklist-rapido.md) | Checklist 15–20 min | Supervisor |

## Orden sugerido

1. A (recepción) → E (doble clic)
2. C (venta + traslado)
3. B (sin color)
4. D (solo si usan Ledger Lab)
5. F (cierre)