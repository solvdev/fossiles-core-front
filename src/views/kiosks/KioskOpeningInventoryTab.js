import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
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
import { ColorSelector } from "components/catalog/FilterableCatalogSelectors";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import {
  applyKioscoOpeningInventory,
  getKioscoOpeningInventory,
  getKioscoOpeningInventoryStatus,
  saveKioscoOpeningInventoryItems,
  startKioscoOpeningInventory,
} from "services/kioscoInventoryService";
import { isCinchoInventoryProduct, isFossCinchosProductCode } from "utils/cinchoProductionHelper";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  CINCHO_FILTER_OPTIONS,
  getHardwareConditionLabel,
  HARDWARE_CONDITION_OPTIONS,
  normalizeCinchoType,
  productMatchesCinchoFilter,
  resolveCinchoSizesForProduct,
  sortSizeKeys,
  sumSizeCounts,
} from "utils/productCinchoHelper";
import { showSuccess, showWarning } from "utils/notificationHelper";
import "./KioskInventory.css";

const OPENING_REASON = "Inventario inicial - migración";

const CATEGORY_OPTIONS = [
  { value: "ALL", label: "Todos" },
  { value: "CINCHO", label: "Cinchos" },
  { value: "PACKAGING", label: "Empaque" },
  { value: "OTHER", label: "Otros" },
];

function itemKey(productId, colorId, hardwareCondition) {
  return `${productId}:${colorId ?? ""}:${hardwareCondition || "NUEVO"}`;
}

function normalizeQty(value) {
  const n = parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function productNeedsSizeBreakdown(product) {
  if (!product || isPackagingProductCode(product.code)) {
    return false;
  }
  return isFossCinchosProductCode(product.code) || isCinchoInventoryProduct(product);
}

function isCinchoProduct(product) {
  if (!product) return false;
  return Boolean(
    normalizeCinchoType(product.cinchoType)
    || product.cinchoForKids
    || isFossCinchosProductCode(product.code)
    || isCinchoInventoryProduct(product)
  );
}

function productMatchesCategory(product, category) {
  if (!category || category === "ALL") return true;
  const packaging = isPackagingProductCode(product?.code);
  const cincho = isCinchoProduct(product);
  if (category === "PACKAGING") return packaging;
  if (category === "CINCHO") return cincho && !packaging;
  if (category === "OTHER") return !packaging && !cincho;
  return true;
}

function productMatchesText(product, search) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;
  return (
    String(product?.code || "").toLowerCase().includes(q)
    || String(product?.name || "").toLowerCase().includes(q)
  );
}

function formatSizesSummary(sizes) {
  if (!sizes || typeof sizes !== "object") return "";
  return Object.entries(sizes)
    .filter(([, qty]) => Number(qty) > 0)
    .sort(([a], [b]) => Number(a) - Number(b) || String(a).localeCompare(String(b)))
    .map(([size, qty]) => `${size}:${qty}`)
    .join(" · ");
}

function OpeningInventorySizeModal({ isOpen, toggle, productLabel, sizeKeys, initialSizes, onApply, disabled }) {
  const [draft, setDraft] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    const next = {};
    (sizeKeys || []).forEach((size) => {
      next[size] = String(normalizeQty(initialSizes?.[size]));
    });
    setDraft(next);
  }, [isOpen, initialSizes, sizeKeys]);

  const total = sumSizeCounts(
    Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, normalizeQty(v)]))
  );

  const handleApply = () => {
    const sizes = {};
    Object.entries(draft).forEach(([size, value]) => {
      sizes[size] = normalizeQty(value);
    });
    onApply(sizes, total);
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} centered>
      <ModalHeader toggle={toggle}>Tallas — {productLabel || "Producto"}</ModalHeader>
      <ModalBody>
        <Table size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Talla</th>
              <th className="text-right">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {(sizeKeys || []).map((size) => (
              <tr key={size}>
                <td>{size}</td>
                <td className="text-right">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    bsSize="sm"
                    style={{ width: 80, marginLeft: "auto" }}
                    value={draft[size] ?? "0"}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === "" || /^\d+$/.test(next)) {
                        setDraft((prev) => ({ ...prev, [size]: next }));
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td className="text-right"><strong>{total}</strong></td>
            </tr>
          </tbody>
        </Table>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline size="sm" onClick={toggle}>Cancelar</Button>
        <Button color="primary" size="sm" onClick={handleApply} disabled={disabled}>
          Confirmar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function KioskOpeningInventoryTab({
  locationId,
  products,
  colors,
  stockRows,
  loadingStock,
  onRefreshStock,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [cinchoFilter, setCinchoFilter] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");

  const [selectedProductId, setSelectedProductId] = useState("");
  const [colorId, setColorId] = useState("");
  const [hardwareDraft, setHardwareDraft] = useState("NUEVO");
  const [quantityDraft, setQuantityDraft] = useState("");
  const [sizeModalOpen, setSizeModalOpen] = useState(false);
  const [pendingSizes, setPendingSizes] = useState(null);
  const [staging, setStaging] = useState([]);

  const readOnly = report?.status === "APLICADO";
  const sessionId = report?.id;

  const selectedProduct = useMemo(
    () => (products || []).find((p) => Number(p.id) === Number(selectedProductId)) || null,
    [products, selectedProductId]
  );

  const isPackaging = isPackagingProductCode(selectedProduct?.code);
  const needsSizes = productNeedsSizeBreakdown(selectedProduct);
  const showHardware = selectedProduct && !isPackaging;

  const filteredProducts = useMemo(() => {
    const list = (products || [])
      .filter((p) => productMatchesCategory(p, categoryFilter))
      .filter((p) => productMatchesCinchoFilter(p, cinchoFilter))
      .filter((p) => productMatchesText(p, productSearch))
      .sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), undefined, { numeric: true }));
    return list.slice(0, 80);
  }, [products, categoryFilter, cinchoFilter, productSearch]);

  const productVariants = useMemo(() => {
    if (!selectedProductId) return [];
    return (stockRows || []).filter((row) => Number(row.productId) === Number(selectedProductId));
  }, [stockRows, selectedProductId]);

  const selectedVariant = useMemo(() => {
    if (!productVariants.length) return null;
    const hw = showHardware ? hardwareDraft : null;
    return productVariants.find((row) => {
      const sameColor = isPackaging
        ? row.colorId == null
        : colorId
          ? Number(row.colorId) === Number(colorId)
          : false;
      const sameHw = !hw || String(row.hardwareCondition || "NUEVO").toUpperCase() === hw;
      return sameColor && sameHw;
    }) || null;
  }, [productVariants, colorId, hardwareDraft, showHardware, isPackaging]);

  const alreadyInDraftKeys = useMemo(() => {
    const keys = new Set();
    (report?.items || []).forEach((row) => {
      keys.add(itemKey(row.productId, row.colorId, row.hardwareCondition));
    });
    return keys;
  }, [report]);

  const filteredDraftItems = useMemo(() => {
    const q = String(draftSearch || "").trim().toLowerCase();
    const items = report?.items || [];
    if (!q) return items;
    return items.filter((row) =>
      String(row.productCode || "").toLowerCase().includes(q)
      || String(row.productName || "").toLowerCase().includes(q)
      || String(row.colorName || "").toLowerCase().includes(q)
    );
  }, [report, draftSearch]);

  const loadSession = useCallback(async () => {
    if (!locationId) {
      setStatus(null);
      setReport(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const estado = await getKioscoOpeningInventoryStatus(locationId);
      setStatus(estado);
      if (estado.status === "APLICADO" && estado.appliedId) {
        setReport(await getKioscoOpeningInventory(estado.appliedId));
      } else if (estado.status === "DRAFT" && estado.draftId) {
        setReport(await getKioscoOpeningInventory(estado.draftId));
      } else {
        setReport(null);
      }
    } catch (err) {
      setError(err.message || "No se pudo cargar el inventario inicial.");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    void loadSession();
    setStaging([]);
    setSelectedProductId("");
    setColorId("");
    setQuantityDraft("");
    setPendingSizes(null);
    setProductSearch("");
    setDraftSearch("");
  }, [loadSession]);

  const handleStartSession = async () => {
    if (!locationId) return;
    setSaving(true);
    setError("");
    try {
      const next = await startKioscoOpeningInventory(locationId);
      setReport(next);
      setStatus({ status: "DRAFT", draftId: next.id, draftItemCount: next.itemCount || 0 });
      showSuccess("Sesión de inventario inicial iniciada.");
    } catch (err) {
      setError(err.message || "No se pudo iniciar la sesión.");
    } finally {
      setSaving(false);
    }
  };

  const resetCaptureForm = () => {
    setQuantityDraft("");
    setPendingSizes(null);
  };

  const selectProduct = (product) => {
    setSelectedProductId(product ? String(product.id) : "");
    setColorId("");
    setHardwareDraft("NUEVO");
    resetCaptureForm();
  };

  const buildUpsertPayload = (productId, nextColorId, quantity, sizes, hardwareCondition) => ({
    productId: Number(productId),
    colorId: nextColorId != null && nextColorId !== "" ? Number(nextColorId) : null,
    hardwareCondition: hardwareCondition || "NUEVO",
    quantity: normalizeQty(quantity),
    sizes: sizes && Object.keys(sizes).length > 0 ? sizes : undefined,
  });

  const handleQueueItem = () => {
    if (!selectedProduct || readOnly) return;
    if (!isPackaging && !colorId) {
      showWarning("Selecciona un color antes de agregar.");
      return;
    }
    let quantity = normalizeQty(quantityDraft);
    let sizes = pendingSizes;

    if (needsSizes) {
      if (!sizes) {
        setSizeModalOpen(true);
        return;
      }
      quantity = sumSizeCounts(sizes);
    }

    if (quantity <= 0) {
      showWarning("Indica una cantidad mayor a cero.");
      return;
    }

    const key = itemKey(
      selectedProduct.id,
      isPackaging ? null : colorId,
      showHardware ? hardwareDraft : "NUEVO"
    );
    const colorName = isPackaging
      ? "—"
      : (colors || []).find((c) => Number(c.id) === Number(colorId))?.name || `Color ${colorId}`;

    const entry = {
      key,
      productId: Number(selectedProduct.id),
      productCode: selectedProduct.code,
      productName: selectedProduct.name,
      colorId: isPackaging ? null : Number(colorId),
      colorName,
      hardwareCondition: showHardware ? hardwareDraft : "NUEVO",
      hardwareLabel: showHardware ? getHardwareConditionLabel(hardwareDraft) : "—",
      quantity,
      sizes: sizes || null,
      sizesSummary: formatSizesSummary(sizes) || "—",
      packaging: isPackaging,
    };

    setStaging((prev) => {
      const without = prev.filter((row) => row.key !== key);
      return [entry, ...without];
    });
    resetCaptureForm();
    showSuccess("Agregado a la cola. Revísalo y guárdalo en el borrador.");
  };

  const handleSaveStaging = async () => {
    if (!sessionId || !staging.length || readOnly) return;
    setSaving(true);
    setError("");
    try {
      const payloads = staging.map((row) =>
        buildUpsertPayload(row.productId, row.colorId, row.quantity, row.sizes, row.hardwareCondition)
      );
      const updated = await saveKioscoOpeningInventoryItems(sessionId, payloads);
      setReport(updated);
      setStatus((prev) => ({ ...prev, draftItemCount: updated.itemCount || 0 }));
      setStaging([]);
      showSuccess(`${payloads.length} ítem(s) guardados en el borrador.`);
    } catch (err) {
      setError(err.message || "No se pudo guardar la cola.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (row) => {
    if (readOnly || !sessionId) return;
    setSaving(true);
    setError("");
    try {
      const updated = await saveKioscoOpeningInventoryItems(sessionId, [{
        productId: row.productId,
        colorId: row.colorId ?? null,
        hardwareCondition: row.hardwareCondition || "NUEVO",
        quantity: 0,
      }]);
      setReport(updated);
      setStatus((prev) => ({ ...prev, draftItemCount: updated.itemCount || 0 }));
      showSuccess("Ítem eliminado del borrador.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar el ítem.");
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    if (!sessionId || readOnly) return;
    if (staging.length > 0) {
      showWarning("Hay ítems en la cola sin guardar. Guárdalos o límpialos antes de aplicar.");
      return;
    }
    const confirmed = window.confirm(
      "¿Aplicar inventario inicial al stock?\n\nSe crearán movimientos AJUSTE con motivo «Inventario inicial - migración». Esta acción no se puede deshacer."
    );
    if (!confirmed) return;

    setApplying(true);
    setError("");
    try {
      const result = await applyKioscoOpeningInventory(sessionId, {});
      setReport(result);
      setStatus({
        status: "APLICADO",
        appliedId: result.id,
        appliedAt: result.appliedAt,
        appliedByName: result.appliedByName,
        draftItemCount: result.itemCount || 0,
      });
      if (result.warnings?.length) {
        result.warnings.forEach((w) => showWarning(w));
      }
      showSuccess("Inventario inicial aplicado al stock.");
      if (onRefreshStock) await onRefreshStock();
    } catch (err) {
      setError(err.message || "No se pudo aplicar el inventario inicial.");
    } finally {
      setApplying(false);
    }
  };

  const handleSizeModalApply = (sizes, total) => {
    setPendingSizes(sizes);
    setQuantityDraft(String(total));
    setSizeModalOpen(false);
  };

  const hardwareOptions = useMemo(
    () =>
      HARDWARE_CONDITION_OPTIONS
        .filter((opt) => opt.value)
        .map((opt) => ({
          value: opt.value,
          label: opt.label,
          searchText: opt.label,
        })),
    []
  );

  const fossSizeKeys = useMemo(() => {
    if (!needsSizes || !selectedProduct) return [];
    const keys = new Set(resolveCinchoSizesForProduct(selectedProduct));
    Object.keys(selectedVariant?.sizes || {}).forEach((k) => keys.add(k));
    Object.keys(pendingSizes || {}).forEach((k) => keys.add(k));
    return sortSizeKeys(keys);
  }, [needsSizes, selectedProduct, selectedVariant, pendingSizes]);

  const statusBanner = () => {
    if (!locationId) {
      return (
        <Alert color="light" className="border mb-3">
          Selecciona un kiosko para capturar el inventario inicial de migración.
        </Alert>
      );
    }
    if (loading) return null;
    if (status?.status === "APLICADO") {
      return (
        <Alert color="success" className="mb-3">
          Inventario inicial <strong>aplicado</strong>
          {status.appliedAt ? ` el ${formatDateTimeGt(status.appliedAt)}` : ""}
          {status.appliedByName ? ` por ${status.appliedByName}` : ""}.
          {" "}Solo lectura — los saldos quedaron en stock vía movimientos AJUSTE.
        </Alert>
      );
    }
    if (status?.status === "DRAFT") {
      return (
        <Alert color="info" className="mb-3">
          Busca productos, arma la <strong>cola</strong>, guárdala en el borrador y al final aplica al stock.
          Ahora: <strong>{status.draftItemCount || 0}</strong> en lista final
          {staging.length ? ` · ${staging.length} en cola` : ""}.
        </Alert>
      );
    }
    return (
      <Alert color="warning" className="mb-3">
        Sin inventario inicial. Inicia la sesión y captura solo lo que hay en el kiosko (no hace falta generar filas en cero).
      </Alert>
    );
  };

  return (
    <div className="kiosk-opening-inventory-tab">
      {error ? <Alert color="danger">{error}</Alert> : null}
      {statusBanner()}

      {locationId && !loading && status?.status === "NONE" ? (
        <div className="mb-3">
          <Button color="primary" onClick={() => void handleStartSession()} disabled={saving}>
            {saving ? <Spinner size="sm" className="mr-2" /> : null}
            Iniciar inventario inicial
          </Button>
        </div>
      ) : null}

      {locationId && (status?.status === "DRAFT" || status?.status === "APLICADO") ? (
        <Row>
          <Col lg="5">
            {!readOnly ? (
              <>
                <Card className="border mb-3">
                  <CardHeader>
                    <CardTitle tag="h6" className="mb-0">1. Buscar y capturar</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <div className="kiosk-opening-filter-chips mb-2">
                      {CATEGORY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`kiosk-opening-chip ${categoryFilter === opt.value ? "active" : ""}`}
                          onClick={() => setCategoryFilter(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {(categoryFilter === "ALL" || categoryFilter === "CINCHO") ? (
                      <FormGroup className="mb-2">
                        <Label className="mb-1">Tipo cincho</Label>
                        <FilterableSelect
                          value={cinchoFilter}
                          onChange={setCinchoFilter}
                          options={CINCHO_FILTER_OPTIONS.map((opt) => ({
                            value: opt.value,
                            label: opt.label,
                            searchText: opt.label,
                          }))}
                          placeholder="Filtrar cincho…"
                          allowEmpty={false}
                        />
                      </FormGroup>
                    ) : null}

                    <FormGroup className="mb-2">
                      <Label className="mb-1">Buscar producto</Label>
                      <Input
                        type="search"
                        bsSize="sm"
                        placeholder="Código o nombre…"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                    </FormGroup>

                    <div className="kiosk-opening-product-list mb-3">
                      {filteredProducts.length === 0 ? (
                        <div className="text-muted small p-2">Sin productos con ese filtro.</div>
                      ) : (
                        filteredProducts.map((product) => {
                          const active = Number(selectedProductId) === Number(product.id);
                          return (
                            <button
                              key={product.id}
                              type="button"
                              className={`kiosk-opening-product-row ${active ? "active" : ""}`}
                              onClick={() => selectProduct(product)}
                            >
                              <strong>{product.code}</strong>
                              <span>{product.name}</span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {selectedProduct ? (
                      <>
                        <div className="kiosk-opening-selected mb-2">
                          <strong>{selectedProduct.code}</strong> — {selectedProduct.name}
                          {isPackaging ? <Badge color="secondary" className="ml-1">Empaque</Badge> : null}
                        </div>

                        {!isPackaging ? (
                          <FormGroup className="mb-2">
                            <Label className="mb-1">Color</Label>
                            <ColorSelector
                              colors={colors}
                              value={colorId}
                              onChange={(color) => setColorId(color ? String(color.id) : "")}
                              placeholder="Buscar color…"
                              disabled={saving}
                            />
                          </FormGroup>
                        ) : null}

                        {showHardware ? (
                          <FormGroup className="mb-2">
                            <Label className="mb-1">Herraje</Label>
                            <FilterableSelect
                              value={hardwareDraft}
                              onChange={setHardwareDraft}
                              options={hardwareOptions}
                              placeholder="Buscar herraje…"
                              allowEmpty={false}
                              disabled={saving}
                            />
                          </FormGroup>
                        ) : null}

                        {selectedVariant ? (
                          <div className="text-muted small mb-2">
                            Stock actual: <strong>{selectedVariant.currentStock ?? 0}</strong>
                          </div>
                        ) : (
                          <div className="text-muted small mb-2">
                            Sin fila de stock aún — se creará al aplicar el inventario inicial.
                          </div>
                        )}

                        {!needsSizes ? (
                          <FormGroup className="mb-2">
                            <Label className="mb-1">Cantidad real</Label>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={quantityDraft}
                              onChange={(e) => setQuantityDraft(e.target.value)}
                              disabled={saving}
                            />
                          </FormGroup>
                        ) : (
                          <div className="mb-2">
                            <div className="d-flex align-items-center justify-content-between mb-1">
                              <Label className="mb-0">Cantidad por talla</Label>
                              <strong>{normalizeQty(quantityDraft) || sumSizeCounts(pendingSizes || {})}</strong>
                            </div>
                            <Button
                              color="primary"
                              outline
                              size="sm"
                              onClick={() => setSizeModalOpen(true)}
                              disabled={saving || (!isPackaging && !colorId)}
                            >
                              {pendingSizes ? "Editar tallas" : "Capturar tallas"}
                            </Button>
                          </div>
                        )}

                        <Button
                          color="success"
                          size="sm"
                          block
                          onClick={handleQueueItem}
                          disabled={saving || loadingStock}
                        >
                          Agregar a la cola
                        </Button>
                      </>
                    ) : (
                      <Alert color="light" className="border mb-0 py-2">
                        Elige un producto de la lista para capturar cantidad.
                      </Alert>
                    )}
                  </CardBody>
                </Card>

                <Card className="border mb-3">
                  <CardHeader className="d-flex justify-content-between align-items-center">
                    <CardTitle tag="h6" className="mb-0">
                      2. Cola por guardar ({staging.length})
                    </CardTitle>
                    <div className="d-flex" style={{ gap: 6 }}>
                      <Button
                        color="secondary"
                        outline
                        size="sm"
                        onClick={() => setStaging([])}
                        disabled={!staging.length || saving}
                      >
                        Limpiar
                      </Button>
                      <Button
                        color="primary"
                        size="sm"
                        onClick={() => void handleSaveStaging()}
                        disabled={!staging.length || saving}
                      >
                        {saving ? <Spinner size="sm" className="mr-1" /> : null}
                        Guardar en borrador
                      </Button>
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    {!staging.length ? (
                      <Alert color="light" className="border-0 mb-0 py-3 mx-3">
                        Aquí ves lo que vas a meter a la lista final antes de guardarlo.
                      </Alert>
                    ) : (
                      <div className="table-responsive">
                        <Table size="sm" className="mb-0">
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th>Color</th>
                              <th className="text-right">Cant.</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {staging.map((row) => (
                              <tr key={row.key}>
                                <td>
                                  <div>{row.productCode}</div>
                                  <small className="text-muted">
                                    {row.hardwareLabel}
                                    {row.sizesSummary && row.sizesSummary !== "—" ? ` · ${row.sizesSummary}` : ""}
                                  </small>
                                  {alreadyInDraftKeys.has(row.key) ? (
                                    <Badge color="warning" className="ml-1">Reemplaza</Badge>
                                  ) : null}
                                </td>
                                <td>{row.colorName}</td>
                                <td className="text-right">{row.quantity}</td>
                                <td className="text-right">
                                  <Button
                                    color="link"
                                    className="text-danger p-0"
                                    size="sm"
                                    onClick={() => setStaging((prev) => prev.filter((x) => x.key !== row.key))}
                                  >
                                    Quitar
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </>
            ) : (
              <Alert color="light" className="border mb-3 py-2">
                Vista de solo lectura. Los movimientos generados tienen motivo «{OPENING_REASON}».
              </Alert>
            )}
          </Col>

          <Col lg="7">
            <Card className="border mb-3">
              <CardHeader className="d-flex justify-content-between align-items-center flex-wrap" style={{ gap: 8 }}>
                <CardTitle tag="h6" className="mb-0">
                  3. Lista final — borrador ({report?.itemCount || 0})
                </CardTitle>
                {!readOnly ? (
                  <div className="d-flex" style={{ gap: 8 }}>
                    <Button
                      color="primary"
                      outline
                      size="sm"
                      onClick={() => void loadSession()}
                      disabled={loading || saving}
                    >
                      Recargar
                    </Button>
                    <Button
                      color="danger"
                      size="sm"
                      onClick={() => void handleApply()}
                      disabled={applying || saving || !(report?.itemCount > 0)}
                    >
                      {applying ? <Spinner size="sm" className="mr-1" /> : null}
                      Aplicar al stock
                    </Button>
                  </div>
                ) : null}
              </CardHeader>
              <CardBody className="pt-2">
                <FormGroup className="mb-2">
                  <Input
                    type="search"
                    bsSize="sm"
                    placeholder="Filtrar lista final (código, nombre, color)…"
                    value={draftSearch}
                    onChange={(e) => setDraftSearch(e.target.value)}
                  />
                </FormGroup>
                {loading ? (
                  <div className="text-center py-4 text-muted">
                    <Spinner size="sm" className="mr-2" />
                    Cargando…
                  </div>
                ) : !(report?.items?.length > 0) ? (
                  <Alert color="light" className="border mb-0 py-3">
                    La lista final está vacía. Captura productos, guárdalos desde la cola y luego aplica.
                  </Alert>
                ) : filteredDraftItems.length === 0 ? (
                  <Alert color="light" className="border mb-0 py-3">
                    Ningún ítem coincide con «{draftSearch}».
                  </Alert>
                ) : (
                  <div className="table-responsive kiosk-opening-final-table">
                    <Table size="sm" hover className="mb-0">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Color</th>
                          <th>Herraje</th>
                          <th>Tallas</th>
                          <th className="text-right">Cant.</th>
                          {!readOnly ? <th /> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDraftItems.map((row) => (
                          <tr key={itemKey(row.productId, row.colorId, row.hardwareCondition)}>
                            <td>
                              <div>{row.productCode}</div>
                              <small className="text-muted">{row.productName}</small>
                              {row.packaging ? (
                                <Badge color="secondary" className="ml-1">Empaque</Badge>
                              ) : null}
                            </td>
                            <td>{row.colorName || "—"}</td>
                            <td>
                              <small>{row.hardwareLabel || getHardwareConditionLabel(row.hardwareCondition)}</small>
                            </td>
                            <td><small>{row.sizesSummary || "—"}</small></td>
                            <td className="text-right">{row.quantity ?? 0}</td>
                            {!readOnly ? (
                              <td className="text-right">
                                <Button
                                  color="link"
                                  className="text-danger p-0"
                                  size="sm"
                                  onClick={() => void handleRemoveItem(row)}
                                  disabled={saving}
                                >
                                  Quitar
                                </Button>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>
      ) : null}

      <OpeningInventorySizeModal
        isOpen={sizeModalOpen}
        toggle={() => setSizeModalOpen(false)}
        productLabel={selectedProduct ? `${selectedProduct.code} — ${selectedProduct.name}` : ""}
        sizeKeys={fossSizeKeys}
        initialSizes={pendingSizes || selectedVariant?.sizes || {}}
        onApply={handleSizeModalApply}
        disabled={saving}
      />
    </div>
  );
}

export default KioskOpeningInventoryTab;
