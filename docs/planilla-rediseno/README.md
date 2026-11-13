# Rediseño UX/UI de Planilla y Cargos a colaboradores

Solo prototipo (`prototipo.html`, se abre con doble clic). No toca código de la app; datos de ejemplo, nada se guarda.

Qué cambia frente a las pantallas actuales (`src/views/payroll/*`):

- **Una sola barra de pestañas**: Planillas, Fichas, Parámetros y Cargos a colaboradores (hoy Cargos es otra ruta). La pestaña de cargos avisa cuántos esperan decisión.
- **Planillas**: tarjetas de "próximo pago" por grupo (fecha, días que faltan, estado, líquido) en vez de la tabla de fechas; historial con filtros.
- **Detalle de planilla**: paso a paso, tarjeta de siguiente paso, lista "Antes de aprobar" que bloquea o avisa con enlace a lo que lo corrige, resumen en un solo panel (líquido, forma de pago, cuota patronal), tabla de 7 columnas con botón para ver las de detalle, y voucher del colaborador en panel lateral con comparación contra la planilla anterior.
- **Fichas**: tarjetas-filtro por grupo y vinculación, edición en panel lateral con validación (cuenta obligatoria si es transferencia) en vez de 8 campos por fila.
- **Parámetros**: tarjetas por tema con valor vigente grande e historial plegable; el cambio se programa en un panel.
- **Cargos**: resumen (esperan decisión, saldo abierto, ya en planilla), filtro "Por decidir" primero, decisión con botones en la fila, selección múltiple con acciones en lote, confirmaciones para marcar pagado y anular.

Prueba sugerida: planilla #44 → "Completar en Fichas" → guardar forma de pago → volver, recalcular, aprobar, numerar cheques, registrar pago. Abajo hay un selector "Solo prototipo" para ver cada estado.
