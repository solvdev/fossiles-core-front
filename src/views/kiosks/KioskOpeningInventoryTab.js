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
import { ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import {
  applyKioscoOpeningInventory,
  getKioscoOpeningInventory,
  getKioscoOpeningInventoryStatus,
  saveKioscoOpeningInventoryItems,
  startKioscoOpeningInventory,
} from "services/kioscoInventoryService";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import { isFossCinchosProductCode } from "utils/cinchoProductionHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { sortSizeKeys, sumSizeCounts } from "utils/productCinchoHelper";
import { showSuccess, showWarning } from "utils/notificationHelper";
import "./KioskInventory.css";

const OPENING_REASON = "Inventario inicial - migración";

const ADULT_CINCHO_SIZES = ["32", "34", "36", "38", "40", "42"];
const KIDS_CINCHO_SIZES = ["18", "20", "22", "24", "26", "28"];

function resolveDefaultCinchoSizes(product) {
  return product?.cinchoForKids ? KIDS_CINCHO_SIZES : ADULT_CINCHO_SIZES;
}

function itemKey(productId, colorId) {
  return `${productId}:${colorId ?? ""}`;
}

function normalizeQty(value) {
  const n = parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
  stockRows,
  loadingStock,
  onRefreshStock,
  onInitializeInventory,
  initializingStock,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const [explorerProductId, setExplorerProductId] = useState("");
  const [explorerColorId, setExplorerColorId] = useState("");
  const [quantityDraft, setQuantityDraft] = useState("");
  const [sizeModalOpen, setSizeModalOpen] = useState(false);
  const [pendingSizes, setPendingSizes] = useState(null);

  const readOnly = report?.status === "APLICADO";
  const sessionId = report?.id;

  const selectedProduct = useMemo(
    () => (products || []).find((p) => Number(p.id) === Number(explorerProductId)) || null,
    [products, explorerProductId]
  );

  const isPackaging = isPackagingProductCode(selectedProduct?.code);
  const isFoss = isFossCinchosProductCode(selectedProduct?.code);

  const productVariants = useMemo(() => {
    if (!explorerProductId) return [];
    return (stockRows || []).filter((row) => Number(row.productId) === Number(explorerProductId));
  }, [stockRows, explorerProductId]);

  const selectedVariant = useMemo(() => {
    if (!productVariants.length) return null;
    if (explorerColorId) {
      return productVariants.find((row) => Number(row.colorId) === Number(explorerColorId)) || productVariants[0];
    }
    return productVariants.length === 1 ? productVariants[0] : null;
  }, [productVariants, explorerColorId]);

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

  const buildUpsertPayload = (productId, colorId, quantity, sizes) => ({
    productId: Number(productId),
    colorId: colorId != null && colorId !== "" ? Number(colorId) : null,
    quantity: normalizeQty(quantity),
    sizes: sizes && Object.keys(sizes).length > 0 ? sizes : undefined,
  });

  const persistItem = async (payload) => {
    if (!sessionId) throw new Error("No hay sesión activa.");
    const updated = await saveKioscoOpeningInventoryItems(sessionId, [payload]);
    setReport(updated);
    setStatus((prev) => ({ ...prev, draftItemCount: updated.itemCount || 0 }));
    return updated;
  };

  const handleAddItem = async () => {
    if (!selectedProduct || readOnly) return;
    if (!isPackaging && !explorerColorId && productVariants.length > 1) {
      showWarning("Selecciona un color antes de agregar.");
      return;
    }
    const colorId = isPackaging ? null : (explorerColorId || productVariants[0]?.colorId || null);
    let quantity = normalizeQty(quantityDraft);
    let sizes = pendingSizes;

    if (isFoss) {
      if (!sizes) {
        setSizeModalOpen(true);
        return;
      }
      quantity = sumSizeCounts(sizes);
    }

    if (quantity <= 0 && (!sizes || sumSizeCounts(sizes) <= 0)) {
      showWarning("Indica una cantidad mayor a cero.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await persistItem(buildUpsertPayload(selectedProduct.id, colorId, quantity, sizes));
      setQuantityDraft("");
      setPendingSizes(null);
      showSuccess("Ítem guardado en el borrador.");
    } catch (err) {
      setError(err.message || "No se pudo guardar el ítem.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (row) => {
    if (readOnly || !sessionId) return;
    setSaving(true);
    setError("");
    try {
      await persistItem({
        productId: row.productId,
        colorId: row.colorId ?? null,
        quantity: 0,
      });
      showSuccess("Ítem eliminado del borrador.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar el ítem.");
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    if (!sessionId || readOnly) return;
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
          Borrador en curso con <strong>{status.draftItemCount || 0}</strong> ítem(s) capturado(s).
        </Alert>
      );
    }
    return (
      <Alert color="warning" className="mb-3">
        Sin inventario inicial iniciado. Genere filas de stock si hace falta e inicie la sesión de captura.
      </Alert>
    );
  };

  const fossSizeKeys = useMemo(() => {
    if (!isFoss || !selectedProduct) return [];
    return sortSizeKeys(resolveDefaultCinchoSizes(selectedProduct));
  }, [isFoss, selectedProduct]);

  return (
    <div className="kiosk-opening-inventory-tab">
      {error ? <Alert color="danger">{error}</Alert> : null}
      {statusBanner()}

      {locationId && !loading && status?.status === "NONE" ? (
        <div className="mb-3 d-flex flex-wrap" style={{ gap: 8 }}>
          <Button color="primary" onClick={() => void handleStartSession()} disabled={saving}>
            {saving ? <Spinner size="sm" className="mr-2" /> : null}
            Iniciar inventario inicial
          </Button>
          {(stockRows || []).length === 0 ? (
            <Button
              color="primary"
              outline
              onClick={() => onInitializeInventory?.()}
              disabled={initializingStock}
            >
              {initializingStock ? "Generando…" : "Generar inventario (filas en cero)"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {locationId && (status?.status === "DRAFT" || status?.status === "APLICADO") ? (
        <Row>
          <Col lg="5">
            <Card className="border mb-3">
              <CardHeader>
                <CardTitle tag="h6" className="mb-0">Buscar producto</CardTitle>
              </CardHeader>
              <CardBody>
                {!readOnly ? (
                  <>
                    <FormGroup className="mb-2">
                      <Label className="mb-1">Producto</Label>
                      <ProductSelector
                        products={products}
                        value={explorerProductId}
                        onChange={(product) => {
                          setExplorerProductId(product ? String(product.id) : "");
                          setExplorerColorId("");
                          setQuantityDraft("");
                          setPendingSizes(null);
                        }}
                        placeholder="Buscar producto…"
                        disabled={!locationId || loadingStock}
                      />
                    </FormGroup>
                    {loadingStock ? (
                      <div className="text-muted small mb-2">
                        <Spinner size="sm" className="mr-1" />
                        Cargando stock…
                      </div>
                    ) : null}
                    {selectedProduct && productVariants.length > 1 ? (
                      <FormGroup className="mb-2">
                        <Label className="mb-1">Color / variante</Label>
                        <div>
                          {productVariants.map((row) => {
                            const active = explorerColorId && Number(row.colorId) === Number(explorerColorId);
                            return (
                              <Badge
                                key={row.id || `${row.productId}-${row.colorId}`}
                                color={active ? "primary" : "secondary"}
                                className={`kiosk-inv-color-pill ${active ? "active" : ""}`}
                                onClick={() => setExplorerColorId(row.colorId ? String(row.colorId) : "")}
                                style={{ cursor: "pointer" }}
                              >
                                {row.colorName || "Sin color"} · stock {row.currentStock ?? 0}
                              </Badge>
                            );
                          })}
                        </div>
                      </FormGroup>
                    ) : null}
                    {selectedProduct && productVariants.length === 0 ? (
                      <Alert color="warning" className="py-2 mb-2">
                        Este producto no tiene fila de stock en el kiosko. Use «Generar inventario» primero
                        {isPackaging ? " (empaques SUM- incluidos)." : "."}
                      </Alert>
                    ) : null}
                    {selectedVariant ? (
                      <div className="text-muted small mb-2">
                        Stock actual en kiosko: <strong>{selectedVariant.currentStock ?? 0}</strong>
                      </div>
                    ) : null}
                    {selectedProduct && !isFoss ? (
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
                    ) : null}
                    {selectedProduct && isFoss ? (
                      <div className="mb-2">
                        <div className="d-flex align-items-center justify-content-between mb-1">
                          <Label className="mb-0">Cantidad por talla (FOSS)</Label>
                          <strong>{normalizeQty(quantityDraft) || sumSizeCounts(pendingSizes || {})}</strong>
                        </div>
                        <Button
                          color="primary"
                          outline
                          size="sm"
                          onClick={() => setSizeModalOpen(true)}
                          disabled={saving || (!explorerColorId && productVariants.length > 1)}
                        >
                          {pendingSizes ? "Editar tallas" : "Capturar tallas"}
                        </Button>
                      </div>
                    ) : null}
                    {selectedProduct ? (
                      <Button
                        color="success"
                        size="sm"
                        onClick={() => void handleAddItem()}
                        disabled={saving}
                      >
                        {saving ? <Spinner size="sm" className="mr-1" /> : null}
                        Agregar al inventario inicial
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <Alert color="light" className="border mb-0 py-2">
                    Vista de solo lectura. Los movimientos generados tienen motivo «{OPENING_REASON}».
                  </Alert>
                )}
              </CardBody>
            </Card>
          </Col>

          <Col lg="7">
            <Card className="border mb-3">
              <CardHeader className="d-flex justify-content-between align-items-center">
                <CardTitle tag="h6" className="mb-0">
                  Ítems capturados ({report?.itemCount || 0})
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
              <CardBody className="p-0">
                {loading ? (
                  <div className="text-center py-4 text-muted">
                    <Spinner size="sm" className="mr-2" />
                    Cargando…
                  </div>
                ) : !(report?.items?.length > 0) ? (
                  <Alert color="light" className="border-0 mb-0 py-3 mx-3">
                    Aún no hay ítems. Busca un producto y agrégalo al borrador.
                  </Alert>
                ) : (
                  <div className="table-responsive">
                    <Table size="sm" hover className="mb-0">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Color</th>
                          <th>Tallas</th>
                          <th className="text-right">Cant.</th>
                          {!readOnly ? <th /> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {report.items.map((row) => (
                          <tr key={itemKey(row.productId, row.colorId)}>
                            <td>
                              <div>{row.productCode}</div>
                              <small className="text-muted">{row.productName}</small>
                              {row.packaging ? (
                                <Badge color="secondary" className="ml-1">Empaque</Badge>
                              ) : null}
                            </td>
                            <td>{row.colorName || (row.packaging ? "—" : "—")}</td>
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
        initialSizes={pendingSizes || {}}
        onApply={handleSizeModalApply}
        disabled={saving}
      />
    </div>
  );
}

export default KioskOpeningInventoryTab;
