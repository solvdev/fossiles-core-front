# Agente E — Confirmaciones anti doble clic

## Qué cambió (en simple)

Para evitar movimientos dobles por accidente:

1. **Recibir distribución:** pide confirmación (“¿Seguro?”) y bloquea doble clic.
2. **Traslado / Ajuste / Merma / Entrada** en Inventario kiosko: confirmación + bloqueo mientras guarda.
3. **Cargas masivas** línea a línea: si falla a mitad, avisa lo que ya salió bien y **no** reintenta ciegamente todo.
4. **Historial de movimientos:** muestra de a 50 y botón **Cargar más** (menos pantallas eternas).

## Quién prueba

- Todos los que tocan recepción e inventario kiosko

## Cómo probarlo

1. En recepción: clic en confirmar → debe salir diálogo → aceptar. Dar doble clic rápido: solo un envío efectivo.
2. En Inventario kiosko: traslado o ajuste → confirmación antes de guardar.
3. Abrir movimientos del stock: ver 50 filas y **Cargar más** si hay más.

### Resultado esperado

- Un solo movimiento por acción confirmada.
- Mensaje claro si un bulk quedó a medias.

### Incorrecto (reportar)

- Dos movimientos idénticos por un doble clic.
- Bulk que vuelve a crear lo que ya había creado.