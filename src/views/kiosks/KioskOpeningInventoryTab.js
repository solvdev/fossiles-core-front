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
  formatCinchoClassification,
  getHardwareConditionLabel,
  normalizeCinchoType,
  productMatchesCinchoFilter,
  resolveCinchoSizesForProduct,
  sortSizeKeys,
  sumSizeCounts,
} from "utils/productCinchoHelper";
import {
  PRODUCT_AUDIENCE_OPTIONS,
  getProductAudienceLabel,
  productMatchesAudienceFilter,
} from "utils/productAudienceHelper";
import { showSuccess, showWarning } from "utils/notificationHelper";
import "./KioskInventory.css";

const OPENING_REASON = "Inventario inicial - migración";

const CATEGORY_OPTIONS = [
  { value: "ALL", label: "Todos" },
  { value: "CINCHO", label: "Cinchos" },
  { value: "PACKAGING", label: "Empaque" },
  { value: "OTHER", label: "Otros" },
];

const DRAFT_CINCHO_FILTER_OPTIONS = CINCHO_FILTER_OPTIONS.filter((opt) => opt.value !== "NONE");

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

/** Cada estilo×color×talla (o estilo×color sin tallas) cuenta 1 unidad para cuadrar el conteo. */
function countOpeningCaptureStats(items) {
  const estilos = new Set();
  const colores = new Set();
  let unidades = 0;
  let piezas = 0;
  let tallas = 0;

  (items || []).forEach((row) => {
    if (!row) return;
    const productId = row.productId;
    if (productId == null) return;
    estilos.add(String(productId));
    colores.add(itemKey(productId, row.colorId, row.hardwareCondition));

    const sizes = row.sizes && typeof row.sizes === "object" ? row.sizes : null;
    const sizeEntries = sizes
      ? Object.entries(sizes).filter(([, qty]) => normalizeQty(qty) > 0)
      : [];

    if (sizeEntries.length > 0) {
      unidades += sizeEntries.length;
      tallas += sizeEntries.length;
      piezas += sizeEntries.reduce((sum, [, qty]) => sum + normalizeQty(qty), 0);
    } else {
      const qty = normalizeQty(row.quantity);
      if (qty > 0) {
        unidades += 1;
        piezas += qty;
      }
    }
  });

  return {
    estilos: estilos.size,
    colores: colores.size,
    tallas,
    unidades,
    piezas,
    lineas: (items || []).length,
  };
}

const EXTRA_SIZE_MIN = 16;
const EXTRA_SIZE_MAX = 70;

function OpeningInventorySizeModal({ isOpen, toggle, productLabel, sizeKeys, initialSizes, onApply, disabled }) {
  const [draft, setDraft] = useState({});
  const [orderedKeys, setOrderedKeys] = useState([]);
  const [extraSizeInput, setExtraSizeInput] = useState("");
  const [extraSizeError, setExtraSizeError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const keys = sortSizeKeys(sizeKeys || []);
    const next = {};
    keys.forEach((size) => {
      next[size] = String(normalizeQty(initialSizes?.[size]));
    });
    setDraft(next);
    setOrderedKeys(keys);
    setExtraSizeInput("");
    setExtraSizeError("");
  }, [isOpen, initialSizes, sizeKeys]);

  const total = sumSizeCounts(
    Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, normalizeQty(v)]))
  );

  const handleAddSize = () => {
    const raw = String(extraSizeInput || "").trim();
    if (!/^\d+$/.test(raw)) {
      setExtraSizeError("Ingresa un número entero.");
      return;
    }
    const n = Number(raw);
    if (n < EXTRA_SIZE_MIN || n > EXTRA_SIZE_MAX) {
      setExtraSizeError(`La talla debe estar entre ${EXTRA_SIZE_MIN} y ${EXTRA_SIZE_MAX}.`);
      return;
    }
    const key = String(n);
    if (orderedKeys.includes(key)) {
      setExtraSizeError(`La talla ${key} ya está en la lista.`);
      return;
    }
    setOrderedKeys((prev) => sortSizeKeys([...prev, key]));
    setDraft((prev) => ({ ...prev, [key]: "0" }));
    setExtraSizeInput("");
    setExtraSizeError("");
  };

  const handleApply = () => {
    const sizes = {};
    orderedKeys.forEach((size) => {
      sizes[size] = normalizeQty(draft[size]);
    });
    onApply(sizes, total);
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} centered>
      <ModalHeader toggle={toggle}>Tallas — {productLabel || "Producto"}</ModalHeader>
      <ModalBody>
        <Table size="sm" className="mb-2">
          <thead>
            <tr>
              <th>Talla</th>
              <th className="text-right">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {orderedKeys.map((size) => (
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
        {!disabled && (
          <div className="d-flex align-items-start flex-wrap" style={{ gap: 8 }}>
            <Input
              type="number"
              min={EXTRA_SIZE_MIN}
              max={EXTRA_SIZE_MAX}
              step="1"
              bsSize="sm"
              placeholder="Ej. 48"
              style={{ width: 100 }}
              value={extraSizeInput}
              onChange={(e) => {
                const next = e.target.value;
                if (next === "" || /^\d+$/.test(next)) {
                  setExtraSizeInput(next);
                  setExtraSizeError("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddSize();
                }
              }}
            />
            <Button color="secondary" outline size="sm" type="button" onClick={handleAddSize}>
              Agregar talla
            </Button>
            {extraSizeError ? (
              <div className="text-danger small w-100 mb-0">{extraSizeError}</div>
            ) : null}
          </div>
        )}
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
  const [draftCategoryFilter, setDraftCategoryFilter] = useState("ALL");
  const [draftAudienceFilter, setDraftAudienceFilter] = useState("");
  const [draftCinchoFilter, setDraftCinchoFilter] = useState("");

  const [selectedProductId, setSelectedProductId] = useState("");
  const [colorRows, setColorRows] = useState([]);
  const [colorPickerKey, setColorPickerKey] = useState(0);
  const [sizeModalOpen, setSizeModalOpen] = useState(false);
  const [sizeModalRowId, setSizeModalRowId] = useState(null);
  const [staging, setStaging] = useState([]);

  const readOnly = report?.status === "APLICADO";
  const sessionId = report?.id;

  const productsById = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p) => {
      if (p?.id != null) map.set(Number(p.id), p);
    });
    return map;
  }, [products]);

  const selectedProduct = useMemo(
    () => productsById.get(Number(selectedProductId)) || null,
    [productsById, selectedProductId]
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

  const alreadyInDraftKeys = useMemo(() => {
    const keys = new Set();
    (report?.items || []).forEach((row) => {
      keys.add(itemKey(row.productId, row.colorId, row.hardwareCondition));
    });
    return keys;
  }, [report]);

  const enrichedDraftItems = useMemo(() => {
    return (report?.items || []).map((row) => {
      const product = productsById.get(Number(row.productId));
      const code = product?.code || row.productCode;
      const name = product?.name || row.productName;
      return {
        ...row,
        code,
        name,
        audienceCategory: product?.audienceCategory,
        cinchoType: product?.cinchoType,
        cinchoForKids: Boolean(product?.cinchoForKids),
        audienceLabel: getProductAudienceLabel(product?.audienceCategory),
        cinchoLabel: formatCinchoClassification({
          cinchoType: product?.cinchoType,
          cinchoForKids: product?.cinchoForKids,
        }),
      };
    });
  }, [report, productsById]);

  const filteredDraftItems = useMemo(() => {
    const q = String(draftSearch || "").trim().toLowerCase();
    return enrichedDraftItems.filter((row) => {
      if (!productMatchesCategory(row, draftCategoryFilter)) return false;
      if (!productMatchesAudienceFilter(row, draftAudienceFilter)) return false;
      if (!productMatchesCinchoFilter(row, draftCinchoFilter)) return false;
      if (!q) return true;
      return (
        String(row.productCode || "").toLowerCase().includes(q)
        || String(row.productName || "").toLowerCase().includes(q)
        || String(row.colorName || "").toLowerCase().includes(q)
      );
    });
  }, [
    enrichedDraftItems,
    draftCategoryFilter,
    draftAudienceFilter,
    draftCinchoFilter,
    draftSearch,
  ]);

  const draftStats = useMemo(
    () => countOpeningCaptureStats(report?.items || []),
    [report]
  );

  const filteredDraftStats = useMemo(
    () => countOpeningCaptureStats(filteredDraftItems),
    [filteredDraftItems]
  );

  const draftFiltersActive = Boolean(
    draftCategoryFilter !== "ALL"
    || draftAudienceFilter
    || draftCinchoFilter
    || String(draftSearch || "").trim()
  );

  const stagingStats = useMemo(
    () => countOpeningCaptureStats(staging),
    [staging]
  );

  const projectedStats = useMemo(() => {
    if (!staging.length) return draftStats;
    const byKey = new Map();
    (report?.items || []).forEach((row) => {
      byKey.set(itemKey(row.productId, row.colorId, row.hardwareCondition), row);
    });
    staging.forEach((row) => {
      byKey.set(row.key, row);
    });
    return countOpeningCaptureStats(Array.from(byKey.values()));
  }, [report, staging, draftStats]);

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
    setColorRows([]);
    setSizeModalRowId(null);
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

  const makeColorRow = (color, hardware = "NUEVO") => ({
    rowId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    colorId: color?.id != null ? Number(color.id) : null,
    colorName: color?.name || "—",
    hardware,
    quantity: "",
    sizes: null,
  });

  const selectProduct = (product) => {
    setSelectedProductId(product ? String(product.id) : "");
    setSizeModalRowId(null);
    setSizeModalOpen(false);
    if (!product) {
      setColorRows([]);
      return;
    }
    if (isPackagingProductCode(product.code)) {
      setColorRows([makeColorRow(null)]);
    } else {
      setColorRows([]);
    }
    setColorPickerKey((k) => k + 1);
  };

  const handleAddColor = (color) => {
    if (!color?.id) return;
    setColorRows((prev) => [...prev, makeColorRow(color)]);
    setColorPickerKey((k) => k + 1);
  };

  const updateColorRow = (rowId, patch) => {
    setColorRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  const removeColorRow = (rowId) => {
    setColorRows((prev) => prev.filter((row) => row.rowId !== rowId));
  };

  const buildUpsertPayload = (productId, nextColorId, quantity, sizes, hardwareCondition) => ({
    productId: Number(productId),
    colorId: nextColorId != null && nextColorId !== "" ? Number(nextColorId) : null,
    hardwareCondition: hardwareCondition || "NUEVO",
    quantity: normalizeQty(quantity),
    sizes: sizes && Object.keys(sizes).length > 0 ? sizes : undefined,
  });

  const handleQueueColorRows = () => {
    if (!selectedProduct || readOnly) return;

    if (!isPackaging && colorRows.length === 0) {
      showWarning("Agrega al menos un color.");
      return;
    }

    const entries = [];
    for (const row of colorRows) {
      if (!isPackaging && row.colorId == null) {
        showWarning("Hay una fila sin color.");
        return;
      }

      let quantity = normalizeQty(row.quantity);
      let sizes = row.sizes;

      if (needsSizes) {
        if (!sizes || sumSizeCounts(sizes) <= 0) {
          showWarning(`Captura tallas para ${row.colorName} antes de agregar.`);
          return;
        }
        quantity = sumSizeCounts(sizes);
      }

      if (quantity <= 0) continue;

      const hardware = showHardware ? (row.hardware || "NUEVO") : "NUEVO";
      const key = itemKey(selectedProduct.id, isPackaging ? null : row.colorId, hardware);
      entries.push({
        key,
        productId: Number(selectedProduct.id),
        productCode: selectedProduct.code,
        productName: selectedProduct.name,
        colorId: isPackaging ? null : Number(row.colorId),
        colorName: isPackaging ? "—" : row.colorName,
        hardwareCondition: hardware,
        hardwareLabel: showHardware ? getHardwareConditionLabel(hardware) : "—",
        quantity,
        sizes: sizes || null,
        sizesSummary: formatSizesSummary(sizes) || "—",
        packaging: isPackaging,
      });
    }

    if (!entries.length) {
      showWarning("Indica cantidad (> 0) en al menos una fila.");
      return;
    }

    setStaging((prev) => {
      const keys = new Set(entries.map((e) => e.key));
      const without = prev.filter((row) => !keys.has(row.key));
      return [...entries, ...without];
    });

    if (isPackaging) {
      setColorRows([makeColorRow(null)]);
    } else {
      setColorRows([]);
    }
    setColorPickerKey((k) => k + 1);
    showSuccess(`${entries.length} ítem(s) agregados a la cola.`);
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

  const sizeModalRow = useMemo(
    () => colorRows.find((row) => row.rowId === sizeModalRowId) || null,
    [colorRows, sizeModalRowId]
  );

  const handleSizeModalApply = (sizes, total) => {
    if (!sizeModalRowId) return;
    updateColorRow(sizeModalRowId, {
      sizes,
      quantity: String(total),
    });
    setSizeModalOpen(false);
    setSizeModalRowId(null);
  };

  const fossSizeKeys = useMemo(() => {
    if (!needsSizes || !selectedProduct) return [];
    const keys = new Set(resolveCinchoSizesForProduct(selectedProduct));
    Object.keys(sizeModalRow?.sizes || {}).forEach((k) => keys.add(k));
    return sortSizeKeys(keys);
  }, [needsSizes, selectedProduct, sizeModalRow]);

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
          Cada estilo×color×talla cuenta como <strong>1 unidad</strong> para cuadrar el conteo físico.
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
        <>
        <div className="kiosk-opening-counters mb-3">
          <div className="kiosk-opening-counter-card">
            <div className="kiosk-opening-counter-label">Estilos</div>
            <div className="kiosk-opening-counter-value">{draftStats.estilos}</div>
          </div>
          <div className="kiosk-opening-counter-card">
            <div className="kiosk-opening-counter-label">Colores</div>
            <div className="kiosk-opening-counter-value">{draftStats.colores}</div>
          </div>
          <div className="kiosk-opening-counter-card">
            <div className="kiosk-opening-counter-label">Tallas</div>
            <div className="kiosk-opening-counter-value">{draftStats.tallas}</div>
          </div>
          <div className="kiosk-opening-counter-card accent">
            <div className="kiosk-opening-counter-label">Unidades</div>
            <div className="kiosk-opening-counter-value">{draftStats.unidades}</div>
            <div className="kiosk-opening-counter-hint">estilo × color × talla</div>
          </div>
          <div className="kiosk-opening-counter-card">
            <div className="kiosk-opening-counter-label">Piezas</div>
            <div className="kiosk-opening-counter-value">{draftStats.piezas}</div>
            <div className="kiosk-opening-counter-hint">suma de cantidades</div>
          </div>
        </div>
        {staging.length > 0 ? (
          <Alert color="light" className="border mb-3 py-2">
            Cola sin guardar: <strong>{stagingStats.unidades}</strong> unidad(es)
            {" "}· Si la guardas, irías a{" "}
            <strong>{projectedStats.unidades}</strong> unidades /
            {" "}{projectedStats.estilos} estilos /
            {" "}{projectedStats.colores} colores /
            {" "}{projectedStats.tallas} tallas.
          </Alert>
        ) : null}

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
                          {needsSizes ? <Badge color="info" className="ml-1">Por tallas</Badge> : null}
                        </div>

                        {!isPackaging ? (
                          <FormGroup className="mb-2">
                            <Label className="mb-1">Agregar colores</Label>
                            <ColorSelector
                              key={colorPickerKey}
                              colors={colors}
                              value=""
                              onChange={(color) => {
                                if (color) handleAddColor(color);
                              }}
                              placeholder="Buscar y agregar color…"
                              disabled={saving}
                            />
                            <small className="text-muted d-block mt-1">
                              Puedes agregar varios. Si el mismo color tiene herraje nuevo y viejo, agrégalo dos veces.
                            </small>
                          </FormGroup>
                        ) : null}

                        {colorRows.length === 0 ? (
                          <Alert color="light" className="border mb-2 py-2">
                            {isPackaging
                              ? "Indica la cantidad del empaque."
                              : "Agrega uno o más colores para capturar cantidades."}
                          </Alert>
                        ) : (
                          <div className="table-responsive mb-2">
                            <Table size="sm" className="mb-0 kiosk-opening-color-rows">
                              <thead>
                                <tr>
                                  <th>Color</th>
                                  {showHardware ? <th>Herraje</th> : null}
                                  <th className="text-right">{needsSizes ? "Tallas" : "Cant."}</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {colorRows.map((row) => (
                                  <tr key={row.rowId}>
                                    <td>{row.colorName}</td>
                                    {showHardware ? (
                                      <td>
                                        <div className="kiosk-opening-hw-toggle">
                                          <button
                                            type="button"
                                            className={`kiosk-opening-hw-btn ${(row.hardware || "NUEVO") === "NUEVO" ? "active is-nuevo" : ""}`}
                                            disabled={saving}
                                            onClick={() => updateColorRow(row.rowId, { hardware: "NUEVO" })}
                                          >
                                            Nuevo
                                          </button>
                                          <button
                                            type="button"
                                            className={`kiosk-opening-hw-btn ${(row.hardware || "NUEVO") === "VIEJO" ? "active is-viejo" : ""}`}
                                            disabled={saving}
                                            onClick={() => updateColorRow(row.rowId, { hardware: "VIEJO" })}
                                          >
                                            Viejo
                                          </button>
                                        </div>
                                      </td>
                                    ) : null}
                                    <td className="text-right">
                                      {needsSizes ? (
                                        <div className="d-flex flex-column align-items-end">
                                          <Button
                                            color="primary"
                                            outline
                                            size="sm"
                                            disabled={saving}
                                            onClick={() => {
                                              setSizeModalRowId(row.rowId);
                                              setSizeModalOpen(true);
                                            }}
                                          >
                                            {row.sizes ? "Editar tallas" : "Capturar tallas"}
                                          </Button>
                                          <small className="text-muted">
                                            {normalizeQty(row.quantity) || sumSizeCounts(row.sizes || {}) || 0} uds
                                          </small>
                                        </div>
                                      ) : (
                                        <Input
                                          type="number"
                                          min="0"
                                          step="1"
                                          bsSize="sm"
                                          style={{ width: 88, marginLeft: "auto" }}
                                          value={row.quantity}
                                          disabled={saving}
                                          onChange={(e) =>
                                            updateColorRow(row.rowId, { quantity: e.target.value })
                                          }
                                        />
                                      )}
                                    </td>
                                    <td className="text-right">
                                      {!isPackaging ? (
                                        <Button
                                          color="link"
                                          className="text-danger p-0"
                                          size="sm"
                                          onClick={() => removeColorRow(row.rowId)}
                                          disabled={saving}
                                        >
                                          Quitar
                                        </Button>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>
                        )}

                        <Button
                          color="success"
                          size="sm"
                          block
                          onClick={handleQueueColorRows}
                          disabled={saving || loadingStock || colorRows.length === 0}
                        >
                          Agregar {colorRows.length || ""} a la cola
                        </Button>
                      </>
                    ) : (
                      <Alert color="light" className="border mb-0 py-2">
                        Elige un producto, agrega varios colores y captura cantidad/herraje por fila.
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
                  3. Lista final — borrador ({draftStats.lineas} líneas · {draftStats.unidades} uds)
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
                <div className="kiosk-opening-draft-filters mb-2">
                  <div className="kiosk-opening-filter-chips">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`kiosk-opening-chip ${draftCategoryFilter === opt.value ? "active" : ""}`}
                        onClick={() => setDraftCategoryFilter(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <span className="kiosk-opening-filter-sep" aria-hidden="true" />
                    <button
                      type="button"
                      className={`kiosk-opening-chip ${draftAudienceFilter === "" ? "active" : ""}`}
                      onClick={() => setDraftAudienceFilter("")}
                    >
                      Línea: Todas
                    </button>
                    {PRODUCT_AUDIENCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`kiosk-opening-chip ${draftAudienceFilter === opt.value ? "active" : ""}`}
                        onClick={() => setDraftAudienceFilter(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <span className="kiosk-opening-filter-sep" aria-hidden="true" />
                    {DRAFT_CINCHO_FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value || "all"}
                        type="button"
                        className={`kiosk-opening-chip ${draftCinchoFilter === opt.value ? "active" : ""}`}
                        onClick={() => setDraftCinchoFilter(opt.value)}
                      >
                        {opt.value === "" ? "Cinchos: Todos" : opt.label}
                      </button>
                    ))}
                  </div>
                  {draftFiltersActive ? (
                    <small className="text-muted d-block mt-1">
                      Vista filtrada: {filteredDraftStats.lineas} líneas · {filteredDraftStats.unidades} uds
                      {" "}(de {draftStats.lineas} · {draftStats.unidades})
                    </small>
                  ) : null}
                </div>
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
                    Ningún ítem coincide con los filtros actuales.
                  </Alert>
                ) : (
                  <div className="table-responsive kiosk-opening-final-table">
                    <Table size="sm" hover className="mb-0">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Línea</th>
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
                              <div className="mt-1">
                                {row.packaging ? (
                                  <Badge color="secondary" className="mr-1">Empaque</Badge>
                                ) : null}
                                {row.cinchoLabel && row.cinchoLabel !== "—" ? (
                                  <Badge color="info" className="mr-1">{row.cinchoLabel}</Badge>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              <small>{row.packaging ? "—" : row.audienceLabel}</small>
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
        </>
      ) : null}

      <OpeningInventorySizeModal
        isOpen={sizeModalOpen}
        toggle={() => {
          setSizeModalOpen(false);
          setSizeModalRowId(null);
        }}
        productLabel={
          selectedProduct
            ? `${selectedProduct.code} — ${selectedProduct.name}${sizeModalRow ? ` · ${sizeModalRow.colorName}` : ""}`
            : ""
        }
        sizeKeys={fossSizeKeys}
        initialSizes={sizeModalRow?.sizes || {}}
        onApply={handleSizeModalApply}
        disabled={saving}
      />
    </div>
  );
}

export default KioskOpeningInventoryTab;
