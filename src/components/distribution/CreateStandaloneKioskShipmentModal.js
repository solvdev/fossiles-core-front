import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
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
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getColors } from "services/colorService";
import { getLocations } from "services/locationService";
import { searchMaterials } from "services/materialService";
import { getProducts } from "services/productService";
import { createStandaloneKioskShipment, previewDispatchStock } from "services/productDistributionService";
import { isCinchoInventoryProductByCodeAndName } from "utils/cinchoProductionHelper";
import { getDefaultShipmentDocumentDate } from "utils/prepareShipmentsOrderHelper";
import { showError, showSuccess } from "utils/notificationHelper";

const emptyLine = () => ({
  key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  productId: "",
  colorId: "",
  size: "",
  quantity: 1,
  stockHint: "",
  stockLoading: false,
});

function CreateStandaloneKioskShipmentModal({ isOpen, toggle, onCreated }) {
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [documentDate, setDocumentDate] = useState(() => getDefaultShipmentDocumentDate());
  const [lines, setLines] = useState([emptyLine()]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [kiosks, setKiosks] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packingMaterials, setPackingMaterials] = useState([]);
  const [loadingPackingMaterials, setLoadingPackingMaterials] = useState(false);
  const [packingSearch, setPackingSearch] = useState("");
  const [selectedPackingMaterialId, setSelectedPackingMaterialId] = useState("");
  const [packingQuantityInput, setPackingQuantityInput] = useState("");
  const [packingUnitPriceInput, setPackingUnitPriceInput] = useState("");
  const [shipmentPacking, setShipmentPacking] = useState({});
  const [shipmentPackingPrice, setShipmentPackingPrice] = useState({});

  const resetForm = useCallback(() => {
    setLocationId("");
    setNotes("");
    setDocumentDate(getDefaultShipmentDocumentDate());
    setLines([emptyLine()]);
    setPackingSearch("");
    setSelectedPackingMaterialId("");
    setPackingQuantityInput("");
    setPackingUnitPriceInput("");
    setShipmentPacking({});
    setShipmentPackingPrice({});
  }, []);

  const loadPackingMaterials = useCallback(async () => {
    try {
      setLoadingPackingMaterials(true);
      const data = await searchMaterials("SUM-", true);
      const onlySum = (Array.isArray(data) ? data : []).filter((item) =>
        String(item.sku || "").toUpperCase().startsWith("SUM-")
      );
      setPackingMaterials(onlySum);
    } catch (err) {
      console.error("Error loading packing materials:", err);
      setPackingMaterials([]);
    } finally {
      setLoadingPackingMaterials(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    setLoadingCatalog(true);
    Promise.all([getProducts(), getColors(), getLocations(), loadPackingMaterials()])
      .then(([prods, cols, locs]) => {
        setProducts(prods || []);
        setColors(cols || []);
        const rows = (locs || []).filter((loc) => {
          const cat = String(loc.category || loc.categoria || loc.locationCategory || "").toUpperCase();
          return cat.includes("KIOSKO") || cat === "KIOSK";
        });
        setKiosks(rows.length ? rows : locs || []);
      })
      .catch((err) => showError(err.message || "No se pudo cargar catálogo"))
      .finally(() => setLoadingCatalog(false));
  }, [isOpen, resetForm, loadPackingMaterials]);

  const kioskOptions = useMemo(
    () =>
      (kiosks || []).map((k) => ({
        value: String(k.id),
        label: `${k.code ? `${k.code} — ` : ""}${k.name || ""}`.trim(),
        searchText: `${k.code || ""} ${k.name || ""} ${k.category || k.categoria || ""}`,
      })),
    [kiosks]
  );

  const filteredPackingMaterials = useMemo(() => {
    const query = String(packingSearch || "").toLowerCase().trim();
    if (!query) return packingMaterials;
    return packingMaterials.filter((material) =>
      `${material.sku || ""} ${material.name || ""}`.toLowerCase().includes(query)
    );
  }, [packingMaterials, packingSearch]);

  const packingLines = useMemo(
    () =>
      Object.entries(shipmentPacking)
        .filter(([_, qty]) => Number(qty) > 0)
        .map(([materialId, quantity]) => {
          const material = packingMaterials.find((item) => Number(item.id) === Number(materialId));
          return {
            materialId: Number(materialId),
            quantity: Number(quantity),
            unitPrice: Number(shipmentPackingPrice[materialId] || 0),
            material,
          };
        }),
    [shipmentPacking, shipmentPackingPrice, packingMaterials]
  );

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

  const handleAddPacking = () => {
    const materialId = Number(selectedPackingMaterialId);
    const quantity = Number(packingQuantityInput);
    const unitPrice = Number(packingUnitPriceInput);
    if (!Number.isFinite(materialId) || materialId <= 0) {
      showError("Seleccione un empaque SUM-");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showError("Indique cantidad del empaque");
      return;
    }
    setShipmentPacking((prev) => ({
      ...prev,
      [materialId]: (Number(prev[materialId] || 0) + quantity).toFixed(3),
    }));
    if (Number.isFinite(unitPrice) && unitPrice > 0) {
      setShipmentPackingPrice((prev) => ({ ...prev, [materialId]: unitPrice }));
    }
    setSelectedPackingMaterialId("");
    setPackingQuantityInput("");
    setPackingUnitPriceInput("");
    setPackingSearch("");
  };

  const handleRemovePacking = (materialId) => {
    setShipmentPacking((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
    setShipmentPackingPrice((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!locationId) {
      showError("Seleccione el kiosko destino");
      return;
    }
    const payloadLines = lines
      .map((row) => ({
        productId: Number(row.productId),
        colorId: row.colorId ? Number(row.colorId) : null,
        size: String(row.size || "").trim().toUpperCase(),
        quantity: Number(row.quantity) || 0,
        rowKey: row.key,
      }))
      .filter((row) => Number.isFinite(row.productId) && row.productId > 0 && row.quantity > 0);

    const packingItems = packingLines.map(({ materialId, quantity, unitPrice }) => ({
      materialId,
      quantity,
      unitPrice: unitPrice > 0 ? unitPrice : undefined,
    }));

    if (payloadLines.length === 0 && packingItems.length === 0) {
      showError("Agregue al menos un producto o un empaque SUM- con cantidad mayor a cero");
      return;
    }

    for (const row of payloadLines) {
      const source = lines.find((l) => l.key === row.rowKey);
      if (source && isLineCincho(source) && !row.size) {
        const product = getLineProduct(source);
        showError(`Indique talla para ${product?.code || "cincho"} — ${product?.name || "producto"}`);
        return;
      }
    }

    const productsPayload = payloadLines.map(({ rowKey, ...rest }) => rest);
    setSaving(true);
    try {
      const created = await createStandaloneKioskShipment({
        locationId: Number(locationId),
        notes: notes.trim() || undefined,
        documentDate: documentDate || undefined,
        products: productsPayload.length > 0 ? productsPayload : undefined,
        packingItems: packingItems.length > 0 ? packingItems : undefined,
        confirmOnly: true,
      });
      showSuccess(
        `Envío ${created.shipmentNumber || created.id} generado (confirmado). Use Enviar cuando deba salir de bodega.`
      );
      toggle();
      if (onCreated) await onCreated(created);
    } catch (err) {
      showError(err.message || "No se pudo crear el envío");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>Envío directo a kiosko (sin OP)</ModalHeader>
      <ModalBody>
        <Alert color="info" className="py-2">
          Paso 1: <strong>Generar envío</strong> crea el documento confirmado (sin validar stock).
          Paso 2: en la tabla use <strong>Enviar</strong> cuando deba salir de Bodega PT hacia el kiosko.
          Los empaques <strong>SUM-</strong> se incluyen en el documento impreso.
        </Alert>
        <Row>
          <Col md="6">
            <FormGroup>
              <Label>Kiosko destino *</Label>
              <FilterableSelect
                value={locationId}
                onChange={setLocationId}
                options={kioskOptions}
                disabled={loadingCatalog}
                placeholder="Buscar kiosko…"
                emptyLabel="— Seleccione kiosko —"
              />
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup>
              <Label>Fecha documento</Label>
              <Input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup>
              <Label>Observaciones</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormGroup>
          </Col>
        </Row>

        <div className="d-flex justify-content-between align-items-center mb-2">
          <strong>Productos</strong>
          <Button color="secondary" size="sm" outline onClick={addLine}>
            + Línea
          </Button>
        </div>
        <Table size="sm" bordered responsive className="mb-3">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Color</th>
              <th>Talla</th>
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

        <Label>
          <strong>Empaques SUM-</strong>
          <small className="text-muted ml-2">(Opcional — se guardan en el detalle del envío)</small>
        </Label>
        {loadingPackingMaterials ? (
          <div className="text-muted py-2">Cargando empaques...</div>
        ) : packingMaterials.length === 0 ? (
          <Alert color="warning" className="mb-0">
            No se encontraron materiales con SKU SUM-.
          </Alert>
        ) : (
          <>
            <Row className="mt-2">
              <Col md="5">
                <Input
                  type="search"
                  value={packingSearch}
                  onChange={(e) => setPackingSearch(e.target.value)}
                  placeholder="Buscar empaque por SKU o nombre..."
                />
              </Col>
              <Col md="4">
                <Input
                  type="select"
                  value={selectedPackingMaterialId}
                  onChange={(e) => {
                    const materialId = e.target.value;
                    setSelectedPackingMaterialId(materialId);
                    const selected = packingMaterials.find((item) => String(item.id) === String(materialId));
                    const suggestedPrice = Number(
                      selected?.unitCost || selected?.purchasePrice || selected?.cost || 0
                    );
                    setPackingUnitPriceInput(
                      Number.isFinite(suggestedPrice) && suggestedPrice > 0 ? suggestedPrice.toFixed(2) : ""
                    );
                  }}
                >
                  <option value="">-- Seleccionar empaque --</option>
                  {filteredPackingMaterials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.sku} - {material.name}
                    </option>
                  ))}
                </Input>
              </Col>
              <Col md="1">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={packingQuantityInput}
                  onChange={(e) => setPackingQuantityInput(e.target.value)}
                  placeholder="Cant."
                />
              </Col>
              <Col md="2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={packingUnitPriceInput}
                  onChange={(e) => setPackingUnitPriceInput(e.target.value)}
                  placeholder="Precio unit."
                />
              </Col>
            </Row>
            <div className="text-right mt-2 mb-2">
              <Button color="info" size="sm" outline onClick={handleAddPacking}>
                + Agregar empaque
              </Button>
            </div>
            {packingLines.length > 0 && (
              <Table size="sm" bordered responsive className="mb-0">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Material</th>
                    <th>Cantidad</th>
                    <th>Precio unit.</th>
                    <th style={{ width: 44 }} />
                  </tr>
                </thead>
                <tbody>
                  {packingLines.map((line) => (
                    <tr key={line.materialId}>
                      <td><strong>{line.material?.sku || line.materialId}</strong></td>
                      <td>{line.material?.name || "—"}</td>
                      <td>
                        <Badge color="success">{Number(line.quantity).toFixed(3)}</Badge>
                      </td>
                      <td>{line.unitPrice > 0 ? line.unitPrice.toFixed(2) : "—"}</td>
                      <td>
                        <Button close onClick={() => handleRemovePacking(line.materialId)} title="Quitar" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button color="success" onClick={handleSubmit} disabled={saving || loadingCatalog}>
          {saving ? <Spinner size="sm" /> : "Generar envío"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CreateStandaloneKioskShipmentModal;
