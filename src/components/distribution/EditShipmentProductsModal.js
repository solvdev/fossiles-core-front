import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { ColorSelector, ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import { getColors } from "services/colorService";
import { getProducts } from "services/productService";
import { previewDispatchStock, updateShipmentProducts } from "services/productDistributionService";
import { isCinchoInventoryProductByCodeAndName } from "utils/cinchoProductionHelper";
import { HARDWARE_CONDITION_OPTIONS } from "utils/productCinchoHelper";
import { showError, showSuccess } from "utils/notificationHelper";

const normalizeStatus = (status) => String(status || "").trim().toUpperCase();

const emptyLine = () => ({
  key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  productId: "",
  colorId: "",
  size: "",
  hardwareCondition: "",
  quantity: 1,
  stockHint: "",
  stockLoading: false,
});

const lineFromProduct = (product, index) => ({
  key: `existing-${product.productId}-${product.colorId ?? "nc"}-${product.size || "ns"}-${product.hardwareCondition || "nh"}-${index}`,
  productId: String(product.productId || ""),
  colorId: product.colorId != null && product.colorId !== "" ? String(product.colorId) : "",
  size: String(product.size || product.sizeLabel || "").trim().toUpperCase(),
  hardwareCondition: String(product.hardwareCondition || "").trim().toUpperCase(),
  quantity: Number(product.quantity) || 1,
  stockHint: "",
  stockLoading: false,
});

function EditShipmentProductsModal({ isOpen, toggle, shipment, onSaved }) {
  const [lines, setLines] = useState([emptyLine()]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);

  const shipmentStatus = normalizeStatus(shipment?.status);
  const isSent = shipmentStatus === "SENT";

  const resetFromShipment = useCallback(() => {
    const source = Array.isArray(shipment?.products) ? shipment.products : [];
    if (source.length > 0) {
      setLines(source.map((row, index) => lineFromProduct(row, index)));
    } else {
      setLines([emptyLine()]);
    }
  }, [shipment]);

  useEffect(() => {
    if (!isOpen || !shipment) return;
    resetFromShipment();
    setLoadingCatalog(true);
    Promise.all([getProducts(), getColors()])
      .then(([prods, cols]) => {
        setProducts(prods || []);
        setColors(cols || []);
      })
      .catch((err) => showError(err.message || "No se pudo cargar catálogo"))
      .finally(() => setLoadingCatalog(false));
  }, [isOpen, shipment, resetFromShipment]);

  const productsById = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p) => map.set(Number(p.id), p));
    return map;
  }, [products]);

  const getLineProduct = (row) => productsById.get(Number(row.productId));

  const isLineCincho = (row) => {
    const product = getLineProduct(row);
    if (!product) return false;
    return isCinchoInventoryProductByCodeAndName(product.code, product.name);
  };

  const refreshLineStock = async (line) => {
    const pid = Number(line.productId);
    if (!Number.isFinite(pid) || pid <= 0) {
      return { ...line, stockHint: "", stockLoading: false };
    }
    try {
      const preview = await previewDispatchStock({
        productId: pid,
        colorId: line.colorId || null,
        size: line.size || "",
      });
      const breakdown = (preview?.breakdown || [])
        .map((b) => `${b.locationName || b.locationCode}: ${Number(b.quantity || 0)}`)
        .join(" · ");
      const hint = `Disp. ${Number(preview?.availableTotal || 0)} (${breakdown || "PT/Devoluciones"})`;
      return { ...line, stockHint: hint, stockLoading: false };
    } catch (err) {
      return { ...line, stockHint: err.message || "Sin stock", stockLoading: false };
    }
  };

  const patchLine = (key, patch) => {
    setLines((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const refreshLineStockByKey = async (key, rowOverride) => {
    const row = rowOverride || lines.find((l) => l.key === key);
    if (!row) return;
    patchLine(key, { stockLoading: true, stockHint: "Consultando…" });
    const updated = await refreshLineStock(row);
    patchLine(key, { stockHint: updated.stockHint, stockLoading: updated.stockLoading });
  };

  const onProductSelected = async (key, product) => {
    const productId = product ? String(product.id) : "";
    const nextRow = { ...(lines.find((l) => l.key === key) || {}), productId, stockHint: "" };
    patchLine(key, { productId, stockHint: "" });
    if (product) await refreshLineStockByKey(key, nextRow);
  };

  const onColorSelected = async (key, color) => {
    const colorId = color ? String(color.id) : "";
    const row = lines.find((l) => l.key === key);
    if (!row) return;
    const nextRow = { ...row, colorId, stockHint: "" };
    patchLine(key, { colorId, stockHint: "" });
    if (row.productId) await refreshLineStockByKey(key, nextRow);
  };

  const onLineFieldBlur = async (key) => {
    const row = lines.find((l) => l.key === key);
    if (!row) return;
    await refreshLineStockByKey(key, row);
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (key) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const handleSubmit = async () => {
    if (!shipment?.id) {
      showError("Envío no válido");
      return;
    }

    const payloadLines = lines
      .map((row) => ({
        productId: Number(row.productId),
        colorId: row.colorId ? Number(row.colorId) : null,
        size: String(row.size || "").trim().toUpperCase(),
        hardwareCondition: String(row.hardwareCondition || "").trim().toUpperCase() || null,
        quantity: Number(row.quantity) || 0,
        rowKey: row.key,
      }))
      .filter((row) => Number.isFinite(row.productId) && row.productId > 0 && row.quantity > 0);

    if (payloadLines.length === 0) {
      showError("Agregue al menos un producto con cantidad mayor a cero");
      return;
    }

    for (const row of payloadLines) {
      const source = lines.find((l) => l.key === row.rowKey);
      if (source && isLineCincho(source) && !row.size) {
        const product = getLineProduct(source);
        showError(`Indique talla para ${product?.code || "cincho"} — ${product?.name || "producto"}`);
        return;
      }
      if (source && isLineCincho(source) && !row.hardwareCondition) {
        const product = getLineProduct(source);
        showError(`Indique herraje (nuevo/viejo) para ${product?.code || "cincho"}`);
        return;
      }
    }

    const productsPayload = payloadLines.map(({ rowKey, ...rest }) => rest);
    setSaving(true);
    try {
      const updated = await updateShipmentProducts(shipment.id, productsPayload);
      showSuccess(`Envío ${updated.shipmentNumber || shipment.shipmentNumber || shipment.id} actualizado`);
      toggle();
      if (onSaved) await onSaved(updated);
    } catch (err) {
      showError(err.message || "No se pudo actualizar el envío");
    } finally {
      setSaving(false);
    }
  };

  const destinationLabel =
    shipment?.locationName ||
    shipment?.locationCode ||
    (shipment?.locationId ? `Kiosko #${shipment.locationId}` : "Sin destino");

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>
        Editar productos — {shipment?.shipmentNumber || "envío"}
      </ModalHeader>
      <ModalBody>
        {isSent && (
          <Alert color="warning" className="py-2">
            Este envío ya está <strong>en tránsito</strong>. Al guardar se revierte la salida anterior de Bodega
            PT/Devoluciones y se aplica la nueva composición del envío.
          </Alert>
        )}
        <Row className="mb-3">
          <Col md="6">
            <FormGroup className="mb-0">
              <Label className="mb-1">Destino</Label>
              <div className="form-control-plaintext border rounded px-2 py-1 bg-light">
                {destinationLabel}
              </div>
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup className="mb-0">
              <Label className="mb-1">Estado</Label>
              <div className="form-control-plaintext border rounded px-2 py-1 bg-light">
                {shipmentStatus || "—"}
              </div>
            </FormGroup>
          </Col>
        </Row>

        <div className="d-flex justify-content-between align-items-center mb-2">
          <strong>Productos</strong>
          <Button color="secondary" size="sm" outline onClick={addLine} disabled={loadingCatalog}>
            + Línea
          </Button>
        </div>
        <Table size="sm" bordered responsive className="mb-0">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Color</th>
              <th>Talla</th>
              <th>Herraje</th>
              <th style={{ width: 90 }}>Cant.</th>
              <th>Stock PT/Dev.</th>
              <th style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => {
              const cincho = isLineCincho(row);
              return (
                <tr key={row.key}>
                  <td style={{ minWidth: 260 }}>
                    <ProductSelector
                      products={products}
                      value={row.productId}
                      disabled={loadingCatalog}
                      onChange={(product) => onProductSelected(row.key, product)}
                    />
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <ColorSelector
                      colors={colors}
                      value={row.colorId}
                      disabled={loadingCatalog || !row.productId}
                      onChange={(color) => onColorSelected(row.key, color)}
                    />
                  </td>
                  <td style={{ minWidth: 100 }}>
                    <Input
                      value={row.size}
                      disabled={!row.productId}
                      onChange={(e) =>
                        patchLine(row.key, { size: e.target.value.toUpperCase(), stockHint: "" })
                      }
                      onBlur={() => onLineFieldBlur(row.key)}
                      placeholder={cincho ? "Ej: 34" : "Opcional"}
                      bsSize="sm"
                    />
                  </td>
                  <td style={{ minWidth: 120 }}>
                    {cincho ? (
                      <Input
                        type="select"
                        bsSize="sm"
                        value={row.hardwareCondition || ""}
                        disabled={!row.productId}
                        onChange={(e) =>
                          patchLine(row.key, { hardwareCondition: e.target.value || "" })
                        }
                      >
                        <option value="">Seleccione…</option>
                        {HARDWARE_CONDITION_OPTIONS.filter((opt) => opt.value).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Input>
                    ) : (
                      <span className="text-muted small">—</span>
                    )}
                  </td>
                  <td>
                    <Input
                      type="number"
                      min={1}
                      bsSize="sm"
                      value={row.quantity}
                      onChange={(e) => patchLine(row.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="small text-muted">
                    {row.stockLoading ? <Spinner size="sm" /> : row.stockHint || "—"}
                  </td>
                  <td>
                    <Button close onClick={() => removeLine(row.key)} title="Quitar" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handleSubmit} disabled={saving || loadingCatalog}>
          {saving ? <Spinner size="sm" /> : "Guardar cambios"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default EditShipmentProductsModal;
