import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Badge,
  Alert,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormGroup,
  Label,
  Input,
} from "reactstrap";
import { useAuth } from "../../contexts/AuthContext";
import Select from "react-select";
import {
  useTable,
  useFilters,
  useGlobalFilter,
  useSortBy,
  usePagination,
} from "react-table";
import { matchSorter } from "match-sorter";
import {
  getInventoryAdjustments,
  createInventoryAdjustment,
  getMaterialInventory,
} from "services/inventoryService";
import { getProductInventoryByProductAndLocation } from "services/productInventoryService";
import { getLocations } from "services/locationService";
import { getProducts } from "services/productService";
import { getMaterials } from "services/materialService";
import { getColors } from "services/colorService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";

// Componente de filtro por defecto
function DefaultColumnFilter({
  column: { filterValue, preFilteredRows, setFilter },
}) {
  return (
    <FormGroup className="mb-0">
      <Input
        type="text"
        value={filterValue || ""}
        onChange={(e) => {
          setFilter(e.target.value || undefined);
        }}
        placeholder={`Buscar...`}
        size="sm"
      />
    </FormGroup>
  );
}

function InventoryAdjustments() {
  const { hasPermission } = useAuth();
  
  // Verificar permisos
  const canViewMaterials = hasPermission("INVENTARIOS.AJUSTES_MATERIALES.VER");
  const canCreateMaterials = hasPermission("INVENTARIOS.AJUSTES_MATERIALES.CREAR");
  const canViewProducts = hasPermission("INVENTARIOS.AJUSTES_PRODUCTOS.VER");
  const canCreateProducts = hasPermission("INVENTARIOS.AJUSTES_PRODUCTOS.CREAR");
  
  // Determinar modo inicial basado en permisos
  const getInitialMode = () => {
    if (canCreateMaterials && !canCreateProducts) return "material";
    if (canCreateProducts && !canCreateMaterials) return "product";
    return "product"; // Por defecto productos si tiene ambos permisos
  };
  
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [adjustmentMode, setAdjustmentMode] = useState(getInitialMode()); // "product" o "material"
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [colors, setColors] = useState([]);
  const [currentStock, setCurrentStock] = useState(null);
  const [loadingStock, setLoadingStock] = useState(false);
  
  // Formulario de ajuste
  const [formData, setFormData] = useState({
    locationId: "",
    productId: "",
    materialId: "",
    colorId: "",
    captureUnitMode: "BASE",
    captureQuantity: "",
    customFactorToBase: "",
    systemStock: "",
    physicalStock: "",
    reason: "",
  });
  const createProductBatchRow = () => ({
    rowId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: "",
    colorId: "",
    systemStock: "",
    physicalStock: "",
    reason: "",
    fossSizeLines: [],
  });
  const [productBatchRows, setProductBatchRows] = useState([createProductBatchRow()]);
  const [batchStockLoadingRows, setBatchStockLoadingRows] = useState({});

  const getProductById = (productId) =>
    (products || []).find((p) => String(p.id) === String(productId)) || null;

  const isFossCinchoCode = (code) =>
    code != null && String(code).toUpperCase().startsWith("FOSS");

  const isFossCinchoRow = (row) => {
    const p = getProductById(row.productId);
    return p && isFossCinchoCode(p.code);
  };

  const updateFossSizeLine = (rowId, lineId, patch) => {
    setProductBatchRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const fossSizeLines = (row.fossSizeLines || []).map((l) =>
          l.lineId === lineId ? { ...l, ...patch } : l
        );
        const sysSum = fossSizeLines.reduce((a, l) => a + (parseFloat(l.systemStock) || 0), 0);
        const phySum = fossSizeLines.reduce((a, l) => a + (parseFloat(l.physicalStock) || 0), 0);
        return {
          ...row,
          fossSizeLines,
          systemStock: sysSum.toFixed(3),
          physicalStock: phySum.toFixed(3),
        };
      })
    );
  };

  const addFossSizeLine = (rowId) => {
    setProductBatchRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const lineId = `${rowId}-fs-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const fossSizeLines = [
          ...(row.fossSizeLines || []),
          { lineId, size: "", systemStock: "0", physicalStock: "0" },
        ];
        const sysSum = fossSizeLines.reduce((a, l) => a + (parseFloat(l.systemStock) || 0), 0);
        const phySum = fossSizeLines.reduce((a, l) => a + (parseFloat(l.physicalStock) || 0), 0);
        return {
          ...row,
          fossSizeLines,
          systemStock: sysSum.toFixed(3),
          physicalStock: phySum.toFixed(3),
        };
      })
    );
  };

  const removeFossSizeLine = (rowId, lineId) => {
    setProductBatchRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        let fossSizeLines = (row.fossSizeLines || []).filter((l) => l.lineId !== lineId);
        if (fossSizeLines.length === 0) {
          fossSizeLines = [{ lineId: `${rowId}-fs-${Date.now()}`, size: "", systemStock: "0", physicalStock: "0" }];
        }
        const sysSum = fossSizeLines.reduce((a, l) => a + (parseFloat(l.systemStock) || 0), 0);
        const phySum = fossSizeLines.reduce((a, l) => a + (parseFloat(l.physicalStock) || 0), 0);
        return {
          ...row,
          fossSizeLines,
          systemStock: sysSum.toFixed(3),
          physicalStock: phySum.toFixed(3),
        };
      })
    );
  };

  const materialOptions = useMemo(() => {
    return (materials || []).map((m) => ({
      value: String(m.id),
      label: `${m.sku ? `${m.sku} - ` : ""}${m.name || ""}`.trim(),
      raw: m,
    }));
  }, [materials]);

  const productOptions = useMemo(() => {
    return (products || []).map((p) => ({
      value: String(p.id),
      label: `${p.code ? `${p.code} - ` : ""}${p.name || ""}`.trim(),
      raw: p,
    }));
  }, [products]);

  const locationOptions = useMemo(() => {
    return (locations || []).map((l) => ({
      value: String(l.id),
      label: `${l.name || ""}${l.code ? ` (${l.code})` : ""}`.trim(),
      raw: l,
    }));
  }, [locations]);

  const colorOptions = useMemo(() => {
    return (colors || []).map((c) => ({
      value: String(c.id),
      label: `${c.name || ""}`.trim(),
      raw: c,
    }));
  }, [colors]);

  const selectedMaterialMeta = useMemo(() => {
    if (!formData.materialId) return null;
    return (materials || []).find((m) => String(m.id) === String(formData.materialId)) || null;
  }, [materials, formData.materialId]);

  const materialMeasureUom =
    selectedMaterialMeta?.manufacturingUomName ||
    selectedMaterialMeta?.manufacturingUomCode ||
    "unidades";
  const materialPurchaseUom =
    selectedMaterialMeta?.purchaseUomName ||
    selectedMaterialMeta?.purchaseUomCode ||
    "unidad de compra";
  const purchaseQuantity = Number(selectedMaterialMeta?.purchaseQuantity || 0);

  const filterSelectOption = (option, rawInput) => {
    const input = (rawInput || "").toLowerCase().trim();
    if (!input) return true;
    const label = (option?.label || "").toLowerCase();
    return label.includes(input);
  };

  // Filtros para el historial
  const [filters, setFilters] = useState({
    materialId: "",
    productId: "",
    locationId: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    loadAdjustments();
    loadLocations();
    loadProducts();
    loadMaterials();
    loadColors();
  }, []);

  const loadColors = async () => {
    try {
      const data = await getColors();
      setColors(data || []);
    } catch (err) {
      console.error("Error loading colors:", err);
    }
  };

  useEffect(() => {
    loadAdjustments();
  }, [filters]);

  const loadAdjustments = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getInventoryAdjustments(filters);
      // Filtrar ajustes según permisos
      let filteredData = data || [];
      if (!canViewMaterials && !canViewProducts) {
        filteredData = []; // No tiene permisos para ver nada
      } else if (!canViewMaterials) {
        // Solo puede ver productos
        filteredData = filteredData.filter(adj => adj.productId != null);
      } else if (!canViewProducts) {
        // Solo puede ver materiales
        filteredData = filteredData.filter(adj => adj.materialId != null);
      }
      // Si tiene ambos permisos, mostrar todos
      setAdjustments(filteredData);
    } catch (err) {
      setError(err.message || "Error al cargar los ajustes");
      showError(err.message || "Error al cargar los ajustes");
      setAdjustments([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLocations = async () => {
    try {
      const data = await getLocations();
      setLocations(data || []);
    } catch (err) {
      console.error("Error loading locations:", err);
    }
  };

  const loadProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data || []);
    } catch (err) {
      console.error("Error loading products:", err);
    }
  };

  const loadMaterials = async () => {
    try {
      const data = await getMaterials();
      setMaterials(data || []);
    } catch (err) {
      console.error("Error loading materials:", err);
    }
  };

  const loadCurrentStock = async () => {
    // Para productos se requiere ubicación
    if (adjustmentMode === "product") {
      if (!formData.locationId || !formData.productId) {
        setCurrentStock(null);
        setFormData((prev) => ({ ...prev, systemStock: "" }));
        return;
      }

      try {
        setLoadingStock(true);
        const colorId = formData.colorId ? parseInt(formData.colorId) : null;
        const inventory = await getProductInventoryByProductAndLocation(
          parseInt(formData.productId),
          parseInt(formData.locationId),
          colorId
        );
        const stock = inventory?.quantity || 0;
        setCurrentStock(stock);
        // Prellenar el campo "Stock del Sistema" con el valor obtenido
        setFormData((prev) => ({ ...prev, systemStock: stock.toString() }));
      } catch (err) {
        console.error("Error loading current stock:", err);
        // Si no existe inventario, establecer en 0
        setCurrentStock(0);
        setFormData((prev) => ({ ...prev, systemStock: "0" }));
      } finally {
        setLoadingStock(false);
      }
    } else {
      // Para materiales no se requiere ubicación
      if (!formData.materialId) {
        setCurrentStock(null);
        setFormData((prev) => ({ ...prev, systemStock: "" }));
        return;
      }

      try {
        setLoadingStock(true);
        const inventory = await getMaterialInventory(parseInt(formData.materialId));
        const stock = inventory?.totalQuantity || 0;
        setCurrentStock(stock);
        // Prellenar el campo "Stock del Sistema" con el valor obtenido
        setFormData((prev) => ({ ...prev, systemStock: stock.toString() }));
      } catch (err) {
        console.error("Error loading current stock:", err);
        // Si no existe inventario, establecer en 0
        setCurrentStock(0);
        setFormData((prev) => ({ ...prev, systemStock: "0" }));
      } finally {
        setLoadingStock(false);
      }
    }
  };

  useEffect(() => {
    loadCurrentStock();
  }, [formData.locationId, formData.productId, formData.materialId, formData.colorId, adjustmentMode]);

  const handleCreateAdjustment = async () => {
    // Validaciones
    if (adjustmentMode === "product" && !formData.locationId) {
      showError("Debe seleccionar una ubicación");
      return;
    }

    if (adjustmentMode === "product" && !formData.productId) {
      showError("Debe seleccionar un producto");
      return;
    }

    if (adjustmentMode === "material" && !formData.materialId) {
      showError("Debe seleccionar un material");
      return;
    }

    if (!formData.systemStock || formData.systemStock.trim() === "" || parseFloat(formData.systemStock) < 0) {
      showError("Debe ingresar el stock del sistema (valor válido >= 0)");
      return;
    }

    if (
      formData.physicalStock === "" ||
      formData.physicalStock.trim() === "" ||
      parseFloat(formData.physicalStock) < 0
    ) {
      showError("Debe ingresar el stock físico (valor válido >= 0)");
      return;
    }

    if (!formData.reason || formData.reason.trim() === "") {
      showError("Debe ingresar un motivo para el ajuste");
      return;
    }

    const systemStock = parseFloat(formData.systemStock);
    const physicalStock = parseFloat(formData.physicalStock);

    if (systemStock === physicalStock) {
      const confirmProceed = window.confirm(
        "El stock del sistema y el stock físico son iguales (diferencia = 0).\n\n" +
        "¿Desea continuar y guardar este ajuste de todas formas?\n\n" +
        "Esto puede ser útil para fines de auditoría o documentación."
      );
      if (!confirmProceed) {
        return;
      }
    }

    // Validación adicional para diferencias muy grandes
    const difference = Math.abs(physicalStock - systemStock);
    const percentage = systemStock > 0 ? (difference / systemStock) * 100 : 0;
    
    if (difference > 50 || (systemStock > 0 && percentage > 20)) {
      const confirmLargeDiff = window.confirm(
        `⚠️ ADVERTENCIA: Diferencia significativa detectada\n\n` +
        `Stock del Sistema: ${systemStock.toFixed(3)}\n` +
        `Stock Físico: ${physicalStock.toFixed(3)}\n` +
        `Diferencia: ${difference >= 0 ? "+" : ""}${difference.toFixed(3)} unidades\n` +
        `${systemStock > 0 ? `(${percentage.toFixed(1)}% del stock del sistema)` : ""}\n\n` +
        `¿Está seguro de que estos valores son correctos?\n\n` +
        `Por favor verifique antes de continuar.`
      );
      if (!confirmLargeDiff) {
        return;
      }
    }

    try {
      setLoading(true);
      const adjustmentData = {
        systemStock: systemStock,
        physicalStock: physicalStock,
        reason: formData.reason.trim(),
        ...(adjustmentMode === "product"
          ? { 
              productId: parseInt(formData.productId),
              locationId: parseInt(formData.locationId),
              colorId: formData.colorId ? parseInt(formData.colorId) : null
            }
          : { 
              materialId: parseInt(formData.materialId)
              // No se incluye locationId para materiales
            }
        ),
      };

      await createInventoryAdjustment(adjustmentData);
      showSuccess("Ajuste de inventario creado exitosamente");
      setShowMaterialModal(false);
      setShowProductModal(false);
      resetForm();
      await loadAdjustments();
    } catch (err) {
      showError(err.message || "Error al crear el ajuste");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      locationId: "",
      productId: "",
      materialId: "",
      colorId: "",
      captureUnitMode: "BASE",
      captureQuantity: "",
      customFactorToBase: "",
      systemStock: "",
      physicalStock: "",
      reason: "",
    });
    setCurrentStock(null);
  };

  const resetProductBatch = () => {
    setProductBatchRows([createProductBatchRow()]);
    setBatchStockLoadingRows({});
    setFormData((prev) => ({ ...prev, locationId: "", productId: "", colorId: "", systemStock: "", physicalStock: "", reason: "" }));
  };

  const updateBatchRow = (rowId, changes) => {
    setProductBatchRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...changes } : row))
    );
  };

  const addBatchRow = () => {
    setProductBatchRows((prev) => [...prev, createProductBatchRow()]);
  };

  const removeBatchRow = (rowId) => {
    setProductBatchRows((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((row) => row.rowId !== rowId);
    });
  };

  const loadBatchRowStock = async (rowId, productId, colorId, locationId) => {
    if (!locationId || !productId) {
      updateBatchRow(rowId, { systemStock: "", fossSizeLines: [] });
      return;
    }

    try {
      setBatchStockLoadingRows((prev) => ({ ...prev, [rowId]: true }));
      const inventory = await getProductInventoryByProductAndLocation(
        parseInt(productId, 10),
        parseInt(locationId, 10),
        colorId ? parseInt(colorId, 10) : null
      );
      const prod = getProductById(productId);
      const foss = prod && isFossCinchoCode(prod.code);
      const sizesObj = inventory?.sizes && typeof inventory.sizes === "object" ? inventory.sizes : null;
      if (foss && sizesObj && Object.keys(sizesObj).length > 0) {
        const fossSizeLines = Object.entries(sizesObj).map(([size, qty]) => ({
          lineId: `${rowId}-sz-${size}-${Math.random().toString(36).slice(2, 5)}`,
          size: String(size),
          systemStock: String(qty != null ? qty : 0),
          physicalStock: String(qty != null ? qty : 0),
        }));
        const sysSum = fossSizeLines.reduce((a, l) => a + (parseFloat(l.systemStock) || 0), 0);
        const phySum = fossSizeLines.reduce((a, l) => a + (parseFloat(l.physicalStock) || 0), 0);
        updateBatchRow(rowId, {
          systemStock: sysSum.toFixed(3),
          physicalStock: phySum.toFixed(3),
          fossSizeLines,
        });
      } else if (foss) {
        const stock = Number(inventory?.quantity || 0);
        updateBatchRow(rowId, {
          systemStock: stock.toFixed(3),
          physicalStock: stock.toFixed(3),
          fossSizeLines: [
            {
              lineId: `${rowId}-fs-${Date.now()}`,
              size: "",
              systemStock: stock.toFixed(3),
              physicalStock: stock.toFixed(3),
            },
          ],
        });
      } else {
        const stock = Number(inventory?.quantity || 0);
        updateBatchRow(rowId, { systemStock: stock.toFixed(3), fossSizeLines: [] });
      }
    } catch (err) {
      console.error("Error loading batch row stock:", err);
      updateBatchRow(rowId, { systemStock: "0.000", physicalStock: "0.000", fossSizeLines: [] });
    } finally {
      setBatchStockLoadingRows((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const handleCreateProductBatchAdjustments = async () => {
    if (!formData.locationId) {
      showError("Debe seleccionar una ubicación");
      return;
    }

    const rowsToSubmit = productBatchRows.filter(
      (row) => row.productId || row.systemStock || row.physicalStock || row.reason || row.colorId
    );

    if (!rowsToSubmit.length) {
      showError("Debe agregar al menos un ajuste en el listado");
      return;
    }

    const zeroDifferenceRows = [];
    const largeDifferenceRows = [];

    for (let i = 0; i < rowsToSubmit.length; i += 1) {
      const row = rowsToSubmit[i];
      const rowLabel = `fila ${i + 1}`;

      if (!row.productId) {
        showError(`Debe seleccionar producto en la ${rowLabel}`);
        return;
      }

      const prod = getProductById(row.productId);
      const foss = prod && isFossCinchoCode(prod.code);
      if (foss) {
        const lines = (row.fossSizeLines || []).filter((l) => l.size && String(l.size).trim());
        if (lines.length === 0) {
          showError(`Cincho FOSS (${rowLabel}): agregue al menos una talla con cantidades.`);
          return;
        }
        for (let j = 0; j < lines.length; j += 1) {
          const l = lines[j];
          if (l.systemStock === "" || Number.isNaN(parseFloat(l.systemStock)) || parseFloat(l.systemStock) < 0) {
            showError(`Stock sistema invalido talla "${l.size}" (${rowLabel})`);
            return;
          }
          if (l.physicalStock === "" || Number.isNaN(parseFloat(l.physicalStock)) || parseFloat(l.physicalStock) < 0) {
            showError(`Stock fisico invalido talla "${l.size}" (${rowLabel})`);
            return;
          }
        }
      } else {
        if (row.systemStock === "" || Number.isNaN(parseFloat(row.systemStock)) || parseFloat(row.systemStock) < 0) {
          showError(`Debe ingresar stock del sistema valido en la ${rowLabel}`);
          return;
        }
        if (row.physicalStock === "" || Number.isNaN(parseFloat(row.physicalStock)) || parseFloat(row.physicalStock) < 0) {
          showError(`Debe ingresar stock fisico valido en la ${rowLabel}`);
          return;
        }
      }
      if (!row.reason || !row.reason.trim()) {
        showError(`Debe ingresar motivo del ajuste en la ${rowLabel}`);
        return;
      }

      const systemStock = foss
        ? (row.fossSizeLines || []).reduce((a, l) => a + (parseFloat(l.systemStock) || 0), 0)
        : parseFloat(row.systemStock);
      const physicalStock = foss
        ? (row.fossSizeLines || []).reduce((a, l) => a + (parseFloat(l.physicalStock) || 0), 0)
        : parseFloat(row.physicalStock);
      const difference = Math.abs(physicalStock - systemStock);
      const percentage = systemStock > 0 ? (difference / systemStock) * 100 : 0;

      if (systemStock === physicalStock) {
        zeroDifferenceRows.push(i + 1);
      }
      if (difference > 50 || (systemStock > 0 && percentage > 20)) {
        largeDifferenceRows.push(i + 1);
      }
    }

    if (zeroDifferenceRows.length) {
      const confirmProceed = window.confirm(
        `Hay ${zeroDifferenceRows.length} ajuste(s) sin diferencia real (filas: ${zeroDifferenceRows.join(", ")}).\n\n` +
          "Desea continuar y guardarlos de todas formas?"
      );
      if (!confirmProceed) return;
    }

    if (largeDifferenceRows.length) {
      const confirmLargeDiff = window.confirm(
        `Hay ${largeDifferenceRows.length} ajuste(s) con diferencia significativa (filas: ${largeDifferenceRows.join(", ")}).\n\n` +
          "Desea continuar?"
      );
      if (!confirmLargeDiff) return;
    }

    let createdCount = 0;
    const failedRows = [];

    try {
      setLoading(true);

      for (let i = 0; i < rowsToSubmit.length; i += 1) {
        const row = rowsToSubmit[i];
        try {
          const prod = getProductById(row.productId);
          const foss = prod && isFossCinchoCode(prod.code);
          let systemStockTotal = parseFloat(row.systemStock);
          let physicalStockTotal = parseFloat(row.physicalStock);
          const base = {
            productId: parseInt(row.productId, 10),
            locationId: parseInt(formData.locationId, 10),
            colorId: row.colorId ? parseInt(row.colorId, 10) : null,
            systemStock: systemStockTotal,
            physicalStock: physicalStockTotal,
            reason: row.reason.trim(),
          };
          if (foss) {
            const systemSizes = {};
            const physicalSizes = {};
            (row.fossSizeLines || []).forEach((l) => {
              const sk = String(l.size || "").trim();
              if (!sk) return;
              systemSizes[sk] = parseFloat(l.systemStock || 0);
              physicalSizes[sk] = parseFloat(l.physicalStock || 0);
            });
            base.systemSizes = systemSizes;
            base.physicalSizes = physicalSizes;
            systemStockTotal = Object.values(systemSizes).reduce((a, v) => a + v, 0);
            physicalStockTotal = Object.values(physicalSizes).reduce((a, v) => a + v, 0);
            base.systemStock = systemStockTotal;
            base.physicalStock = physicalStockTotal;
          }
          await createInventoryAdjustment(base);
          createdCount += 1;
        } catch (rowError) {
          failedRows.push(`Fila ${i + 1}: ${rowError.message || "error desconocido"}`);
        }
      }

      if (createdCount > 0 && failedRows.length === 0) {
        showSuccess(`${createdCount} ajuste(s) creado(s) exitosamente`);
        setShowProductModal(false);
        resetProductBatch();
      } else if (createdCount > 0) {
        showSuccess(`${createdCount} ajuste(s) creado(s). Algunos registros fallaron.`);
        showError(failedRows.join(" | "));
      } else {
        showError(failedRows.join(" | ") || "No se pudo crear ningun ajuste");
      }

      if (createdCount > 0) {
        await loadAdjustments();
      }
    } finally {
      setLoading(false);
    }
  };

  // Limpiar stock del sistema cuando cambia el modo, producto o material
  useEffect(() => {
    if (!showCreateModal) {
      resetForm();
    }
  }, [showCreateModal]);

  useEffect(() => {
    // Limpiar stock cuando cambia el modo de ajuste
    setFormData((prev) => ({ ...prev, systemStock: "", physicalStock: "", colorId: "" }));
    setCurrentStock(null);
  }, [adjustmentMode]);

  const calculateDifference = () => {
    const system = parseFloat(formData.systemStock || 0);
    const physical = parseFloat(formData.physicalStock || 0);
    return physical - system;
  };

  // Función de filtro global mejorada
  const fuzzyTextFilterFn = (rows, id, filterValue) => {
    return matchSorter(rows, filterValue, {
      keys: [(row) => row.values[id]],
    });
  };
  fuzzyTextFilterFn.autoRemove = (val) => !val || !val.length;

  // Definición de columnas para react-table
  const columns = useMemo(
    () => [
      {
        Header: "Fecha",
        accessor: "adjustmentDate",
        Cell: ({ value }) => {
          if (!value) return "N/A";
          try {
            return formatDateTimeGt(value, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
          } catch (e) {
            return value;
          }
        },
        sortType: (rowA, rowB) => {
          const a = new Date(rowA.original.adjustmentDate || 0);
          const b = new Date(rowB.original.adjustmentDate || 0);
          return a - b;
        },
      },
      {
        Header: "Tipo",
        id: "adjustmentType",
        Cell: ({ row }) => {
          const isProduct = row.original.productId != null && row.original.productId !== "";
          const isMaterial = row.original.materialId != null && row.original.materialId !== "";
          
          // Determinar tipo basándose en qué ID está presente
          if (isProduct) {
            return <Badge color="info">PRODUCTO</Badge>;
          } else if (isMaterial) {
            return <Badge color="primary">MATERIAL</Badge>;
          } else {
            return <Badge color="secondary">N/A</Badge>;
          }
        },
        Filter: ({ column: { filterValue, setFilter } }) => {
          return (
            <FormGroup className="mb-0">
              <Input
                type="select"
                value={filterValue || ""}
                onChange={(e) => {
                  setFilter(e.target.value || undefined);
                }}
                size="sm"
              >
                <option value="">Todos</option>
                <option value="PRODUCT">Producto</option>
                <option value="MATERIAL">Material</option>
              </Input>
            </FormGroup>
          );
        },
        filter: (rows, id, filterValue) => {
          if (!filterValue) return rows;
          return rows.filter((row) => {
            const isProduct = row.original.productId != null && row.original.productId !== "";
            const isMaterial = row.original.materialId != null && row.original.materialId !== "";
            
            if (filterValue === "PRODUCT") {
              return isProduct;
            } else if (filterValue === "MATERIAL") {
              return isMaterial;
            }
            return true;
          });
        },
      },
      {
        Header: "Item",
        id: "itemName",
        Cell: ({ row }) => {
          const itemName = row.original.productName || row.original.materialName || "N/A";
          const colorName = row.original.colorName;
          const sysSz = row.original.systemSizes;
          const phySz = row.original.physicalSizes;
          const sizeKeys =
            sysSz || phySz
              ? Array.from(new Set([...Object.keys(sysSz || {}), ...Object.keys(phySz || {})])).sort()
              : [];
          return (
            <span>
              {itemName}
              {colorName && <Badge color="info" className="ml-2">{colorName}</Badge>}
              {sizeKeys.length > 0 && (
                <div className="small text-muted mt-1">
                  {sizeKeys.map((k) => (
                    <div key={k}>
                      Talla {k}: sis {parseFloat(sysSz?.[k] ?? 0).toFixed(3)} / fis{" "}
                      {parseFloat(phySz?.[k] ?? 0).toFixed(3)}
                    </div>
                  ))}
                </div>
              )}
            </span>
          );
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Ubicación",
        accessor: "locationName",
        Cell: ({ row }) => {
          const locationName = row.original.locationName || "N/A";
          const locationCode = row.original.locationCode;
          return (
            <span>
              {locationName}
              {locationCode && ` (${locationCode})`}
            </span>
          );
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Stock Sistema",
        accessor: "systemStock",
        Cell: ({ value }) => parseFloat(value || 0).toFixed(3),
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.systemStock || 0);
          const b = parseFloat(rowB.original.systemStock || 0);
          return a - b;
        },
      },
      {
        Header: "Stock Físico",
        accessor: "physicalStock",
        Cell: ({ value }) => parseFloat(value || 0).toFixed(3),
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.physicalStock || 0);
          const b = parseFloat(rowB.original.physicalStock || 0);
          return a - b;
        },
      },
      {
        Header: "Diferencia",
        id: "difference",
        Cell: ({ row }) => {
          const system = parseFloat(row.original.systemStock || 0);
          const physical = parseFloat(row.original.physicalStock || 0);
          const diff = physical - system;
          return (
            <strong className={diff >= 0 ? "text-success" : "text-danger"}>
              {diff >= 0 ? "+" : ""}
              {diff.toFixed(3)}
            </strong>
          );
        },
        sortType: (rowA, rowB) => {
          const a =
            parseFloat(rowA.original.physicalStock || 0) -
            parseFloat(rowA.original.systemStock || 0);
          const b =
            parseFloat(rowB.original.physicalStock || 0) -
            parseFloat(rowB.original.systemStock || 0);
          return a - b;
        },
      },
      {
        Header: "Motivo",
        accessor: "reason",
        Cell: ({ value }) => <small>{value || "N/A"}</small>,
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Creado por",
        accessor: "createdByName",
        Cell: ({ value, row }) => {
          const createdByName = value || row.original.createdByName || "N/A";
          const updatedByName = row.original.updatedByName;
          if (updatedByName && updatedByName !== createdByName) {
            return (
              <div>
                <div>{createdByName}</div>
                <small className="text-muted">Editado por: {updatedByName}</small>
              </div>
            );
          }
          return createdByName;
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
    ],
    []
  );

  // Configuración de react-table
  const filterTypes = useMemo(
    () => ({
      fuzzyText: fuzzyTextFilterFn,
      text: (rows, id, filterValue) => {
        return rows.filter((row) => {
          const rowValue = row.values[id];
          return rowValue !== undefined
            ? String(rowValue)
                .toLowerCase()
                .includes(String(filterValue).toLowerCase())
            : true;
        });
      },
    }),
    []
  );

  const defaultColumn = useMemo(
    () => ({
      Filter: DefaultColumnFilter,
    }),
    []
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    page,
    prepareRow,
    state,
    setGlobalFilter,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
  } = useTable(
    {
      columns,
      data: adjustments,
      defaultColumn,
      filterTypes,
      initialState: {
        pageSize: 10,
        pageIndex: 0,
        sortBy: [{ id: "adjustmentDate", desc: true }],
      },
    },
    useFilters,
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  const { globalFilter, pageIndex, pageSize } = state;

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Ajustes Manuales de Inventario</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  {canCreateMaterials && (
                    <Button
                      color="primary"
                      size="sm"
                      onClick={() => {
                        setAdjustmentMode("material");
                        setShowMaterialModal(true);
                      }}
                      disabled={loading}
                      className="mr-2"
                    >
                      <i className="nc-icon nc-simple-add mr-1" />
                      Ajuste Material
                    </Button>
                  )}
                  {canCreateProducts && (
                    <Button
                      color="success"
                      size="sm"
                      onClick={() => {
                        setAdjustmentMode("product");
                        setShowProductModal(true);
                      }}
                      disabled={loading}
                    >
                      <i className="nc-icon nc-simple-add mr-1" />
                      Ajuste Producto
                    </Button>
                  )}
                  {!canCreateMaterials && !canCreateProducts && (
                    <Badge color="warning">
                      No tiene permisos para crear ajustes
                    </Badge>
                  )}
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {/* Filtros de historial */}
              <Row className="mb-3">
                <Col md="3">
                  <FormGroup>
                    <Label>Filtrar por Ubicación</Label>
                    <Input
                      type="select"
                      value={filters.locationId}
                      onChange={(e) =>
                        setFilters({ ...filters, locationId: e.target.value })
                      }
                    >
                      <option value="">Todas</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>
                      Filtrar por{" "}
                      {adjustmentMode === "product" ? "Producto" : "Material"}
                    </Label>
                    <Input
                      type="select"
                      value={
                        adjustmentMode === "product"
                          ? filters.productId
                          : filters.materialId
                      }
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          [adjustmentMode === "product"
                            ? "productId"
                            : "materialId"]: e.target.value,
                        })
                      }
                    >
                      <option value="">Todos</option>
                      {adjustmentMode === "product"
                        ? products.map((prod) => (
                            <option key={prod.id} value={prod.id}>
                              {prod.code} - {prod.name}
                            </option>
                          ))
                        : materials.map((mat) => (
                            <option key={mat.id} value={mat.id}>
                              {mat.sku} - {mat.name}
                            </option>
                          ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Fecha Desde</Label>
                    <Input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) =>
                        setFilters({ ...filters, startDate: e.target.value })
                      }
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Fecha Hasta</Label>
                    <Input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) =>
                        setFilters({ ...filters, endDate: e.target.value })
                      }
                    />
                  </FormGroup>
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  <Button
                    color="secondary"
                    size="sm"
                    onClick={() =>
                      setFilters({
                        materialId: "",
                        productId: "",
                        locationId: "",
                        startDate: "",
                        endDate: "",
                      })
                    }
                  >
                    Limpiar
                  </Button>
                </Col>
              </Row>

              {error && (
                <Alert color="danger" className="mt-3">
                  {error}
                </Alert>
              )}

              {loading && adjustments.length === 0 ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2">Cargando ajustes...</p>
                </div>
              ) : adjustments.length === 0 ? (
                <Alert color="info" className="mt-3">
                  No hay ajustes registrados. Haz clic en "Nuevo Ajuste" para crear uno.
                </Alert>
              ) : (
                <>
                  {/* Filtro global */}
                  <Row className="mb-3">
                    <Col md="4">
                      <FormGroup>
                        <Label>Buscar en todos los campos:</Label>
                        <Input
                          type="text"
                          value={globalFilter || ""}
                          onChange={(e) =>
                            setGlobalFilter(e.target.value || undefined)
                          }
                          placeholder="Buscar por item, ubicación, motivo..."
                        />
                      </FormGroup>
                    </Col>
                    <Col md="4" className="d-flex align-items-end">
                      <small className="text-muted">
                        Mostrando {page.length} de {adjustments.length} ajustes
                      </small>
                    </Col>
                  </Row>

                  {/* Tabla con react-table */}
                  <div className="table-responsive">
                    <table {...getTableProps()} className="table table-striped">
                      <thead className="text-primary">
                        {headerGroups.map((headerGroup) => (
                          <tr {...headerGroup.getHeaderGroupProps()}>
                            {headerGroup.headers.map((column) => (
                              <th
                                {...column.getHeaderProps(
                                  column.getSortByToggleProps()
                                )}
                                className={
                                  column.canSort
                                    ? column.isSorted
                                      ? column.isSortedDesc
                                        ? "sort-desc"
                                        : "sort-asc"
                                      : "sortable"
                                    : ""
                                }
                              >
                                {column.render("Header")}
                                <span>
                                  {column.isSorted
                                    ? column.isSortedDesc
                                      ? " ▼"
                                      : " ▲"
                                    : column.canSort
                                    ? " ⇅"
                                    : ""}
                                </span>
                                <div>
                                  {column.canFilter
                                    ? column.render("Filter")
                                    : null}
                                </div>
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody {...getTableBodyProps()}>
                        {page.map((row) => {
                          prepareRow(row);
                          return (
                            <tr {...row.getRowProps()}>
                              {row.cells.map((cell) => (
                                <td {...cell.getCellProps()}>
                                  {cell.render("Cell")}
                                </td>
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
                        <Input
                          type="select"
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                          }}
                          style={{ width: "auto" }}
                        >
                          {[5, 10, 20, 25, 50, 100].map((pageSize) => (
                            <option key={pageSize} value={pageSize}>
                              {pageSize}
                            </option>
                          ))}
                        </Input>
                        <span className="ml-2">registros por página</span>
                      </div>
                    </Col>
                    <Col md="6" className="text-right">
                      <div className="d-flex align-items-center justify-content-end">
                        <span className="mr-3">
                          Página{" "}
                          <strong>
                            {pageIndex + 1} de {pageOptions.length}
                          </strong>
                        </span>
                        <Button
                          color="primary"
                          size="sm"
                          onClick={() => gotoPage(0)}
                          disabled={!canPreviousPage}
                          className="mr-1"
                        >
                          {"<<"}
                        </Button>
                        <Button
                          color="primary"
                          size="sm"
                          onClick={() => previousPage()}
                          disabled={!canPreviousPage}
                          className="mr-1"
                        >
                          {"<"}
                        </Button>
                        <Button
                          color="primary"
                          size="sm"
                          onClick={() => nextPage()}
                          disabled={!canNextPage}
                          className="mr-1"
                        >
                          {">"}
                        </Button>
                        <Button
                          color="primary"
                          size="sm"
                          onClick={() => gotoPage(pageCount - 1)}
                          disabled={!canNextPage}
                        >
                          {">>"}
                        </Button>
                      </div>
                    </Col>
                  </Row>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Modal para crear ajuste de MATERIAL */}
      {canCreateMaterials && (
        <Modal
          isOpen={showMaterialModal}
          toggle={() => {
            setShowMaterialModal(false);
            resetForm();
          }}
          size="lg"
        >
          <ModalHeader toggle={() => {
            setShowMaterialModal(false);
            resetForm();
          }}>
            Nuevo Ajuste de Inventario - Material
          </ModalHeader>
          <ModalBody>
            <Row>
              <Col md="12">
                <FormGroup>
                  <Label>Material *</Label>
                  <Select
                    className="react-select"
                    classNamePrefix="react-select"
                    placeholder="Buscar material..."
                    isClearable
                    filterOption={filterSelectOption}
                    value={
                      formData.materialId
                        ? materialOptions.find((o) => o.value === String(formData.materialId)) || null
                        : null
                    }
                    onChange={(selected) =>
                      setFormData({
                        ...formData,
                        materialId: selected ? selected.value : "",
                      })
                    }
                    options={materialOptions}
                  />
                </FormGroup>
              </Col>
            {selectedMaterialMeta?.conversionText && (
              <Col md="12">
                <Alert color="info" className="py-2">
                  <strong>Equivalencia:</strong> {selectedMaterialMeta.conversionText}
                </Alert>
              </Col>
            )}
            <Col md="6">
              <FormGroup>
                <Label>Unidad de captura</Label>
                <Input
                  type="select"
                  value={formData.captureUnitMode || "BASE"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      captureUnitMode: e.target.value,
                    }))
                  }
                >
                  <option value="BASE">{materialMeasureUom}</option>
                  {purchaseQuantity > 0 && <option value="PURCHASE">{materialPurchaseUom}</option>}
                  <option value="CUSTOM">Otra unidad (factor manual)</option>
                </Input>
              </FormGroup>
            </Col>
            {formData.captureUnitMode === "CUSTOM" && (
              <Col md="6">
                <FormGroup>
                  <Label>Factor a {materialMeasureUom}</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={formData.customFactorToBase}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        customFactorToBase: e.target.value,
                      }))
                    }
                    placeholder={`1 unidad = ? ${materialMeasureUom}`}
                  />
                </FormGroup>
              </Col>
            )}
            <Col md="6">
              <FormGroup>
                <Label>
                  Cantidad en {formData.captureUnitMode === "PURCHASE"
                    ? materialPurchaseUom
                    : formData.captureUnitMode === "CUSTOM"
                    ? "unidad personalizada"
                    : materialMeasureUom}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.captureQuantity}
                  onChange={(e) => {
                    const captureValue = e.target.value;
                    const captureNum = parseFloat(captureValue || 0);
                    const factor =
                      formData.captureUnitMode === "PURCHASE"
                        ? purchaseQuantity
                        : formData.captureUnitMode === "CUSTOM"
                        ? parseFloat(formData.customFactorToBase || 0)
                        : 1;
                    const calculated = !Number.isNaN(captureNum) ? captureNum * (factor || 0) : 0;
                    setFormData((prev) => ({
                      ...prev,
                      captureQuantity: captureValue,
                      physicalStock: captureValue === "" ? prev.physicalStock : calculated.toFixed(3),
                    }));
                  }}
                  placeholder="0.000"
                />
                <small className="text-muted">
                  Se convierte automáticamente a {materialMeasureUom}.
                </small>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>
                  Stock del Sistema *
                  {loadingStock && (
                    <Spinner size="sm" color="primary" className="ml-2" />
                  )}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.systemStock}
                  onChange={(e) =>
                    setFormData({ ...formData, systemStock: e.target.value })
                  }
                  placeholder="0.000"
                  disabled={loadingStock}
                  style={{
                    backgroundColor: currentStock !== null ? "#f8f9fa" : "white",
                    fontWeight: currentStock !== null ? "500" : "normal",
                  }}
                />
                <small className="text-muted">
                  {currentStock !== null
                    ? `Stock actual del sistema: ${parseFloat(currentStock || 0).toFixed(3)} ${materialMeasureUom} (editable)`
                    : "Stock registrado en el sistema (se cargará automáticamente)"}
                </small>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Stock Físico *</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.physicalStock}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      physicalStock: e.target.value,
                    })
                  }
                  placeholder="0.000"
                />
                <small className="text-muted">
                  Stock contado físicamente en {materialMeasureUom}
                </small>
              </FormGroup>
            </Col>
            {formData.systemStock && formData.physicalStock && (
              <Col md="12">
                {(() => {
                  const difference = calculateDifference();
                  const absDifference = Math.abs(difference);
                  const systemStock = parseFloat(formData.systemStock || 0);
                  const percentage = systemStock > 0 
                    ? ((absDifference / systemStock) * 100).toFixed(1)
                    : 0;
                  const isLargeDifference = absDifference > 50 || (systemStock > 0 && percentage > 20);
                  
                  return (
                    <>
                      <Alert
                        color={
                          difference > 0
                            ? "success"
                            : difference < 0
                            ? "danger"
                            : "secondary"
                        }
                        style={{
                          borderLeft: `4px solid ${
                            difference > 0
                              ? "#28a745"
                              : difference < 0
                              ? "#dc3545"
                              : "#6c757d"
                          }`,
                        }}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <strong>
                              {difference > 0 ? "Sobrante" : difference < 0 ? "Faltante" : "Sin diferencia"}
                            </strong>
                            <br />
                            <span style={{ fontSize: "1.2em", fontWeight: "bold" }}>
                              {difference >= 0 ? "+" : ""}
                              {difference.toFixed(3)} {materialMeasureUom}
                            </span>
                            {systemStock > 0 && (
                              <small className="ml-2">
                                ({percentage}% del stock del sistema)
                              </small>
                            )}
                          </div>
                          {difference !== 0 && (
                            <div>
                              {difference > 0 ? (
                                <i className="nc-icon nc-check-2" style={{ fontSize: "2em", color: "#28a745" }} />
                              ) : (
                                <i className="nc-icon nc-alert-circle-i" style={{ fontSize: "2em", color: "#dc3545" }} />
                              )}
                            </div>
                          )}
                        </div>
                      </Alert>
                      {isLargeDifference && (
                        <Alert color="warning" className="mt-2">
                          <i className="nc-icon nc-alert-circle-i mr-2" />
                          <strong>Atención:</strong> La diferencia es significativa (
                          {absDifference.toFixed(3)} unidades
                          {systemStock > 0 && `, ${percentage}%`}
                          ). Por favor verifique que los valores sean correctos antes de guardar.
                        </Alert>
                      )}
                      {difference === 0 && (
                        <Alert color="info" className="mt-2">
                          <i className="nc-icon nc-info-circle-i mr-2" />
                          El stock del sistema y el stock físico son iguales. 
                          Aunque técnicamente no hay diferencia, puede guardar este ajuste para fines de auditoría.
                        </Alert>
                      )}
                    </>
                  );
                })()}
              </Col>
            )}
            <Col md="12">
              <FormGroup>
                <Label>Motivo del Ajuste *</Label>
                <Input
                  type="textarea"
                  rows="4"
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                  placeholder="Ej: Conteo físico, Pérdida por daño, Error de registro..."
                />
                <small className="text-muted">
                  Describa el motivo del ajuste (requerido)
                </small>
              </FormGroup>
            </Col>
          </Row>
        </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={() => {
              setShowMaterialModal(false);
              resetForm();
            }}>
              Cancelar
            </Button>
            <Button
              color="primary"
              onClick={() => {
                setAdjustmentMode("material");
                handleCreateAdjustment();
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creando...
                </>
              ) : (
                "Crear Ajuste"
              )}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Modal para crear ajuste de PRODUCTO */}
      {canCreateProducts && (
        <Modal
          isOpen={showProductModal}
          toggle={() => {
            setShowProductModal(false);
            resetProductBatch();
          }}
          size="lg"
        >
          <ModalHeader toggle={() => {
            setShowProductModal(false);
            resetProductBatch();
          }}>
            Ajuste de Inventario - Productos por Lote
          </ModalHeader>
          <ModalBody>
            <Row>
              <Col md="8">
                <FormGroup>
                  <Label>Ubicación *</Label>
                  <Select
                    className="react-select"
                    classNamePrefix="react-select"
                    placeholder="Buscar ubicación..."
                    isClearable
                    filterOption={filterSelectOption}
                    value={
                      formData.locationId
                        ? locationOptions.find((o) => o.value === String(formData.locationId)) || null
                        : null
                    }
                    onChange={(selected) => {
                      const nextLocationId = selected ? selected.value : "";
                      setFormData((prev) => ({
                        ...prev,
                        locationId: nextLocationId,
                      }));
                      productBatchRows.forEach((row) => {
                        loadBatchRowStock(row.rowId, row.productId, row.colorId, nextLocationId);
                      });
                    }}
                    options={locationOptions}
                  />
                </FormGroup>
              </Col>
              <Col md="4" className="d-flex align-items-end">
                <Button
                  color="info"
                  size="sm"
                  className="mb-3"
                  onClick={addBatchRow}
                >
                  <i className="nc-icon nc-simple-add mr-1" />
                  Agregar fila
                </Button>
              </Col>
              <Col md="12">
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr>
                        <th style={{ minWidth: "230px" }}>Producto *</th>
                        <th style={{ minWidth: "190px" }}>Color</th>
                        <th style={{ minWidth: "130px" }}>Stock Sistema *</th>
                        <th style={{ minWidth: "130px" }}>Stock Fisico *</th>
                        <th style={{ minWidth: "220px" }}>Motivo *</th>
                        <th style={{ minWidth: "90px" }}>Dif.</th>
                        <th style={{ width: "70px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {productBatchRows.map((row, index) => {
                        const rowFoss = isFossCinchoRow(row);
                        const system = parseFloat(row.systemStock || 0);
                        const physical = parseFloat(row.physicalStock || 0);
                        const difference = Number.isNaN(system) || Number.isNaN(physical) ? null : physical - system;

                        return (
                          <tr key={row.rowId}>
                            <td>
                              <Select
                                className="react-select"
                                classNamePrefix="react-select"
                                placeholder={`Producto fila ${index + 1}`}
                                isClearable
                                filterOption={filterSelectOption}
                                value={
                                  row.productId
                                    ? productOptions.find((o) => o.value === String(row.productId)) || null
                                    : null
                                }
                                onChange={(selected) => {
                                  const nextProductId = selected ? selected.value : "";
                                  updateBatchRow(row.rowId, {
                                    productId: nextProductId,
                                    colorId: "",
                                    fossSizeLines: [],
                                  });
                                  loadBatchRowStock(row.rowId, nextProductId, "", formData.locationId);
                                }}
                                options={productOptions}
                              />
                            </td>
                            <td>
                              <Select
                                className="react-select"
                                classNamePrefix="react-select"
                                placeholder="Color opcional"
                                isClearable
                                filterOption={filterSelectOption}
                                value={
                                  row.colorId
                                    ? colorOptions.find((o) => o.value === String(row.colorId)) || null
                                    : null
                                }
                                onChange={(selected) => {
                                  const nextColorId = selected ? selected.value : "";
                                  updateBatchRow(row.rowId, { colorId: nextColorId });
                                  loadBatchRowStock(row.rowId, row.productId, nextColorId, formData.locationId);
                                }}
                                options={colorOptions}
                              />
                            </td>
                            {rowFoss ? (
                              <td colSpan={2}>
                                <div className="mb-1">
                                  <small className="text-muted">Cincho FOSS: stock por talla</small>
                                </div>
                                {(row.fossSizeLines || []).map((line) => (
                                  <div
                                    key={line.lineId}
                                    className="d-flex flex-wrap align-items-center mb-1"
                                    style={{ gap: "6px" }}
                                  >
                                    <Input
                                      style={{ width: "72px", minWidth: "72px" }}
                                      type="text"
                                      bsSize="sm"
                                      value={line.size}
                                      onChange={(e) =>
                                        updateFossSizeLine(row.rowId, line.lineId, { size: e.target.value })
                                      }
                                      placeholder="Talla"
                                      disabled={Boolean(batchStockLoadingRows[row.rowId])}
                                    />
                                    <Input
                                      style={{ width: "96px", minWidth: "96px" }}
                                      type="number"
                                      step="0.001"
                                      min="0"
                                      bsSize="sm"
                                      value={line.systemStock}
                                      onChange={(e) =>
                                        updateFossSizeLine(row.rowId, line.lineId, { systemStock: e.target.value })
                                      }
                                      placeholder="Sis."
                                      title="Stock sistema"
                                      disabled={Boolean(batchStockLoadingRows[row.rowId])}
                                    />
                                    <Input
                                      style={{ width: "96px", minWidth: "96px" }}
                                      type="number"
                                      step="0.001"
                                      min="0"
                                      bsSize="sm"
                                      value={line.physicalStock}
                                      onChange={(e) =>
                                        updateFossSizeLine(row.rowId, line.lineId, { physicalStock: e.target.value })
                                      }
                                      placeholder="Fis."
                                      title="Stock físico"
                                    />
                                    <Button
                                      color="link"
                                      className="p-0 text-danger"
                                      size="sm"
                                      onClick={() => removeFossSizeLine(row.rowId, line.lineId)}
                                      title="Quitar talla"
                                      disabled={(row.fossSizeLines || []).length <= 1}
                                    >
                                      <i className="nc-icon nc-simple-remove" />
                                    </Button>
                                  </div>
                                ))}
                                {batchStockLoadingRows[row.rowId] && (
                                  <small className="text-muted d-block">Cargando...</small>
                                )}
                                <Button
                                  color="info"
                                  size="sm"
                                  outline
                                  className="mt-1"
                                  onClick={() => addFossSizeLine(row.rowId)}
                                >
                                  <i className="nc-icon nc-simple-add mr-1" />
                                  Agregar talla
                                </Button>
                                <div className="small text-muted mt-1">
                                  Total fila: sis {system.toFixed(3)} / fis {physical.toFixed(3)}
                                </div>
                              </td>
                            ) : (
                              <>
                                <td>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={row.systemStock}
                                    onChange={(e) => updateBatchRow(row.rowId, { systemStock: e.target.value })}
                                    placeholder="0.000"
                                    disabled={Boolean(batchStockLoadingRows[row.rowId])}
                                  />
                                  {batchStockLoadingRows[row.rowId] && (
                                    <small className="text-muted">Cargando...</small>
                                  )}
                                </td>
                                <td>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={row.physicalStock}
                                    onChange={(e) => updateBatchRow(row.rowId, { physicalStock: e.target.value })}
                                    placeholder="0.000"
                                  />
                                </td>
                              </>
                            )}
                            <td>
                              <Input
                                type="text"
                                value={row.reason}
                                onChange={(e) => updateBatchRow(row.rowId, { reason: e.target.value })}
                                placeholder="Conteo, dano, correccion..."
                              />
                            </td>
                            <td className="text-center align-middle">
                              {difference === null ? "-" : (
                                <strong className={difference >= 0 ? "text-success" : "text-danger"}>
                                  {difference >= 0 ? "+" : ""}
                                  {difference.toFixed(3)}
                                </strong>
                              )}
                            </td>
                            <td className="text-center align-middle">
                              <Button
                                color="link"
                                className="p-0 text-danger"
                                onClick={() => removeBatchRow(row.rowId)}
                                disabled={productBatchRows.length === 1}
                                title="Eliminar fila"
                              >
                                <i className="nc-icon nc-simple-remove" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <small className="text-muted">
                  Puede cargar varias filas y guardar todos los ajustes de una sola vez.
                </small>
              </Col>
              {!formData.locationId && (
                <Col md="12">
                  <Alert color="warning" className="mt-2 mb-0">
                    Seleccione una ubicacion para autocompletar el stock del sistema por cada producto.
                  </Alert>
                </Col>
              )}
            </Row>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={() => {
              setShowProductModal(false);
              resetProductBatch();
            }}>
              Cancelar
            </Button>
            <Button
              color="success"
              onClick={handleCreateProductBatchAdjustments}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Guardando...
                </>
              ) : (
                `Crear Ajustes (${productBatchRows.length})`
              )}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}

export default InventoryAdjustments;

