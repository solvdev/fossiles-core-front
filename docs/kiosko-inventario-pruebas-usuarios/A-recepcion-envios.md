# Agente A — Recibir envíos sin doble entrada

## Qué cambió (en simple)

Cuando un kiosko **recibe** un envío de distribución (ENVI), el sistema carga el stock en el kiosko.

Antes, en algunos reintentos o reparaciones, podía **sumar dos veces** la misma línea.  
Ahora:

- Recibir **una vez** → suma bien.
- **Reintentar** el mismo envío → **no** vuelve a sumar.
- Si faltaba solo el kardex (historial) o solo el kiosko, completa lo que falta **sin duplicar**.
- Las líneas L1 y L10 ya no se confunden entre sí.

## Quién prueba

- Quien confirma recepción en el kiosko / POS “Recibir distribución”

## Cómo probarlo

1. Anotar stock del producto en el kiosko **antes**.
2. Tener un envío en estado **enviado / en tránsito** hacia ese kiosko.
3. Confirmar recepción (aceptar el diálogo de confirmación).
4. Anotar stock **después** → debe subir exactamente la cantidad del envío.
5. Intentar confirmar de nuevo el **mismo** envío (si la pantalla lo permite) o usar reparación sin forzar de más.

### Resultado esperado

- Una sola entrada en movimientos (ENTRADA / recepción).
- Stock sube una sola vez.
- No aparecen dos entradas iguales por la misma línea del envío.

### Incorrecto (reportar)

- Stock subió el doble.
- Dos movimientos ENTRADA para la misma línea del envío.