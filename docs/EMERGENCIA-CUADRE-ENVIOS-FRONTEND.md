# Emergencia: cuadre de inventario kiosko con envíos (frontend)

Documento para **rehabilitar la UI de cuadre** si vuelve a hacer falta. Uso **solo en emergencia** (ENTRADAs duplicadas masivas por recepción/envío). En operación normal **no** se usa: se corrige con **Sincronizar inventario kiosko**, **AJUSTE por talla** (FOSS) y conteo físico.

---

## Qué hace el cuadre (backend ya existe)

Compara envíos **DELIVERED** con ENTRADAs kiosko enlazadas al envío:

- **Elimina o recorta ENTRADAs duplicadas** (según cantidad **enviada** en el documento, no `quantity_received`).
- **No agrega faltantes** ni modifica ventas.
- Tras cuadrar, **recalcula** `stock_before` / `stock_after` / `current_stock` del kiosko.
- Cinchos **FOSS**: cuadra por producto+color (suma de líneas del envío vs ENTRADAs); luego puede hacer falta **AJUSTE por talla** si `sizes_data` quedó mal.

**Requisito BD:** script `fossiles-core-back/scripts/migration-kiosco-movement-admin-delete.sql` ejecutado en PostgreSQL. Sin eso, el cuadre detecta duplicados pero **no puede borrar** movimientos.

**Permiso:** solo usuarios con acceso admin a todos los kioskos (`KioskAccessHelper.hasAllKiosksAccess`).

---

## APIs (ya implementadas — no hay que crear backend)

| Acción | Método | Ruta |
|--------|--------|------|
| Vista previa por envío | `GET` | `/api/product-distributions/shipments/{shipmentId}/reconcile-shipment-entries/preview` |
| Ejecutar cuadre por envío | `PUT` | `/api/product-distributions/shipments/{shipmentId}/repair-receipt-inventory?mode=reset` |
| Vista previa por kiosko (todos DELIVERED) | `GET` | `/api/kiosco-inventory/{locationId}/reconcile-shipment-entries/preview` |
| Ejecutar cuadre por kiosko | `POST` | `/api/kiosco-inventory/{locationId}/reconcile-shipment-entries` |

Servicios front existentes:

- `src/services/productDistributionService.js` → `previewDeliveredShipmentReceiptReconcile`, `reconcileDeliveredShipmentReceiptInventory`
- `src/services/kioscoInventoryService.js` → `previewKioscoShipmentEntriesReconcile`, `reconcileKioscoShipmentEntries`

Helpers existentes:

- `src/utils/shipmentReconcilePreviewHelper.js` — resumen y etiquetas del preview
- `src/utils/shipmentReceiptRepairHelper.js` → `formatShipmentReconcileMessage(result)`
- `src/components/distribution/ShipmentReconcilePreviewModal.js` — modal reutilizable (sigue en repo, **sin uso** tras quitar botones)

---

## Qué se quitó de la UI (estado actual)

Los botones **“Cuadrar con envío(s)”** fueron removidos de:

1. `src/views/kiosks/KioskInventory.js` — junto a “Generar inventario en kioskos”
2. `src/components/distribution/ShipmentReceiptPanel.js` — envío entregado, junto a “Sincronizar inventario kiosco”
3. `src/views/distribution/PrepareShipments.js` — fila de envío entregado, junto a “Sincronizar inv. kiosco”

También se quitaron: estado React del preview, handlers `openReconcilePreview` / `handleConfirmReconcile*`, imports del modal y `canReconcileInventory`.

**No borrar** (reutilizar al reactivar): `ShipmentReconcilePreviewModal.js`, helpers y servicios API.

---

## Qué reconstruir en frontend (checklist)

### 1. Control de acceso (mismo criterio que antes)

```javascript
const canReconcileInventory = useMemo(
  () =>
    (roles || []).some((role) => {
      const text = `${role?.code || ""} ${role?.name || ""}`.toUpperCase();
      return text.includes("ADMIN")
        || (text.includes("LOGIST") && !text.includes("KIOSKO"))
        || (text.includes("SUPERVIS") && text.includes("KIOSKO"));
    }),
  [roles]
);
```

Usar `useAuth()` de `contexts/AuthContext`. Mostrar botón solo si `canReconcileInventory`.

### 2. Flujo UX obligatorio (preview → confirmar)

1. Usuario pulsa **Cuadrar con envío(s)**.
2. Llamar **preview** (GET).
3. Abrir `ShipmentReconcilePreviewModal` con el JSON.
4. Habilitar **Confirmar cuadre** solo si `preview.hasChanges === true`  
   (`hasChanges` = hay `DELETE_ENTRADA`, `TRIM_ENTRADA` o `DELETE_MERMA`; también puede incluir recálculo de stock sin borrados según versión del backend).
5. Al confirmar, llamar POST/PUT de ejecución.
6. Mostrar resultado con `formatShipmentReconcileMessage(result)` (`showSuccess` / `showWarning` si hay `warnings`).

### 3. Tres puntos de entrada (mismos que antes)

#### A) Inventario del Kiosko — `KioskInventory.js`

- Botón: **“Cuadrar con envíos”** (outline secondary), requiere kiosko seleccionado.
- Preview: `previewKioscoShipmentEntriesReconcile(Number(selectedLocation))`
- Ejecutar: `reconcileKioscoShipmentEntries(Number(selectedLocation))`
- Título modal: `"Vista previa: cuadrar con envíos entregados"`
- Tras éxito: `loadConsolidated()` + `refreshLocationData(selectedLocation)`

#### B) Recepción POS / panel envío — `ShipmentReceiptPanel.js` (componente interno de detalle)

- Visible si `status === DELIVERED'` y `shipment.locationId`.
- Botón: **“Cuadrar con envío”** junto a **“Sincronizar inventario kiosko”**.
- Preview: `previewDeliveredShipmentReceiptReconcile(shipment.id)`
- Ejecutar: `reconcileDeliveredShipmentReceiptInventory(shipment.id)`
- Tras éxito: callback `onRepaired()` si existe.

#### C) Preparar envíos — `PrepareShipments.js`

- Por fila de envío **DELIVERED** con kiosko destino (`isShipmentReceiptRepairable`).
- Botón size sm: **“Cuadrar con envío”**.
- Misma API por `shipment.id` que en B.
- Tras éxito: `reloadCurrentShipments()`.

### 4. Props del modal

```jsx
<ShipmentReconcilePreviewModal
  isOpen={reconcilePreviewOpen}
  toggle={closeReconcilePreview}
  title="..."  // según contexto
  preview={reconcilePreview}
  loading={reconcilePreviewLoading}
  error={reconcilePreviewError}
  applying={reconciling}
  onConfirm={() => void handleConfirmReconcileInventory()}
/>
```

### 5. Estado React mínimo por pantalla

```javascript
const [reconcilePreviewOpen, setReconcilePreviewOpen] = useState(false);
const [reconcilePreview, setReconcilePreview] = useState(null);
const [reconcilePreviewLoading, setReconcilePreviewLoading] = useState(false);
const [reconcilePreviewError, setReconcilePreviewError] = useState("");
const [reconciling, setReconciling] = useState(false);
```

En `PrepareShipments`, además guardar `reconcilePreviewShipment` para saber qué envío se confirma.

### 6. No confundir con “Sincronizar inventario kiosko”

| Acción | Propósito |
|--------|-----------|
| **Sincronizar inventario kiosko** | Carga lo **faltante** desde el envío (repair, mode `add`). Uso normal. |
| **Cuadrar con envío** | Quita **duplicados** y recalcula stock. Solo emergencia. |

---

## Después del cuadre (FOSS)

1. Revisar inventario en **Inventario del Kiosko**.
2. Si hay color con stock pero **`sizes_data` vacío o mal**: **AJUSTE** con cantidades reales por talla (`realSizes`).
3. Actualizar **conteo físico** si hay sesión abierta.
4. **No** usar cuadre como sustituto del ajuste por talla.

---

## Bloque para pegar en un prompt futuro

Copia desde aquí:

---

**Contexto Fossiles — reactivar UI de emergencia “Cuadrar con envíos”**

El backend ya tiene cuadre de ENTRADAs duplicadas de envíos DELIVERED. La UI se quitó a propósito; hay que **restaurar solo el frontend**.

**Objetivo:** Volver a mostrar botón + modal de vista previa + confirmación en:

1. `src/views/kiosks/KioskInventory.js` — cuadre de todos los envíos DELIVERED del kiosko seleccionado (`previewKioscoShipmentEntriesReconcile` / `reconcileKioscoShipmentEntries` desde `kioscoInventoryService.js`).
2. `src/components/distribution/ShipmentReceiptPanel.js` — un envío entregado (`previewDeliveredShipmentReceiptReconcile` / `reconcileDeliveredShipmentReceiptInventory` desde `productDistributionService.js`).
3. `src/views/distribution/PrepareShipments.js` — misma API por envío en la tabla.

**Reutilizar sin reescribir:**

- `src/components/distribution/ShipmentReconcilePreviewModal.js`
- `src/utils/shipmentReconcilePreviewHelper.js`
- `src/utils/shipmentReceiptRepairHelper.js` → `formatShipmentReconcileMessage`

**Flujo:** botón (solo admin/logística) → GET preview → modal → confirmar solo si `preview.hasChanges` → POST/PUT → toast con warnings.

**No tocar** el flujo normal: “Sincronizar inventario kiosko” (repair mode `add`) y AJUSTE FOSS por talla.

**Prerequisito ops:** migración `fossiles-core-back/scripts/migration-kiosco-movement-admin-delete.sql` en la BD.

Implementa los botones y handlers que existían antes de removerlos; no añadas cuadre a flujos que no tenían botón.

---
