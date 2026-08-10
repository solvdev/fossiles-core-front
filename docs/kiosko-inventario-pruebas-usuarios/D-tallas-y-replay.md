# Agente D — Tallas y Replay (Ledger Lab)

## Qué cambió (en simple)

En el **Ledger Lab** (herramienta de soporte), al hacer **Replay stock**:

- Si el historial tiene movimientos **con talla** y **sin talla**, ya no “borra” el total usando solo la suma de tallas.
- Si el replay tiene que evitar stock negativo, **deja una marca** en el movimiento (`REPLAY_CLAMP`) para que se pueda auditar (ya no es un silencio total).

## Quién prueba

- Admin / soporte (no uso diario de piso)

## Cómo probarlo

1. Abrir **Kiosk Ledger Lab** (ruta admin).
2. Elegir un stock con movimientos.
3. Anotar `current` y tallas **antes**.
4. Usar **Replay stock**.
5. Revisar que el total tenga sentido con los movimientos (antes / después).
6. Si había clamp, buscar en el reason del movimiento la marca de replay.

### Resultado esperado

- El qty final cuadra con la cadena de movimientos.
- No “desaparece” stock solo porque había movimientos sin talla mezclados.

### Incorrecto (reportar)

- Después del replay el stock queda en 0 sin explicación.
- Las tallas y el total ya no coinciden de forma absurda sin historial que lo justifique.

## Nota

Replay es herramienta delicada. En piso normal **no** hace falta usarla; solo para corregir descuadres con supervisión.