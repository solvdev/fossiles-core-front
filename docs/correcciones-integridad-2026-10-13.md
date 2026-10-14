# Formatos, órdenes y recepciones

Los formatos limpian el HTML antes de guardarlo y antes de mostrar cualquier vista previa. El editor conserva las variables de impresión y los estilos permitidos.

La edición de órdenes envía el identificador de cada ítem existente para conservar sus recepciones y vínculos de producción.

Las recepciones agrupan materiales repetidos en la compra, conservan los valores cero y permiten corregir compras completamente recibidas. Desmarcar un material en una edición envía cantidad cero. La anulación exige motivo, conserva el documento visible y solicita al backend la reversión conjunta de inventario y contabilidad. El material consumido requiere conciliación.

Los listados y reportes contables incluyen el tipo `MATERIAL_RECEIPT_ADJUSTMENT` para consultar el historial de correcciones.

La versión del backend debe incluir las migraciones de formatos, movimientos de cuero y estado de recepciones descritas en `docs/correcciones-integridad-2026-10-13.md` del repositorio backend.

## Ajustes del 14 de octubre

La pantalla de asientos envía tipo, cuenta y fechas en una sola consulta. Las fechas viajan en hora local con hora de inicio y de cierre del día.

Una recepción anulada se imprime y se exporta con la leyenda de anulación y su motivo. Los textos que se insertan en la impresión se escapan.
