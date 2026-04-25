import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button, Card, CardHeader, CardBody, CardTitle, Table, Alert,
  Modal, ModalHeader, ModalBody, ModalFooter, FormGroup, Label, Input,
  Row, Col, Badge, Nav, NavItem, NavLink, TabContent, TabPane, Spinner,
} from "reactstrap";
import { useTable, useFilters, useGlobalFilter, useSortBy, usePagination } from "react-table";
import { matchSorter } from "match-sorter";
import {
  getLeatherInventory, getLeatherMovements, getLeatherKardex,
  createLeatherReception, createLeatherDelivery,
  updateLeatherMovement, cancelLeatherMovement,
  initializeLeatherInventory,
} from "services/leatherInventoryService";
import { getMaterials, updateMaterial } from "services/materialService";
import { getProducts } from "services/productService";
import { getSuppliers } from "services/supplierService";
import { getProductionOrders } from "services/productionOrderService";
import { getTasks } from "services/taskService";
import { showSuccess, showError } from "utils/notificationHelper";
import { formatDateGt, formatNowGt } from "utils/dateTimeHelper";
import { formatProductionOrderSelectLabel, formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";

const formatNum = (n, dec = 2) =>
  n != null ? Number(n).toLocaleString("es-GT", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "—";
const formatQ = (n) =>
  n != null ? "Q " + Number(n).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const today = () => new Date().toISOString().split("T")[0];
const DEFAULT_RECEIVER_NAME = "DAVID FERNANDO GARCIA MORALES";

function DefaultColumnFilter({ column: { filterValue, setFilter } }) {
  return (
    <FormGroup className="mb-0 mt-1">
      <Input type="text" bsSize="sm" value={filterValue || ""}
        onChange={e => setFilter(e.target.value || undefined)} placeholder="Buscar..." />
    </FormGroup>
  );
}

const fuzzyTextFilterFn = (rows, id, filterValue) =>
  matchSorter(rows, filterValue, { keys: [row => row.values[id]] });
fuzzyTextFilterFn.autoRemove = val => !val || !val.length;

function LeatherInventory() {
  const [searchParams, setSearchParams] = useSearchParams();
  // ─── Estado global ─────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("inventory");
  const [inventory, setInventory] = useState([]);
  const [movements, setMovements] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ─── Filtros ───────────────────────────────────────────────────
  const [filterMaterial, setFilterMaterial] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterType, setFilterType] = useState("");

  // ─── Kardex ────────────────────────────────────────────────────
  const [kardexMaterial, setKardexMaterial] = useState("");
  const [kardexSearch, setKardexSearch] = useState("");
  const [kardexFrom, setKardexFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [kardexTo, setKardexTo] = useState(today());
  const [kardexData, setKardexData] = useState([]);
  const [kardexLoading, setKardexLoading] = useState(false);

  // ─── Modal Recepción ──────────────────────────────────────────
  const [showReceptionModal, setShowReceptionModal] = useState(false);
  const [receptionForm, setReceptionForm] = useState({
    movementDate: today(),
    supplierId: "",
    purchaseDocument: "",
    deliveredBy: DEFAULT_RECEIVER_NAME,
    receivedBy: "",
    observations: "",
  });
  const [receptionDraft, setReceptionDraft] = useState({ materialId: "", quantity: "", unitCost: "" });
  const [receptionMaterialSearch, setReceptionMaterialSearch] = useState("");
  const [receptionItems, setReceptionItems] = useState([]);
  const [savingReception, setSavingReception] = useState(false);

  // ─── Modal Entrega ─────────────────────────────────────────────
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [autoDeliveryPrefillDone, setAutoDeliveryPrefillDone] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState("WITH_PO");
  const [deliveryForm, setDeliveryForm] = useState({
    movementDate: today(),
    productionOrderId: "", deliveredBy: DEFAULT_RECEIVER_NAME, receivedBy: "", observations: "",
  });
  // Cada fila: { itemIdx, productName, colorName, quantity, leatherConsumption, leatherTotal, materialId, adjustedQty }
  const [deliveryItems, setDeliveryItems] = useState([]);
  const [deliveryBatchMaterialId, setDeliveryBatchMaterialId] = useState("");
  const [deliveryBatchMaterialSearch, setDeliveryBatchMaterialSearch] = useState("");
  const [deliveryRowMaterialSearch, setDeliveryRowMaterialSearch] = useState({});
  const [deliveryRowProductSearch, setDeliveryRowProductSearch] = useState({});
  const [savingDelivery, setSavingDelivery] = useState(false);

  // ─── Modal Editar ───────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: null, movementDate: "", deliveredBy: "", receivedBy: "",
    observations: "", purchaseDocument: "", supplierId: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // ─── Modal Anular ──────────────────────────────────────────────
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [savingCancel, setSavingCancel] = useState(false);

  // ─── Inicializar inventario ──────────────────────────────────
  const [initializing, setInitializing] = useState(false);
  const [showInitModal, setShowInitModal] = useState(false);

  // ─── Cueros: filtrar materiales que son tipo "cuero" ──────────
  const leatherMaterials = useMemo(() => {
    return materials.filter(m => {
      const n = (m.name || "").toLowerCase();
      const s = (m.sku || "").toLowerCase();
      return n.includes("cuero") || n.includes("piel") || n.includes("leather")
        || s.includes("cue") || s.includes("piel");
    });
  }, [materials]);

  // Si no se encuentran materiales con esos filtros, mostrar todos
  const materialOptions = leatherMaterials.length > 0 ? leatherMaterials : materials;

  const leatherOptionLabel = useCallback((m) => `${m.name || ""} (${m.sku || "-"})`, []);

  const resolveMaterialBySearch = useCallback((text) => {
    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) return null;
    return (
      materialOptions.find((m) => leatherOptionLabel(m).toLowerCase() === normalized) ||
      materialOptions.find((m) => String(m.id) === normalized) ||
      null
    );
  }, [materialOptions, leatherOptionLabel]);

  const topUsedLeatherOptions = useMemo(() => {
    const usage = {};
    (movements || []).forEach((m) => {
      if (!m?.materialId || m.movementType !== "SALIDA") return;
      const materialId = Number(m.materialId);
      if (!materialId) return;
      usage[materialId] = (usage[materialId] || 0) + Math.abs(Number(m.quantity || 0));
    });
    return Object.entries(usage)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([id]) => materialOptions.find((m) => Number(m.id) === Number(id)))
      .filter(Boolean);
  }, [movements, materialOptions]);

  const primaryLeatherOptions = useMemo(() => {
    return (materialOptions || []).filter((m) => Boolean(m.isPrimaryLeather));
  }, [materialOptions]);

  const primaryLeatherIds = useMemo(() => {
    return primaryLeatherOptions.map((m) => Number(m.id));
  }, [primaryLeatherOptions]);

  const quickLeatherOptions = useMemo(() => {
    const merged = [...primaryLeatherOptions, ...topUsedLeatherOptions];
    const dedup = [];
    const seen = new Set();
    merged.forEach((m) => {
      const id = Number(m.id);
      if (!id || seen.has(id)) return;
      seen.add(id);
      dedup.push(m);
    });
    return dedup;
  }, [primaryLeatherOptions, topUsedLeatherOptions]);

  // ─── Carga inicial ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [inv, mov, mats, sups, pos, prods] = await Promise.all([
        getLeatherInventory(),
        getLeatherMovements(),
        getMaterials(),
        getSuppliers(),
        getProductionOrders(),
        getProducts(),
      ]);
      const tks = await getTasks();
      setInventory(inv || []);
      setMovements(mov || []);
      setMaterials(mats || []);
      setSuppliers(sups || []);
      setProductionOrders(pos || []);
      setProducts(prods || []);
      setTasks(tks || []);
    } catch (err) {
      setError(err.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Filtrado de movimientos ───────────────────────────────────
  const filteredMovements = useMemo(() => {
    let result = movements;
    if (filterMaterial) result = result.filter(m => String(m.materialId) === filterMaterial);
    if (filterType) result = result.filter(m => m.movementType === filterType);
    if (filterFrom) result = result.filter(m => m.movementDate >= filterFrom);
    if (filterTo) result = result.filter(m => m.movementDate <= filterTo);
    return result;
  }, [movements, filterMaterial, filterType, filterFrom, filterTo]);

  // ─── Kardex ────────────────────────────────────────────────────
  const loadKardex = async () => {
    if (!kardexMaterial) { showError("Seleccione un tipo de cuero"); return; }
    setKardexLoading(true);
    try {
      const data = await getLeatherKardex(kardexMaterial, kardexFrom, kardexTo);
      setKardexData(data || []);
    } catch (err) {
      showError(err.message);
    } finally {
      setKardexLoading(false);
    }
  };

  // ─── Guardar Recepción ─────────────────────────────────────────
  const resetReceptionModal = () => {
    setReceptionForm({
      movementDate: today(),
      supplierId: "",
      purchaseDocument: "",
      deliveredBy: DEFAULT_RECEIVER_NAME,
      receivedBy: "",
      observations: "",
    });
    setReceptionDraft({ materialId: "", quantity: "", unitCost: "" });
    setReceptionMaterialSearch("");
    setReceptionItems([]);
  };

  const addReceptionItem = () => {
    const materialId = Number(receptionDraft.materialId);
    const quantity = Number(receptionDraft.quantity);
    const unitCost = receptionDraft.unitCost === "" ? null : Number(receptionDraft.unitCost);
    if (!materialId || !quantity || quantity <= 0) {
      showError("Seleccione cuero y cantidad válida para agregar.");
      return;
    }

    setReceptionItems(prev => [
      ...prev,
      {
        materialId,
        quantity,
        unitCost: unitCost != null && Number.isFinite(unitCost) ? unitCost : null,
      },
    ]);
    setReceptionDraft({ materialId: "", quantity: "", unitCost: "" });
    setReceptionMaterialSearch("");
  };

  const removeReceptionItem = (idx) => {
    setReceptionItems(prev => prev.filter((_, i) => i !== idx));
  };

  const togglePrimaryLeather = async (materialId) => {
    const id = Number(materialId);
    if (!id) return;
    const material = materialOptions.find((m) => Number(m.id) === id);
    if (!material) return;

    const nextPrimary = !Boolean(material.isPrimaryLeather);
    const purchaseUomId = material.purchaseUomId || material.uomId;
    const manufacturingUomId = material.manufacturingUomId || material.uomId;
    if (!purchaseUomId || !manufacturingUomId) {
      showError("Este material no tiene UOM configurada para poder guardarlo como principal.");
      return;
    }

    const payload = {
      sku: material.sku,
      name: material.name,
      purchaseUomId,
      purchaseQuantity: material.purchaseQuantity,
      purchasePrice: material.purchasePrice,
      manufacturingUomId,
      uomId: material.uomId,
      quantity: material.quantity,
      cost: material.cost,
      min: material.min,
      max: material.max,
      deliveryDays: material.deliveryDays,
      materialColorId: material.materialColorId,
      supplierId: material.supplierId,
      description: material.description,
      status: material.status,
      lossPercentage: material.lossPercentage,
      imageUrl: material.imageUrl,
      isPrimaryLeather: nextPrimary,
    };

    try {
      await updateMaterial(id, payload);
      showSuccess(nextPrimary ? "Cuero marcado como principal" : "Cuero removido de principales");
      await loadAll();
    } catch (err) {
      showError(err.message || "No se pudo actualizar el cuero principal");
    }
  };

  const handleSaveReception = async () => {
    if (receptionItems.length === 0) {
      showError("Agregue al menos un cuero para registrar la recepción.");
      return;
    }
    if (!receptionForm.deliveredBy || !receptionForm.deliveredBy.trim()) {
      showError("Complete el campo 'Entregado por'.");
      return;
    }
    if (!receptionForm.receivedBy || !receptionForm.receivedBy.trim()) {
      showError("Complete el campo 'Recibido por'.");
      return;
    }

    setSavingReception(true);
    try {
      const savedMovements = [];
      for (const item of receptionItems) {
        const saved = await createLeatherReception({
          materialId: Number(item.materialId),
          quantity: Number(item.quantity),
          unitCost: item.unitCost != null ? Number(item.unitCost) : null,
          movementDate: receptionForm.movementDate,
          supplierId: receptionForm.supplierId ? Number(receptionForm.supplierId) : null,
          purchaseDocument: receptionForm.purchaseDocument || null,
          deliveredBy: receptionForm.deliveredBy.trim(),
          receivedBy: receptionForm.receivedBy.trim(),
          observations: receptionForm.observations || null,
        });
        savedMovements.push(saved);
      }

      if (savedMovements.length === 1) {
        const matName = materialOptions.find(m => Number(m.id) === Number(savedMovements[0].materialId))?.name || "";
        printReceptionReceipt({ ...savedMovements[0], materialName: matName || savedMovements[0].materialName });
      }
      showSuccess(`Recepción registrada correctamente (${savedMovements.length} tipo${savedMovements.length > 1 ? "s" : ""} de cuero).`);
      setShowReceptionModal(false);
      resetReceptionModal();
      loadAll();
    } catch (err) {
      showError(err.message);
    } finally {
      setSavingReception(false);
    }
  };

  // ─── Guardar Entrega (múltiples por tipo de cuero) ─────────────
  const handleSaveDelivery = async () => {
    // Validaciones
    const itemsToDeliver = deliveryItems.filter(it => it.enabled !== false && it.materialId && Number(it.adjustedQty) > 0);
    if (itemsToDeliver.length === 0) {
      showError("Seleccione al menos un tipo de cuero y cantidad para entregar.");
      return;
    }
    if (deliveryMode === "WITH_PO" && !deliveryForm.productionOrderId) {
      showError("Seleccione una orden de producción.");
      return;
    }
    if (deliveryMode === "WITHOUT_PO") {
      const invalid = itemsToDeliver.some((it) => !it.productId || Number(it.quantity || 0) <= 0);
      if (invalid) {
        showError("En entrega sin OP debe seleccionar producto y cantidad de productos en cada fila.");
        return;
      }
    }
    if (!deliveryForm.deliveredBy || !deliveryForm.receivedBy) {
      showError("Complete los campos de Entregado por y Recibido por.");
      return;
    }

    const getProductQtyToDeliver = (it) => {
      const qty = Number(it.deliveryProductQty ?? it.quantity ?? 0);
      return Number.isFinite(qty) ? qty : 0;
    };

    // Agrupar por materialId: sumar cantidades del mismo tipo de cuero
    const grouped = {};
    itemsToDeliver.forEach(it => {
      const mid = String(it.materialId);
      if (!grouped[mid]) grouped[mid] = { materialId: Number(mid), quantity: 0 };
      grouped[mid].quantity += Number(it.adjustedQty) || 0;
    });
    const deliveries = Object.values(grouped);

    setSavingDelivery(true);
    try {
      for (const del of deliveries) {
        const deliveryProducts = itemsToDeliver
          .filter((it) => Number(it.materialId) === Number(del.materialId))
          .map((it) => ({
            productId: it.productId ? Number(it.productId) : null,
            productCode: it.productCode || null,
            productName: it.productName || null,
            productQuantity: getProductQtyToDeliver(it),
            leatherQuantity: Number(it.adjustedQty || 0),
          }))
          .filter((it) => it.productId && it.productQuantity > 0 && it.leatherQuantity > 0);

        await createLeatherDelivery({
          materialId: del.materialId,
          quantity: Math.round(del.quantity * 100) / 100,
          movementDate: deliveryForm.movementDate,
          productionOrderId: deliveryMode === "WITH_PO" ? Number(deliveryForm.productionOrderId) : null,
          deliveredBy: deliveryForm.deliveredBy,
          receivedBy: deliveryForm.receivedBy,
          observations: deliveryForm.observations || null,
          deliveryProducts,
        });
      }
      showSuccess(`Entrega de cuero registrada correctamente (${deliveries.length} tipo${deliveries.length > 1 ? "s" : ""} de cuero).`);

      // Imprimir comprobante con el detalle completo
      const order = deliveryMode === "WITH_PO"
        ? productionOrders.find(o => String(o.id) === deliveryForm.productionOrderId)
        : null;
      printDeliveryReceiptMulti(deliveryItems.filter(it => it.materialId && Number(it.adjustedQty) > 0), deliveryForm, order);

      setShowDeliveryModal(false);
      setDeliveryMode("WITH_PO");
      setDeliveryForm({ movementDate: today(), productionOrderId: "", deliveredBy: DEFAULT_RECEIVER_NAME, receivedBy: "", observations: "" });
      setDeliveryBatchMaterialId("");
      setDeliveryBatchMaterialSearch("");
      setDeliveryRowMaterialSearch({});
      setDeliveryRowProductSearch({});
      setDeliveryItems([]);
      loadAll();
    } catch (err) {
      showError(err.message);
    } finally {
      setSavingDelivery(false);
    }
  };

  // ─── Cuando se selecciona OP, poblar deliveryItems ──────────────
  const handleSelectDeliveryOrder = useCallback((orderId) => {
    setDeliveryForm(p => ({ ...p, productionOrderId: orderId }));
    setDeliveryRowMaterialSearch({});
    setDeliveryRowProductSearch({});
    const order = productionOrders.find(o => String(o.id) === orderId);
    if (order && order.items && order.items.length > 0) {
      setDeliveryItems(order.items.map((it, idx) => ({
        itemIdx: idx,
        enabled: true,
        productId: it.productId || "",
        productCode: it.productCode || "",
        productName: it.productName || it.productCode || "—",
        colorName: it.colorName || "—",
        quantity: it.quantity || 0,
        deliveryProductQty: it.quantity || 0,
        leatherConsumption: Number(it.leatherConsumption) || 0,
        leatherTotal: Number(it.leatherTotal) || 0,
        observations: it.observations || "",
        materialId: "", // El usuario elige el tipo de cuero
        adjustedQty: it.leatherTotal != null ? Number(it.leatherTotal).toFixed(2) : "",
      })));
    } else {
      setDeliveryItems([]);
    }
  }, [productionOrders]);

  useEffect(() => {
    if (autoDeliveryPrefillDone) return;
    if (searchParams.get("openDelivery") !== "1") return;
    if (loading) return;

    setDeliveryMode("WITH_PO");
    setDeliveryBatchMaterialId("");
    setDeliveryBatchMaterialSearch("");
    setDeliveryRowMaterialSearch({});
    setDeliveryRowProductSearch({});
    setShowDeliveryModal(true);

    const preselectedOrderId = searchParams.get("productionOrderId");
    if (preselectedOrderId && productionOrders.some((o) => String(o.id) === String(preselectedOrderId))) {
      handleSelectDeliveryOrder(String(preselectedOrderId));
    }

    setAutoDeliveryPrefillDone(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("openDelivery");
    nextParams.delete("productionOrderId");
    setSearchParams(nextParams, { replace: true });
  }, [
    autoDeliveryPrefillDone,
    searchParams,
    setSearchParams,
    loading,
    productionOrders,
    handleSelectDeliveryOrder,
  ]);

  const addManualDeliveryItem = () => {
    setDeliveryItems((prev) => {
      const next = [
        ...prev,
        {
          itemIdx: prev.length,
          enabled: true,
          productId: "",
          productCode: "",
          productName: "",
          colorName: "—",
          quantity: "",
          deliveryProductQty: "",
          leatherConsumption: 0,
          leatherTotal: 0,
          materialId: "",
          adjustedQty: "",
        },
      ];
      setDeliveryRowMaterialSearch((searchPrev) => ({
        ...searchPrev,
        [next.length - 1]: "",
      }));
      setDeliveryRowProductSearch((searchPrev) => ({
        ...searchPrev,
        [next.length - 1]: "",
      }));
      return next;
    });
  };

  const removeManualDeliveryItem = (idx) => {
    setDeliveryItems((prev) => prev.filter((_, i) => i !== idx));
    setDeliveryRowMaterialSearch((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        const index = Number(key);
        if (index < idx) next[index] = prev[key];
        if (index > idx) next[index - 1] = prev[key];
      });
      return next;
    });
    setDeliveryRowProductSearch((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        const index = Number(key);
        if (index < idx) next[index] = prev[key];
        if (index > idx) next[index - 1] = prev[key];
      });
      return next;
    });
  };

  const updateDeliveryItem = (idx, field, value) => {
    setDeliveryItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };

      if (field === "productId") {
        const selected = activeProductOptions.find((p) => String(p.id) === String(value));
        const productQty = Number(next.quantity || 0);
        const consumption = Number(selected?.leatherConsumption || 0);
        next.productCode = selected?.code || "";
        next.productName = selected?.name || "";
        next.leatherConsumption = consumption || 0;
        if (productQty > 0 && consumption > 0) {
          next.adjustedQty = (productQty * consumption).toFixed(2);
        }
      }

      if (field === "quantity") {
        const productQty = Number(value || 0);
        const consumption = Number(next.leatherConsumption || 0);
        next.deliveryProductQty = value;
        if (productQty > 0 && consumption > 0) {
          next.adjustedQty = (productQty * consumption).toFixed(2);
        }
      }
      if (field === "deliveryProductQty") {
        const productQty = Number(value || 0);
        const maxQty = Number(next.quantity || 0);
        const clampedQty = maxQty > 0 ? Math.min(Math.max(productQty, 0), maxQty) : Math.max(productQty, 0);
        next.deliveryProductQty = clampedQty;
        const consumption = Number(next.leatherConsumption || 0);
        next.adjustedQty = clampedQty > 0 && consumption > 0 ? (clampedQty * consumption).toFixed(2) : "";
      }
      return next;
    }));
  };

  const applyDeliveryMaterialToAll = () => {
    if (!deliveryBatchMaterialId) {
      showError("Seleccione un tipo de cuero para aplicar a todos.");
      return;
    }
    setDeliveryItems(prev => prev.map(it => ({ ...it, materialId: String(deliveryBatchMaterialId) })));
    const selectedMaterial = materialOptions.find((m) => String(m.id) === String(deliveryBatchMaterialId));
    const label = selectedMaterial ? leatherOptionLabel(selectedMaterial) : "";
    setDeliveryRowMaterialSearch((prev) => {
      const next = { ...prev };
      deliveryItems.forEach((_, idx) => {
        next[idx] = label;
      });
      return next;
    });
    showSuccess("Tipo de cuero aplicado a todos los artículos.");
  };

  // ─── Imprimir comprobante de entrega ─────────────────────────────
  const printDeliveryReceipt = (movement, order) => {
    const fmtDate = (d) => {
      if (!d) return "—";
      try { return formatDateGt(d, { year: "numeric", month: "long", day: "numeric" }); }
      catch { return d; }
    };
    const fmtN = (n) => n != null ? Number(n).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

    // Detalle de artículos de la OP (si disponible)
    let itemsHtml = "";
    let totalLeather = 0;
    if (order && order.items && order.items.length > 0) {
      const rows = order.items.map((it, idx) => {
        const lt = Number(it.leatherTotal) || 0;
        totalLeather += lt;
        return `<tr>
          <td style="border:1px solid #ccc;padding:6px 8px;">${idx + 1}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;">${it.productName || it.productCode || "—"}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;">${it.colorName || "—"}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${it.quantity || 0}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;">${it.leatherConsumption != null ? fmtN(it.leatherConsumption) : "—"}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;font-weight:600;">${lt ? fmtN(lt) : "—"}</td>
        </tr>`;
      }).join("");
      itemsHtml = `
        <h3 style="margin:20px 0 8px;font-size:14px;">Artículos de la Orden de Producción</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="border:1px solid #ccc;padding:6px 8px;width:30px;">#</th>
              <th style="border:1px solid #ccc;padding:6px 8px;">Producto</th>
              <th style="border:1px solid #ccc;padding:6px 8px;">Color</th>
              <th style="border:1px solid #ccc;padding:6px 8px;text-align:center;width:60px;">Cant.</th>
              <th style="border:1px solid #ccc;padding:6px 8px;text-align:right;width:100px;">Cuero/ud (ft²)</th>
              <th style="border:1px solid #ccc;padding:6px 8px;text-align:right;width:100px;">Total (ft²)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#e8f5e9;font-weight:700;">
              <td colspan="5" style="border:1px solid #ccc;padding:6px 8px;text-align:right;">Total cuero requerido:</td>
              <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;">${fmtN(totalLeather)} ft²</td>
            </tr>
          </tfoot>
        </table>`;
    }

    const html = `<!DOCTYPE html><html><head>
      <title>Entrega de Cuero #${movement.id || ""}</title>
      <style>
        @media print { @page { margin: 1.2cm; } body { margin:0; } }
        body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #222; font-size: 13px; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 18px; }
        .header h1 { margin: 0; font-size: 20px; }
        .header p { margin: 4px 0 0; color: #555; font-size: 12px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 16px; }
        .info-grid .item { display: flex; gap: 6px; }
        .info-grid .label { font-weight: 700; white-space: nowrap; }
        .highlight { background: #e3f2fd; border: 1px solid #90caf9; border-radius: 6px; padding: 10px 14px; margin: 14px 0; text-align: center; }
        .highlight .big { font-size: 22px; font-weight: 800; }
        .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
        .sig-box { width: 40%; text-align: center; }
        .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; font-size: 12px; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
      </style>
    </head><body>
      <div class="header">
        <h1>Comprobante de Entrega de Cuero</h1>
        <p>Entrega #${movement.id || "—"} · ${fmtDate(movement.movementDate)}</p>
      </div>

      <div class="info-grid">
        <div class="item"><span class="label">Tipo de Cuero:</span> ${movement.materialName || "—"}</div>
        <div class="item"><span class="label">Orden de Producción:</span> ${formatProductionOrderCodeDate(order) || movement.productionOrderCode || "—"}</div>
        <div class="item"><span class="label">Entregado por:</span> ${movement.deliveredBy || "—"}</div>
        <div class="item"><span class="label">Recibido por:</span> ${movement.receivedBy || "—"}</div>
        ${order?.customerName ? `<div class="item"><span class="label">Cliente:</span> ${order.customerName}</div>` : ""}
        ${movement.observations ? `<div class="item" style="grid-column:span 2;"><span class="label">Observaciones:</span> ${movement.observations}</div>` : ""}
      </div>

      <div class="highlight">
        <div>Cantidad de cuero entregado</div>
        <div class="big">${fmtN(movement.quantity)} ft²</div>
        ${movement.balanceAfter != null ? `<div style="font-size:11px;color:#555;margin-top:4px;">Saldo después de entrega: ${fmtN(movement.balanceAfter)} ft²</div>` : ""}
      </div>

      ${itemsHtml}

      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line"><strong>Entregó</strong><br/>${movement.deliveredBy || ""}</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"><strong>Recibió</strong><br/>${movement.receivedBy || ""}</div>
        </div>
      </div>

      <div class="footer">
        Documento generado el ${formatNowGt()} · Fossiles Core
      </div>
    </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  // ─── Imprimir comprobante de entrega múltiple (desde modal) ─────
  const printDeliveryReceiptMulti = (items, form, order) => {
    const fmtDate = (d) => {
      if (!d) return "—";
      try { return formatDateGt(d, { year: "numeric", month: "long", day: "numeric" }); }
      catch { return d; }
    };
    const fmtN = (n) => n != null ? Number(n).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

    let totalQty = 0;
    const rows = items.map((it, idx) => {
      const qty = Number(it.adjustedQty) || 0;
      totalQty += qty;
      const matObj = materialOptions.find(m => String(m.id) === String(it.materialId));
      return `<tr>
        <td style="border:1px solid #ccc;padding:6px 8px;">${idx + 1}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;">${it.productName || "—"}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;">${it.colorName || "—"}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;">${it.quantity || 0}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;">${matObj ? matObj.name : "—"}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;">${it.leatherConsumption ? fmtN(it.leatherConsumption) : "—"}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;font-weight:600;">${fmtN(qty)}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;font-style:italic;color:#555;">${it.observations || ""}</td>
      </tr>`;
    }).join("");

    // Resumen por tipo de cuero
    const grouped = {};
    items.forEach(it => {
      const mid = String(it.materialId);
      const matObj = materialOptions.find(m => String(m.id) === mid);
      const name = matObj ? matObj.name : "—";
      if (!grouped[mid]) grouped[mid] = { name, qty: 0 };
      grouped[mid].qty += Number(it.adjustedQty) || 0;
    });
    const summaryRows = Object.values(grouped).map(g =>
      `<tr><td style="border:1px solid #ccc;padding:6px 8px;font-weight:600;">${g.name}</td>
       <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;font-weight:700;">${fmtN(g.qty)} ft²</td></tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head>
      <title>Entrega de Cuero — ${formatProductionOrderCodeDate(order) || order?.code || "Sin OP"}</title>
      <style>
        @media print { @page { margin: 1.2cm; } body { margin:0; } }
        body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #222; font-size: 13px; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 18px; }
        .header h1 { margin: 0; font-size: 20px; }
        .header p { margin: 4px 0 0; color: #555; font-size: 12px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 16px; }
        .info-grid .item { display: flex; gap: 6px; }
        .info-grid .label { font-weight: 700; white-space: nowrap; }
        .highlight { background: #e3f2fd; border: 1px solid #90caf9; border-radius: 6px; padding: 10px 14px; margin: 14px 0; text-align: center; }
        .highlight .big { font-size: 22px; font-weight: 800; }
        .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
        .sig-box { width: 40%; text-align: center; }
        .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; font-size: 12px; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
      </style>
    </head><body>
      <div class="header">
        <h1>Comprobante de Entrega de Cuero</h1>
        <p>${order ? `Orden: ${formatProductionOrderCodeDate(order)}` : "Entrega sin orden de producción"} · ${fmtDate(form.movementDate)}</p>
      </div>

      <div class="info-grid">
        <div class="item"><span class="label">Orden de Producción:</span> ${formatProductionOrderCodeDate(order) || order?.code || "Sin OP"}</div>
        ${order?.customerName ? `<div class="item"><span class="label">Cliente:</span> ${order.customerName}</div>` : ""}
        <div class="item"><span class="label">Entregado por:</span> ${form.deliveredBy || "—"}</div>
        <div class="item"><span class="label">Recibido por:</span> ${form.receivedBy || "—"}</div>
        ${form.observations ? `<div class="item" style="grid-column:span 2;"><span class="label">Observaciones:</span> ${form.observations}</div>` : ""}
      </div>

      <h3 style="margin:16px 0 8px;font-size:14px;">Detalle de Entrega por Artículo</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="border:1px solid #ccc;padding:6px 8px;width:30px;">#</th>
            <th style="border:1px solid #ccc;padding:6px 8px;">Producto</th>
            <th style="border:1px solid #ccc;padding:6px 8px;">Color</th>
            <th style="border:1px solid #ccc;padding:6px 8px;text-align:center;width:50px;">Cant.</th>
            <th style="border:1px solid #ccc;padding:6px 8px;">Tipo de Cuero</th>
            <th style="border:1px solid #ccc;padding:6px 8px;text-align:right;width:90px;">Cuero/ud</th>
            <th style="border:1px solid #ccc;padding:6px 8px;text-align:right;width:90px;">Total (ft²)</th>
            <th style="border:1px solid #ccc;padding:6px 8px;">Observaciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#e8f5e9;font-weight:700;">
            <td colspan="7" style="border:1px solid #ccc;padding:6px 8px;text-align:right;">Total cuero entregado:</td>
            <td style="border:1px solid #ccc;padding:6px 8px;text-align:right;">${fmtN(totalQty)} ft²</td>
          </tr>
        </tfoot>
      </table>

      ${Object.keys(grouped).length > 1 ? `
        <h3 style="margin:16px 0 8px;font-size:14px;">Resumen por Tipo de Cuero</h3>
        <table style="width:50%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f0f0f0;">
            <th style="border:1px solid #ccc;padding:6px 8px;">Tipo de Cuero</th>
            <th style="border:1px solid #ccc;padding:6px 8px;text-align:right;">Cantidad</th>
          </tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>` : ""}

      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line"><strong>Entregó</strong><br/>${form.deliveredBy || ""}</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"><strong>Recibió</strong><br/>${form.receivedBy || ""}</div>
        </div>
      </div>

      <div class="footer">
        Documento generado el ${formatNowGt()} · Fossiles Core
      </div>
    </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  // ─── Imprimir comprobante de recepción ───────────────────────────
  const printReceptionReceipt = (movement) => {
    const fmtDate = (d) => {
      if (!d) return "—";
      try { return formatDateGt(d, { year: "numeric", month: "long", day: "numeric" }); }
      catch { return d; }
    };
    const fmtN = (n) => n != null ? Number(n).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
    const fmtQ = (n) => n != null ? "Q " + fmtN(n) : "—";

    const totalCost = movement.quantity && movement.unitCost
      ? Number(movement.quantity) * Number(movement.unitCost) : null;

    const html = `<!DOCTYPE html><html><head>
      <title>Recepción de Cuero #${movement.id || ""}</title>
      <style>
        @media print { @page { margin: 1.2cm; } body { margin:0; } }
        body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #222; font-size: 13px; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 18px; }
        .header h1 { margin: 0; font-size: 20px; }
        .header p { margin: 4px 0 0; color: #555; font-size: 12px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 16px; }
        .info-grid .item { display: flex; gap: 6px; }
        .info-grid .label { font-weight: 700; white-space: nowrap; }
        .highlight { background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 6px; padding: 10px 14px; margin: 14px 0; text-align: center; }
        .highlight .big { font-size: 22px; font-weight: 800; }
        .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
        .sig-box { width: 40%; text-align: center; }
        .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; font-size: 12px; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
      </style>
    </head><body>
      <div class="header">
        <h1>Comprobante de Recepción de Cuero</h1>
        <p>Recepción #${movement.id || "—"} · ${fmtDate(movement.movementDate)}</p>
      </div>

      <div class="info-grid">
        <div class="item"><span class="label">Tipo de Cuero:</span> ${movement.materialName || "—"}</div>
        <div class="item"><span class="label">Proveedor:</span> ${movement.supplierName || "—"}</div>
        <div class="item"><span class="label">Documento:</span> ${movement.purchaseDocument || "—"}</div>
        <div class="item"><span class="label">Entregado por:</span> ${movement.deliveredBy || "—"}</div>
        <div class="item"><span class="label">Recibido por:</span> ${movement.receivedBy || "—"}</div>
        ${movement.observations ? `<div class="item" style="grid-column:span 2;"><span class="label">Observaciones:</span> ${movement.observations}</div>` : ""}
      </div>

      <div class="highlight">
        <div>Cantidad de cuero recibido</div>
        <div class="big">${fmtN(movement.quantity)} ft²</div>
        ${movement.unitCost ? `<div style="font-size:12px;margin-top:4px;">Costo: ${fmtQ(movement.unitCost)}/ft²${totalCost ? ` · Total: ${fmtQ(totalCost)}` : ""}</div>` : ""}
        ${movement.balanceAfter != null ? `<div style="font-size:11px;color:#555;margin-top:4px;">Saldo después de recepción: ${fmtN(movement.balanceAfter)} ft²</div>` : ""}
      </div>

      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line"><strong>Entregó (Proveedor)</strong><br/>${movement.deliveredBy || ""}</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"><strong>Recibió</strong><br/>${movement.receivedBy || ""}</div>
        </div>
      </div>

      <div class="footer">
        Documento generado el ${formatNowGt()} · Fossiles Core
      </div>
    </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  // ─── Abrir modal editar ──────────────────────────────────────
  const openEditModal = (mov) => {
    setEditForm({
      id: mov.id,
      movementDate: mov.movementDate || "",
      deliveredBy: mov.deliveredBy || "",
      receivedBy: mov.receivedBy || "",
      observations: mov.observations || "",
      purchaseDocument: mov.purchaseDocument || "",
      supplierId: mov.supplierId ? String(mov.supplierId) : "",
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      await updateLeatherMovement(editForm.id, {
        movementDate: editForm.movementDate || null,
        deliveredBy: editForm.deliveredBy || null,
        receivedBy: editForm.receivedBy || null,
        observations: editForm.observations || null,
        purchaseDocument: editForm.purchaseDocument || null,
        supplierId: editForm.supplierId ? Number(editForm.supplierId) : null,
      });
      showSuccess("Movimiento actualizado correctamente");
      setShowEditModal(false);
      loadAll();
    } catch (err) {
      showError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // ─── Anular movimiento ──────────────────────────────────────
  const openCancelModal = (mov) => {
    setCancelTarget(mov);
    setCancelReason("");
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setSavingCancel(true);
    try {
      await cancelLeatherMovement(cancelTarget.id, cancelReason);
      showSuccess("Movimiento anulado correctamente. Se generó un movimiento de reversa.");
      setShowCancelModal(false);
      setCancelTarget(null);
      loadAll();
    } catch (err) {
      showError(err.message);
    } finally {
      setSavingCancel(false);
    }
  };

  // ─── Stock disponible para entrega ─────────────────────────────
  const getAvailableStock = (materialId) => {
    const inv = inventory.find(i => i.materialId === Number(materialId));
    return inv ? Number(inv.quantityAvailable) : 0;
  };

  // ─── Órdenes activas ──────────────────────────────────────────
  const activeOrders = useMemo(() =>
    productionOrders.filter(o => o.status === "PENDING" || o.status === "IN_PROGRESS"),
  [productionOrders]);

  const taskSummaryByOrder = useMemo(() => {
    const map = {};
    (tasks || []).forEach((t) => {
      const poId = t.productionOrderId;
      if (!poId || t.status === "CANCELLED") return;
      if (!map[poId]) {
        map[poId] = {
          total: 0,
          pendingLeather: 0,
          pendingDieCut: 0,
          pendingTable: 0,
          pendingMaterials: 0,
          inProduction: 0,
          completed: 0,
        };
      }
      map[poId].total += 1;
      if (t.workflowStatus === "PENDING_LEATHER") map[poId].pendingLeather += 1;
      if (t.workflowStatus === "PENDING_DIE_CUT") map[poId].pendingDieCut += 1;
      if (t.workflowStatus === "PENDING_TABLE_ENTRY") map[poId].pendingTable += 1;
      if (t.workflowStatus === "PENDING_MATERIAL_DELIVERY") map[poId].pendingMaterials += 1;
      if (t.workflowStatus === "IN_PRODUCTION" || t.status === "IN_PROGRESS") map[poId].inProduction += 1;
      if (t.workflowStatus === "COMPLETED" || t.status === "COMPLETED") map[poId].completed += 1;
    });
    return map;
  }, [tasks]);

  const deliveredOrdersFromMovements = useMemo(() => {
    const ids = new Set();
    (movements || []).forEach((m) => {
      if (m.productionOrderId && m.movementType === "SALIDA") {
        ids.add(Number(m.productionOrderId));
      }
    });
    return ids;
  }, [movements]);

  // Cola de cuero: solo órdenes con tareas que aún requieren entrega de cuero
  const leatherQueueOrders = useMemo(() => {
    return activeOrders.filter((o) => {
      if (deliveredOrdersFromMovements.has(Number(o.id))) return false;
      const s = taskSummaryByOrder[o.id];
      return s && s.pendingLeather > 0;
    });
  }, [activeOrders, taskSummaryByOrder, deliveredOrdersFromMovements]);

  const activeProductOptions = useMemo(() => {
    return (products || []).filter((p) => String(p.status || "").toLowerCase() !== "inactive");
  }, [products]);

  const productOptionLabel = useCallback((p) => `${p.code || ""} - ${p.name || ""}`, []);

  const resolveProductBySearch = useCallback((text) => {
    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) return null;
    return (
      activeProductOptions.find((p) => productOptionLabel(p).toLowerCase() === normalized) ||
      activeProductOptions.find((p) => String(p.id) === normalized) ||
      null
    );
  }, [activeProductOptions, productOptionLabel]);

  // ─── Inicializar inventario faltante ────────────────────────────
  const handleInitializeInventory = async () => {
    setShowInitModal(false);
    setInitializing(true);
    try {
      const result = await initializeLeatherInventory();
      showSuccess(`Inventario de cuero actualizado. Se crearon ${result.createdCount} registros nuevos.`);
      loadAll();
    } catch (err) {
      showError(err.message);
    } finally {
      setInitializing(false);
    }
  };

  // ─── react-table: columnas del inventario ──────────────────────
  const invColumns = useMemo(() => [
    {
      Header: "Material (Cuero)", accessor: "materialName",
      Filter: DefaultColumnFilter, filter: "fuzzyText",
      Cell: ({ value }) => <span style={{ fontWeight: 600 }}>{value || "—"}</span>,
    },
    {
      Header: "SKU", accessor: "materialSku",
      Filter: DefaultColumnFilter, filter: "fuzzyText",
      Cell: ({ value }) => <code>{value}</code>,
    },
    {
      Header: "Disponible (ft²)", accessor: "quantityAvailable",
      Cell: ({ value }) => <strong style={{ fontSize: 15 }}>{formatNum(value)}</strong>,
      sortType: (a, b) => Number(a.original.quantityAvailable || 0) - Number(b.original.quantityAvailable || 0),
      disableFilters: true,
    },
    {
      Header: "Recibido", accessor: "totalReceived",
      Cell: ({ value }) => <span style={{ color: "#43a047" }}>{formatNum(value)}</span>,
      sortType: (a, b) => Number(a.original.totalReceived || 0) - Number(b.original.totalReceived || 0),
      disableFilters: true,
    },
    {
      Header: "Entregado", accessor: "totalDelivered",
      Cell: ({ value }) => <span style={{ color: "#e53935" }}>{formatNum(value)}</span>,
      sortType: (a, b) => Number(a.original.totalDelivered || 0) - Number(b.original.totalDelivered || 0),
      disableFilters: true,
    },
    {
      Header: "Estado", id: "status", disableSortBy: true, disableFilters: true,
      Cell: ({ row }) => {
        const avail = Number(row.original.quantityAvailable || 0);
        return avail <= 0
          ? <Badge color="danger">Sin Stock</Badge>
          : avail < 50
            ? <Badge color="warning">Bajo</Badge>
            : <Badge color="success">OK</Badge>;
      },
    },
  ], []);

  const invFilterTypes = useMemo(() => ({
    fuzzyText: fuzzyTextFilterFn,
    text: (rows, id, filterValue) => rows.filter(row => {
      const v = row.values[id];
      return v !== undefined ? String(v).toLowerCase().includes(String(filterValue).toLowerCase()) : true;
    }),
  }), []);

  const invDefaultColumn = useMemo(() => ({ Filter: DefaultColumnFilter }), []);

  const {
    getTableProps, getTableBodyProps, headerGroups, page, prepareRow,
    state: invState, setGlobalFilter: setInvGlobalFilter,
    canPreviousPage, canNextPage, pageOptions, pageCount,
    gotoPage, nextPage, previousPage, setPageSize: setInvPageSize,
  } = useTable(
    {
      columns: invColumns, data: inventory, defaultColumn: invDefaultColumn,
      filterTypes: invFilterTypes,
      initialState: { pageSize: 10, pageIndex: 0, sortBy: [{ id: "materialName", desc: false }] },
    },
    useFilters, useGlobalFilter, useSortBy, usePagination,
  );

  const { globalFilter: invGlobalFilter, pageIndex: invPageIndex, pageSize: invPageSize } = invState;

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  return (
    <div className="content">
      {error && <Alert color="danger">{error}</Alert>}

      <Row className="mb-3">
        <Col>
          <h4 style={{ fontWeight: 700 }}>
            <i className="nc-icon nc-ruler-pencil" style={{ marginRight: 8 }} />
            Control de Cuero
          </h4>
        </Col>
        <Col className="text-right">
          <Button color="success" size="sm" className="mr-2"
            onClick={() => setShowReceptionModal(true)}>
            <i className="nc-icon nc-simple-add" /> Recepción
          </Button>
          <Button color="info" size="sm"
            onClick={() => {
              setDeliveryMode("WITH_PO");
              setDeliveryBatchMaterialSearch("");
              setDeliveryRowMaterialSearch({});
              setDeliveryRowProductSearch({});
              setShowDeliveryModal(true);
            }}>
            <i className="nc-icon nc-delivery-fast" /> Entrega a Producción
          </Button>
        </Col>
      </Row>

      {/* ─── Tabs ──────────────────────────────────────────────── */}
      <Nav tabs style={{ marginBottom: 0 }}>
        {[
          { id: "inventory", label: "Inventario", icon: "nc-icon nc-box" },
          { id: "movements", label: "Historial", icon: "nc-icon nc-bullet-list-67" },
          { id: "kardex", label: "Kardex", icon: "nc-icon nc-chart-bar-32" },
        ].map(t => (
          <NavItem key={t.id}>
            <NavLink
              className={activeTab === t.id ? "active" : ""}
              onClick={() => setActiveTab(t.id)}
              style={{ cursor: "pointer", fontWeight: activeTab === t.id ? 700 : 400 }}
            >
              <i className={t.icon} style={{ marginRight: 4 }} /> {t.label}
            </NavLink>
          </NavItem>
        ))}
      </Nav>

      <TabContent activeTab={activeTab}>

        {/* ═══ TAB INVENTARIO ═══ */}
        <TabPane tabId="inventory">
          <Card className="mt-0" style={{ borderTopLeftRadius: 0 }}>
            <CardHeader>
              <Row className="align-items-center">
                <Col>
                  <CardTitle tag="h5" className="mb-0">Inventario Actual de Cuero (Pies²)</CardTitle>
                </Col>
                <Col className="text-right">
                  <Button color="primary" size="sm" onClick={() => setShowInitModal(true)}
                    disabled={initializing || loading}>
                    {initializing ? (
                      <><Spinner size="sm" className="mr-1" /> Actualizando...</>
                    ) : (
                      <><i className="nc-icon nc-refresh-69 mr-1" /> Actualizar Inventario</>
                    )}
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              <Alert color="info" className="py-2">
                <strong>Cola de Cueros:</strong> se muestran para entrega solo órdenes con tareas en fase
                {" "}<code>PENDING_LEATHER</code> para evitar sobrecarga de información.
              </Alert>
              <Card className="mb-3">
                <CardBody className="py-2">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong style={{ fontSize: 13 }}>Cueros principales (persistidos en sistema)</strong>
                    <small className="text-muted">Top 5 por uso + selección manual</small>
                  </div>
                  {quickLeatherOptions.length === 0 ? (
                    <small className="text-muted">Aún no hay cueros sugeridos.</small>
                  ) : (
                    <div>
                      {quickLeatherOptions.map((m) => {
                        const isPrimary = primaryLeatherIds.includes(Number(m.id));
                        return (
                          <Button
                            key={m.id}
                            size="sm"
                            color={isPrimary ? "warning" : "light"}
                            className="mr-1 mb-1"
                            onClick={() => togglePrimaryLeather(m.id)}
                            title={isPrimary ? "Quitar de principales" : "Marcar como principal"}
                          >
                            {isPrimary ? "★" : "☆"} {m.name}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </CardBody>
              </Card>
              <Row className="mb-3">
                <Col md="3">
                  <Card className="mb-0">
                    <CardBody className="py-2 text-center">
                      <small className="text-muted d-block">Órdenes activas</small>
                      <strong>{activeOrders.length}</strong>
                    </CardBody>
                  </Card>
                </Col>
                <Col md="3">
                  <Card className="mb-0">
                    <CardBody className="py-2 text-center">
                      <small className="text-muted d-block">Pendientes cuero</small>
                      <strong>{leatherQueueOrders.length}</strong>
                    </CardBody>
                  </Card>
                </Col>
              </Row>
              {loading ? (
                <div className="text-center p-4"><Spinner color="primary" /></div>
              ) : inventory.length === 0 ? (
                <Alert color="warning">
                  No hay inventario de cuero registrado. Haz clic en "Actualizar Inventario" para crear registros
                  para todos los materiales tipo cuero, o registre una recepción para comenzar.
                </Alert>
              ) : (
                <>
                  {/* Summary cards */}
                  <Row className="mb-4">
                    <Col md="4">
                      <Card className="card-stats" style={{ background: "linear-gradient(135deg,#43a047,#66bb6a)", color: "#fff" }}>
                        <CardBody className="text-center">
                          <p style={{ fontSize: 13, margin: 0 }}>Total Disponible</p>
                          <h3 style={{ margin: "4px 0", fontWeight: 800 }}>
                            {formatNum(inventory.reduce((s, i) => s + Number(i.quantityAvailable || 0), 0))} ft²
                          </h3>
                        </CardBody>
                      </Card>
                    </Col>
                    <Col md="4">
                      <Card className="card-stats" style={{ background: "linear-gradient(135deg,#1e88e5,#42a5f5)", color: "#fff" }}>
                        <CardBody className="text-center">
                          <p style={{ fontSize: 13, margin: 0 }}>Total Recibido</p>
                          <h3 style={{ margin: "4px 0", fontWeight: 800 }}>
                            {formatNum(inventory.reduce((s, i) => s + Number(i.totalReceived || 0), 0))} ft²
                          </h3>
                        </CardBody>
                      </Card>
                    </Col>
                    <Col md="4">
                      <Card className="card-stats" style={{ background: "linear-gradient(135deg,#e53935,#ef5350)", color: "#fff" }}>
                        <CardBody className="text-center">
                          <p style={{ fontSize: 13, margin: 0 }}>Total Entregado</p>
                          <h3 style={{ margin: "4px 0", fontWeight: 800 }}>
                            {formatNum(inventory.reduce((s, i) => s + Number(i.totalDelivered || 0), 0))} ft²
                          </h3>
                        </CardBody>
                      </Card>
                    </Col>
                  </Row>

                  {/* Búsqueda global */}
                  <Row className="mb-3">
                    <Col md="4">
                      <FormGroup className="mb-0">
                        <Label className="small">Buscar en todos los campos:</Label>
                        <Input type="text" bsSize="sm" value={invGlobalFilter || ""}
                          onChange={e => setInvGlobalFilter(e.target.value || undefined)}
                          placeholder="Buscar por nombre, SKU..." />
                      </FormGroup>
                    </Col>
                    <Col md="4" className="d-flex align-items-end">
                      <small className="text-muted">
                        Mostrando {page.length} de {inventory.length} cueros
                      </small>
                    </Col>
                  </Row>

                  {/* Tabla con react-table */}
                  <div className="table-responsive">
                    <table {...getTableProps()} className="table table-hover table-striped">
                      <thead className="text-primary">
                        {headerGroups.map(hg => (
                          <tr {...hg.getHeaderGroupProps()}>
                            {hg.headers.map(col => (
                              <th {...col.getHeaderProps(col.getSortByToggleProps())}
                                className={col.isSorted ? (col.isSortedDesc ? "sort-desc" : "sort-asc") : col.canSort ? "sortable" : ""}>
                                {col.render("Header")}
                                <span>{col.isSorted ? (col.isSortedDesc ? " ▼" : " ▲") : col.canSort ? " ⇅" : ""}</span>
                                <div>{col.canFilter ? col.render("Filter") : null}</div>
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody {...getTableBodyProps()}>
                        {page.map(row => {
                          prepareRow(row);
                          return (
                            <tr {...row.getRowProps()}>
                              {row.cells.map(cell => (
                                <td {...cell.getCellProps()}>{cell.render("Cell")}</td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginación */}
                  <Row className="mt-3">
                    <Col md="6">
                      <div className="d-flex align-items-center">
                        <span className="mr-2">Mostrar:</span>
                        <Input type="select" value={invPageSize}
                          onChange={e => setInvPageSize(Number(e.target.value))} style={{ width: "auto" }}>
                          {[5, 10, 20, 50, 100].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </Input>
                        <span className="ml-2">registros por página</span>
                      </div>
                    </Col>
                    <Col md="6" className="text-right">
                      <div className="d-flex align-items-center justify-content-end">
                        <span className="mr-3">
                          Página <strong>{invPageIndex + 1} de {pageOptions.length}</strong>
                        </span>
                        <Button color="primary" size="sm" onClick={() => gotoPage(0)} disabled={!canPreviousPage} className="mr-1">{"<<"}</Button>
                        <Button color="primary" size="sm" onClick={() => previousPage()} disabled={!canPreviousPage} className="mr-1">{"<"}</Button>
                        <Button color="primary" size="sm" onClick={() => nextPage()} disabled={!canNextPage} className="mr-1">{">"}</Button>
                        <Button color="primary" size="sm" onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>{">>"}</Button>
                      </div>
                    </Col>
                  </Row>
                </>
              )}
            </CardBody>
          </Card>
        </TabPane>

        {/* ═══ TAB HISTORIAL DE MOVIMIENTOS ═══ */}
        <TabPane tabId="movements">
          <Card className="mt-0" style={{ borderTopLeftRadius: 0 }}>
            <CardHeader>
              <CardTitle tag="h5">Historial de Movimientos de Cuero</CardTitle>
            </CardHeader>
            <CardBody>
              {/* Filtros */}
              <Row className="mb-3">
                <Col md="3">
                  <Label className="small">Tipo de Cuero</Label>
                  <Input type="select" bsSize="sm" value={filterMaterial}
                    onChange={e => setFilterMaterial(e.target.value)}>
                    <option value="">Todos</option>
                    {materialOptions.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Input>
                </Col>
                <Col md="2">
                  <Label className="small">Tipo</Label>
                  <Input type="select" bsSize="sm" value={filterType}
                    onChange={e => setFilterType(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="ENTRADA">Entradas</option>
                    <option value="SALIDA">Salidas</option>
                    <option value="ANULADO">Anulados</option>
                  </Input>
                </Col>
                <Col md="2">
                  <Label className="small">Desde</Label>
                  <Input type="date" bsSize="sm" value={filterFrom}
                    onChange={e => setFilterFrom(e.target.value)} />
                </Col>
                <Col md="2">
                  <Label className="small">Hasta</Label>
                  <Input type="date" bsSize="sm" value={filterTo}
                    onChange={e => setFilterTo(e.target.value)} />
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <Button color="secondary" size="sm" className="mr-2"
                    onClick={() => { setFilterMaterial(""); setFilterType(""); setFilterFrom(""); setFilterTo(""); }}>
                    Limpiar
                  </Button>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center p-4"><Spinner color="primary" /></div>
              ) : filteredMovements.length === 0 ? (
                <Alert color="info">No hay movimientos registrados.</Alert>
              ) : (
                <Table responsive hover size="sm">
                  <thead className="text-primary">
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Cuero</th>
                      <th className="text-right">Cantidad (ft²)</th>
                      <th className="text-right">Costo</th>
                      <th>Referencia</th>
                      <th>Entregó</th>
                      <th>Recibió</th>
                      <th className="text-right">Saldo</th>
                      <th>Notas</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.map(m => {
                      const isAnulado = m.movementType === "ANULADO";
                      const badgeColor = m.movementType === "ENTRADA" ? "success"
                        : m.movementType === "SALIDA" ? "danger" : "secondary";
                      const badgeLabel = m.movementType === "ENTRADA" ? "↓ Entrada"
                        : m.movementType === "SALIDA" ? "↑ Salida" : "✕ Anulado";
                      return (
                        <tr key={m.id} style={isAnulado ? { opacity: 0.55, textDecoration: "line-through" } : {}}>
                          <td style={{ whiteSpace: "nowrap" }}>{m.movementDate}</td>
                          <td>
                            <Badge color={badgeColor}>{badgeLabel}</Badge>
                          </td>
                          <td style={{ fontWeight: 600 }}>{m.materialName}</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>
                            {formatNum(m.quantity)}
                          </td>
                          <td className="text-right">
                            {m.movementType === "ENTRADA" && m.unitCost ? (
                              <span>{formatQ(m.unitCost)}/ft² <br />
                                <small className="text-muted">Total: {formatQ(m.totalCost)}</small>
                              </span>
                            ) : "—"}
                          </td>
                          <td>
                            {m.movementType === "ENTRADA" ? (
                              <span>
                                {m.supplierName && <><i className="nc-icon nc-shop" /> {m.supplierName}<br /></>}
                                {m.purchaseDocument && <small className="text-muted">Doc: {m.purchaseDocument}</small>}
                              </span>
                            ) : m.movementType === "SALIDA" ? (
                              <span>
                                {m.productionOrderCode && <><i className="nc-icon nc-settings-gear-65" /> OP: {m.productionOrderCode}</>}
                              </span>
                            ) : (
                              <small className="text-muted">Reversa</small>
                            )}
                          </td>
                          <td>{m.deliveredBy || "—"}</td>
                          <td>{m.receivedBy || "—"}</td>
                          <td className="text-right" style={{ fontWeight: 600 }}>
                            {formatNum(m.balanceAfter)}
                          </td>
                          <td><small>{m.observations || ""}</small></td>
                          <td className="text-center" style={{ whiteSpace: "nowrap" }}>
                            {(m.movementType === "SALIDA" || m.movementType === "ENTRADA") && !isAnulado && (
                              <Button color="default" size="sm" className="btn-icon btn-round mr-1"
                                title="Imprimir comprobante" onClick={() => {
                                  if (m.movementType === "SALIDA") {
                                    const order = productionOrders.find(o => o.id === m.productionOrderId);
                                    printDeliveryReceipt(m, order);
                                  } else {
                                    printReceptionReceipt(m);
                                  }
                                }}
                                style={{ padding: "4px 8px" }}>
                                <i className="nc-icon nc-paper" />
                              </Button>
                            )}
                            {!isAnulado && (
                              <>
                                <Button color="warning" size="sm" className="btn-icon btn-round mr-1"
                                  title="Editar" onClick={() => openEditModal(m)}
                                  style={{ padding: "4px 8px" }}>
                                  <i className="nc-icon nc-ruler-pencil" />
                                </Button>
                                <Button color="danger" size="sm" className="btn-icon btn-round"
                                  title="Anular" onClick={() => openCancelModal(m)}
                                  style={{ padding: "4px 8px" }}>
                                  <i className="nc-icon nc-simple-remove" />
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabPane>

        {/* ═══ TAB KARDEX ═══ */}
        <TabPane tabId="kardex">
          <Card className="mt-0" style={{ borderTopLeftRadius: 0 }}>
            <CardHeader>
              <CardTitle tag="h5">Kardex de Cuero</CardTitle>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
                <Col md="4">
                  <Label className="small">Tipo de Cuero *</Label>
                  <Input type="text" bsSize="sm" list="kardex-material-list"
                    placeholder="Escriba para buscar cuero..."
                    value={kardexSearch}
                    onChange={e => {
                      const val = e.target.value;
                      setKardexSearch(val);
                      const match = materialOptions.find(m =>
                        `${m.name} (${m.sku})` === val
                      );
                      setKardexMaterial(match ? String(match.id) : "");
                    }}
                  />
                  <datalist id="kardex-material-list">
                    {materialOptions
                      .filter(m => {
                        if (!kardexSearch) return true;
                        const s = kardexSearch.toLowerCase();
                        return (m.name || "").toLowerCase().includes(s)
                          || (m.sku || "").toLowerCase().includes(s);
                      })
                      .map(m => (
                        <option key={m.id} value={`${m.name} (${m.sku})`} />
                      ))}
                  </datalist>
                  {kardexSearch && !kardexMaterial && (
                    <small className="text-warning">Seleccione un cuero de la lista</small>
                  )}
                </Col>
                <Col md="3">
                  <Label className="small">Desde</Label>
                  <Input type="date" bsSize="sm" value={kardexFrom}
                    onChange={e => setKardexFrom(e.target.value)} />
                </Col>
                <Col md="3">
                  <Label className="small">Hasta</Label>
                  <Input type="date" bsSize="sm" value={kardexTo}
                    onChange={e => setKardexTo(e.target.value)} />
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  <Button color="primary" size="sm" onClick={loadKardex} disabled={kardexLoading}>
                    {kardexLoading ? <Spinner size="sm" /> : "Consultar"}
                  </Button>
                </Col>
              </Row>

              {kardexData.length > 0 && (
                <Table responsive hover size="sm" className="mt-3">
                  <thead className="text-primary">
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Referencia</th>
                      <th className="text-right">Entrada (ft²)</th>
                      <th className="text-right">Salida (ft²)</th>
                      <th className="text-right">Saldo (ft²)</th>
                      <th>Responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kardexData.map(m => {
                      const isAnulado = m.movementType === "ANULADO";
                      const badgeColor = m.movementType === "ENTRADA" ? "success"
                        : m.movementType === "SALIDA" ? "danger" : "secondary";
                      return (
                        <tr key={m.id} style={isAnulado ? { opacity: 0.55, textDecoration: "line-through" } : {}}>
                          <td style={{ whiteSpace: "nowrap" }}>{m.movementDate}</td>
                          <td>
                            <Badge color={badgeColor} style={{ fontSize: 11 }}>
                              {m.movementType}
                            </Badge>
                          </td>
                          <td>
                            {m.movementType === "ENTRADA"
                              ? (m.supplierName || m.purchaseDocument || "Compra")
                              : m.movementType === "SALIDA"
                                ? (m.productionOrderCode ? `OP: ${m.productionOrderCode}` : "Producción")
                                : "Anulación"}
                          </td>
                          <td className="text-right" style={{ color: "#43a047", fontWeight: 600 }}>
                            {m.movementType === "ENTRADA" ? formatNum(m.quantity) : ""}
                          </td>
                          <td className="text-right" style={{ color: "#e53935", fontWeight: 600 }}>
                            {m.movementType === "SALIDA" ? formatNum(m.quantity) : ""}
                          </td>
                          <td className="text-right" style={{ fontWeight: 700, fontSize: 14 }}>
                            {formatNum(m.balanceAfter)}
                          </td>
                          <td>
                            <small>
                              {m.deliveredBy && <span>Entregó: {m.deliveredBy}</span>}
                              {m.deliveredBy && m.receivedBy && " · "}
                              {m.receivedBy && <span>Recibió: {m.receivedBy}</span>}
                            </small>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}

              {kardexData.length === 0 && !kardexLoading && kardexMaterial && (
                <Alert color="info" className="mt-3">No hay movimientos en el rango seleccionado.</Alert>
              )}
            </CardBody>
          </Card>
        </TabPane>

      </TabContent>

      {/* ═══ MODAL CONFIRMAR ACTUALIZACIÓN DE INVENTARIO ═══ */}
      <Modal isOpen={showInitModal} toggle={() => setShowInitModal(false)}>
        <ModalHeader toggle={() => setShowInitModal(false)}>
          <i className="nc-icon nc-refresh-69 text-primary" style={{ marginRight: 6 }} />
          Actualizar Inventario de Cuero
        </ModalHeader>
        <ModalBody>
          <p>¿Desea actualizar el inventario de cuero?</p>
          <p className="text-muted mb-0" style={{ fontSize: 13 }}>
            Se compararán todos los materiales tipo cuero existentes con los que ya tienen registro de inventario.
            Se crearán registros con cantidad <strong>0</strong> para los materiales que aún no estén en el inventario.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowInitModal(false)}>Cancelar</Button>
          <Button color="primary" onClick={handleInitializeInventory}>
            <i className="nc-icon nc-refresh-69 mr-1" /> Confirmar
          </Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL RECEPCIÓN DE CUERO ═══ */}
      <Modal isOpen={showReceptionModal} toggle={() => { setShowReceptionModal(false); resetReceptionModal(); }} size="lg">
        <ModalHeader toggle={() => { setShowReceptionModal(false); resetReceptionModal(); }}>
          <i className="nc-icon nc-simple-add text-success" style={{ marginRight: 6 }} />
          Recepción de Cuero (Compra)
        </ModalHeader>
        <ModalBody>
          {quickLeatherOptions.length > 0 && (
            <Alert color="light" className="py-2">
              <strong>Acceso rápido:</strong>
              <div className="mt-1">
                {quickLeatherOptions.map((m) => (
                  <Button
                    key={`quick-reception-${m.id}`}
                    size="sm"
                    color={Number(receptionDraft.materialId) === Number(m.id) ? "primary" : "light"}
                    className="mr-1 mb-1"
                    onClick={() => {
                      setReceptionDraft((p) => ({ ...p, materialId: String(m.id) }));
                      setReceptionMaterialSearch(leatherOptionLabel(m));
                    }}
                  >
                    {primaryLeatherIds.includes(Number(m.id)) ? "★ " : ""}{m.name}
                  </Button>
                ))}
              </div>
            </Alert>
          )}
          <Row>
            <Col md="5">
              <FormGroup>
                <Label>Tipo de Cuero</Label>
                <Input
                  type="text"
                  list="reception-leather-list"
                  placeholder="Escriba para buscar cuero..."
                  value={receptionMaterialSearch}
                  onChange={e => {
                    const text = e.target.value;
                    setReceptionMaterialSearch(text);
                    const selected = resolveMaterialBySearch(text);
                    setReceptionDraft((p) => ({ ...p, materialId: selected ? String(selected.id) : "" }));
                  }}
                />
                <datalist id="reception-leather-list">
                  {materialOptions.map(m => (
                    <option key={m.id} value={leatherOptionLabel(m)} />
                  ))}
                </datalist>
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Cantidad (ft²)</Label>
                <Input type="number" step="0.001" min="0" value={receptionDraft.quantity}
                  onChange={e => setReceptionDraft(p => ({ ...p, quantity: e.target.value }))} />
              </FormGroup>
            </Col>
            <Col md="2">
              <FormGroup>
                <Label>Costo por ft²</Label>
                <Input type="number" step="0.01" min="0" value={receptionDraft.unitCost}
                  onChange={e => setReceptionDraft(p => ({ ...p, unitCost: e.target.value }))} />
              </FormGroup>
            </Col>
            <Col md="2" className="d-flex align-items-end">
              <Button color="primary" block onClick={addReceptionItem}>
                + Agregar
              </Button>
            </Col>
          </Row>
          {receptionItems.length > 0 && (
            <Table bordered size="sm" className="mb-3">
              <thead style={{ background: "#f5f5f5" }}>
                <tr>
                  <th>Cuero</th>
                  <th className="text-right">Cantidad (ft²)</th>
                  <th className="text-right">Costo/ft²</th>
                  <th className="text-right">Total</th>
                  <th style={{ width: 70 }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {receptionItems.map((it, idx) => {
                  const mat = materialOptions.find(m => Number(m.id) === Number(it.materialId));
                  const rowTotal = it.unitCost != null ? Number(it.unitCost) * Number(it.quantity || 0) : null;
                  return (
                    <tr key={`${it.materialId}-${idx}`}>
                      <td>{mat?.name || "—"}</td>
                      <td className="text-right">{formatNum(it.quantity, 3)}</td>
                      <td className="text-right">{it.unitCost != null ? formatQ(it.unitCost) : "—"}</td>
                      <td className="text-right">{rowTotal != null ? formatQ(rowTotal) : "—"}</td>
                      <td className="text-center">
                        <Button color="danger" size="sm" onClick={() => removeReceptionItem(idx)}>
                          <i className="nc-icon nc-simple-remove" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Fecha</Label>
                <Input type="date" value={receptionForm.movementDate}
                  onChange={e => setReceptionForm(p => ({ ...p, movementDate: e.target.value }))} />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Proveedor</Label>
                <Input type="select" value={receptionForm.supplierId}
                  onChange={e => setReceptionForm(p => ({ ...p, supplierId: e.target.value }))}>
                  <option value="">Seleccione...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Documento de Compra</Label>
                <Input type="text" placeholder="Ej: FAC-001" value={receptionForm.purchaseDocument}
                  onChange={e => setReceptionForm(p => ({ ...p, purchaseDocument: e.target.value }))} />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Entregado por *</Label>
                <Input type="text" placeholder="Nombre de quien entrega" value={receptionForm.deliveredBy}
                  onChange={e => setReceptionForm(p => ({ ...p, deliveredBy: e.target.value }))} />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Recibido por *</Label>
                <Input type="text" placeholder="Nombre de quien recibe" value={receptionForm.receivedBy}
                  onChange={e => setReceptionForm(p => ({ ...p, receivedBy: e.target.value }))} />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Observaciones</Label>
                <Input type="textarea" rows="2" value={receptionForm.observations}
                  onChange={e => setReceptionForm(p => ({ ...p, observations: e.target.value }))} />
              </FormGroup>
            </Col>
          </Row>
          {receptionItems.length > 0 && (
            <Alert color="success" className="mt-2">
              <strong>Total de recepción:</strong> {
                formatQ(
                  receptionItems.reduce((sum, it) => {
                    if (it.unitCost == null) return sum;
                    return sum + Number(it.quantity || 0) * Number(it.unitCost || 0);
                  }, 0)
                )
              }
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => { setShowReceptionModal(false); resetReceptionModal(); }}>Cancelar</Button>
          <Button color="success" onClick={handleSaveReception} disabled={savingReception || receptionItems.length === 0}>
            {savingReception ? <Spinner size="sm" /> : "Registrar Recepción"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL EDITAR MOVIMIENTO ═══ */}
      <Modal isOpen={showEditModal} toggle={() => setShowEditModal(false)} size="md">
        <ModalHeader toggle={() => setShowEditModal(false)}>
          <i className="nc-icon nc-ruler-pencil text-warning" style={{ marginRight: 6 }} />
          Editar Movimiento #{editForm.id}
        </ModalHeader>
        <ModalBody>
          <Alert color="info" className="py-2" style={{ fontSize: 13 }}>
            <strong>Nota:</strong> Solo se pueden editar datos descriptivos (responsables, fecha, notas, proveedor, documento).
            Para corregir cantidad o material, anule este movimiento y cree uno nuevo.
          </Alert>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Fecha</Label>
                <Input type="date" value={editForm.movementDate}
                  onChange={e => setEditForm(p => ({ ...p, movementDate: e.target.value }))} />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Proveedor</Label>
                <Input type="select" value={editForm.supplierId}
                  onChange={e => setEditForm(p => ({ ...p, supplierId: e.target.value }))}>
                  <option value="">— Sin proveedor —</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Entregado por</Label>
                <Input type="text" value={editForm.deliveredBy}
                  onChange={e => setEditForm(p => ({ ...p, deliveredBy: e.target.value }))} />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Recibido por</Label>
                <Input type="text" value={editForm.receivedBy}
                  onChange={e => setEditForm(p => ({ ...p, receivedBy: e.target.value }))} />
              </FormGroup>
            </Col>
          </Row>
          <FormGroup>
            <Label>Documento de Compra</Label>
            <Input type="text" value={editForm.purchaseDocument}
              onChange={e => setEditForm(p => ({ ...p, purchaseDocument: e.target.value }))} />
          </FormGroup>
          <FormGroup>
            <Label>Observaciones</Label>
            <Input type="textarea" rows="2" value={editForm.observations}
              onChange={e => setEditForm(p => ({ ...p, observations: e.target.value }))} />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowEditModal(false)}>Cancelar</Button>
          <Button color="warning" onClick={handleSaveEdit} disabled={savingEdit}>
            {savingEdit ? <Spinner size="sm" /> : "Guardar Cambios"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL ANULAR MOVIMIENTO ═══ */}
      <Modal isOpen={showCancelModal} toggle={() => setShowCancelModal(false)}>
        <ModalHeader toggle={() => setShowCancelModal(false)}>
          <i className="nc-icon nc-simple-remove text-danger" style={{ marginRight: 6 }} />
          Anular Movimiento
        </ModalHeader>
        <ModalBody>
          {cancelTarget && (
            <>
              <Alert color="danger" className="py-2">
                <strong>¡Atención!</strong> Se creará un movimiento de reversa que deshace el efecto en inventario.
                El movimiento original quedará marcado como anulado.
              </Alert>
              <Table bordered size="sm" className="mb-3">
                <tbody>
                  <tr><td><strong>ID</strong></td><td>#{cancelTarget.id}</td></tr>
                  <tr><td><strong>Tipo</strong></td><td>{cancelTarget.movementType}</td></tr>
                  <tr><td><strong>Cuero</strong></td><td>{cancelTarget.materialName}</td></tr>
                  <tr><td><strong>Cantidad</strong></td><td>{formatNum(cancelTarget.quantity)} ft²</td></tr>
                  <tr><td><strong>Fecha</strong></td><td>{cancelTarget.movementDate}</td></tr>
                </tbody>
              </Table>
              <FormGroup>
                <Label>Motivo de la anulación</Label>
                <Input type="textarea" rows="2" value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Describa el motivo..." />
              </FormGroup>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowCancelModal(false)}>Cancelar</Button>
          <Button color="danger" onClick={handleConfirmCancel} disabled={savingCancel}>
            {savingCancel ? <Spinner size="sm" /> : "Confirmar Anulación"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL ENTREGA A PRODUCCIÓN ═══ */}
      <Modal isOpen={showDeliveryModal} toggle={() => { setShowDeliveryModal(false); setDeliveryItems([]); setDeliveryBatchMaterialId(""); setDeliveryBatchMaterialSearch(""); setDeliveryRowMaterialSearch({}); setDeliveryRowProductSearch({}); setDeliveryMode("WITH_PO"); }} size="xl">
        <ModalHeader toggle={() => { setShowDeliveryModal(false); setDeliveryItems([]); setDeliveryBatchMaterialId(""); setDeliveryBatchMaterialSearch(""); setDeliveryRowMaterialSearch({}); setDeliveryRowProductSearch({}); setDeliveryMode("WITH_PO"); }}>
          <i className="nc-icon nc-delivery-fast text-info" style={{ marginRight: 6 }} />
          Entrega de Cuero a Producción
        </ModalHeader>
        <ModalBody>
          <Row className="mb-2">
            <Col md="6">
              <FormGroup>
                <Label>Tipo de entrega *</Label>
                <Input type="select" value={deliveryMode}
                  onChange={e => {
                    const nextMode = e.target.value;
                    setDeliveryMode(nextMode);
                    setDeliveryItems([]);
                    setDeliveryBatchMaterialId("");
                    setDeliveryBatchMaterialSearch("");
                    setDeliveryRowMaterialSearch({});
                    setDeliveryRowProductSearch({});
                    setDeliveryForm(p => ({
                      ...p,
                      productionOrderId: nextMode === "WITH_PO" ? p.productionOrderId : "",
                    }));
                  }}>
                  <option value="WITH_PO">Con orden de producción</option>
                  <option value="WITHOUT_PO">Entrega normal (sin orden)</option>
                </Input>
              </FormGroup>
            </Col>
          </Row>
          {quickLeatherOptions.length > 0 && (
            <Alert color="light" className="py-2">
              <strong>Cueros principales / más usados:</strong>
              <div className="mt-1">
                {quickLeatherOptions.map((m) => (
                  <Button
                    key={`quick-delivery-${m.id}`}
                    size="sm"
                    color={Number(deliveryBatchMaterialId) === Number(m.id) ? "primary" : "light"}
                    className="mr-1 mb-1"
                    onClick={() => {
                      setDeliveryBatchMaterialId(String(m.id));
                      setDeliveryBatchMaterialSearch(leatherOptionLabel(m));
                    }}
                  >
                    {primaryLeatherIds.includes(Number(m.id)) ? "★ " : ""}{m.name}
                  </Button>
                ))}
              </div>
            </Alert>
          )}
          <Row>
            {deliveryMode === "WITH_PO" ? (
            <Col md="6">
              <FormGroup>
                <Label>Orden de Producción *</Label>
                <Input type="select" value={deliveryForm.productionOrderId}
                  onChange={e => handleSelectDeliveryOrder(e.target.value)}>
                  <option value="">Seleccione...</option>
                  {leatherQueueOrders.map(o => {
                    const s = taskSummaryByOrder[o.id];
                    return (
                    <option key={o.id} value={o.id}>
                      {formatProductionOrderSelectLabel(o)} ({o.status}) · Pend. cuero: {s?.pendingLeather || 0}
                    </option>
                    );
                  })}
                </Input>
                {leatherQueueOrders.length === 0 && (
                  <small className="text-muted">No hay órdenes pendientes de cuero en este momento.</small>
                )}
              </FormGroup>
            </Col>
            ) : (
            <Col md="6">
              <FormGroup>
                <Label>Productos destino *</Label>
                <div>
                  <Button color="primary" size="sm" onClick={addManualDeliveryItem}>
                    <i className="nc-icon nc-simple-add mr-1" />
                    Agregar producto
                  </Button>
                  <small className="d-block text-muted mt-1">
                    Debe elegir productos para dejar trazabilidad del consumo de cuero.
                  </small>
                </div>
              </FormGroup>
            </Col>
            )}
            <Col md="3">
              <FormGroup>
                <Label>Fecha</Label>
                <Input type="date" value={deliveryForm.movementDate}
                  onChange={e => setDeliveryForm(p => ({ ...p, movementDate: e.target.value }))} />
              </FormGroup>
            </Col>
          </Row>

          {/* ── Tabla interactiva: asignar cuero por artículo ── */}
          {deliveryItems.length > 0 && (
            <div className="mb-3">
              <Row className="mb-2 align-items-end">
                <Col md="6">
                  <Label className="mb-1">Aplicar mismo cuero a todos</Label>
                  <Input
                    type="text"
                    list="delivery-batch-leather-list"
                    bsSize="sm"
                    placeholder="Escriba para buscar cuero..."
                    value={deliveryBatchMaterialSearch}
                    onChange={e => {
                      const text = e.target.value;
                      setDeliveryBatchMaterialSearch(text);
                      const selected = resolveMaterialBySearch(text);
                      setDeliveryBatchMaterialId(selected ? String(selected.id) : "");
                    }}
                  />
                  <datalist id="delivery-batch-leather-list">
                    {materialOptions.map(m => (
                      <option key={m.id} value={leatherOptionLabel(m)} />
                    ))}
                  </datalist>
                </Col>
                <Col md="3">
                  <Button color="primary" size="sm" block onClick={applyDeliveryMaterialToAll}>
                    Aplicar a todos
                  </Button>
                </Col>
              </Row>
              <Label className="font-weight-bold" style={{ fontSize: 13 }}>
                <i className="nc-icon nc-ruler-pencil mr-1" />
                Asignar tipo de cuero por artículo
              </Label>
              <div className="table-responsive">
                <Table bordered size="sm" style={{ fontSize: 13 }}>
                  <thead style={{ background: "#f5f5f5" }}>
                    <tr>
                      <th className="text-center" style={{ width: 70 }}>¿Entregar?</th>
                      <th>Producto</th>
                      <th className="text-center" style={{ width: 85 }}>
                        {deliveryMode === "WITH_PO" ? "Color / Cant." : "Cant. prod."}
                      </th>
                      <th className="text-right" style={{ width: 90 }}>Cuero/ud</th>
                      <th style={{ width: 220 }}>Tipo de Cuero *</th>
                      <th className="text-right" style={{ width: 100 }}>Entregar (ft²)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryItems.map((it, idx) => {
                      const stock = it.materialId ? getAvailableStock(it.materialId) : null;
                      return (
                        <tr key={idx}>
                          <td className="text-center align-middle">
                            <Input
                              type="checkbox"
                              checked={it.enabled !== false}
                              onChange={e => updateDeliveryItem(idx, "enabled", e.target.checked)}
                            />
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {deliveryMode === "WITHOUT_PO" ? (
                              <>
                                <Input
                                  type="text"
                                  list="delivery-row-product-list"
                                  bsSize="sm"
                                  disabled={it.enabled === false}
                                  placeholder="Buscar producto..."
                                  value={
                                    deliveryRowProductSearch[idx] !== undefined
                                      ? deliveryRowProductSearch[idx]
                                      : (it.productId
                                        ? productOptionLabel(activeProductOptions.find((p) => String(p.id) === String(it.productId)) || { code: "", name: "" })
                                        : "")
                                  }
                                  onChange={e => {
                                    const text = e.target.value;
                                    setDeliveryRowProductSearch((prev) => ({ ...prev, [idx]: text }));
                                    const selected = resolveProductBySearch(text);
                                    updateDeliveryItem(idx, "productId", selected ? String(selected.id) : "");
                                  }}
                                />
                                <datalist id="delivery-row-product-list">
                                  {activeProductOptions.map(p => (
                                    <option key={p.id} value={productOptionLabel(p)} />
                                  ))}
                                </datalist>
                              </>
                            ) : (
                              it.productName
                            )}
                          </td>
                          <td className="text-center">
                            {deliveryMode === "WITHOUT_PO" ? (
                              <Input
                                type="number"
                                bsSize="sm"
                                step="1"
                                min="1"
                                disabled={it.enabled === false}
                                value={it.quantity}
                                onChange={e => updateDeliveryItem(idx, "quantity", e.target.value)}
                                style={{ textAlign: "center", fontWeight: 600 }}
                              />
                            ) : (
                              <div>
                                <div style={{ fontSize: 12 }}>{it.colorName}</div>
                                <Input
                                  type="number"
                                  bsSize="sm"
                                  step="1"
                                  min="0"
                                  max={it.quantity || 0}
                                  disabled={it.enabled === false}
                                  value={it.deliveryProductQty ?? it.quantity ?? 0}
                                  onChange={e => updateDeliveryItem(idx, "deliveryProductQty", e.target.value)}
                                  style={{ textAlign: "center", fontWeight: 600, marginTop: 4 }}
                                />
                                <small className="text-muted">de {it.quantity || 0}</small>
                              </div>
                            )}
                          </td>
                          <td className="text-right">
                            {it.leatherConsumption ? formatNum(it.leatherConsumption) : <span className="text-muted">—</span>}
                          </td>
                          <td>
                            <Input
                              type="text"
                              list="delivery-row-leather-list"
                              bsSize="sm"
                              disabled={it.enabled === false}
                              placeholder="Buscar cuero..."
                              value={
                                deliveryRowMaterialSearch[idx] !== undefined
                                  ? deliveryRowMaterialSearch[idx]
                                  : (it.materialId
                                    ? leatherOptionLabel(materialOptions.find((m) => String(m.id) === String(it.materialId)) || { name: "", sku: "" })
                                    : "")
                              }
                              onChange={e => {
                                const text = e.target.value;
                                setDeliveryRowMaterialSearch((prev) => ({ ...prev, [idx]: text }));
                                const selected = resolveMaterialBySearch(text);
                                updateDeliveryItem(idx, "materialId", selected ? String(selected.id) : "");
                              }}
                            />
                            <datalist id="delivery-row-leather-list">
                              {materialOptions.map(m => (
                                <option key={m.id} value={leatherOptionLabel(m)} />
                              ))}
                            </datalist>
                            {it.materialId && stock != null && Number(it.adjustedQty) > stock && (
                              <small className="text-danger">Excede stock ({formatNum(stock)})</small>
                            )}
                          </td>
                          <td>
                            <Input type="number" bsSize="sm" step="0.01" min="0"
                              disabled={it.enabled === false}
                              value={it.adjustedQty}
                              onChange={e => updateDeliveryItem(idx, "adjustedQty", e.target.value)}
                              style={{ textAlign: "right", fontWeight: 600 }} />
                            {deliveryMode === "WITHOUT_PO" && (
                              <Button
                                color="danger"
                                size="sm"
                                className="mt-1"
                                onClick={() => removeManualDeliveryItem(idx)}
                                block
                              >
                                Quitar
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot style={{ background: "#e3f2fd" }}>
                    <tr>
                      <td colSpan="5" className="text-right" style={{ fontWeight: 700 }}>
                        Total cuero a entregar:
                      </td>
                      <td className="text-right" style={{ fontWeight: 800, fontSize: 14 }}>
                        {formatNum(deliveryItems.reduce((s, it) => s + ((it.enabled === false) ? 0 : (Number(it.adjustedQty) || 0)), 0))} ft²
                      </td>
                    </tr>
                  </tfoot>
                </Table>
              </div>
            </div>
          )}

          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Entregado por *</Label>
                <Input type="text" placeholder="Nombre de quien entrega" value={deliveryForm.deliveredBy}
                  readOnly />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Recibido por *</Label>
                <Input type="text" placeholder="Nombre de quien recibe" value={deliveryForm.receivedBy}
                  onChange={e => setDeliveryForm(p => ({ ...p, receivedBy: e.target.value }))} />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Observaciones</Label>
                <Input type="textarea" rows="2" value={deliveryForm.observations}
                  onChange={e => setDeliveryForm(p => ({ ...p, observations: e.target.value }))} />
              </FormGroup>
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => { setShowDeliveryModal(false); setDeliveryItems([]); setDeliveryBatchMaterialId(""); setDeliveryBatchMaterialSearch(""); setDeliveryRowMaterialSearch({}); setDeliveryRowProductSearch({}); setDeliveryMode("WITH_PO"); }}>Cancelar</Button>
          <Button color="info" onClick={handleSaveDelivery}
            disabled={savingDelivery || deliveryItems.filter(it => it.materialId && Number(it.adjustedQty) > 0).length === 0}>
            {savingDelivery ? <Spinner size="sm" /> : "Registrar Entrega"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default LeatherInventory;

