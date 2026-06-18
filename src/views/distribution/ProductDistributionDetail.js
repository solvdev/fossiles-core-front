import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Button,
  Input,
  Label,
  FormGroup,
  Badge,
  Alert,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Collapse,
} from "reactstrap";
import {
  getDistributionById,
  createDistribution,
  updateDistribution,
  createOrUpdateShipment,
  getShipmentsByDistribution,
  deleteShipment,
  cancelShipment,
  completeDistribution,
} from "services/productDistributionService";
import { getProductInventoryByLocation, getProductInventoryByProductAndLocation } from "services/productInventoryService";
import { getProducts } from "services/productService";
import { getLocations } from "services/locationService";
import { getColors } from "services/colorService";
import { getAuthHeader } from "services/authService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatDateGt } from "utils/dateTimeHelper";
import QRCode from "qrcode";
import { getPublicFrontBaseUrl, buildPtDispatchDistributionUrl } from "utils/ptDispatchQr";

/** Códigos de ubicación de devoluciones (alineado con backend OnlineSaleProductionOrderService). */
const RETURNS_WAREHOUSE_CODES = new Set([
  "BODEGA_DEVOLUCIONES",
  "BODEGA_DEV",
  "DEVOLUCION",
  "DEVOLUCIONES",
  "BODEGA_RET",
  "BODEGA_RETURN",
]);

/** Catálogo para envíos de distribución: no exige inventario previo en el kiosko. */
async function loadDistributionProductCatalog(locationId) {
  const [products, kioskInv] = await Promise.all([
    getProducts(),
    getProductInventoryByLocation(locationId).catch(() => []),
  ]);
  const kioskQtyByProductId = new Map();
  (Array.isArray(kioskInv) ? kioskInv : []).forEach((row) => {
    const pid = Number(row.productId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    kioskQtyByProductId.set(pid, (kioskQtyByProductId.get(pid) || 0) + Number(row.quantity || 0));
  });
  return (Array.isArray(products) ? products : [])
    .filter((p) => p?.id != null)
    .map((p) => ({
      productId: Number(p.id),
      productCode: p.code || p.productCode || "",
      productName: p.name || p.productName || "",
      quantity: kioskQtyByProductId.get(Number(p.id)) || 0,
    }))
    .sort((a, b) =>
      String(a.productCode).localeCompare(String(b.productCode), "es", { sensitivity: "base" })
    );
}

function KioskTypeahead({ locations, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = (locations || []).find((l) => String(l.id) === String(value));
  const display = selected ? `${selected.name} (${selected.code})` : "";
  const normalize = (text) =>
    String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const normalizedQuery = normalize(query);

  const filtered = useMemo(() => {
    const source = locations || [];
    if (!normalizedQuery) return source.slice(0, 120);

    return source
      .filter((location) => {
        const name = normalize(location.name);
        const code = normalize(location.code);
        return name.includes(normalizedQuery) || code.includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aName = normalize(a.name);
        const bName = normalize(b.name);
        const aStarts = aName.startsWith(normalizedQuery) ? 0 : 1;
        const bStarts = bName.startsWith(normalizedQuery) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return aName.localeCompare(bName);
      })
      .slice(0, 120);
  }, [locations, normalizedQuery]);

  const handleSelect = (locationId) => {
    onChange(String(locationId || ""));
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <Input
        type="text"
        value={open ? query : display}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && filtered.length > 0) {
            event.preventDefault();
            handleSelect(filtered[0].id);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Escribe para buscar kiosko por nombre o código..."
        disabled={disabled}
      />
      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            width: "100%",
            maxHeight: 240,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #d6d6d6",
            borderRadius: 4,
            boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
            marginTop: 2,
          }}
        >
          <div
            style={{ padding: "8px 10px", cursor: "pointer", color: "#666", borderBottom: "1px solid #f0f0f0" }}
            onMouseDown={() => handleSelect("")}
          >
            -- Seleccione un kiosko --
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: "8px 10px", color: "#999" }}>Sin resultados</div>
          ) : (
            filtered.map((location) => (
              <div
                key={location.id}
                style={{
                  padding: "8px 10px",
                  cursor: "pointer",
                  background: String(location.id) === String(value) ? "#e8f4fd" : "transparent",
                }}
                onMouseDown={() => handleSelect(location.id)}
              >
                {location.name} ({location.code})
              </div>
            ))
          )}
        </div>
      )}
      <small className="text-muted d-block mt-1">
        {normalizedQuery
          ? `${filtered.length} resultado(s) para "${query}". Presiona Enter para seleccionar el primero.`
          : "Escribe para filtrar kioskos por nombre o código."}
      </small>
    </div>
  );
}

function ProductDistributionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Verificar si estamos en la ruta de nueva distribución
  // Puede ser que id sea "new" o que la ruta sea "/product-distributions/new"
  const isNew = id === "new" || location.pathname.includes("/product-distributions/new");
  
  console.log("ProductDistributionDetail rendered - id:", id, "pathname:", location.pathname, "isNew:", isNew);
  
  const [distribution, setDistribution] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [colors, setColors] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [currentShipment, setCurrentShipment] = useState(null);
  const [editingShipmentId, setEditingShipmentId] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [shipmentProducts, setShipmentProducts] = useState({}); // {"productId:colorId:size": quantity}
  const [shipmentColors, setShipmentColors] = useState({}); // {productId: colorId} -> color draft por fila
  const [shipmentSizes, setShipmentSizes] = useState({}); // {productId: sizeLabel} -> talla draft por fila CINCHO
  const [quantityInputs, setQuantityInputs] = useState({}); // {productId: "string value"} -> cantidad draft por fila
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [generateProductionOrderOnComplete, setGenerateProductionOrderOnComplete] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [onlySelectedProducts, setOnlySelectedProducts] = useState(false);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [packingMaterials, setPackingMaterials] = useState([]);
  const [loadingPackingMaterials, setLoadingPackingMaterials] = useState(false);
  const [shipmentPacking, setShipmentPacking] = useState({}); // {materialId: quantity}
  const [shipmentPackingPrice, setShipmentPackingPrice] = useState({}); // {materialId: unitPrice}
  const [packingSearch, setPackingSearch] = useState("");
  const [selectedPackingMaterialId, setSelectedPackingMaterialId] = useState("");
  const [packingQuantityInput, setPackingQuantityInput] = useState("");
  const [packingUnitPriceInput, setPackingUnitPriceInput] = useState("");
  const pageSize = 12;
  const [distributionQrDataUrl, setDistributionQrDataUrl] = useState("");
  const hubStockFetchSeq = useRef(0);
  const [hubStockByKey, setHubStockByKey] = useState({});

  // Estado para el formulario de nueva distribución
  const [distributionForm, setDistributionForm] = useState({
    distributionDate: new Date().toISOString().split('T')[0],
    description: "",
  });

  const normalizeShipmentSize = (sizeValue) => String(sizeValue || "").trim().toUpperCase();
  const normalizeShipmentColor = (colorId) =>
    colorId === null || colorId === undefined || colorId === "" ? "null" : String(parseInt(colorId, 10));

  const buildShipmentKey = (productId, colorId, sizeLabel = "") =>
    `${parseInt(productId, 10)}:${normalizeShipmentColor(colorId)}:${normalizeShipmentSize(sizeLabel) || "nosize"}`;

  const parseShipmentKey = (key) => {
    const parts = String(key).split(":");
    const [productRaw, colorRaw, sizeRaw] = parts;
    const normalizedColorRaw = colorRaw === undefined ? "null" : colorRaw;
    const normalizedSizeRaw = sizeRaw === undefined ? "nosize" : sizeRaw;
    return {
      productId: parseInt(productRaw, 10),
      colorId: normalizedColorRaw === "null" ? null : parseInt(normalizedColorRaw, 10),
      size: normalizedSizeRaw === "nosize" ? "" : normalizedSizeRaw,
    };
  };

  const PACKING_TAG = "__PACKING_SUM__:";
  const BELT_SIZE_TAG = "__BELT_SIZE__:";

  const parseShipmentNotes = (rawNotes) => {
    const lines = String(rawNotes || "").split("\n");
    let packingRaw = "";
    let beltSizeRaw = "";
    const baseLines = [];

    lines.forEach((line) => {
      if (line.startsWith(PACKING_TAG)) {
        packingRaw = line.slice(PACKING_TAG.length).trim();
      } else if (line.startsWith(BELT_SIZE_TAG)) {
        beltSizeRaw = line.slice(BELT_SIZE_TAG.length).trim();
      } else {
        baseLines.push(line);
      }
    });

    const packingMap = {};
    const packingPrices = {};
    try {
      const packingItems = JSON.parse(packingRaw || "[]");
      (Array.isArray(packingItems) ? packingItems : []).forEach((item) => {
        const materialId = Number(item?.materialId);
        const quantity = Number(item?.quantity);
        const unitPrice = Number(item?.unitPrice || 0);
        if (materialId > 0 && quantity > 0) {
          packingMap[materialId] = quantity;
          if (Number.isFinite(unitPrice) && unitPrice > 0) {
            packingPrices[materialId] = unitPrice;
          }
        }
      });
    } catch (_err) {
      // Ignore malformed payload and keep base notes.
    }

    const beltSizes = [];
    try {
      const beltSizeItems = JSON.parse(beltSizeRaw || "[]");
      (Array.isArray(beltSizeItems) ? beltSizeItems : []).forEach((item) => {
        const productId = Number(item?.productId);
        const colorId = item?.colorId === null || item?.colorId === undefined || item?.colorId === ""
          ? null
          : Number(item.colorId);
        const quantity = Number(item?.quantity);
        const size = normalizeShipmentSize(item?.size);
        if (productId > 0 && quantity > 0 && size) {
          beltSizes.push({ productId, colorId, size, quantity });
        }
      });
    } catch (_err) {
      // Ignore malformed payload and keep base notes.
    }

    return {
      baseNotes: baseLines.join("\n").trim(),
      packing: packingMap,
      packingPrices,
      beltSizes,
    };
  };

  const isCinchoProduct = (productCode, productName) =>
    `${productCode || ""} ${productName || ""}`.toUpperCase().includes("CINCHO");

  const getSelectedProductQty = (productId) =>
    Object.entries(shipmentProducts)
      .filter(([key, qty]) => {
        if (!(qty > 0)) return false;
        const parsed = parseShipmentKey(key);
        return parsed.productId === parseInt(productId, 10);
      })
      .reduce((sum, [, qty]) => sum + parseFloat(qty || 0), 0);

  const hasSelectedProduct = (productId) => getSelectedProductQty(productId) > 0;
  const filteredPackingMaterials = useMemo(() => {
    const query = String(packingSearch || "").toLowerCase().trim();
    if (!query) return packingMaterials;
    return packingMaterials.filter((material) =>
      `${material.sku || ""} ${material.name || ""}`.toLowerCase().includes(query)
    );
  }, [packingMaterials, packingSearch]);
  const selectedPackingRows = useMemo(() => {
    return Object.entries(shipmentPacking)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([materialId, qty]) => {
        const material = packingMaterials.find((item) => Number(item.id) === Number(materialId));
        return {
          materialId: Number(materialId),
          sku: material?.sku || "SUM-",
          name: material?.name || "Material",
          quantity: Number(qty),
          unitPrice: Number(shipmentPackingPrice[materialId] || 0),
        };
      });
  }, [shipmentPacking, packingMaterials, shipmentPackingPrice]);

  const hubLocationIds = useMemo(() => {
    const list = locations || [];
    let ptLocationId = null;
    let returnsLocationId = null;
    for (const loc of list) {
      const code = String(loc.code || "").trim().toUpperCase();
      if (code === "BODEGA_PT" && ptLocationId == null) {
        ptLocationId = loc.id;
      }
      if (RETURNS_WAREHOUSE_CODES.has(code) && returnsLocationId == null) {
        returnsLocationId = loc.id;
      }
    }
    return { ptLocationId, returnsLocationId };
  }, [locations]);

  useEffect(() => {
    console.log("ProductDistributionDetail useEffect - id:", id, "isNew:", isNew);
    
    // Cargar ubicaciones y colores siempre
    loadLocations();
    loadColors();
    loadPackingMaterials();
    
    // Solo cargar distribución si NO es nueva y tiene un ID válido
    if (!isNew && id && id !== "new" && !isNaN(id)) {
      console.log("Loading existing distribution:", id);
      loadDistribution();
    }
    // Si es nueva (id === "new"), NO hacer nada, solo mostrar el formulario
  }, [id]);

  // Recargar envíos cuando cambie la distribución (solo si NO es nueva)
  useEffect(() => {
    if (distribution && distribution.id && !isNew) {
      console.log("Distribution changed, loading shipments for:", distribution.id);
      loadShipments();
    }
  }, [distribution?.id, isNew]);

  useEffect(() => {
    let cancelled = false;
    if (isNew || !distribution?.id) {
      setDistributionQrDataUrl("");
      return undefined;
    }
    const base = getPublicFrontBaseUrl();
    if (!base) {
      setDistributionQrDataUrl("");
      return undefined;
    }
    void QRCode.toDataURL(buildPtDispatchDistributionUrl(base, distribution.id), {
      width: 160,
      margin: 1,
    })
      .then((url) => {
        if (!cancelled) setDistributionQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDistributionQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, distribution?.id]);

  const handleCreateDistribution = async () => {
    if (!distributionForm.distributionDate) {
      showError("La fecha de distribución es requerida");
      return;
    }

    try {
      setSaving(true);
      setError("");
      console.log("Calling createDistribution API...");
      const newDist = await createDistribution({
        distributionDate: distributionForm.distributionDate,
        description: distributionForm.description,
        status: "DRAFT",
      });
      console.log("Distribution created:", newDist);
      if (newDist && newDist.id) {
        // Navegar a la vista de detalle con el ID (el componente cargará los datos)
        navigate(`/admin/product-distributions/${newDist.id}`, { replace: true });
        showSuccess("Distribución creada correctamente. Ahora puedes agregar envíos.");
      } else {
        throw new Error("No se recibió una respuesta válida del servidor");
      }
    } catch (err) {
      const errorMessage = err.message || "Error al crear distribución";
      setError(errorMessage);
      showError(errorMessage);
      console.error("Error creating distribution:", err);
    } finally {
      setSaving(false);
    }
  };

  const loadDistribution = async () => {
    // No cargar si es nueva o si el id no es válido
    if (isNew || !id || id === "new") {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const data = await getDistributionById(id);
      setDistribution(data);
    } catch (err) {
      setError(err.message || "Error al cargar distribución");
      showError(err.message || "Error al cargar distribución");
    } finally {
      setLoading(false);
    }
  };

  const loadShipments = async () => {
    // No cargar si es nueva
    if (isNew) {
      setShipments([]);
      return;
    }
    try {
      const distributionId = distribution?.id || (id && id !== "new" ? id : null);
      if (distributionId) {
        console.log("Loading shipments for distribution:", distributionId);
        const data = await getShipmentsByDistribution(distributionId);
        setShipments(data || []);
      } else {
        setShipments([]);
      }
    } catch (err) {
      console.error("Error loading shipments:", err);
      setShipments([]);
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

  const loadColors = async () => {
    try {
      const data = await getColors();
      setColors(data || []);
    } catch (err) {
      console.error("Error loading colors:", err);
    }
  };

  const loadPackingMaterials = async () => {
    try {
      setLoadingPackingMaterials(true);
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || "http://localhost:8080/api"}/materials/search?query=SUM-&activeOnly=true`,
        {
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
        }
      );
      if (!response.ok) {
        throw new Error("No se pudieron cargar los materiales de empaque SUM-.");
      }
      const data = await response.json();
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
  };

  const handleLocationChange = async (locationId, preferredShipmentId = null) => {
    if (!locationId) {
      setSelectedLocation("");
      setCurrentShipment(null);
      setInventory([]);
      setShipmentProducts({});
      setShipmentColors({});
      setShipmentSizes({});
      setShipmentPackingPrice({});
      setPackingSearch("");
      setPackingQuantityInput("");
      setPackingUnitPriceInput("");
      setSelectedPackingMaterialId("");
      return;
    }

    setSelectedLocation(locationId);
    
    // Buscar envío del kiosko (si se edita uno específico, respetarlo)
    const locationShipments = shipments.filter(s => s.locationId === parseInt(locationId));
    const existingShipment = preferredShipmentId
      ? locationShipments.find((s) => Number(s.id) === Number(preferredShipmentId))
      : locationShipments[0];
    
    if (existingShipment) {
      // Cargar envío existente
      setCurrentShipment(existingShipment);
      const parsedNotes = parseShipmentNotes(existingShipment.notes);
      const packingFromApi = {};
      const packingPricesFromApi = {};
      (existingShipment.packingItems || []).forEach((item) => {
        const materialId = Number(item.materialId);
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        if (materialId > 0 && quantity > 0) {
          packingFromApi[materialId] = quantity;
          if (unitPrice > 0) {
            packingPricesFromApi[materialId] = unitPrice;
          }
        }
      });
      setShipmentPacking(
        Object.keys(packingFromApi).length > 0 ? packingFromApi : (parsedNotes.packing || {})
      );
      setShipmentPackingPrice(
        Object.keys(packingPricesFromApi).length > 0 ? packingPricesFromApi : (parsedNotes.packingPrices || {})
      );
      const productsMap = {};
      (existingShipment.products || []).forEach(p => {
        const key = buildShipmentKey(p.productId, p.colorId ?? null, p.size || "");
        productsMap[key] = Number((Number(productsMap[key] || 0) + Number(p.quantity || 0)).toFixed(3));
      });
      setShipmentProducts(productsMap);
      setQuantityInputs({});
      setShipmentColors({});
      setShipmentSizes({});
      setShipmentSizes({});
      setPackingSearch("");
      setPackingQuantityInput("");
      setPackingUnitPriceInput("");
      setSelectedPackingMaterialId("");
      
      try {
        const invData = await loadDistributionProductCatalog(locationId);
        setInventory(invData || []);
      } catch (err) {
        console.error("Error loading product catalog:", err);
        setInventory([]);
      }
    } else {
      // Nuevo envío
      setCurrentShipment(null);
      setShipmentPacking({});
      setShipmentPackingPrice({});
      setShipmentProducts({});
      setShipmentColors({});
      setShipmentSizes({});
      setQuantityInputs({});
      setPackingSearch("");
      setPackingQuantityInput("");
      setPackingUnitPriceInput("");
      setSelectedPackingMaterialId("");
      
      try {
        const invData = await loadDistributionProductCatalog(locationId);
        setInventory(invData || []);
      } catch (err) {
        console.error("Error loading product catalog:", err);
        setInventory([]);
      }
    }
  };

  const handleQuantityChange = (productId, quantity) => {
    // Guardar el valor como string mientras se escribe (permite escribir libremente)
    setQuantityInputs(prev => ({
      ...prev,
      [productId]: quantity
    }));
  };

  const handleQuantityBlur = (productId) => {
    const inputValue = quantityInputs[productId];
    
    // Si está vacío o no es válido, limpiar
    if (!inputValue || inputValue === "" || isNaN(parseFloat(inputValue)) || parseFloat(inputValue) <= 0) {
      setQuantityInputs(prev => {
        const newInputs = { ...prev };
        delete newInputs[productId];
        return newInputs;
      });
    } else {
      // Asegurar que el valor final sea un número válido
      const finalQty = parseFloat(inputValue);
      if (finalQty > 0) {
        setQuantityInputs(prev => ({
          ...prev,
          [productId]: finalQty.toString()
        }));
      }
    }
  };

  const handleAddProductLine = (productId) => {
    const qtyRaw = quantityInputs[productId];
    const qty = parseFloat(qtyRaw);
    if (isNaN(qty) || qty <= 0) {
      showError("Ingresa una cantidad valida mayor a 0");
      return;
    }

    const colorValue = shipmentColors[productId];
    const colorId = colorValue === "" || colorValue === null || colorValue === undefined
      ? null
      : parseInt(colorValue, 10);
    const inventoryItem = inventory.find((item) => Number(item.productId) === Number(productId));
    const cinchoSelected = isCinchoProduct(inventoryItem?.productCode, inventoryItem?.productName);
    const sizeValue = normalizeShipmentSize(shipmentSizes[productId] || "");
    if (cinchoSelected && !sizeValue) {
      showError("Para CINCHO debes indicar talla.");
      return;
    }
    const key = buildShipmentKey(productId, colorId, cinchoSelected ? sizeValue : "");

    setShipmentProducts((prev) => ({
      ...prev,
      [key]: parseFloat((parseFloat(prev[key] || 0) + qty).toFixed(3)),
    }));
    setQuantityInputs((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handleRemoveShipmentLine = (lineKey) => {
    setShipmentProducts((prev) => {
      const next = { ...prev };
      delete next[lineKey];
      return next;
    });
  };

  const handleAddPackingLine = () => {
    const materialId = Number(selectedPackingMaterialId);
    const quantity = Number(packingQuantityInput);
    const unitPrice = Number(packingUnitPriceInput);
    if (!materialId) {
      showError("Selecciona un empaque SUM-.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showError("Ingresa una cantidad válida de empaque.");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      showError("Ingresa un precio válido para el empaque.");
      return;
    }
    setShipmentPacking((prev) => ({
      ...prev,
      [materialId]: Number((Number(prev[materialId] || 0) + quantity).toFixed(3)),
    }));
    setShipmentPackingPrice((prev) => ({
      ...prev,
      [materialId]: Number(unitPrice.toFixed(2)),
    }));
    setPackingQuantityInput("");
  };

  const handleRemovePackingLine = (materialId) => {
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

  const handleSaveShipment = async () => {
    if (!selectedLocation) {
      showError("Debe seleccionar un kiosko");
      return;
    }

    const lineEntries = Object.entries(shipmentProducts)
      .filter(([_, qty]) => qty > 0)
      .map(([lineKey, quantity]) => {
        const { productId, colorId, size } = parseShipmentKey(lineKey);
        const productMeta =
          inventory.find((item) => Number(item.productId) === Number(productId)) ||
          (currentShipment?.products || []).find((item) => Number(item.productId) === Number(productId)) ||
          {};
        return {
          productId,
          colorId,
          size: normalizeShipmentSize(size),
          quantity: parseFloat(quantity),
          isCincho: isCinchoProduct(productMeta.productCode, productMeta.productName),
        };
      });

    const products = lineEntries.map((line) => ({
      productId: line.productId,
      colorId: line.colorId,
      size: line.size || "",
      quantity: line.quantity,
    }));
    const packingItems = Object.entries(shipmentPacking)
      .filter(([_, qty]) => Number(qty) > 0)
      .map(([materialId, quantity]) => ({
        materialId: Number(materialId),
        quantity: Number(quantity),
        unitPrice: Number(shipmentPackingPrice[materialId] || 0),
      }));
    const cleanNotes = parseShipmentNotes(currentShipment?.notes || "").baseNotes || "";
    const hasProducts = products.length > 0;
    const hasPacking = Object.values(shipmentPacking).some((qty) => Number(qty) > 0);
    if (!hasProducts && !hasPacking) {
      showError("Agrega productos o empaques SUM- antes de guardar el envío.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      
      await createOrUpdateShipment(id, {
        shipmentId: editingShipmentId || undefined,
        locationId: parseInt(selectedLocation),
        products: products,
        packingItems,
        notes: cleanNotes,
      });
      
      showSuccess("Envío guardado correctamente");
      await loadShipments();
      await handleLocationChange(selectedLocation, editingShipmentId || null); // Recargar
    } catch (err) {
      setError(err.message || "Error al guardar envío");
      showError(err.message || "Error al guardar envío");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShipment = async (shipmentId) => {
    if (!window.confirm("¿Está seguro de eliminar este envío?")) {
      return;
    }
    try {
      setError("");
      await deleteShipment(shipmentId);
      showSuccess("Envío eliminado correctamente");
      await loadShipments();
      if (currentShipment && currentShipment.id === shipmentId) {
        setSelectedLocation("");
        setCurrentShipment(null);
        setEditingShipmentId(null);
        setInventory([]);
        setShipmentProducts({});
        setShipmentColors({});
        setShipmentSizes({});
      }
    } catch (err) {
      setError(err.message || "Error al eliminar envío");
      showError(err.message || "Error al eliminar envío");
    }
  };

  const handleCancelShipment = async (shipmentId) => {
    if (!window.confirm("¿Anular este envío? Solo aplica antes de enviar.")) {
      return;
    }
    try {
      setError("");
      await cancelShipment(shipmentId);
      showSuccess("Envío anulado correctamente");
      await loadShipments();
      if (currentShipment && currentShipment.id === shipmentId) {
        setSelectedLocation("");
        setCurrentShipment(null);
        setEditingShipmentId(null);
        setInventory([]);
        setShipmentProducts({});
        setShipmentColors({});
        setShipmentSizes({});
      }
    } catch (err) {
      setError(err.message || "Error al anular envío");
      showError(err.message || "Error al anular envío");
    }
  };

  const isShipmentCancellable = (status) => {
    const st = String(status || "").trim().toUpperCase();
    return st === "DRAFT" || st === "CONFIRMED";
  };

  const startEditingShipment = async (shipment) => {
    if (!shipment?.locationId) return;
    setEditingShipmentId(shipment.id);
    await handleLocationChange(shipment.locationId.toString(), shipment.id);
  };

  const closeInlineEditor = () => {
    setEditingShipmentId(null);
    setSelectedLocation("");
    setCurrentShipment(null);
    setInventory([]);
    setShipmentProducts({});
    setShipmentColors({});
    setShipmentSizes({});
    setQuantityInputs({});
  };

  const handleCompleteDistribution = async () => {
    if (!distribution || !distribution.id) {
      showError("No hay una distribución activa");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const result = await completeDistribution(distribution.id, {
        generateProductionOrder: generateProductionOrderOnComplete,
      });
      const poCode = result?.productionOrderCode;
      if (generateProductionOrderOnComplete) {
        showSuccess(
          poCode
            ? `Distribución completada. Se generó la orden de producción ${poCode}.`
            : "Distribución completada. Se generó una orden de producción."
        );
      } else {
        showSuccess("Distribución completada sin generar orden de producción.");
      }
      setShowCompleteModal(false);
      await loadDistribution();
      await loadShipments();
    } catch (err) {
      setError(err.message || "Error al completar distribución");
      showError(err.message || "Error al completar distribución");
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      DRAFT: { color: "secondary", text: "Borrador" },
      CONFIRMED: { color: "info", text: "Confirmada" },
      SENT: { color: "warning", text: "Enviada" },
      COMPLETED: { color: "success", text: "Completada" },
      CANCELLED: { color: "dark", text: "Anulado" },
    };
    const config = statusMap[status] || { color: "default", text: status };
    return <Badge color={config.color}>{config.text}</Badge>;
  };

  const filteredInventory = useMemo(() => {
    const search = (inventorySearch || "").toLowerCase().trim();
    return (inventory || []).filter((item) => {
      if (onlySelectedProducts && !hasSelectedProduct(item.productId)) return false;
      if (!search) return true;
      const code = (item.productCode || "").toLowerCase();
      const name = (item.productName || "").toLowerCase();
      return code.includes(search) || name.includes(search);
    });
  }, [inventory, inventorySearch, onlySelectedProducts, shipmentProducts]);

  const totalInventoryPages = Math.max(1, Math.ceil(filteredInventory.length / pageSize));
  const pagedInventory = useMemo(() => {
    const safePage = Math.min(inventoryPage, totalInventoryPages);
    const start = (safePage - 1) * pageSize;
    return filteredInventory.slice(start, start + pageSize);
  }, [filteredInventory, inventoryPage, totalInventoryPages]);

  useEffect(() => {
    if (!selectedLocation || !pagedInventory.length) {
      setHubStockByKey({});
      return undefined;
    }
    const { ptLocationId, returnsLocationId } = hubLocationIds;
    if (!ptLocationId && !returnsLocationId) {
      setHubStockByKey({});
      return undefined;
    }

    let cancelled = false;
    const seq = ++hubStockFetchSeq.current;

    const readHubQuantity = (response, cincho, sizeNorm) => {
      if (!response) return 0;
      if (!cincho) {
        const q = parseFloat(response.quantity);
        return Number.isFinite(q) ? q : 0;
      }
      const sizes = response.sizes || {};
      for (const [k, v] of Object.entries(sizes)) {
        if (normalizeShipmentSize(k) === sizeNorm) {
          const q = parseFloat(v);
          return Number.isFinite(q) ? q : 0;
        }
      }
      return 0;
    };

    const timer = setTimeout(async () => {
      if (cancelled) return;

      const loadingMap = {};
      pagedInventory.forEach((item) => {
        const pid = item.productId;
        const colorRaw = shipmentColors[pid];
        const colorId =
          colorRaw === "" || colorRaw === null || colorRaw === undefined
            ? null
            : parseInt(colorRaw, 10);
        const cincho = isCinchoProduct(item.productCode, item.productName);
        const sizeNorm = cincho ? normalizeShipmentSize(shipmentSizes[pid] || "") : "";
        const key = buildShipmentKey(pid, colorId, cincho ? sizeNorm : "");
        loadingMap[key] = {
          loading: true,
          needSize: cincho && !sizeNorm,
          dev: null,
          pt: null,
        };
      });
      setHubStockByKey(loadingMap);

      let anyFetchError = false;
      const next = { ...loadingMap };

      await Promise.all(
        pagedInventory.map(async (item) => {
          const pid = item.productId;
          const colorRaw = shipmentColors[pid];
          const colorId =
            colorRaw === "" || colorRaw === null || colorRaw === undefined
              ? null
              : parseInt(colorRaw, 10);
          const cincho = isCinchoProduct(item.productCode, item.productName);
          const sizeNorm = cincho ? normalizeShipmentSize(shipmentSizes[pid] || "") : "";
          const key = buildShipmentKey(pid, colorId, cincho ? sizeNorm : "");

          if (cincho && !sizeNorm) {
            next[key] = { loading: false, needSize: true, dev: null, pt: null, devError: false, ptError: false };
            return;
          }

          const fetchLoc = async (locId) => {
            if (!locId) return { qty: null, error: false };
            try {
              const res = await getProductInventoryByProductAndLocation(pid, locId, colorId);
              return { qty: readHubQuantity(res, cincho, sizeNorm), error: false };
            } catch (_e) {
              return { qty: null, error: true };
            }
          };

          const [devRes, ptRes] = await Promise.all([
            fetchLoc(returnsLocationId),
            fetchLoc(ptLocationId),
          ]);

          if (devRes.error || ptRes.error) {
            anyFetchError = true;
          }

          next[key] = {
            loading: false,
            needSize: false,
            dev: returnsLocationId ? devRes.qty : null,
            pt: ptLocationId ? ptRes.qty : null,
            devError: Boolean(returnsLocationId && devRes.error),
            ptError: Boolean(ptLocationId && ptRes.error),
          };
        })
      );

      if (cancelled || hubStockFetchSeq.current !== seq) return;
      if (anyFetchError) {
        console.warn("ProductDistributionDetail: fallo al cargar stock en bodega PT o devoluciones (revisar red o permisos).");
      }
      setHubStockByKey(next);
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedLocation, pagedInventory, shipmentColors, shipmentSizes, hubLocationIds]);

  useEffect(() => {
    setInventoryPage(1);
  }, [selectedLocation, inventorySearch, onlySelectedProducts]);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return formatDateGt(dateString, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  };

  // PRIMERO: Si es nueva, mostrar formulario para crear distribución (ANTES de cualquier otra condición)
  if (isNew) {
    // Si hay error al crear, mostrar error
    if (error && !saving) {
      return (
        <div className="content">
          <Alert color="danger">
            <h4>Error al crear distribución</h4>
            <p>{error}</p>
          </Alert>
          <Button color="secondary" onClick={() => navigate("/admin/product-distributions")} className="mt-3">
            Volver a Distribuciones
          </Button>
        </div>
      );
    }
    
    // Si está guardando, mostrar spinner
    if (saving) {
      return (
        <div className="content">
          <div className="text-center py-5">
            <Spinner color="primary" />
            <p className="mt-2">Creando distribución...</p>
          </div>
        </div>
      );
    }
    
    // Si no hay distribución, mostrar formulario
    if (!distribution) {
      console.log("Rendering form for new distribution");
      return (
        <div className="content">
        <Row>
          <Col md="12">
            <Card>
              <CardHeader>
                <Row>
                  <Col md="6">
                    <CardTitle tag="h4">Nueva Distribución</CardTitle>
                  </Col>
                  <Col md="6" className="text-right">
                    <Button
                      color="secondary"
                      size="sm"
                      onClick={() => navigate("/admin/product-distributions")}
                      className="mt-2"
                    >
                      <i className="nc-icon nc-minimal-left mr-1" />
                      Volver
                    </Button>
                  </Col>
                </Row>
              </CardHeader>
              <CardBody>
                {error && (
                  <Alert color="danger" className="mt-3">
                    {error}
                  </Alert>
                )}

                <Row>
                  <Col md="12">
                    <Label>
                      <strong>Fecha de Distribución *</strong>
                    </Label>
                    <Input
                      type="date"
                      value={distributionForm.distributionDate}
                      onChange={(e) => setDistributionForm({ ...distributionForm, distributionDate: e.target.value })}
                      disabled={saving}
                      required
                    />
                  </Col>
                </Row>

                <Row className="mt-3">
                  <Col md="12">
                    <Label>
                      <strong>Descripción</strong>
                      <small className="text-muted ml-2">(Opcional)</small>
                    </Label>
                    <Input
                      type="textarea"
                      rows="3"
                      value={distributionForm.description}
                      onChange={(e) => setDistributionForm({ ...distributionForm, description: e.target.value })}
                      disabled={saving}
                      placeholder="Ingrese una descripción para esta distribución (opcional)"
                    />
                  </Col>
                </Row>

                <Row className="mt-4">
                  <Col md="12" className="text-right">
                    <Button
                      color="secondary"
                      onClick={() => navigate("/admin/product-distributions")}
                      className="mr-2"
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      color="primary"
                      onClick={handleCreateDistribution}
                      disabled={saving || !distributionForm.distributionDate}
                    >
                      {saving ? (
                        <>
                          <Spinner size="sm" className="mr-2" />
                          Creando...
                        </>
                      ) : (
                        <>
                          <i className="nc-icon nc-check-2 mr-1" />
                          Crear Distribución
                        </>
                      )}
                    </Button>
                  </Col>
                </Row>

                <Alert color="info" className="mt-4">
                  <strong>Información:</strong> Después de crear la distribución, podrás agregar envíos para diferentes kioskos.
                </Alert>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>
      );
    }
    
    // Si es nueva pero ya tiene distribución (después de crear), continuar al render normal
  }

  // Si NO es nueva y está cargando
  if (loading && !isNew) {
    return (
      <div className="content">
        <div className="text-center py-5">
          <Spinner color="primary" />
          <p className="mt-2">Cargando distribución...</p>
        </div>
      </div>
    );
  }

  // Si NO es nueva y no hay distribución
  if (!distribution && !isNew && !loading) {
    return (
      <div className="content">
        <Alert color="danger">No se pudo cargar la distribución</Alert>
        <Button color="secondary" onClick={() => navigate("/admin/product-distributions")} className="mt-3">
          Volver a Distribuciones
        </Button>
      </div>
    );
  }

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">
                    {distribution ? `Distribución ${distribution.distributionNumber}` : "Nueva Distribución"}
                  </CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  {distribution && distribution.status !== "COMPLETED" && (
                    <Button
                      color="success"
                      size="sm"
                      onClick={() => {
                        setGenerateProductionOrderOnComplete(false);
                        setShowCompleteModal(true);
                      }}
                      className="mt-2 mr-2"
                      disabled={saving}
                    >
                      <i className="nc-icon nc-check-2 mr-1" />
                      Finalizar Distribución
                    </Button>
                  )}
                  <Button
                    color="secondary"
                    size="sm"
                    onClick={() => navigate("/admin/product-distributions")}
                    className="mt-2"
                  >
                    <i className="nc-icon nc-minimal-left mr-1" />
                    Volver
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && (
                <Alert color="danger" className="mt-3">
                  {error}
                </Alert>
              )}

              {distribution && (
                <>
                  <Row className="mb-3">
                    <Col md="3">
                      <Label>Fecha</Label>
                      <p>{formatDate(distribution.distributionDate)}</p>
                    </Col>
                    <Col md="3">
                      <Label>Estado</Label>
                      <p>{getStatusBadge(distribution.status)}</p>
                    </Col>
                    <Col md="3">
                      <Label>Envíos</Label>
                      <p><Badge color="info">{distribution.shipmentCount || 0}</Badge></p>
                    </Col>
                    <Col md="3">
                      <Label>Descripción</Label>
                      <p><small className="text-muted">{distribution.description || "Sin descripción"}</small></p>
                    </Col>
                  </Row>
                  {distributionQrDataUrl && (
                    <Row className="mb-3">
                      <Col md="12">
                        <div
                          className="d-flex flex-wrap align-items-center p-3 border rounded"
                          style={{ background: "#f8fafc", gap: "16px" }}
                        >
                          <img src={distributionQrDataUrl} alt="QR distribución" style={{ width: 120, height: 120 }} />
                          <div>
                            <strong>Bodega PT</strong>
                            <p className="mb-0 text-muted small">
                              Escanear en app Bodega PT — envíos de esta distribución
                            </p>
                          </div>
                        </div>
                      </Col>
                    </Row>
                  )}
                  {distribution.productionOrderCode && (
                    <Alert color="success" className="mb-3">
                      <i className="nc-icon nc-settings-gear-65 mr-1" />
                      <strong>Orden de Producción generada:</strong>{" "}
                      <Badge color="primary" style={{ fontSize: "1em" }}>
                        {distribution.productionOrderCode}
                      </Badge>
                      <small className="ml-2 text-muted">
                        Puedes ver el detalle en el módulo de Órdenes de Producción.
                      </small>
                    </Alert>
                  )}
                </>
              )}

              <hr />

              {/* Lista de envíos existentes */}
              {shipments.length > 0 && (
                <Row className="mb-3">
                  <Col md="12">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <Label className="mb-0">Envíos de esta distribución</Label>
                      {editingShipmentId && (
                        <Button color="secondary" size="sm" outline onClick={closeInlineEditor}>
                          <i className="nc-icon nc-minimal-up mr-1" />
                          Volver a la lista
                        </Button>
                      )}
                    </div>
                    <small className="text-muted d-block mb-2">
                      Máximo 10 filas de productos por envío. Para un mismo kiosko pueden existir múltiples envíos.
                    </small>
                    {editingShipmentId && currentShipment && (
                      <Alert color="info" className="py-2">
                        Editando envío <strong>{currentShipment.shipmentNumber}</strong> para{" "}
                        <strong>{currentShipment.locationName}</strong>.
                      </Alert>
                    )}
                    <Collapse isOpen={!editingShipmentId}>
                      <Table responsive size="sm">
                        <thead>
                          <tr>
                            <th>Número</th>
                            <th>Kiosko</th>
                            <th>Productos</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shipments.map((shipment) => (
                            <tr key={shipment.id}>
                              <td>{shipment.shipmentNumber}</td>
                              <td>{shipment.locationName} ({shipment.locationCode})</td>
                              <td><Badge>{shipment.products?.length || 0}</Badge></td>
                              <td>{getStatusBadge(shipment.status)}</td>
                              <td>
                                <Button
                                  color="info"
                                  size="sm"
                                  onClick={() => startEditingShipment(shipment)}
                                  className="mr-2"
                                >
                                  <i className="nc-icon nc-ruler-pencil mr-1" />
                                  Editar
                                </Button>
                                {isShipmentCancellable(shipment.status) && (
                                  <Button
                                    color="warning"
                                    size="sm"
                                    outline
                                    onClick={() => handleCancelShipment(shipment.id)}
                                    className="mr-2"
                                  >
                                    <i className="nc-icon nc-simple-remove mr-1" />
                                    Anular
                                  </Button>
                                )}
                                {distribution?.status === "DRAFT" && shipment.status === "DRAFT" && (
                                  <Button
                                    color="danger"
                                    size="sm"
                                    onClick={() => handleDeleteShipment(shipment.id)}
                                  >
                                    <i className="nc-icon nc-simple-remove" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </Collapse>
                  </Col>
                </Row>
              )}

              {distribution && distribution.status !== "COMPLETED" && (
                <>
                  <hr />
                  
                  {/* Selector de kiosko */}
                  <Row className="mb-3">
                    <Col md="12">
                      <Label>
                        <strong>
                          {editingShipmentId ? "Kiosko del envío en edición" : "Seleccionar Kiosko para Crear Envío"}
                        </strong>
                        <small className="text-muted ml-2">
                          {editingShipmentId
                            ? "(Para cambiar de envío, usa 'Volver a la lista' y elige otro)"
                            : "(Puedes crear múltiples envíos para diferentes kioskos en esta distribución)"}
                        </small>
                      </Label>
                    </Col>
                  </Row>
                  <Row className="mb-3">
                    <Col md="6">
                      <KioskTypeahead
                        locations={locations}
                        value={selectedLocation}
                        onChange={handleLocationChange}
                        disabled={saving || Boolean(editingShipmentId)}
                      />
                    </Col>
                    <Col md="6" className="d-flex align-items-end">
                      {selectedLocation && (
                        <Button
                          color="primary"
                          size="lg"
                          onClick={handleSaveShipment}
                          disabled={
                            saving ||
                            (
                              Object.keys(shipmentProducts).filter((pid) => shipmentProducts[pid] > 0).length === 0 &&
                              !Object.values(shipmentPacking).some((qty) => Number(qty) > 0)
                            )
                          }
                          block
                        >
                          {saving ? (
                            <>
                              <Spinner size="sm" className="mr-2" />
                              Guardando Envío...
                            </>
                          ) : (
                            <>
                              <i className="nc-icon nc-check-2 mr-1" />
                              Guardar Envío para este Kiosko
                            </>
                          )}
                        </Button>
                      )}
                    </Col>
                  </Row>
                  {selectedLocation &&
                    Object.keys(shipmentProducts).filter((pid) => shipmentProducts[pid] > 0).length === 0 &&
                    !Object.values(shipmentPacking).some((qty) => Number(qty) > 0) && (
                    <Alert color="warning" className="mb-3">
                      <i className="nc-icon nc-alert-circle-i mr-1" />
                      Asigna productos o empaques SUM- antes de guardar el envío.
                    </Alert>
                  )}

                  {/* Tabla de inventario editable */}
                  {selectedLocation && inventory.length > 0 && (
                    <Row>
                      <Col md="12">
                        <Label>
                          <strong>Catálogo de productos — cantidades a enviar</strong>
                          <small className="text-muted ml-2">
                            (El kiosko puede tener stock 0; el envío sale de Bodega PT / devoluciones)
                          </small>
                          <br />
                          <small className="text-muted">
                            Stock devoluciones y Stock PT muestran la variante elegida (color y talla en CINCHO).
                          </small>
                        </Label>
                        <Row className="mb-2">
                          <Col md="5">
                            <Input
                              type="search"
                              placeholder="Buscar por código o producto..."
                              value={inventorySearch}
                              onChange={(e) => setInventorySearch(e.target.value)}
                            />
                          </Col>
                          <Col md="3" className="d-flex align-items-center">
                            <Label check style={{ cursor: "pointer", marginBottom: 0 }}>
                              <Input
                                type="checkbox"
                                checked={onlySelectedProducts}
                                onChange={(e) => setOnlySelectedProducts(e.target.checked)}
                              />
                              {" "}Solo seleccionados
                            </Label>
                          </Col>
                          <Col md="4" className="text-right d-flex align-items-center justify-content-end">
                            <small className="text-muted">
                              Mostrando {pagedInventory.length} de {filteredInventory.length} productos
                            </small>
                          </Col>
                        </Row>
                        <Table responsive striped>
                          <thead className="text-primary">
                            <tr>
                              <th>Código</th>
                              <th>Producto</th>
                              <th>Stock Actual en Kiosko</th>
                              <th>Color</th>
                              <th>Talla</th>
                              <th>Stock devoluciones</th>
                              <th>Stock PT</th>
                              <th>Cantidad a Enviar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedInventory.map((item) => {
                              const currentQty = getSelectedProductQty(item.productId);
                              const stock = parseFloat(item.quantity || 0);
                              const hasQuantity = currentQty > 0;
                              const isCincho = isCinchoProduct(item.productCode, item.productName);
                              const displayValue = quantityInputs[item.productId] !== undefined 
                                ? quantityInputs[item.productId] 
                                : "";
                              const colorRaw = shipmentColors[item.productId];
                              const rowColorId =
                                colorRaw === "" || colorRaw === null || colorRaw === undefined
                                  ? null
                                  : parseInt(colorRaw, 10);
                              const rowSizeNorm = isCincho
                                ? normalizeShipmentSize(shipmentSizes[item.productId] || "")
                                : "";
                              const hubKey = buildShipmentKey(
                                item.productId,
                                rowColorId,
                                isCincho ? rowSizeNorm : ""
                              );
                              const hub = hubStockByKey[hubKey] || {};
                              const { ptLocationId: ptLocId, returnsLocationId: retLocId } = hubLocationIds;
                              const renderHubCell = (side) => {
                                const locId = side === "dev" ? retLocId : ptLocId;
                                if (!locId) {
                                  return <span className="text-muted">N/D</span>;
                                }
                                if (hub.loading) {
                                  return <Spinner size="sm" color="primary" />;
                                }
                                if (hub.needSize) {
                                  return <small className="text-muted">Elija talla</small>;
                                }
                                const val = side === "dev" ? hub.dev : hub.pt;
                                const err = side === "dev" ? hub.devError : hub.ptError;
                                if (err || val === null) {
                                  return <small className="text-muted">—</small>;
                                }
                                const n = Number(val);
                                return (
                                  <strong className={n === 0 ? "text-muted" : "text-primary"}>
                                    {Number.isFinite(n) ? n.toFixed(3) : "—"}
                                  </strong>
                                );
                              };
                              return (
                                <tr key={item.productId} className={hasQuantity ? "table-info" : ""}>
                                  <td>{item.productCode || "N/A"}</td>
                                  <td>{item.productName || "N/A"}</td>
                                  <td>
                                    <strong className={stock === 0 ? "text-muted" : "text-primary"}>
                                      {stock.toFixed(3)}
                                    </strong>
                                  </td>
                                  <td>
                                    <Input
                                      type="select"
                                      value={shipmentColors[item.productId] || ""}
                                      onChange={(e) =>
                                        setShipmentColors((prev) => ({
                                          ...prev,
                                          [item.productId]: e.target.value || null,
                                        }))
                                      }
                                      style={{ width: "160px" }}
                                      bsSize="sm"
                                    >
                                      <option value="">-- Sin color --</option>
                                      {colors.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </Input>
                                  </td>
                                  <td>
                                    {isCincho ? (
                                      <Input
                                        type="text"
                                        value={shipmentSizes[item.productId] || ""}
                                        onChange={(e) =>
                                          setShipmentSizes((prev) => ({
                                            ...prev,
                                            [item.productId]: e.target.value.toUpperCase(),
                                          }))
                                        }
                                        style={{ width: "120px" }}
                                        bsSize="sm"
                                        placeholder="Ej: 34, 36"
                                      />
                                    ) : (
                                      <small className="text-muted">N/A</small>
                                    )}
                                  </td>
                                  <td>{renderHubCell("dev")}</td>
                                  <td>{renderHubCell("pt")}</td>
                                  <td>
                                    <div className="d-flex align-items-center">
                                      <Input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={displayValue}
                                        onChange={(e) => handleQuantityChange(item.productId, e.target.value)}
                                        onBlur={() => handleQuantityBlur(item.productId)}
                                        style={{ width: "130px" }}
                                        placeholder="0"
                                      />
                                      <Button
                                        color="primary"
                                        size="sm"
                                        className="ml-2"
                                        onClick={() => handleAddProductLine(item.productId)}
                                      >
                                        Agregar
                                      </Button>
                                    </div>
                                    {hasQuantity && (
                                      <Badge color="info" className="ml-2 mt-1">
                                        En envio: {currentQty.toFixed(3)}
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                        {filteredInventory.length > pageSize && (
                          <Row className="mt-2">
                            <Col md="12" className="d-flex justify-content-end align-items-center">
                              <small className="text-muted mr-2">
                                Página {Math.min(inventoryPage, totalInventoryPages)} de {totalInventoryPages}
                              </small>
                              <Button
                                size="sm"
                                color="secondary"
                                outline
                                className="mr-1"
                                disabled={inventoryPage <= 1}
                                onClick={() => setInventoryPage((p) => Math.max(1, p - 1))}
                              >
                                Anterior
                              </Button>
                              <Button
                                size="sm"
                                color="secondary"
                                outline
                                disabled={inventoryPage >= totalInventoryPages}
                                onClick={() => setInventoryPage((p) => Math.min(totalInventoryPages, p + 1))}
                              >
                                Siguiente
                              </Button>
                            </Col>
                          </Row>
                        )}
                      </Col>
                    </Row>
                  )}

                  {selectedLocation && inventory.length === 0 && (
                    <Alert color="warning" className="mt-3">
                      No se pudo cargar el catálogo de productos. Verifica tu conexión o permisos de catálogo.
                    </Alert>
                  )}

                  {/* Lista de productos del envío */}
                  {selectedLocation && Object.keys(shipmentProducts).filter((key) => shipmentProducts[key] > 0).length > 0 && (
                    <Row className="mt-4">
                      <Col md="12">
                        <Label>
                          <strong>Lista de Productos del Envío</strong>
                          <Badge color="primary" className="ml-2">
                            {Object.entries(shipmentProducts).filter(([_, qty]) => qty > 0).length} linea(s)
                          </Badge>
                        </Label>
                        <Table responsive striped className="mt-2">
                          <thead className="thead-dark">
                            <tr>
                              <th>Código</th>
                              <th>Producto</th>
                              <th>Color</th>
                              <th>Talla</th>
                              <th>Cantidad a Enviar</th>
                              <th>Acción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(shipmentProducts)
                              .filter(([_, qty]) => qty > 0)
                              .map(([lineKey, quantity]) => {
                                const { productId, colorId, size } = parseShipmentKey(lineKey);
                                const product = inventory.find(p => p.productId === parseInt(productId, 10));
                                const color = colorId ? colors.find(c => c.id === parseInt(colorId)) : null;
                                return (
                                  <tr key={lineKey}>
                                    <td><strong>{product?.productCode || "N/A"}</strong></td>
                                    <td>{product?.productName || "N/A"}</td>
                                    <td>
                                      {color
                                        ? <Badge color="warning">{color.name}</Badge>
                                        : <small className="text-muted">Sin color</small>}
                                    </td>
                                    <td>
                                      {size
                                        ? (
                                          <Badge
                                            color="info"
                                            style={{
                                              fontSize: "0.9em",
                                              padding: "0.45em 0.7em",
                                              fontWeight: 700,
                                              color: "#0b3b4a",
                                              backgroundColor: "#b8f0fb",
                                            }}
                                          >
                                            {String(size).toUpperCase()}
                                          </Badge>
                                        )
                                        : <small className="text-muted">Sin talla</small>}
                                    </td>
                                    <td>
                                      <Badge color="success" style={{ fontSize: "1em", padding: "0.5em" }}>
                                        {parseFloat(quantity).toFixed(3)}
                                      </Badge>
                                    </td>
                                    <td>
                                      <Button
                                        color="danger"
                                        size="sm"
                                        onClick={() => handleRemoveShipmentLine(lineKey)}
                                        title="Eliminar del envío"
                                      >
                                        <i className="nc-icon nc-simple-remove" /> Quitar
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </Table>
                        <Alert color="info" className="mt-2">
                          <small>
                            <i className="nc-icon nc-info" /> 
                            Estos productos se agregarán al envío cuando guardes. 
                            Puedes modificar las cantidades en la tabla de arriba o quitar productos de esta lista.
                          </small>
                        </Alert>
                      </Col>
                    </Row>
                  )}

                  {selectedLocation && (
                    <Row className="mt-3">
                      <Col md="12">
                        <Label>
                          <strong>Empaques SUM- para este kiosko</strong>
                          <small className="text-muted ml-2">(Se guardan dentro del detalle del envío)</small>
                        </Label>
                        {loadingPackingMaterials ? (
                          <div className="text-muted">Cargando empaques...</div>
                        ) : packingMaterials.length === 0 ? (
                          <Alert color="warning" className="mb-0">
                            No se encontraron materiales con SKU SUM-.
                          </Alert>
                        ) : (
                          <>
                            <Row className="mt-2">
                              <Col md="6">
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
                                    const selected = packingMaterials.find(
                                      (item) => String(item.id) === String(materialId)
                                    );
                                    const suggestedPrice = Number(
                                      selected?.unitCost || selected?.purchasePrice || selected?.cost || 0
                                    );
                                    setPackingUnitPriceInput(
                                      Number.isFinite(suggestedPrice) && suggestedPrice > 0
                                        ? suggestedPrice.toFixed(2)
                                        : ""
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
                              <Col md="2">
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={packingQuantityInput}
                                  onChange={(e) => setPackingQuantityInput(e.target.value)}
                                  placeholder="Cant."
                                />
                              </Col>
                            </Row>
                            <Row className="mt-2">
                              <Col md="3">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={packingUnitPriceInput}
                                  onChange={(e) => setPackingUnitPriceInput(e.target.value)}
                                  placeholder="Precio unitario"
                                />
                              </Col>
                              <Col md="9" className="d-flex align-items-center">
                                <small className="text-muted">
                                  El precio del empaque se guarda en el detalle del envío para reportes/costos.
                                </small>
                              </Col>
                            </Row>
                            <Row className="mt-2">
                              <Col md="12" className="text-right">
                                <Button color="info" size="sm" onClick={handleAddPackingLine}>
                                  <i className="nc-icon nc-simple-add mr-1" />
                                  Agregar empaque
                                </Button>
                              </Col>
                            </Row>

                            {selectedPackingRows.length === 0 ? (
                              <Alert color="light" className="mt-2 mb-0">
                                No hay empaques agregados aún para este envío.
                              </Alert>
                            ) : (
                              <Table responsive bordered size="sm" className="mt-2">
                                <thead className="text-primary">
                                  <tr>
                                    <th>SKU</th>
                                    <th>Material</th>
                                    <th style={{ width: "140px" }}>Cantidad</th>
                                    <th style={{ width: "140px" }}>Precio</th>
                                    <th style={{ width: "160px" }}>Subtotal</th>
                                    <th style={{ width: "80px" }}>Acción</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedPackingRows.map((row) => (
                                    <tr key={row.materialId}>
                                      <td><strong>{row.sku}</strong></td>
                                      <td>{row.name}</td>
                                      <td>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={shipmentPacking[row.materialId] || ""}
                                          onChange={(e) =>
                                            setShipmentPacking((prev) => ({
                                              ...prev,
                                              [row.materialId]: e.target.value,
                                            }))
                                          }
                                          bsSize="sm"
                                        />
                                      </td>
                                      <td>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={shipmentPackingPrice[row.materialId] || ""}
                                          onChange={(e) =>
                                            setShipmentPackingPrice((prev) => ({
                                              ...prev,
                                              [row.materialId]: e.target.value,
                                            }))
                                          }
                                          bsSize="sm"
                                        />
                                      </td>
                                      <td>
                                        <Badge color="success">
                                          Q {(Number(shipmentPacking[row.materialId] || 0) * Number(shipmentPackingPrice[row.materialId] || 0)).toFixed(2)}
                                        </Badge>
                                      </td>
                                      <td>
                                        <Button
                                          color="danger"
                                          size="sm"
                                          onClick={() => handleRemovePackingLine(row.materialId)}
                                        >
                                          <i className="nc-icon nc-simple-remove" />
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </Table>
                            )}
                          </>
                        )}
                      </Col>
                    </Row>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Modal de confirmación para finalizar */}
      <Modal isOpen={showCompleteModal} toggle={() => setShowCompleteModal(false)}>
        <ModalHeader toggle={() => setShowCompleteModal(false)}>
          Finalizar Distribución
        </ModalHeader>
        <ModalBody>
          <p>
            ¿Está seguro de finalizar esta distribución?
          </p>
          <FormGroup check className="mb-3">
            <Label check style={{ cursor: "pointer" }}>
              <Input
                type="checkbox"
                checked={generateProductionOrderOnComplete}
                onChange={(e) => setGenerateProductionOrderOnComplete(e.target.checked)}
              />{" "}
              Generar orden de producción al finalizar
            </Label>
          </FormGroup>
          {generateProductionOrderOnComplete ? (
            <>
              <p className="text-info">
                <strong>Se generará una Orden de Producción que incluirá:</strong>
              </p>
              <ul>
                <li>El resumen de todos los productos y cantidades totales</li>
                <li>El detalle de la distribución y sus envíos por kiosko</li>
                <li>La distribución quedará marcada como COMPLETADA</li>
              </ul>
            </>
          ) : (
            <Alert color="warning" className="mt-2">
              La distribución se marcará como COMPLETADA sin crear orden de producción.
              Use esta opción cuando los envíos saldrán desde stock ya disponible en bodega PT.
            </Alert>
          )}
          <Alert color="info" className="mt-2">
            <i className="nc-icon nc-alert-circle-i mr-1" />
            <strong>Nota:</strong> El inventario NO se actualizará de inmediato. Los movimientos de inventario 
            se realizarán cuando la orden de producción sea procesada.
          </Alert>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowCompleteModal(false)}>
            Cancelar
          </Button>
          <Button color="success" onClick={handleCompleteDistribution} disabled={saving}>
            {saving ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Procesando...
              </>
            ) : (
              <>
                <i className="nc-icon nc-check-2 mr-1" />
                {generateProductionOrderOnComplete
                  ? "Finalizar y Generar Orden de Producción"
                  : "Finalizar Distribución"}
              </>
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default ProductDistributionDetail;

