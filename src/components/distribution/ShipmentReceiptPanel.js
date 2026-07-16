import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  Progress,
  Spinner,
  Table,
} from "reactstrap";
import { confirmReceipt, repairDeliveredShipmentReceiptInventory } from "services/productDistributionService";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import { formatShipmentReceiptRepairMessage } from "utils/shipmentReceiptRepairHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  buildCategoryOptions,
  buildColorOptions,
  formatQty,
  getColorSwatch,
  itemMatchesCategory,
  itemMatchesColor,
  normalizePosLabel,
  POS_COLOR_SWATCHES,
  resolveImageUrl,
} from "views/kiosks/pos/posUtils";
import "views/kiosks/KioskSales.css";

const shipmentMatchesSearch = (shipment, query) => {
  if (!query) return true;
  const header = normalizePosLabel(
    `${shipment.shipmentNumber || ""} ${shipment.locationName || ""} ${shipment.locationCode || ""}`
  );
  if (header.includes(query)) return true;
  return (shipment.products || []).some((product) =>
    normalizePosLabel(
      `${product.productCode || ""} ${product.productName || ""} ${product.colorName || ""} ${product.categoryName || ""}`
    ).includes(query)
  );
};

const shipmentMatchesProductFilters = (shipment, categoryFilter, colorFilter) => {
  const products = shipment.products || [];
  if (categoryFilter && !products.some((p) => itemMatchesCategory(p, categoryFilter))) {
    return false;
  }
  if (colorFilter && !products.some((p) => itemMatchesColor(p, colorFilter))) {
    return false;
  }
  return true;
};

export const filterShipmentsForReceipt = (shipments, { search, categoryFilter, colorFilter }) => {
  const query = normalizePosLabel(search);
  return (shipments || []).filter(
    (shipment) =>
      shipmentMatchesSearch(shipment, query) &&
      shipmentMatchesProductFilters(shipment, categoryFilter, colorFilter)
  );
};

export const shipmentSentTotal = (shipment) =>
  (shipment?.products || []).reduce((sum, p) => sum + Number(p.quantity || 0), 0);

export const shipmentReceivedTotal = (shipment, receivedByDetail = {}) => {
  if (!shipment) return 0;
  return (shipment.products || []).reduce(
    (sum, p) => sum + Number(receivedByDetail[p.id] ?? p.quantityReceived ?? 0),
    0
  );
};

const uniqueProductPreviews = (products, limit = 4) => {
  const seen = new Set();
  const previews = [];
  (products || []).forEach((product) => {
    const key = product.productId || product.productCode;
    if (seen.has(key)) return;
    seen.add(key);
    previews.push(product);
  });
  return previews.slice(0, limit);
};

const uniqueColors = (products) => {
  const colors = [];
  const seen = new Set();
  (products || []).forEach((product) => {
    const name = String(product.colorName || "").trim();
    if (!name) return;
    const norm = normalizePosLabel(name);
    if (seen.has(norm)) return;
    seen.add(norm);
    colors.push(name);
  });
  return colors;
};

export function ShipmentReceiptFilters({
  shipments,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  colorFilter,
  onColorFilterChange,
}) {
  const filterSource = useMemo(
    () => (shipments || []).flatMap((shipment) => shipment.products || []),
    [shipments]
  );
  const categoryOptions = useMemo(() => buildCategoryOptions(filterSource), [filterSource]);
  const colorOptions = useMemo(() => buildColorOptions(filterSource), [filterSource]);

  const handleCategoryClick = (option) => {
    if (option.disabled || option.id == null) return;
    const next = String(categoryFilter) === String(option.id) ? "" : String(option.id);
    onCategoryFilterChange(next);
  };

  const handleColorClick = (color, disabled) => {
    if (disabled) return;
    onColorFilterChange(colorFilter === color ? "" : color);
  };

  return (
    <div className="shipment-receipt-filters">
      <div className="kiosk-pos-search-wrap mb-3">
        <i className="nc-icon nc-zoom-split" />
        <Input
          className="kiosk-pos-search-input"
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar envío, código, producto o color..."
        />
      </div>

      <div className="kiosk-pos-filter-row">
        <span className="kiosk-pos-filter-label">Categoría</span>
        <div className="kiosk-pos-chips">
          <button
            type="button"
            className={`kiosk-pos-chip ${!categoryFilter ? "active" : ""}`}
            onClick={() => onCategoryFilterChange("")}
          >
            Todas
          </button>
          {categoryOptions.map((option) => (
            <button
              key={`receipt-cat-${option.label}-${option.id || "none"}`}
              type="button"
              className={`kiosk-pos-chip ${
                option.id != null && String(categoryFilter) === String(option.id) ? "active" : ""
              } ${option.disabled ? "disabled" : ""}`}
              onClick={() => handleCategoryClick(option)}
              disabled={option.disabled}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="kiosk-pos-filter-row mb-3">
        <span className="kiosk-pos-filter-label">Color</span>
        <div className="kiosk-pos-chips">
          <button
            type="button"
            className={`kiosk-pos-chip ${!colorFilter ? "active" : ""}`}
            onClick={() => onColorFilterChange("")}
          >
            Todos
          </button>
          {colorOptions.map(({ color, disabled }) => {
            const swatch = POS_COLOR_SWATCHES[color] || "#ccc";
            return (
              <button
                key={`receipt-color-${color}`}
                type="button"
                className={`kiosk-pos-chip ${colorFilter === color ? "active" : ""} ${
                  disabled ? "disabled" : ""
                }`}
                onClick={() => handleColorClick(color, disabled)}
                disabled={disabled}
              >
                <span className="kiosk-pos-color-dot" style={{ backgroundColor: swatch }} />
                {color}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ShipmentReceiptList({
  shipments,
  showLocation = false,
  selectedShipmentId = null,
  onSelectShipment,
  actionLabel = "Revisar y confirmar",
}) {
  if (!shipments.length) {
    return (
      <Alert color="light" className="mb-0">
        No hay envíos que coincidan con los filtros actuales.
      </Alert>
    );
  }

  return (
    <div className="shipment-receipt-list">
      {shipments.map((shipment) => {
        const sent = shipmentSentTotal(shipment);
        const received = shipmentReceivedTotal(shipment);
        const progressPct = sent > 0 ? Math.min(100, Math.round((received / sent) * 100)) : 0;
        const previews = uniqueProductPreviews(shipment.products);
        const colors = uniqueColors(shipment.products);
        const isSelected = selectedShipmentId === shipment.id;

        return (
          <Card
            key={shipment.id}
            className={`shipment-receipt-card mb-3${isSelected ? " shipment-receipt-card-selected" : ""}`}
          >
            <CardBody>
              <div className="d-flex flex-wrap justify-content-between align-items-start mb-2">
                <div>
                  <strong>{shipment.shipmentNumber || shipment.id}</strong>
                  {showLocation && (
                    <div className="text-muted small">
                      {shipment.locationName || "-"}
                      {shipment.locationCode ? ` (${shipment.locationCode})` : ""}
                    </div>
                  )}
                  <div className="mt-1">
                    <Badge color={String(shipment.status || "").toUpperCase() === "DELIVERED" ? "success" : "warning"}>
                      {String(shipment.status || "").toUpperCase() === "DELIVERED" ? "Entregado" : "En camino"}
                    </Badge>
                    <span className="text-muted small ml-2">
                      {shipment.sentAt ? formatDateTimeGt(shipment.sentAt) : "Sin fecha de envío"}
                    </span>
                  </div>
                </div>
                <Button
                  color={isSelected ? "secondary" : "success"}
                  size="sm"
                  onClick={() => onSelectShipment?.(shipment)}
                >
                  {isSelected ? "Cerrar" : actionLabel}
                </Button>
              </div>

              <div className="shipment-receipt-previews mb-2">
                {previews.map((product) => {
                  const imageUrl = resolveImageUrl(product.productImageUrl);
                  return (
                    <div key={`${shipment.id}-${product.productId}-${product.id}`} className="shipment-receipt-thumb">
                      {imageUrl ? (
                        <img src={imageUrl} alt={product.productName || product.productCode} />
                      ) : (
                        <div className="shipment-receipt-thumb-placeholder">
                          <i className="nc-icon nc-image" />
                        </div>
                      )}
                      <span className="shipment-receipt-thumb-code">{product.productCode}</span>
                    </div>
                  );
                })}
              </div>

              {colors.length > 0 && (
                <div className="shipment-receipt-color-row mb-2">
                  {colors.map((colorName) => (
                    <span
                      key={`${shipment.id}-${colorName}`}
                      className="shipment-receipt-color-chip"
                      title={colorName}
                    >
                      <span
                        className="kiosk-pos-color-dot"
                        style={{ backgroundColor: getColorSwatch(colorName) }}
                      />
                      {colorName}
                    </span>
                  ))}
                </div>
              )}

              <div className="shipment-receipt-progress">
                <div className="d-flex justify-content-between small text-muted mb-1">
                  <span>
                    Enviado: <strong>{formatQty(sent)}</strong>
                  </span>
                  <span>
                    Recibido: <strong>{formatQty(received)}</strong> · Líneas:{" "}
                    {(shipment.products || []).length}
                  </span>
                </div>
                <Progress value={progressPct} color={progressPct >= 100 ? "success" : "info"} />
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

export function ShipmentReceiptDetail({
  shipment,
  onConfirmed,
  onRepaired,
  readOnly = false,
  successMessage = "Recepción confirmada. Inventario de kiosko actualizado.",
}) {
  const [receivedByDetail, setReceivedByDetail] = useState({});
  const [lineNotesByDetail, setLineNotesByDetail] = useState({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const isDelivered = String(shipment?.status || "").toUpperCase() === "DELIVERED";

  useEffect(() => {
    if (!shipment) {
      setReceivedByDetail({});
      setLineNotesByDetail({});
      setNotes("");
      return;
    }
    const qtyMap = {};
    const noteMap = {};
    (shipment.products || []).forEach((product) => {
      qtyMap[product.id] = Number(product.quantityReceived ?? product.quantity ?? 0);
      noteMap[product.id] = product.receivedLineNotes || "";
    });
    setReceivedByDetail(qtyMap);
    setLineNotesByDetail(noteMap);
    setNotes("");
  }, [shipment]);

  const totalSent = useMemo(() => shipmentSentTotal(shipment), [shipment]);
  const totalReceived = useMemo(
    () => Object.values(receivedByDetail).reduce((sum, qty) => sum + Number(qty || 0), 0),
    [receivedByDetail]
  );

  const updateReceivedQty = (detailId, value, max) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      setReceivedByDetail((prev) => ({ ...prev, [detailId]: 0 }));
      return;
    }
    const bounded = Math.max(0, Math.min(parsed, Number(max || 0)));
    setReceivedByDetail((prev) => ({ ...prev, [detailId]: bounded }));
  };

  const receiveAllConforme = () => {
    const qtyMap = {};
    (shipment?.products || []).forEach((product) => {
      qtyMap[product.id] = Number(product.quantity ?? 0);
    });
    setReceivedByDetail(qtyMap);
  };

  const handleConfirm = async () => {
    if (!shipment?.id || readOnly) return;
    if (shipment.status && shipment.status !== "SENT") {
      showError("Solo se puede confirmar recepción para envíos en estado SENT.");
      return;
    }
    try {
      setSaving(true);
      const items = (shipment.products || []).map((product) => ({
        detailId: product.id,
        quantityReceived: Number(receivedByDetail[product.id] ?? product.quantity ?? 0),
        lineNotes: (lineNotesByDetail[product.id] || "").trim() || null,
      }));
      await confirmReceipt(shipment.id, {
        notes: notes.trim() || null,
        items,
      });
      showSuccess(successMessage);
      if (onConfirmed) {
        await onConfirmed();
      }
    } catch (err) {
      showError(err.message || "No se pudo confirmar la recepción.");
    } finally {
      setSaving(false);
    }
  };

  const handleRepairInventory = async () => {
    if (!shipment?.id || !isDelivered) return;
    if (
      !window.confirm(
        "¿Sincronizar inventario de kiosko con este envío entregado?\n\n"
          + "Se cargarán al kiosko todas las líneas del documento (productos, tallas y empaques SUM-) "
          + "según las cantidades recibidas del envío. No descarga archivos."
      )
    ) {
      return;
    }
    try {
      setRepairing(true);
      const result = await repairDeliveredShipmentReceiptInventory(shipment.id);
      const { message, warnings } = formatShipmentReceiptRepairMessage(result);
      if (warnings.length > 0) {
        showWarning(message);
      } else {
        showSuccess(message);
      }
      if (onRepaired) {
        await onRepaired();
      }
    } catch (err) {
      showError(err.message || "No se pudo reparar el inventario de recepción.");
    } finally {
      setRepairing(false);
    }
  };

  if (!shipment) return null;

  return (
    <div className="shipment-receipt-detail">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
        <small className="text-muted">
          Enviado: <strong>{formatQty(totalSent)}</strong> · Recibido:{" "}
          <strong>{formatQty(totalReceived)}</strong> · Faltante:{" "}
          <strong>{formatQty(Math.max(totalSent - totalReceived, 0))}</strong>
        </small>
        {!readOnly && (
          <Button color="default" size="sm" outline onClick={receiveAllConforme}>
            Recibir todo conforme
          </Button>
        )}
      </div>

      <Table responsive size="sm" className="kiosk-pos-receipt-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Color</th>
            <th className="text-right">Enviado</th>
            <th className="text-right">Recibido</th>
            <th>Nota</th>
          </tr>
        </thead>
        <tbody>
          {(shipment.products || []).map((product) => {
            const sent = Number(product.quantity || 0);
            const received = Number(receivedByDetail[product.id] ?? 0);
            const hasIssue = received < sent || Boolean((lineNotesByDetail[product.id] || "").trim());
            const lineNote = lineNotesByDetail[product.id] || "";
            const imageUrl = resolveImageUrl(product.productImageUrl);

            return (
              <tr
                key={product.id}
                className={hasIssue ? "kiosk-pos-receipt-row-issue" : ""}
              >
                <td>
                  <div className="d-flex align-items-start">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={product.productName || product.productCode}
                        className="shipment-receipt-line-thumb mr-2"
                      />
                    ) : (
                      <div className="shipment-receipt-line-thumb shipment-receipt-line-thumb-placeholder mr-2">
                        <i className="nc-icon nc-image" />
                      </div>
                    )}
                    <div>
                      <strong>{product.productCode || "-"}</strong>
                      <div className="small text-muted">{product.productName || "-"}</div>
                      {product.categoryName ? (
                        <div className="small text-muted">{product.categoryName}</div>
                      ) : null}
                      {product.size ? (
                        <Badge color="light" className="mt-1 mr-1">
                          Talla {product.size}
                        </Badge>
                      ) : null}
                      {product.hardwareCondition ? (
                        <Badge color="secondary" className="mt-1">
                          {String(product.hardwareCondition).toUpperCase() === "VIEJO"
                            ? "Herraje viejo"
                            : "Herraje nuevo"}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  {product.colorName ? (
                    <span className="shipment-receipt-color-chip">
                      <span
                        className="kiosk-pos-color-dot"
                        style={{ backgroundColor: getColorSwatch(product.colorName) }}
                      />
                      {product.colorName}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="text-right">{formatQty(sent)}</td>
                <td className="text-right" style={{ width: 90 }}>
                  {readOnly ? (
                    formatQty(received)
                  ) : (
                    <Input
                      type="number"
                      min="0"
                      max={sent}
                      step="0.001"
                      bsSize="sm"
                      value={received}
                      onChange={(e) => updateReceivedQty(product.id, e.target.value, sent)}
                    />
                  )}
                </td>
                <td>
                  {readOnly ? (
                    lineNote || "-"
                  ) : (
                    <>
                      <Input
                        type="text"
                        bsSize="sm"
                        placeholder="Ej. faltó 1, color incorrecto"
                        value={lineNote}
                        onChange={(e) =>
                          setLineNotesByDetail((prev) => ({
                            ...prev,
                            [product.id]: e.target.value,
                          }))
                        }
                      />
                      {lineNote.trim() && (
                        <Badge color="warning" className="mt-1">
                          Obs.
                        </Badge>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {!readOnly && (
        <>
          <Label className="kiosk-pos-label">Observación general del envío</Label>
          <Input
            type="textarea"
            rows="2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Comentarios adicionales para supervisión"
            className="mb-3"
          />
          <div className="text-right">
            <Button color="success" onClick={handleConfirm} disabled={saving}>
              {saving ? <Spinner size="sm" /> : "Confirmar recepción"}
            </Button>
          </div>
        </>
      )}

      {isDelivered && shipment.locationId && (
        <div className={readOnly ? "mt-0" : "mt-3 pt-3 border-top"}>
          <Alert color="light" className="border py-2 mb-2">
            Envío entregado. Si el stock kiosco no refleja este documento (productos, tallas o empaques SUM-),
            sincronice con el botón de abajo. No descarga archivos.
          </Alert>
          <div className="text-right d-flex flex-wrap justify-content-end" style={{ gap: 8 }}>
            <Button type="button" color="warning" outline onClick={handleRepairInventory} disabled={repairing}>
              {repairing ? <Spinner size="sm" /> : "Sincronizar inventario kiosco"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShipmentReceiptPanel({
  shipments = [],
  loading = false,
  kioskName,
  showLocation = false,
  selectedShipmentId,
  onSelectShipment,
  onConfirmed,
  emptyMessage = "No hay envíos pendientes de recepción.",
  headerTitle = "Recibir distribución",
  headerHint,
  onRefresh,
  refreshDisabled = false,
  embedded = false,
  actionLabel = "Revisar y confirmar",
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");

  const filteredShipments = useMemo(
    () => filterShipmentsForReceipt(shipments, { search, categoryFilter, colorFilter }),
    [shipments, search, categoryFilter, colorFilter]
  );

  const selectedShipment = useMemo(() => {
    if (selectedShipmentId == null) return null;
    return (
      filteredShipments.find((s) => s.id === selectedShipmentId) ||
      shipments.find((s) => s.id === selectedShipmentId) ||
      null
    );
  }, [filteredShipments, shipments, selectedShipmentId]);

  const resolvedHint =
    headerHint ||
    (kioskName
      ? `Pendientes para ${kioskName}. Revisa cada envío antes de confirmar.`
      : "Distribuciones en camino. Revisa cada envío antes de confirmar.");

  const panelBody = (
    <>
      {loading && shipments.length === 0 ? (
        <div className="text-center py-3">
          <Spinner color="primary" size="sm" />
        </div>
      ) : shipments.length === 0 ? (
        <Alert color="light" className="mb-0">
          {emptyMessage}
        </Alert>
      ) : (
        <>
          <ShipmentReceiptFilters
            shipments={shipments}
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            colorFilter={colorFilter}
            onColorFilterChange={setColorFilter}
          />

          <div className="d-flex justify-content-between align-items-center mb-3">
            <Badge color="warning">Envíos: {filteredShipments.length}</Badge>
          </div>

          <ShipmentReceiptList
            shipments={filteredShipments}
            showLocation={showLocation}
            selectedShipmentId={selectedShipmentId}
            onSelectShipment={onSelectShipment}
            actionLabel={actionLabel}
          />

          {selectedShipment && (
            <Card className="mt-3 shipment-receipt-detail-card">
              <CardHeader style={{ backgroundColor: "#eff6ff" }}>
                <h6 className="mb-0">
                  Recepción · {selectedShipment.shipmentNumber}
                  {showLocation && selectedShipment.locationName
                    ? ` (${selectedShipment.locationName})`
                    : ""}
                </h6>
              </CardHeader>
              <CardBody>
                <ShipmentReceiptDetail
                  shipment={selectedShipment}
                  readOnly={String(selectedShipment.status || "").toUpperCase() === "DELIVERED"}
                  onConfirmed={async () => {
                    if (onSelectShipment) {
                      onSelectShipment(null);
                    }
                    if (onConfirmed) {
                      await onConfirmed();
                    }
                  }}
                  onRepaired={onConfirmed}
                />
              </CardBody>
            </Card>
          )}

          {!selectedShipment && (
            <p className="text-muted small mt-3 mb-0">
              Puedes indicar faltantes o productos incorrectos por línea antes de confirmar.
            </p>
          )}
        </>
      )}
    </>
  );

  if (embedded) {
    return <div className="shipment-receipt-panel shipment-receipt-panel-embedded">{panelBody}</div>;
  }

  return (
    <Card className="kiosk-pos-block shipment-receipt-panel">
      <CardHeader className="d-flex justify-content-between align-items-center flex-wrap">
        <div>
          <h5 className="mb-1">{headerTitle}</h5>
          <small className="text-muted">{resolvedHint}</small>
        </div>
        {onRefresh && (
          <Button color="info" size="sm" outline onClick={onRefresh} disabled={refreshDisabled || loading}>
            {loading ? <Spinner size="sm" /> : "Actualizar"}
          </Button>
        )}
      </CardHeader>
      <CardBody>{panelBody}</CardBody>
    </Card>
  );
}
