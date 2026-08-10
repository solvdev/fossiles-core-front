# Agente E — Bodega de producto terminado (PT) y envíos

## Qué cambió (en simple)

1. Al **recibir** producción en bodega PT → el stock **sube** (como debe).
2. Al **enviar** una OP normal (envío de distribución) → el stock **baja** en la cantidad correcta.  
   Si no hay stock suficiente, **no deja enviar a medias** (antes a veces quedaba “enviado” y el stock no bajaba bien).
3. Al **despachar una OPL** ya producida y recibida en PT → **ahora sí baja** el stock.  
   Antes se quedaba stock “fantasma” como si no se hubiera ido.
4. Ventas en línea que **ya se descontaron al preparar desde inventario** no se vuelven a descontar al despachar.

## Quién debe probar

- Bodega de producto terminado
- Quien despacha OPL / envíos

## Cómo probarlo

### Flujo A — OPL producida (el caso crítico)

1. Tener una **OPL** en producción.
2. Terminar en mesa y hacer **recibo en bodega PT**.
3. Anotar stock del producto **antes** y **después** del recibo.  
   **Esperado:** el stock **sube**.
4. **Despachar** esa OPL al cliente.
5. Anotar stock otra vez.  
   **Esperado:** el stock **baja** la misma cantidad despachada.
6. Confirmar que **no** queda stock “como si no se hubiera ido”.

### Flujo B — OP / envío normal

1. OP recibida en bodega PT (stock ya subió).
2. Preparar y **enviar** el envío.
3. **Esperado:** el stock baja exactamente la cantidad del envío.

### Flujo C — Sin stock suficiente

1. Intentar enviar **más** de lo que hay en PT (o vaciar stock y reintentar).

**Esperado:** mensaje de **stock insuficiente**.  
**No** debe quedar marcado como enviado sin haber bajado el inventario.

### Flujo D — Venta en línea desde inventario (sin producir)

1. Pedido que se **preparó / cumplió desde inventario** (ya descontó al preparar).
2. Luego solo se despacha / marca enviado.

**Esperado:** **no** baja el stock otra vez (ya salió en la preparación).

## Resultado incorrecto (reportar)

- Despachan OPL y el stock de PT **no baja**.
- Envío marcado como enviado pero el stock no se movió.
- Doble descuento en ventas que ya habían salido al preparar.