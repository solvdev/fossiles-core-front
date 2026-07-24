import React, { useEffect, useMemo, useState } from "react";
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
  Nav,
  NavItem,
  NavLink,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { ColorSelector, ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getLocations } from "services/locationService";
import KioskInventoryCountReport from "./KioskInventoryCountReport";
import KioskOpeningInventoryTab from "./KioskOpeningInventoryTab";
import { getProducts } from "services/productService";
import { getColors } from "services/colorService";
import {
  getKioscoMovimientos,
  getKioscoStock,
  getKioscoStockBajo,
  initializeKioscoInventory,
  registrarKioscoAjuste,
  registrarKioscoAnulacion,
  registrarKioscoDevolucionCliente,
  registrarKioscoDevolucionDeposito,
  registrarKioscoEntrada,
  registrarKioscoMerma,
  registrarKioscoCambio,
  registrarKioscoTraslado,
  lookupKioscoTrasladoBoleta,
  registrarKioscoVenta,
} from "services/kioscoInventoryService";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import { hasInventorySizeBreakdown } from "utils/inventoryVariantHelper";
import { isFossCinchosProductCode } from "utils/cinchoProductionHelper";
import { sortSizeKeys, filterVisibleKioskStockRows } from "utils/productCinchoHelper";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import {
  canSell,
  createEmptyLineItem,
  isSaleBelowMinimum,
  OPERATION_OPTIONS,
  sortMovementsDesc,
  supportsBulkLines,
  validateAnulacionForm,
  validateBulkLines,
  validateCommonStockForm,
  validateTransferForm,
} from "./kioskInventoryFormHelper";
import KioskInventoryMovementsPanel from "./KioskInventoryMovementsPanel";
import KioskInventoryStockExplorer from "./KioskInventoryStockExplorer";
import "./KioskInventory.css";

const INITIAL_FORM = {
  operation: "ENTRADA",
  locationId: "",
  locationOriginId: "",
  locationDestinationId: "",
  productId: "",
  colorId: "",
  returnedProductId: "",
  returnedColorId: "",
  quantity: "",
  referenceId: "",
  invoiceId: "",
  originalInvoiceId: "",
  apto: true,
  reason: "",
  realQuantity: "",
  productLeftKiosk: false,
  userId: "",
  physicalSlipNumber: "",
  sizeKey: "",
  realSizes: {},
};

function KioskInventory() {
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [stockRows, setStockRows] = useState([]);
  const [lowStockRows, setLowStockRows] = useState([]);
  const [movements, setMovements] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [initializingStock, setInitializingStock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [customAjusteSizeKeys, setCustomAjusteSizeKeys] = useState([]);
  const [newAjusteSizeKey, setNewAjusteSizeKey] = useState("");
  const [activeTab, setActiveTab] = useState("INVENTARIO");
  const [stockViewFilter, setStockViewFilter] = useState("ALL");
  const [lineItems, setLineItems] = useState([createEmptyLineItem()]);
  const [originStockRows, setOriginStockRows] = useState([]);
  const [boletaLocked, setBoletaLocked] = useState(false);
  const [lookingUpBoleta, setLookingUpBoleta] = useState(false);
  const [boletaHint, setBoletaHint] = useState("");
  const [stockExploreProductId, setStockExploreProductId] = useState("");
  const [stockExploreColorId, setStockExploreColorId] = useState("");
  const [showAllStockRows, setShowAllStockRows] = useState(false);
  const [movementKioskId, setMovementKioskId] = useState("");
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementFilters, setMovementFilters] = useState({
    type: "",
    productTerm: "",
    referenceTerm: "",
    fromDate: "",
    toDate: "",
  });

  const kiosks = useMemo(
    () =>
      (locations || []).filter((location) => {
        const category = String(location?.categoria || "")
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const name = String(location?.name || "")
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const code = String(location?.code || "").toUpperCase();
        return category.includes("KIOS") || name.includes("KIOS") || code.startsWith("K");
      }),
    [locations]
  );

  const packagingProducts = useMemo(
    () => (products || []).filter((product) => isPackagingProductCode(product?.code)),
    [products]
  );

  const renderProductOptionExtra = (product) =>
    isPackagingProductCode(product?.code) ? (
      <Badge color="secondary" className="ml-1">Empaque</Badge>
    ) : null;

  const visibleStockRows = useMemo(
    () => filterVisibleKioskStockRows(stockRows),
    [stockRows]
  );

  const filteredStockRows = useMemo(() => {
    if (stockViewFilter === "PACKAGING") {
      return visibleStockRows.filter((row) => isPackagingProductCode(row.productCode));
    }
    if (stockViewFilter === "PRODUCTS") {
      return visibleStockRows.filter((row) => !isPackagingProductCode(row.productCode));
    }
    return visibleStockRows;
  }, [visibleStockRows, stockViewFilter]);

  const packagingStockCount = useMemo(
    () => visibleStockRows.filter((row) => isPackagingProductCode(row.productCode)).length,
    [visibleStockRows]
  );

  const visibleLowStockCount = useMemo(
    () => filterVisibleKioskStockRows(lowStockRows).length,
    [lowStockRows]
  );

  const kioskOptions = useMemo(
    () =>
      kiosks.map((k) => ({
        value: String(k.id),
        label: `${k.name || ""}${k.code ? ` (${k.code})` : ""}`.trim(),
        searchText: `${k.code || ""} ${k.name || ""}`,
      })),
    [kiosks]
  );

  const operationOptions = useMemo(
    () =>
      OPERATION_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
        searchText: opt.label,
      })),
    []
  );

  const productLeftKioskOptions = useMemo(
    () => [
      { value: "false", label: "No, sigue en kiosko", searchText: "no sigue kiosko" },
      { value: "true", label: "Sí, ya salió", searchText: "si salio" },
    ],
    []
  );

  const selectedStockRow = useMemo(() => {
    if (!form.productId) return null;
    const colorCandidate = form.colorId ? Number(form.colorId) : null;
    return stockRows.find((row) => {
      const sameProduct = Number(row.productId) === Number(form.productId);
      const sameColor =
        colorCandidate == null ? row.colorId == null : Number(row.colorId) === colorCandidate;
      return sameProduct && sameColor;
    });
  }, [form.productId, form.colorId, stockRows]);

  const selectedProduct = useMemo(
    () => (products || []).find((product) => Number(product.id) === Number(form.productId)) || null,
    [products, form.productId]
  );

  const requiresSizeKey = useMemo(() => {
    if (!selectedStockRow) return false;
    return hasInventorySizeBreakdown(selectedStockRow.sizes);
  }, [selectedStockRow]);

  const fossAjusteMode = useMemo(() => {
    if (!selectedProduct || form.operation !== "AJUSTE") return false;
    return isFossCinchosProductCode(selectedProduct.code);
  }, [selectedProduct, form.operation]);

  const ajusteSizeKeys = useMemo(() => {
    const keys = new Set(Object.keys(selectedStockRow?.sizes || {}));
    Object.keys(form.realSizes || {}).forEach((key) => keys.add(key));
    customAjusteSizeKeys.forEach((key) => keys.add(key));
    return sortSizeKeys(keys);
  }, [selectedStockRow, form.realSizes, customAjusteSizeKeys]);

  useEffect(() => {
    setCustomAjusteSizeKeys([]);
    setNewAjusteSizeKey("");
    setForm((prev) => ({ ...prev, realSizes: {} }));
  }, [form.productId, form.colorId, form.locationId]);

  useEffect(() => {
    void loadCatalogs();
  }, []);

  useEffect(() => {
    if (!selectedLocation) {
      setStockRows([]);
      setLowStockRows([]);
      setStockExploreProductId("");
      setStockExploreColorId("");
      return;
    }
    void refreshLocationData(selectedLocation);
  }, [selectedLocation]);

  useEffect(() => {
    if (selectedLocation) {
      setMovementKioskId(selectedLocation);
    }
  }, [selectedLocation]);

  useEffect(() => {
    if (form.operation !== "TRASLADO") {
      setOriginStockRows([]);
      setBoletaLocked(false);
      setBoletaHint("");
      return;
    }
    if (!form.locationOriginId) {
      setOriginStockRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getKioscoStock(Number(form.locationOriginId));
        if (!cancelled) setOriginStockRows(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setOriginStockRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.operation, form.locationOriginId]);

  useEffect(() => {
    if (form.operation !== "TRASLADO") return;
    setLineItems([createEmptyLineItem()]);
  }, [form.operation]);

  const handleLookupTrasladoBoleta = async () => {
    const slip = String(form.physicalSlipNumber || "").trim();
    if (!slip) {
      showWarning("Escribe el número de boleta para buscar.");
      return;
    }
    try {
      setLookingUpBoleta(true);
      const data = await lookupKioscoTrasladoBoleta(slip);
      if (!data?.exists) {
        setBoletaLocked(false);
        setBoletaHint("Boleta nueva: puedes armar el traslado con uno o más productos.");
        showSuccess("Boleta disponible (nueva).");
        return;
      }
      if (data.locationOriginId != null) {
        onFormChange("locationOriginId", String(data.locationOriginId));
      }
      if (data.locationDestinationId != null) {
        onFormChange("locationDestinationId", String(data.locationDestinationId));
      }
      setBoletaLocked(true);
      const n = (data.lines || []).length;
      setBoletaHint(
        `Boleta existente (${n} producto${n === 1 ? "" : "s"}). Origen/destino bloqueados — agrega solo lo que faltó.`
      );
      showSuccess("Boleta encontrada. Puedes añadir productos faltantes.");
    } catch (err) {
      setBoletaLocked(false);
      setBoletaHint("");
      showError(err.message || "No se pudo consultar la boleta.");
    } finally {
      setLookingUpBoleta(false);
    }
  };

  useEffect(() => {
    if (!movementKioskId) {
      setMovements([]);
      return;
    }
    void loadMovements(movementKioskId);
  }, [movementKioskId]);

  useEffect(() => {
    setStockExploreColorId("");
  }, [stockExploreProductId, selectedLocation]);

  useEffect(() => {
    if (supportsBulkLines(form.operation)) {
      setLineItems([createEmptyLineItem()]);
    }
  }, [form.operation]);

  const loadCatalogs = async () => {
    try {
      setLoadingCatalogs(true);
      const [locationsData, productsData, colorsData] = await Promise.all([
        getLocations(),
        getProducts(),
        getColors(),
      ]);
      setLocations(locationsData || []);
      setProducts(productsData || []);
      setColors(colorsData || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar catálogos.");
    } finally {
      setLoadingCatalogs(false);
    }
  };

  const onMovementFilterChange = (key, value) => {
    setMovementFilters((prev) => ({ ...prev, [key]: value }));
  };

  const loadMovements = async (locationId) => {
    try {
      setLoadingMovements(true);
      const movementList = await getKioscoMovimientos(locationId);
      setMovements(sortMovementsDesc(movementList || []));
    } catch (err) {
      setMovements([]);
      showError(err.message || "No se pudieron cargar los movimientos del kiosko.");
    } finally {
      setLoadingMovements(false);
    }
  };

  const refreshLocationData = async (locationId) => {
    try {
      setLoadingData(true);
      setError("");
      const [stock, lowStock] = await Promise.all([
        getKioscoStock(locationId),
        getKioscoStockBajo(locationId),
      ]);
      setStockRows(stock || []);
      setLowStockRows(lowStock || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar el inventario del kiosko.");
      setStockRows([]);
      setLowStockRows([]);
    } finally {
      setLoadingData(false);
    }
  };

  const onFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddAjusteSizeKey = () => {
    const normalized = String(newAjusteSizeKey || "").trim();
    if (!normalized) {
      showWarning("Indique el número de talla (ej. 32).");
      return;
    }
    setCustomAjusteSizeKeys((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setNewAjusteSizeKey("");
  };

  const findStockRow = (productId, colorId) => {
    if (!productId) return null;
    const colorCandidate = colorId ? Number(colorId) : null;
    const rows = form.operation === "TRASLADO" ? originStockRows : stockRows;
    return rows.find((row) => {
      const sameProduct = Number(row.productId) === Number(productId);
      const sameColor =
        colorCandidate == null ? row.colorId == null : Number(row.colorId) === colorCandidate;
      return sameProduct && sameColor;
    });
  };

  const resolveLineSizeOptions = (line) => {
    const row = findStockRow(line.productId, line.colorId);
    if (!row || !hasInventorySizeBreakdown(row.sizes)) return [];
    return sortSizeKeys(Object.keys(row.sizes || {}));
  };

  const updateLineItem = (lineId, key, value) => {
    setLineItems((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, [key]: value } : line))
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, createEmptyLineItem()]);
  };

  const removeLineItem = (lineId) => {
    setLineItems((prev) => {
      if (prev.length <= 1) {
        return [createEmptyLineItem()];
      }
      return prev.filter((line) => line.id !== lineId);
    });
  };

  const validateForm = () => {
    if (supportsBulkLines(form.operation)) {
      return validateBulkLines(form.operation, lineItems, {
        locationId: form.locationId,
        locationOriginId: form.locationOriginId,
        locationDestinationId: form.locationDestinationId,
        invoiceId: form.invoiceId,
        reason: form.reason,
        physicalSlipNumber: form.physicalSlipNumber,
        lineNeedsSize: (line) => {
          const row = findStockRow(line.productId, line.colorId);
          return Boolean(row && hasInventorySizeBreakdown(row.sizes));
        },
      });
    }
    if (form.operation === "DEVOLUCION_DEPOSITO") {
      if (!form.locationId) {
        return "Debes seleccionar un kiosko.";
      }
      if (!String(form.physicalSlipNumber || "").trim()) {
        return "Debes indicar el número de boleta de devolución a bodega.";
      }
    }
    if (form.operation === "CAMBIO") {
      if (!form.locationId) return "Debes seleccionar un kiosko.";
      if (!form.returnedProductId) return "Debes seleccionar el producto que devuelve el cliente.";
      if (!form.productId) return "Debes seleccionar el producto que se entrega al cliente.";
      if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) <= 0) {
        return "La cantidad debe ser un entero mayor a cero.";
      }
      return "";
    }
    if (form.operation === "TRASLADO") {
      return validateTransferForm({
        locationOriginId: form.locationOriginId,
        locationDestinationId: form.locationDestinationId,
        productId: form.productId,
        quantity: form.quantity,
        physicalSlipNumber: form.physicalSlipNumber,
      });
    }
    if (form.operation === "ANULACION") {
      return validateAnulacionForm({
        locationId: form.locationId,
        productId: form.productId,
        quantity: form.quantity,
        reason: form.reason,
        productLeftKiosk: form.productLeftKiosk,
      });
    }
    if (form.operation === "AJUSTE") {
      if (!form.locationId || !form.productId) {
        return "Debes seleccionar kiosko y producto.";
      }
      if (fossAjusteMode) {
        const realSizes = form.realSizes || {};
        const total = ajusteSizeKeys.reduce((sum, size) => sum + Number(realSizes[size] || 0), 0);
        if (ajusteSizeKeys.length === 0) {
          return "Agregue al menos una talla (ej. 32, 34) con la cantidad contada.";
        }
        if (!Number.isInteger(total) || total < 0) {
          return "Indica la cantidad real por talla (enteros >= 0).";
        }
      } else if (!Number.isInteger(Number(form.realQuantity)) || Number(form.realQuantity) < 0) {
        return "La cantidad real debe ser un entero >= 0.";
      }
      if (!String(form.reason || "").trim()) {
        return "El motivo del ajuste es obligatorio.";
      }
      return "";
    }
    const commonError = validateCommonStockForm({
      locationId: form.locationId,
      productId: form.productId,
      quantity: form.quantity,
    });
    if (commonError) {
      return commonError;
    }
    if (form.operation === "MERMA" && !String(form.reason || "").trim()) {
      return "El motivo de merma es obligatorio.";
    }
    if (form.operation === "VENTA" && !form.invoiceId) {
      return "La referencia de factura es obligatoria.";
    }
    if (
      requiresSizeKey &&
      ["ENTRADA", "VENTA", "MERMA"].includes(form.operation) &&
      !String(form.sizeKey || "").trim()
    ) {
      return "Debes indicar la talla para este producto cincho.";
    }
    if (form.operation === "DEVOLUCION_CLIENTE" && !form.originalInvoiceId) {
      return "La factura original es obligatoria.";
    }
    return "";
  };

  const buildPayloadForLine = (line) => {
    const base = {
      productId: Number(line.productId),
      colorId: line.colorId ? Number(line.colorId) : null,
      userId: form.userId ? Number(form.userId) : null,
      quantity: Number(line.quantity),
      sizeKey: String(line.sizeKey || "").trim() || null,
    };
    switch (form.operation) {
      case "ENTRADA":
        return { ...base, referenceId: form.referenceId ? Number(form.referenceId) : null };
      case "VENTA":
        return { ...base, invoiceId: Number(form.invoiceId) };
      case "DEVOLUCION_DEPOSITO":
        return {
          ...base,
          referenceId: form.referenceId ? Number(form.referenceId) : null,
          physicalSlipNumber: String(form.physicalSlipNumber || "").trim(),
          reason: String(form.reason || "").trim() || null,
        };
      case "MERMA":
        return { ...base, reason: String(form.reason || "").trim() };
      default:
        return base;
    }
  };

  const buildPayload = () => {
    const base = {
      productId: Number(form.productId),
      colorId: form.colorId ? Number(form.colorId) : null,
      userId: form.userId ? Number(form.userId) : null,
      quantity: Number(form.quantity),
    };
    switch (form.operation) {
      case "ENTRADA":
        return { ...base, referenceId: form.referenceId ? Number(form.referenceId) : null };
      case "VENTA":
        return { ...base, invoiceId: Number(form.invoiceId) };
      case "DEVOLUCION_DEPOSITO":
        return {
          ...base,
          referenceId: form.referenceId ? Number(form.referenceId) : null,
          physicalSlipNumber: String(form.physicalSlipNumber || "").trim(),
          reason: String(form.reason || "").trim() || null,
          sizeKey: String(form.sizeKey || "").trim() || null,
        };
      case "DEVOLUCION_CLIENTE":
        return {
          ...base,
          originalInvoiceId: Number(form.originalInvoiceId),
          apto: Boolean(form.apto),
        };
      case "MERMA":
        return { ...base, reason: String(form.reason || "").trim() };
      case "AJUSTE": {
        if (fossAjusteMode) {
          const realSizes = {};
          ajusteSizeKeys.forEach((size) => {
            realSizes[size] = Number(form.realSizes?.[size] || 0);
          });
          const realQuantity = Object.values(realSizes).reduce((sum, qty) => sum + qty, 0);
          return {
            productId: Number(form.productId),
            colorId: form.colorId ? Number(form.colorId) : null,
            userId: form.userId ? Number(form.userId) : null,
            realQuantity,
            realSizes,
            reason: String(form.reason || "").trim(),
          };
        }
        return {
          productId: Number(form.productId),
          colorId: form.colorId ? Number(form.colorId) : null,
          userId: form.userId ? Number(form.userId) : null,
          realQuantity: Number(form.realQuantity),
          reason: String(form.reason || "").trim(),
        };
      }
      case "ANULACION":
        return {
          ...base,
          invoiceId: Number(form.invoiceId),
          reason: String(form.reason || "").trim(),
          productLeftKiosk: Boolean(form.productLeftKiosk),
        };
      case "CAMBIO":
        return {
          returnedProductId: Number(form.returnedProductId),
          returnedColorId: form.returnedColorId ? Number(form.returnedColorId) : null,
          givenProductId: Number(form.productId),
          givenColorId: form.colorId ? Number(form.colorId) : null,
          quantity: Number(form.quantity),
          referenceId: form.referenceId ? Number(form.referenceId) : null,
          reason: String(form.reason || "").trim() || null,
          userId: form.userId ? Number(form.userId) : null,
        };
      case "TRASLADO":
        return {
          locationOriginId: Number(form.locationOriginId),
          locationDestinationId: Number(form.locationDestinationId),
          productId: Number(form.productId),
          colorId: form.colorId ? Number(form.colorId) : null,
          quantity: Number(form.quantity),
          userId: form.userId ? Number(form.userId) : null,
          physicalSlipNumber: String(form.physicalSlipNumber || "").trim(),
        };
      default:
        return {
          ...base,
          sizeKey: String(form.sizeKey || "").trim() || null,
        };
    }
  };

  const submitBulkOperation = async () => {
    const activeLines = lineItems.filter((line) => line.productId && line.quantity);
    if (form.operation === "TRASLADO") {
      const result = await registrarKioscoTraslado({
        locationOriginId: Number(form.locationOriginId),
        locationDestinationId: Number(form.locationDestinationId),
        physicalSlipNumber: String(form.physicalSlipNumber || "").trim(),
        userId: form.userId ? Number(form.userId) : null,
        items: activeLines.map((line) => ({
          productId: Number(line.productId),
          colorId: line.colorId ? Number(line.colorId) : null,
          quantity: Number(line.quantity),
          sizeKey: String(line.sizeKey || "").trim() || null,
        })),
      });
      return result;
    }
    const locationId = Number(form.locationId);
    const errors = [];
    for (const line of activeLines) {
      if (form.operation === "VENTA") {
        const row = findStockRow(line.productId, line.colorId);
        if (!canSell(row, line.quantity)) {
          errors.push(`Sin stock suficiente para producto #${line.productId}.`);
        }
      }
    }
    if (errors.length) {
      throw new Error(errors[0]);
    }
    for (const line of activeLines) {
      const payload = buildPayloadForLine(line);
      if (form.operation === "ENTRADA") {
        await registrarKioscoEntrada(locationId, payload);
      } else if (form.operation === "VENTA") {
        await registrarKioscoVenta(locationId, payload);
      } else if (form.operation === "DEVOLUCION_DEPOSITO") {
        await registrarKioscoDevolucionDeposito(locationId, payload);
      } else if (form.operation === "MERMA") {
        await registrarKioscoMerma(locationId, payload);
      }
    }
    return null;
  };

  const submitOperation = async () => {
    const validationError = validateForm();
    if (validationError) {
      showError(validationError);
      return;
    }
    try {
      setSubmitting(true);
      let trasladoResult = null;
      if (supportsBulkLines(form.operation)) {
        trasladoResult = await submitBulkOperation();
      } else {
        const payload = buildPayload();
        if (form.operation === "ENTRADA") {
          await registrarKioscoEntrada(Number(form.locationId), payload);
        } else if (form.operation === "VENTA") {
          await registrarKioscoVenta(Number(form.locationId), payload);
        } else if (form.operation === "DEVOLUCION_DEPOSITO") {
          await registrarKioscoDevolucionDeposito(Number(form.locationId), payload);
        } else if (form.operation === "DEVOLUCION_CLIENTE") {
          await registrarKioscoDevolucionCliente(Number(form.locationId), payload);
        } else if (form.operation === "MERMA") {
          await registrarKioscoMerma(Number(form.locationId), payload);
        } else if (form.operation === "AJUSTE") {
          await registrarKioscoAjuste(Number(form.locationId), payload);
        } else if (form.operation === "ANULACION") {
          await registrarKioscoAnulacion(Number(form.locationId), payload);
        } else if (form.operation === "CAMBIO") {
          await registrarKioscoCambio(Number(form.locationId), payload);
        }
      }
      const lineCount = lineItems.filter((l) => l.productId && l.quantity).length;
      if (form.operation === "TRASLADO") {
        showSuccess(
          trasladoResult?.appended
            ? `Productos agregados a la boleta ${trasladoResult.physicalSlipNumber || ""} (${lineCount}).`
            : `Traslado registrado con ${lineCount} producto(s).`
        );
      } else {
        showSuccess(
          supportsBulkLines(form.operation)
            ? `${lineCount} movimiento(s) registrado(s).`
            : "Movimiento registrado correctamente."
        );
      }
      if (selectedLocation) {
        await refreshLocationData(selectedLocation);
      }
      if (form.operation === "TRASLADO" && form.locationOriginId) {
        try {
          const data = await getKioscoStock(Number(form.locationOriginId));
          setOriginStockRows(Array.isArray(data) ? data : []);
        } catch {
          /* ignore */
        }
      }
      if (movementKioskId) {
        await loadMovements(movementKioskId);
      }
      setForm((prev) => ({
        ...INITIAL_FORM,
        operation: prev.operation,
        locationId: prev.locationId,
        locationOriginId: prev.locationOriginId,
        locationDestinationId: prev.locationDestinationId,
      }));
      setBoletaLocked(false);
      setBoletaHint("");
      if (supportsBulkLines(form.operation)) {
        setLineItems([createEmptyLineItem()]);
      }
    } catch (err) {
      showError(err.message || "No se pudo registrar el movimiento.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitializeInventory = async () => {
    const targetLocationId = selectedLocation ? Number(selectedLocation) : null;
    const confirmationMessage = targetLocationId
      ? "¿Inicializar inventario para este kiosko? Se crearán las variantes faltantes por color y tallas de cincho en 0. Los empaques SUM- entran sin color ni tallas (una fila por producto)."
      : "¿Inicializar inventario para TODOS los kioskos? Se crearán las variantes faltantes por color y tallas de cincho en 0. Los empaques SUM- entran sin color ni tallas (una fila por producto).";
    if (!window.confirm(confirmationMessage)) {
      return;
    }
    try {
      setInitializingStock(true);
      const result = await initializeKioscoInventory(targetLocationId);
      showSuccess(
        `${result.message} Creados: ${result.createdCount || 0}, existentes: ${result.existingCount || 0}.`
      );
      if (selectedLocation) {
        await refreshLocationData(selectedLocation);
      }
      if (movementKioskId) {
        await loadMovements(movementKioskId);
      }
    } catch (err) {
      showError(err.message || "No se pudo inicializar el inventario de kiosko.");
    } finally {
      setInitializingStock(false);
    }
  };

  const saleWouldHitMin = form.operation === "VENTA" && isSaleBelowMinimum(selectedStockRow, form.quantity);
  const saleCanSubmit = form.operation !== "VENTA" || canSell(selectedStockRow, form.quantity);
  const bulkSaleCanSubmit = useMemo(() => {
    if (form.operation !== "VENTA" || !supportsBulkLines(form.operation)) return true;
    return lineItems.every((line) => {
      if (!line.productId || !line.quantity) return true;
      return canSell(findStockRow(line.productId, line.colorId), line.quantity);
    });
  }, [form.operation, lineItems, stockRows]);

  const bulkLineCount = lineItems.filter((l) => l.productId && l.quantity).length;

  return (
    <div className="content kiosk-inv-page">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Inventario de Kioskos (módulo dedicado)</CardTitle>
              <Nav tabs className="mt-2">
                <NavItem>
                  <NavLink
                    href="#"
                    className={activeTab === "INVENTARIO" ? "active" : ""}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab("INVENTARIO");
                    }}
                  >
                    Inventario y movimientos
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    href="#"
                    className={activeTab === "CONTEO" ? "active" : ""}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab("CONTEO");
                    }}
                  >
                    Conteo físico
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    href="#"
                    className={activeTab === "INVENTARIO_INICIAL" ? "active" : ""}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab("INVENTARIO_INICIAL");
                    }}
                  >
                    Inventario inicial
                  </NavLink>
                </NavItem>
              </Nav>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              <Row className="mb-3 align-items-end">
                <Col md="4" sm="6">
                  <FormGroup className="mb-0">
                    <Label>Kiosko</Label>
                    <FilterableSelect
                      value={selectedLocation}
                      onChange={(value) => {
                        setSelectedLocation(value);
                        onFormChange("locationId", value);
                      }}
                      options={kioskOptions}
                      placeholder="Buscar kiosko…"
                      emptyLabel="Selecciona kiosko"
                      disabled={loadingCatalogs}
                    />
                  </FormGroup>
                </Col>
                <Col md="8" sm="6" className="d-flex align-items-end flex-wrap" style={{ gap: 8 }}>
                  <Button
                    color="primary"
                    outline
                    onClick={() => void handleInitializeInventory()}
                    disabled={loadingCatalogs || initializingStock}
                  >
                    {initializingStock ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <i className="nc-icon nc-refresh-69 mr-1" />
                        Generar inventario en kioskos
                      </>
                    )}
                  </Button>
                </Col>
              </Row>

              {activeTab === "INVENTARIO" && (
              <>
              <Row>
                <Col md="5">
                  <Card className="border kiosk-inv-movement-card">
                    <CardHeader>
                      <CardTitle tag="h6" className="mb-0">Registrar movimiento</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <FormGroup>
                        <Label>Operación</Label>
                        <FilterableSelect
                          value={form.operation}
                          onChange={(value) => onFormChange("operation", value)}
                          options={operationOptions}
                          placeholder="Buscar operación…"
                          allowEmpty={false}
                        />
                      </FormGroup>

                      {form.operation === "TRASLADO" ? (
                        <>
                          <FormGroup>
                            <Label>Origen</Label>
                            <FilterableSelect
                              value={form.locationOriginId}
                              onChange={(value) => onFormChange("locationOriginId", value)}
                              options={kioskOptions}
                              placeholder="Buscar origen…"
                              emptyLabel="Selecciona origen"
                              disabled={boletaLocked}
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Destino</Label>
                            <FilterableSelect
                              value={form.locationDestinationId}
                              onChange={(value) => onFormChange("locationDestinationId", value)}
                              options={kioskOptions}
                              placeholder="Buscar destino…"
                              emptyLabel="Selecciona destino"
                              disabled={boletaLocked}
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Número de boleta de traslado (física)</Label>
                            <div className="d-flex" style={{ gap: 8 }}>
                              <Input
                                value={form.physicalSlipNumber}
                                onChange={(e) => {
                                  setBoletaLocked(false);
                                  setBoletaHint("");
                                  onFormChange("physicalSlipNumber", e.target.value);
                                }}
                                placeholder="Ej: BT-2026-0042"
                              />
                              <Button
                                color="info"
                                outline
                                type="button"
                                disabled={lookingUpBoleta || submitting}
                                onClick={() => void handleLookupTrasladoBoleta()}
                              >
                                {lookingUpBoleta ? <Spinner size="sm" /> : "Buscar"}
                              </Button>
                            </div>
                            <small className="text-muted d-block mt-1">
                              Si la boleta ya existe, puedes buscarla y agregar productos faltantes (mismo origen/destino).
                            </small>
                            {boletaHint ? (
                              <Alert color={boletaLocked ? "warning" : "info"} className="py-2 mt-2 mb-0">
                                {boletaHint}
                              </Alert>
                            ) : null}
                          </FormGroup>
                        </>
                      ) : (
                        <FormGroup>
                          <Label>Kiosko</Label>
                          <FilterableSelect
                            value={form.locationId}
                            onChange={(value) => {
                              onFormChange("locationId", value);
                              setSelectedLocation(value);
                            }}
                            options={kioskOptions}
                            placeholder="Buscar kiosko…"
                            emptyLabel="Selecciona kiosko"
                          />
                        </FormGroup>
                      )}

                      {form.operation === "CAMBIO" ? (
                        <>
                          <FormGroup>
                            <Label>Producto devuelto por el cliente</Label>
                            <ProductSelector
                              products={products}
                              value={form.returnedProductId}
                              onChange={(product) => onFormChange("returnedProductId", product ? String(product.id) : "")}
                              placeholder="Buscar producto devuelto…"
                              disabled={loadingCatalogs}
                              renderOptionExtra={renderProductOptionExtra}
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Color devuelto (opcional)</Label>
                            <ColorSelector
                              colors={colors}
                              value={form.returnedColorId}
                              onChange={(color) => onFormChange("returnedColorId", color ? String(color.id) : "")}
                              placeholder="Buscar color…"
                              disabled={loadingCatalogs}
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Producto entregado al cliente</Label>
                            <ProductSelector
                              products={products}
                              value={form.productId}
                              onChange={(product) => onFormChange("productId", product ? String(product.id) : "")}
                              placeholder="Buscar producto entregado…"
                              disabled={loadingCatalogs}
                              renderOptionExtra={renderProductOptionExtra}
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Color entregado (opcional)</Label>
                            <ColorSelector
                              colors={colors}
                              value={form.colorId}
                              onChange={(color) => onFormChange("colorId", color ? String(color.id) : "")}
                              placeholder="Buscar color…"
                              disabled={loadingCatalogs}
                            />
                          </FormGroup>
                        </>
                      ) : supportsBulkLines(form.operation) ? (
                        <>
                          <Alert color="info" className="py-2">
                            {form.operation === "TRASLADO"
                              ? "Agrega uno o más productos (color y talla FOSS si aplica). Misma boleta = mismo traslado; puedes buscar una boleta ya guardada para completar faltantes."
                              : `Agrega varias líneas de producto. Todas se registran en un solo envío (${OPERATION_OPTIONS.find((o) => o.value === form.operation)?.label}).`}
                          </Alert>
                          <div className="kiosk-inv-line-table-wrap">
                            <Table size="sm" className="kiosk-inv-line-table mb-2">
                              <thead>
                                <tr>
                                  <th>Producto</th>
                                  <th>Color</th>
                                  <th>Talla</th>
                                  <th>Cant.</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {lineItems.map((line) => {
                                  const lineStock = findStockRow(line.productId, line.colorId);
                                  const lineNeedsSize =
                                    lineStock && hasInventorySizeBreakdown(lineStock.sizes);
                                  const sizeOptions = resolveLineSizeOptions(line);
                                  return (
                                    <tr key={line.id}>
                                      <td style={{ minWidth: 220 }}>
                                        <ProductSelector
                                          products={products}
                                          value={line.productId}
                                          onChange={(product) =>
                                            updateLineItem(
                                              line.id,
                                              "productId",
                                              product ? String(product.id) : ""
                                            )
                                          }
                                          placeholder="Producto…"
                                          disabled={loadingCatalogs}
                                          renderOptionExtra={renderProductOptionExtra}
                                        />
                                      </td>
                                      <td style={{ minWidth: 120 }}>
                                        <ColorSelector
                                          colors={colors}
                                          value={line.colorId}
                                          onChange={(color) =>
                                            updateLineItem(
                                              line.id,
                                              "colorId",
                                              color ? String(color.id) : ""
                                            )
                                          }
                                          placeholder="Color…"
                                          disabled={loadingCatalogs}
                                        />
                                      </td>
                                      <td style={{ width: 96 }}>
                                        {lineNeedsSize && sizeOptions.length > 0 ? (
                                          <Input
                                            type="select"
                                            bsSize="sm"
                                            value={line.sizeKey}
                                            onChange={(e) =>
                                              updateLineItem(line.id, "sizeKey", e.target.value)
                                            }
                                          >
                                            <option value="">Talla…</option>
                                            {sizeOptions.map((size) => (
                                              <option key={size} value={size}>
                                                {size}
                                                {lineStock?.sizes?.[size] != null
                                                  ? ` (${lineStock.sizes[size]})`
                                                  : ""}
                                              </option>
                                            ))}
                                          </Input>
                                        ) : (
                                          <Input
                                            type="text"
                                            bsSize="sm"
                                            value={line.sizeKey}
                                            onChange={(e) =>
                                              updateLineItem(line.id, "sizeKey", e.target.value)
                                            }
                                            placeholder={lineNeedsSize ? "Req." : "—"}
                                            disabled={!lineNeedsSize}
                                          />
                                        )}
                                      </td>
                                      <td style={{ width: 72 }}>
                                        <Input
                                          type="number"
                                          bsSize="sm"
                                          min="1"
                                          step="1"
                                          value={line.quantity}
                                          onChange={(e) =>
                                            updateLineItem(line.id, "quantity", e.target.value)
                                          }
                                        />
                                      </td>
                                      <td style={{ width: 36 }}>
                                        <Button
                                          color="link"
                                          size="sm"
                                          className="text-danger p-0"
                                          onClick={() => removeLineItem(line.id)}
                                          title="Quitar línea"
                                        >
                                          ×
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </Table>
                          </div>
                          <Button color="secondary" outline size="sm" onClick={addLineItem} className="mb-3">
                            + Agregar línea
                          </Button>
                        </>
                      ) : (
                        <>
                          <FormGroup>
                            <Label>Producto</Label>
                            <ProductSelector
                              products={products}
                              value={form.productId}
                              onChange={(product) => onFormChange("productId", product ? String(product.id) : "")}
                              placeholder="Buscar producto o empaque SUM-…"
                              disabled={loadingCatalogs}
                              renderOptionExtra={renderProductOptionExtra}
                            />
                          </FormGroup>
                          {form.operation === "ENTRADA" && packagingProducts.length > 0 ? (
                            <Alert color="info" className="py-2">
                              Los empaques <strong>SUM-</strong> son suministros (materiales). Al recibir envíos
                              o sincronizar inventario se cargan al kiosko automáticamente; configure el precio
                              en catálogo o use <strong>Entrada de stock</strong> para ajustes manuales.
                            </Alert>
                          ) : null}
                          <FormGroup>
                            <Label>Color (opcional)</Label>
                            <ColorSelector
                              colors={colors}
                              value={form.colorId}
                              onChange={(color) => onFormChange("colorId", color ? String(color.id) : "")}
                              placeholder="Buscar color…"
                              disabled={loadingCatalogs}
                            />
                          </FormGroup>
                        </>
                      )}

                      {form.operation === "AJUSTE" ? (
                        fossAjusteMode ? (
                          <>
                            <Alert color="info" className="py-2">
                              Cincho FOSS: indica la cantidad real contada por talla. Si <strong>sizes_data</strong> está
                              vacío, este ajuste crea el desglose y alinea Fin. con lo contado.
                              {selectedStockRow?.currentStock != null ? (
                                <div className="mt-1">
                                  Stock actual del sistema: <strong>{selectedStockRow.currentStock}</strong>
                                  {!hasInventorySizeBreakdown(selectedStockRow?.sizes)
                                    ? " (sin desglose por talla todavía)."
                                    : null}
                                </div>
                              ) : null}
                            </Alert>
                            {ajusteSizeKeys.length === 0 ? (
                              <Alert color="warning" className="py-2">
                                No hay tallas registradas. Agregue las tallas que contó (32, 34, 36…) y la cantidad de cada una.
                              </Alert>
                            ) : null}
                            <FormGroup className="d-flex align-items-end">
                              <div className="flex-grow-1 mr-2">
                                <Label>Agregar talla</Label>
                                <Input
                                  type="text"
                                  placeholder="Ej. 32"
                                  value={newAjusteSizeKey}
                                  onChange={(e) => setNewAjusteSizeKey(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAddAjusteSizeKey();
                                    }
                                  }}
                                />
                              </div>
                              <Button color="secondary" outline type="button" onClick={handleAddAjusteSizeKey}>
                                Agregar
                              </Button>
                            </FormGroup>
                            {ajusteSizeKeys.map((size) => (
                              <FormGroup key={size}>
                                <Label>Talla {size}</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={form.realSizes?.[size] ?? ""}
                                  onChange={(e) =>
                                    setForm((prev) => ({
                                      ...prev,
                                      realSizes: {
                                        ...(prev.realSizes || {}),
                                        [size]: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </FormGroup>
                            ))}
                            <FormGroup>
                              <Label>Total real</Label>
                              <Input
                                type="number"
                                readOnly
                                value={ajusteSizeKeys.reduce(
                                  (sum, size) => sum + Number(form.realSizes?.[size] || 0),
                                  0
                                )}
                              />
                            </FormGroup>
                          </>
                        ) : (
                          <FormGroup>
                            <Label>Cantidad real contada</Label>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={form.realQuantity}
                              onChange={(e) => onFormChange("realQuantity", e.target.value)}
                            />
                          </FormGroup>
                        )
                      ) : supportsBulkLines(form.operation) ? null : (
                        <FormGroup>
                          <Label>Cantidad</Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={form.quantity}
                            onChange={(e) => onFormChange("quantity", e.target.value)}
                          />
                        </FormGroup>
                      )}

                      {!supportsBulkLines(form.operation) &&
                      requiresSizeKey &&
                      ["ENTRADA", "VENTA", "MERMA"].includes(form.operation) ? (
                        <FormGroup>
                          <Label>Talla</Label>
                          <Input
                            type="text"
                            value={form.sizeKey}
                            onChange={(e) => onFormChange("sizeKey", e.target.value)}
                            placeholder="Ej. 32, 34, 36"
                          />
                          {selectedStockRow?.sizes ? (
                            <small className="text-muted d-block mt-1">
                              Stock por talla:{" "}
                              {Object.entries(selectedStockRow.sizes)
                                .filter(([, qty]) => Number(qty) > 0)
                                .map(([size, qty]) => `${size}: ${qty}`)
                                .join(" · ")}
                            </small>
                          ) : null}
                        </FormGroup>
                      ) : null}

                      {form.operation === "ENTRADA" || form.operation === "CAMBIO" ? (
                        <FormGroup>
                          <Label>Referencia (opcional)</Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={form.referenceId}
                            onChange={(e) => onFormChange("referenceId", e.target.value)}
                          />
                        </FormGroup>
                      ) : null}

                      {form.operation === "DEVOLUCION_DEPOSITO" ? (
                        <FormGroup>
                          <Label>Número de boleta de devolución a bodega (física)</Label>
                          <Input
                            type="text"
                            value={form.physicalSlipNumber}
                            onChange={(e) => onFormChange("physicalSlipNumber", e.target.value)}
                            placeholder="Ej: BB-0042"
                          />
                        </FormGroup>
                      ) : null}

                      {form.operation === "DEVOLUCION_DEPOSITO" ? (
                        <FormGroup>
                          <Label>Motivo (opcional)</Label>
                          <Input
                            type="text"
                            value={form.reason}
                            onChange={(e) => onFormChange("reason", e.target.value)}
                            placeholder="Ej: exceso de inventario en kiosko"
                          />
                        </FormGroup>
                      ) : null}

                      {form.operation === "VENTA" || form.operation === "ANULACION" ? (
                        <FormGroup>
                          <Label>Factura / referencia</Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={form.invoiceId}
                            onChange={(e) => onFormChange("invoiceId", e.target.value)}
                          />
                        </FormGroup>
                      ) : null}

                      {form.operation === "DEVOLUCION_CLIENTE" ? (
                        <>
                          <FormGroup>
                            <Label>Factura original</Label>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={form.originalInvoiceId}
                              onChange={(e) => onFormChange("originalInvoiceId", e.target.value)}
                            />
                          </FormGroup>
                          <FormGroup check className="mb-2">
                            <Label check>
                              <Input
                                type="checkbox"
                                checked={Boolean(form.apto)}
                                onChange={(e) => onFormChange("apto", e.target.checked)}
                              />{" "}
                              Producto apto para reventa
                            </Label>
                          </FormGroup>
                        </>
                      ) : null}

                      {form.operation === "MERMA" ||
                      form.operation === "AJUSTE" ||
                      form.operation === "ANULACION" ||
                      form.operation === "CAMBIO" ? (
                        <FormGroup>
                          <Label>{form.operation === "CAMBIO" ? "Motivo (opcional)" : "Motivo"}</Label>
                          <Input
                            type="text"
                            value={form.reason}
                            onChange={(e) => onFormChange("reason", e.target.value)}
                          />
                        </FormGroup>
                      ) : null}

                      {form.operation === "ANULACION" ? (
                        <FormGroup>
                          <Label>¿El producto salió del kiosko?</Label>
                          <FilterableSelect
                            value={String(form.productLeftKiosk)}
                            onChange={(value) => onFormChange("productLeftKiosk", value === "true")}
                            options={productLeftKioskOptions}
                            placeholder="Buscar…"
                            allowEmpty={false}
                          />
                        </FormGroup>
                      ) : null}

                      {saleWouldHitMin && (
                        <Alert color="warning">
                          Esta venta deja el stock en mínimo o por debajo del mínimo de reposición.
                        </Alert>
                      )}
                      {form.operation === "VENTA" && !supportsBulkLines(form.operation) && form.quantity && !saleCanSubmit && (
                        <Alert color="danger">
                          La cantidad supera el stock disponible para el producto/color seleccionado.
                        </Alert>
                      )}
                      {form.operation === "VENTA" && supportsBulkLines(form.operation) && !bulkSaleCanSubmit && (
                        <Alert color="danger">
                          Una o más líneas superan el stock disponible.
                        </Alert>
                      )}

                      <FormGroup>
                        <Label>Usuario (opcional, auditoría)</Label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={form.userId}
                          onChange={(e) => onFormChange("userId", e.target.value)}
                          placeholder="Si se deja vacío usa usuario autenticado"
                        />
                      </FormGroup>

                      <Button
                        color="primary"
                        block
                        onClick={() => void submitOperation()}
                        disabled={
                          submitting
                          || (form.operation === "VENTA"
                            && !supportsBulkLines(form.operation)
                            && !saleCanSubmit)
                          || (form.operation === "VENTA"
                            && supportsBulkLines(form.operation)
                            && !bulkSaleCanSubmit)
                        }
                      >
                        {submitting ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Guardando...
                          </>
                        ) : supportsBulkLines(form.operation) ? (
                          `Registrar ${bulkLineCount || ""} movimiento(s)`
                        ) : (
                          "Registrar movimiento"
                        )}
                      </Button>
                    </CardBody>
                  </Card>
                </Col>

                <Col md="7">
                  <Card className="border mb-3">
                    <CardHeader>
                      <CardTitle tag="h6" className="mb-0">Stock por kiosko</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <KioskInventoryStockExplorer
                        kioskOptions={kioskOptions}
                        products={products}
                        colors={colors}
                        stockRows={visibleStockRows}
                        loading={loadingData}
                        selectedKiosk={selectedLocation}
                        onKioskChange={(value) => {
                          setSelectedLocation(value);
                          onFormChange("locationId", value);
                        }}
                        selectedProductId={stockExploreProductId}
                        onProductChange={setStockExploreProductId}
                        selectedColorId={stockExploreColorId}
                        onColorChange={setStockExploreColorId}
                        showAllRows={showAllStockRows}
                        onToggleShowAll={() => setShowAllStockRows((prev) => !prev)}
                        packagingStockCount={packagingStockCount}
                        stockViewFilter={stockViewFilter}
                        onStockViewFilterChange={setStockViewFilter}
                        filteredStockRows={filteredStockRows}
                      />
                      {visibleLowStockCount > 0 && selectedLocation ? (
                        <Alert color="warning" className="mb-0 mt-2">
                          Hay <strong>{visibleLowStockCount}</strong> producto(s) en stock bajo para este kiosko.
                        </Alert>
                      ) : null}
                    </CardBody>
                  </Card>
                </Col>
              </Row>

              <Row className="mt-3">
                <Col md="12">
                  <KioskInventoryMovementsPanel
                    movements={movements}
                    loading={loadingMovements}
                    filters={movementFilters}
                    onFilterChange={onMovementFilterChange}
                    kioskOptions={kioskOptions}
                    selectedKiosk={movementKioskId}
                    onKioskChange={setMovementKioskId}
                  />
                </Col>
              </Row>
              </>
              )}

              {activeTab === "CONTEO" && (
                <KioskInventoryCountReport locationId={selectedLocation} />
              )}

              {activeTab === "INVENTARIO_INICIAL" && (
                <KioskOpeningInventoryTab
                  locationId={selectedLocation}
                  products={products}
                  colors={colors}
                  stockRows={stockRows}
                  loadingStock={loadingData}
                  onRefreshStock={() =>
                    selectedLocation ? refreshLocationData(selectedLocation) : Promise.resolve()
                  }
                  onInitializeInventory={() => void handleInitializeInventory()}
                  initializingStock={initializingStock}
                />
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default KioskInventory;

