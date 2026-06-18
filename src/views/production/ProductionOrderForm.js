import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Label,
  FormGroup,
  Input,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Row,
  Col,
  Table,
  Badge,
  Card,
  CardBody,
} from "reactstrap";
import {
  getProductionOrderById,
  createProductionOrder,
  updateProductionOrder,
  validateMaterials,
} from "services/productionOrderService";
import { getProducts } from "services/productService";
import { getColors } from "services/colorService";
import { getCustomers } from "services/customerService";
import { getAuthHeader } from "services/authService";
import { showSuccess, showError } from "utils/notificationHelper";
import OpcGenerateShipmentModal from "components/production/OpcGenerateShipmentModal";
import ProductionOrderPartialReleasesPanel from "components/production/ProductionOrderPartialReleasesPanel";
import { isCinchoOrderType } from "utils/cinchoProductionHelper";
import { isLuisFelipeSeller, isLuisFelipeVendorFlow } from "utils/luisFelipeVendorHelper";
import { orderAllowsPartialReleases } from "utils/partialReleaseHelper";
import { resolveDefaultOpvUnitPrice } from "utils/prepareShipmentsOrderHelper";
import OpvShipmentPriceReviewModal from "components/production/OpvShipmentPriceReviewModal";

// Tallas disponibles para cinchos (16-60)
const AVAILABLE_SIZES = Array.from({ length: 45 }, (_, i) => (i + 16).toString());

const STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En Progreso",
  IN_QA: "En Progreso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const SELLER_OPTIONS = ["LUIS FELIPE", "MADELYN"];
const BRAND_OPTIONS = ["LEVIS", "NAUTICA", "TOMMY HILFIGER", "LACOSTE", "ABERCROMBIE"];
const isClienteKioskoOrder = (orderType) => orderType === "CLIENTE_KIOSKO";
const isOnlineSaleOrKioskOrder = (orderType) =>
  orderType === "VENTA_EN_LINEA" || isClienteKioskoOrder(orderType);

const customerFieldsFromCatalog = (customer) => {
  if (!customer) {
    return { customerAddress: "", customerPhone: "", customerTaxId: "" };
  }
  return {
    customerAddress: customer.address || customer.direccion || "",
    customerPhone: customer.phone || customer.telefono || "",
    customerTaxId: customer.nit || customer.taxId || customer.tax_id || "CF",
  };
};

const createEmptyItemForm = () => ({
  productId: "",
  colorId: "",
  colorIds: [],
  brandName: "",
  quantity: "",
  sizes: {},
  selectedSizes: [],
  colorSizes: {},
  observations: "",
  unitPrice: "",
});

const getPositiveSizes = (sizes = {}) =>
  Object.entries(sizes).reduce((acc, [size, qty]) => {
    const quantity = parseInt(qty);
    if (quantity > 0) {
      acc[size] = quantity;
    }
    return acc;
  }, {});

function ProductionOrderForm({ orderId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    code: "",
    orderType: "NORMAL",
    customerId: "",
    customerName: "",
    customerAddress: "",
    customerPhone: "",
    customerTaxId: "",
    sellerName: "",
    startDate: "",
    deliveryDate: "",
    observations: "",
    shippingCost: "",
    packingItems: [],
    status: "PENDING",
    items: [],
    distributionId: null,
    distributionNumber: null,
    distributionDate: null,
    distributionShipments: [],
  });
  const [availableProducts, setAvailableProducts] = useState([]);
  const [availableColors, setAvailableColors] = useState([]);
  const [availableCustomers, setAvailableCustomers] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Formulario para agregar items
  const [itemForm, setItemForm] = useState(createEmptyItemForm);
  const [itemErrors, setItemErrors] = useState({});
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [packingMaterials, setPackingMaterials] = useState([]);
  const [packingForm, setPackingForm] = useState({ materialId: "", quantity: "", unitPrice: "" });
  const [cinchoMaterialsInfo, setCinchoMaterialsInfo] = useState(null);
  const [shipmentModalOpen, setShipmentModalOpen] = useState(false);
  const [opvPriceReviewOpen, setOpvPriceReviewOpen] = useState(false);

  const showItemUnitPrice =
    formData.orderType === "MARCAS" || isLuisFelipeVendorFlow(formData.orderType, formData.sellerName);

  const productCatalogById = useMemo(() => {
    const map = {};
    (availableProducts || []).forEach((p) => {
      if (p?.id != null) {
        map[p.id] = p;
      }
    });
    return map;
  }, [availableProducts]);

  useEffect(() => {
    if (isOpen) {
      loadProducts();
      loadColors();
      loadCustomers();
      loadPackingMaterials();
      if (orderId) {
        loadOrder();
      } else {
        resetForm();
      }
    }
  }, [isOpen, orderId]);

  useEffect(() => {
    if (!isOpen || !orderId || !isOnlineSaleOrKioskOrder(formData.orderType)) {
      setCinchoMaterialsInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await validateMaterials(orderId);
        if (!cancelled) {
          setCinchoMaterialsInfo(data);
        }
      } catch {
        if (!cancelled) {
          setCinchoMaterialsInfo(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, orderId, formData.orderType]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProductDropdown && !event.target.closest('[data-product-search]')) {
        setShowProductDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProductDropdown]);

  const loadProducts = async () => {
    try {
      const products = await getProducts();
      setAvailableProducts(products || []);
    } catch (err) {
      console.error("Error al cargar productos:", err);
    }
  };

  const loadColors = async () => {
    try {
      const colors = await getColors();
      setAvailableColors(colors || []);
    } catch (err) {
      console.error("Error al cargar colores:", err);
    }
  };

  const loadCustomers = async () => {
    try {
      const customers = await getCustomers();
      setAvailableCustomers(customers || []);
    } catch (err) {
      console.error("Error al cargar clientes:", err);
    }
  };

  const loadOrder = async () => {
    try {
      setLoading(true);
      const order = await getProductionOrderById(orderId);
      setFormData({
        code: order.code || "",
        orderType: order.orderType || "NORMAL",
        customerId: order.customerId || "",
        customerName: order.customerName || "",
        customerAddress: order.customerAddress || "",
        customerPhone: order.customerPhone || "",
        customerTaxId: order.customerTaxId || "",
        sellerName: isLuisFelipeSeller(order.sellerName) ? "LUIS FELIPE" : (order.sellerName || ""),
        startDate: order.startDate
          ? new Date(order.startDate).toISOString().split("T")[0]
          : "",
        deliveryDate: order.deliveryDate
          ? new Date(order.deliveryDate).toISOString().split("T")[0]
          : "",
        observations: order.observations || "",
        shippingCost: order.shippingCost ?? "",
        packingItems: order.packingItems || [],
        vendorShipmentNumber: order.vendorShipmentNumber || "",
        status: order.status || "PENDING",
        items: order.items || [],
        distributionId: order.distributionId || null,
        distributionNumber: order.distributionNumber || null,
        distributionDate: order.distributionDate || null,
        distributionShipments: order.distributionShipments || [],
      });
    } catch (err) {
      setError(err.message || "Error al cargar la orden de producción");
      showError(err.message || "Error al cargar la orden de producción");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      orderType: "NORMAL",
      customerId: "",
      customerName: "",
      customerAddress: "",
      customerPhone: "",
      customerTaxId: "",
      sellerName: "",
      startDate: "",
      deliveryDate: "",
      observations: "",
      shippingCost: "",
      packingItems: [],
      status: "PENDING",
      items: [],
      distributionId: null,
      distributionNumber: null,
      distributionDate: null,
      distributionShipments: [],
    });
    setItemForm(createEmptyItemForm());
    setProductSearch("");
    setShowProductDropdown(false);
    setCinchoMaterialsInfo(null);
    setErrors({});
    setItemErrors({});
    setError("");
  };

  const loadPackingMaterials = async () => {
    try {
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
        setPackingMaterials([]);
        return;
      }
      const data = await response.json();
      const rows = Array.isArray(data) ? data : Array.isArray(data?.content) ? data.content : [];
      setPackingMaterials(rows.filter((item) => String(item.sku || "").toUpperCase().startsWith("SUM-")));
    } catch (_err) {
      setPackingMaterials([]);
    }
  };

  const validate = () => {
    const newErrors = {};
    // El código es opcional, se genera automáticamente si no se proporciona
    if (!formData.orderType) newErrors.orderType = "El tipo de orden es requerido";
    if (formData.orderType !== "DISTRIBUTION" && formData.items.length === 0) {
      newErrors.items = "Debe agregar al menos un item";
    } else if (formData.orderType === "MARCAS" && formData.items.some((item) => !item.brandName)) {
      newErrors.items = "Todos los productos de una orden MARCAS deben tener marca";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateItem = () => {
    const newErrors = {};
    if (!itemForm.productId) newErrors.productId = "El producto es requerido";
    if (formData.orderType === "MARCAS" && !itemForm.brandName) {
      newErrors.brandName = "La marca es requerida para este producto";
    }

    if (isCinchoOrderType(formData.orderType)) {
      const hasColors = (itemForm.colorIds || []).length > 0;
      const hasSelectedSizes = (itemForm.selectedSizes || []).length > 0;
      const hasSizes = (itemForm.colorIds || []).some((colorId) =>
        Object.keys(getPositiveSizes(itemForm.colorSizes?.[colorId] || {})).length > 0
      );

      if (!hasColors) {
        newErrors.colors = "Seleccione al menos un color";
      }
      if (!hasSelectedSizes) {
        newErrors.sizes = "Seleccione al menos una talla";
      }
      if (!hasSizes) {
        newErrors.quantities = "Ingrese al menos una cantidad por color y talla";
      }
    } else {
      if (!itemForm.quantity || parseInt(itemForm.quantity) <= 0) {
        newErrors.quantity = "La cantidad debe ser mayor a 0";
      }
    }

    setItemErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const defaultUnitPriceForProduct = (productId) => {
    const item = { productId, unitPrice: itemForm.unitPrice };
    return resolveDefaultOpvUnitPrice(item, productCatalogById);
  };

  const handleAddItem = () => {
    if (!validateItem()) return;

    const productId = parseInt(itemForm.productId);
    const lineUnitPrice = showItemUnitPrice
      ? Number(itemForm.unitPrice) || defaultUnitPriceForProduct(productId)
      : undefined;
    const newItems = isCinchoOrderType(formData.orderType)
      ? (itemForm.colorIds || [])
          .map((colorId) => {
            const sizes = getPositiveSizes(itemForm.colorSizes?.[colorId] || {});
            if (Object.keys(sizes).length === 0) {
              return null;
            }
            return {
              productId,
              colorId: parseInt(colorId),
              brandName: null,
              quantity: null,
              sizes,
              observations: itemForm.observations || "",
              unitPrice: lineUnitPrice,
            };
          })
          .filter(Boolean)
      : [
          {
            productId,
            colorId: itemForm.colorId ? parseInt(itemForm.colorId) : null,
            brandName: formData.orderType === "MARCAS" ? itemForm.brandName : null,
            quantity: parseInt(itemForm.quantity),
            sizes: null,
            observations: itemForm.observations || "",
            unitPrice: lineUnitPrice,
          },
        ];

    setFormData({
      ...formData,
      items: [...formData.items, ...newItems],
    });

    setItemForm(createEmptyItemForm());
    setProductSearch("");
    setShowProductDropdown(false);
    setItemErrors({});
  };

  const handleRemoveItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      items: newItems,
    });
  };

  const handleCinchoSizeToggle = (size) => {
    setItemForm((prev) => {
      const selectedSizes = new Set(prev.selectedSizes || []);
      const colorSizes = { ...(prev.colorSizes || {}) };

      if (selectedSizes.has(size)) {
        selectedSizes.delete(size);
        Object.keys(colorSizes).forEach((colorId) => {
          const sizes = { ...(colorSizes[colorId] || {}) };
          delete sizes[size];
          colorSizes[colorId] = sizes;
        });
      } else {
        selectedSizes.add(size);
      }

      return {
        ...prev,
        selectedSizes: AVAILABLE_SIZES.filter((availableSize) => selectedSizes.has(availableSize)),
        colorSizes,
      };
    });
  };

  const handleCinchoColorToggle = (colorId) => {
    const colorKey = colorId.toString();
    setItemForm((prev) => {
      const colorIds = new Set(prev.colorIds || []);
      const colorSizes = { ...(prev.colorSizes || {}) };

      if (colorIds.has(colorKey)) {
        colorIds.delete(colorKey);
        delete colorSizes[colorKey];
      } else {
        colorIds.add(colorKey);
        colorSizes[colorKey] = colorSizes[colorKey] || {};
      }

      return {
        ...prev,
        colorIds: Array.from(colorIds),
        colorSizes,
      };
    });
  };

  const handleCinchoQuantityChange = (colorId, size, value) => {
    const colorKey = colorId.toString();
    const qty = parseInt(value) || 0;
    setItemForm((prev) => {
      const colorSizes = { ...(prev.colorSizes || {}) };
      const sizes = { ...(colorSizes[colorKey] || {}) };

      if (qty > 0) {
        sizes[size] = qty;
      } else {
        delete sizes[size];
      }

      colorSizes[colorKey] = sizes;
      return { ...prev, colorSizes };
    });
  };

  const getCinchoColorTotal = (colorId) =>
    Object.values(itemForm.colorSizes?.[colorId] || {}).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);

  const getSelectedCinchoColors = () =>
    (itemForm.colorIds || [])
      .map((colorId) => availableColors.find((color) => color.id === parseInt(colorId)))
      .filter(Boolean);

  const clearCinchoSelection = () => {
    setItemForm((prev) => ({
      ...prev,
      colorIds: [],
      selectedSizes: [],
      colorSizes: {},
    }));
  };

  const getProductName = (productId) => {
    if (!productId) return "-";
    const product = availableProducts.find((p) => p.id === productId);
    return product ? `${product.code} - ${product.name || ""}` : `ID: ${productId}`;
  };

  const filteredProducts = availableProducts.filter((product) => {
    if (!productSearch.trim()) return true;
    const searchLower = productSearch.toLowerCase();
    const code = (product.code || "").toLowerCase();
    const name = (product.name || "").toLowerCase();
    return code.includes(searchLower) || name.includes(searchLower);
  });

  const handleProductSelect = (productId) => {
    setItemForm((prev) => {
      const next = { ...prev, productId: productId.toString() };
      if (showItemUnitPrice) {
        const price = resolveDefaultOpvUnitPrice(
          { productId, unitPrice: prev.unitPrice },
          productCatalogById
        );
        next.unitPrice = price > 0 ? String(price) : "";
      }
      return next;
    });
    setProductSearch("");
    setShowProductDropdown(false);
  };

  const handleProductSearchChange = (e) => {
    const value = e.target.value;
    setProductSearch(value);
    setShowProductDropdown(true);
    if (!value) {
      setItemForm((prev) => ({ ...prev, productId: "" }));
    }
  };

  const getColorName = (colorId) => {
    if (!colorId) return "-";
    const color = availableColors.find((c) => c.id === colorId);
    return color ? color.name : `ID: ${colorId}`;
  };

  const getTotalQuantity = (item) => {
    if (item.sizes) {
      return Object.values(item.sizes).reduce((sum, qty) => sum + (qty || 0), 0);
    }
    return item.quantity || 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      showError("Por favor complete todos los campos requeridos");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const submitData = {
        code: formData.code && formData.code.trim() ? formData.code.trim() : null,
        orderType: formData.orderType,
        customerId: formData.customerId || null,
        customerName: formData.customerName || null,
        sellerName: formData.sellerName || null,
        startDate: formData.startDate || null,
        deliveryDate: formData.deliveryDate || null,
        observations: formData.observations || null,
        shippingCost: formData.shippingCost ? parseFloat(formData.shippingCost) : 0,
        packingItems: (formData.packingItems || []).map((item) => ({
          materialId: Number(item.materialId),
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
        })),
        status: formData.status,
        items: formData.items.map((item) => ({
          productId: item.productId,
          colorId: item.colorId,
          brandName: formData.orderType === "MARCAS" ? item.brandName || null : null,
          quantity: item.quantity,
          sizes: item.sizes,
          observations: item.observations,
          unitPrice: showItemUnitPrice ? Number(item.unitPrice) || 0 : undefined,
        })),
      };

      if (orderId) {
        await updateProductionOrder(orderId, submitData);
        showSuccess("Orden de producción actualizada correctamente");
        if (isOnlineSaleOrKioskOrder(formData.orderType)) {
          try {
            setCinchoMaterialsInfo(await validateMaterials(orderId));
          } catch {
            setCinchoMaterialsInfo(null);
          }
        }
      } else {
        await createProductionOrder(submitData);
        showSuccess("Orden de producción creada correctamente");
      }

      resetForm();
      onSuccess();
    } catch (err) {
      const errorMessage = err.message || "Error al guardar la orden de producción";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOrderTypeChange = (newType) => {
    // Limpiar items cuando cambia el tipo
    setFormData({
      ...formData,
      orderType: newType,
      items: [],
      packingItems: isLuisFelipeVendorFlow(newType, formData.sellerName) ? formData.packingItems : [],
    });
    setItemForm(createEmptyItemForm());
  };

  const handleAddPackingItem = () => {
    const materialId = Number(packingForm.materialId);
    const quantity = Number(packingForm.quantity);
    const unitPrice = Number(packingForm.unitPrice || 0);
    if (!materialId || !Number.isFinite(quantity) || quantity <= 0) {
      showError("Selecciona empaque y cantidad válida.");
      return;
    }
    const material = packingMaterials.find((m) => Number(m.id) === materialId);
    setFormData((prev) => ({
      ...prev,
      packingItems: [
        ...(prev.packingItems || []),
        {
          materialId,
          quantity,
          unitPrice,
          materialCode: material?.sku || "",
          materialName: material?.name || "",
        },
      ],
    }));
    setPackingForm({ materialId: "", quantity: "", unitPrice: "" });
  };

  const handleRemovePackingItem = (idx) => {
    setFormData((prev) => ({
      ...prev,
      packingItems: (prev.packingItems || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>
        {orderId ? "Editar Orden de Producción" : "Nueva Orden de Producción"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && (
            <Alert color="danger" style={{ whiteSpace: "pre-line" }}>
              {error}
            </Alert>
          )}
          {cinchoMaterialsInfo &&
            cinchoMaterialsInfo.cinchoAllAvailable === false && (
              <Alert color="warning">
                <strong>Materiales insuficientes en líneas cincho</strong>
                <p className="mb-2 small">
                  La orden puede guardarse; revise stock para las piezas cincho antes de fabricarlas.
                </p>
                {cinchoMaterialsInfo.cinchoShortageMessage && (
                  <div className="small mb-2" style={{ whiteSpace: "pre-line" }}>
                    {cinchoMaterialsInfo.cinchoShortageMessage}
                  </div>
                )}
                {!cinchoMaterialsInfo.cinchoShortageMessage &&
                  cinchoMaterialsInfo.shortageMessage && (
                    <div className="small mb-2" style={{ whiteSpace: "pre-line" }}>
                      {cinchoMaterialsInfo.shortageMessage}
                    </div>
                  )}
                {Array.isArray(cinchoMaterialsInfo.byOrderItem) &&
                  cinchoMaterialsInfo.byOrderItem.some(
                    (row) =>
                      row.isCinchoLine && row.hasBom && row.allAvailable === false
                  ) && (
                    <ul className="small mb-0 pl-3">
                      {cinchoMaterialsInfo.byOrderItem
                        .filter(
                          (row) =>
                            row.isCinchoLine && row.hasBom && row.allAvailable === false
                        )
                        .map((row) => (
                          <li key={row.productionOrderItemId || row.productId}>
                            {row.productCode || `Producto #${row.productId}`}
                            {Array.isArray(row.materials) &&
                              row.materials.some((m) => m.sufficient === false) && (
                                <span className="text-muted">
                                  {" "}
                                  (
                                  {row.materials
                                    .filter((m) => m.sufficient === false)
                                    .map(
                                      (m) =>
                                        `${m.materialName}: req. ${m.required}, disp. ${m.available}`
                                    )
                                    .join("; ")}
                                  )
                                </span>
                              )}
                          </li>
                        ))}
                    </ul>
                  )}
              </Alert>
            )}

          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Código de Orden</Label>
                <Input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="Se genera automáticamente"
                  invalid={!!errors.code}
                  disabled={loading || !orderId}
                  readOnly={!orderId}
                />
                {errors.code && <div className="text-danger small">{errors.code}</div>}
                <small className="text-muted">
                  {!orderId
                    ? "Se genera automáticamente por correlativo según tipo/origen (OPK/OPV/OPI/OPC cinchos unificado, OPD/OPL/OPCK). Códigos antiguos OPCF/OPCM siguen en la serie OPC."
                    : "El código no puede modificarse después de crear la orden"}
                </small>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Tipo de Orden *</Label>
                <Input
                  type="select"
                  value={formData.orderType}
                  onChange={(e) => handleOrderTypeChange(e.target.value)}
                  invalid={!!errors.orderType}
                  disabled={loading || !!orderId}
                >
                  <option value="NORMAL">
                    NORMAL (Productos estándar, prefijo OPK; con vendedor Luis Felipe correlativo OPV-)
                  </option>
                  <option value="MARCAS">MARCAS / OPV (Marcas conocidas, prefijo OPV-)</option>
                  {(!isLuisFelipeSeller(formData.sellerName) ||
                    (orderId && isClienteKioskoOrder(formData.orderType))) && (
                    <option value="CLIENTE_KIOSKO">CLIENTE KIOSKO (Prioridad alta, prefijo OPCK)</option>
                  )}
                  <option value="INTERNA">INTERNA (OPI — producción interna)</option>
                  <option value="CINCHOS_FOSSILES">CINCHOS (prefijo OPC, tallas y colores)</option>
                  {formData.orderType === "CINCHOS_MARCAS" && (
                    <option value="CINCHOS_MARCAS">CINCHOS MARCAS (solo edición — histórico)</option>
                  )}
                  {formData.orderType === "CINCHOS" && (
                    <option value="CINCHOS">CINCHOS (Histórico)</option>
                  )}
                  {formData.orderType === "DISTRIBUTION" && (
                    <option value="DISTRIBUTION">DISTRIBUCIÓN (Generada automáticamente)</option>
                  )}
                </Input>
                {errors.orderType && <div className="text-danger small">{errors.orderType}</div>}
              </FormGroup>
            </Col>
          </Row>

          {isLuisFelipeVendorFlow(formData.orderType, formData.sellerName) && (
            <>
              <hr />
              <h5 className="mb-3">Empaques y costo de envío (Luis Felipe)</h5>
              <Row>
                <Col md="3">
                  <FormGroup>
                    <Label>Costo de envío (Q)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.shippingCost}
                      onChange={(e) => setFormData({ ...formData, shippingCost: e.target.value })}
                      placeholder="0.00"
                    />
                  </FormGroup>
                </Col>
              </Row>
              <Row>
                <Col md="5">
                  <FormGroup>
                    <Label>Empaque SUM-</Label>
                    <Input
                      type="select"
                      value={packingForm.materialId}
                      onChange={(e) => setPackingForm({ ...packingForm, materialId: e.target.value })}
                    >
                      <option value="">Seleccione empaque</option>
                      {packingMaterials.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sku} - {item.name}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={packingForm.quantity}
                      onChange={(e) => setPackingForm({ ...packingForm, quantity: e.target.value })}
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>P.Unitario</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={packingForm.unitPrice}
                      onChange={(e) => setPackingForm({ ...packingForm, unitPrice: e.target.value })}
                    />
                  </FormGroup>
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <Button color="info" onClick={handleAddPackingItem} block>
                    Agregar empaque
                  </Button>
                </Col>
              </Row>
              {(formData.packingItems || []).length > 0 && (
                <Table responsive size="sm">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Empaque</th>
                      <th>Cantidad</th>
                      <th>P.Unitario</th>
                      <th>Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.packingItems || []).map((item, idx) => (
                      <tr key={`${item.materialId}-${idx}`}>
                        <td>{item.materialCode || `SUM-${item.materialId}`}</td>
                        <td>{item.materialName || "Empaque"}</td>
                        <td>{item.quantity}</td>
                        <td>{Number(item.unitPrice || 0).toFixed(2)}</td>
                        <td>{(Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2)}</td>
                        <td className="text-right">
                          <Button color="danger" size="sm" onClick={() => handleRemovePackingItem(idx)}>
                            Quitar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </>
          )}

          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Cliente</Label>
                <Input
                  type="select"
                  value={formData.customerId}
                  onChange={(e) => {
                    const rawId = e.target.value;
                    const selected = rawId
                      ? availableCustomers.find((c) => String(c.id) === String(rawId))
                      : null;
                    const catalogFields = customerFieldsFromCatalog(selected);
                    setFormData({
                      ...formData,
                      customerId: rawId,
                      customerName: selected?.name || "",
                      ...catalogFields,
                    });
                  }}
                  disabled={loading}
                >
                  <option value="">Seleccione un cliente (opcional)</option>
                  {availableCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Input>
                <small className="text-muted">O ingrese el nombre del cliente manualmente abajo</small>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Nombre de Cliente (si no está en la lista)</Label>
                <Input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="Ej: KIOSCOS, TERNOS PALAZZO"
                  disabled={loading || !!formData.customerId}
                />
              </FormGroup>
            </Col>
          </Row>

          {isLuisFelipeVendorFlow(formData.orderType, formData.sellerName) && (
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>Dirección de envío</Label>
                  <Input
                    type="textarea"
                    rows={2}
                    value={formData.customerAddress}
                    onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
                    placeholder="Dirección del cliente"
                    disabled={loading}
                  />
                </FormGroup>
              </Col>
              <Col md="3">
                <FormGroup>
                  <Label>Teléfono</Label>
                  <Input
                    type="text"
                    value={formData.customerPhone}
                    onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                    disabled={loading}
                  />
                </FormGroup>
              </Col>
              <Col md="3">
                <FormGroup>
                  <Label>NIT</Label>
                  <Input
                    type="text"
                    value={formData.customerTaxId}
                    onChange={(e) => setFormData({ ...formData, customerTaxId: e.target.value })}
                    disabled={loading}
                  />
                </FormGroup>
              </Col>
            </Row>
          )}

          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Vendedor</Label>
                <Input
                  type="select"
                  value={formData.sellerName}
                  onChange={(e) => {
                    const nextSeller = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      sellerName: nextSeller,
                      packingItems: isLuisFelipeVendorFlow(prev.orderType, nextSeller)
                        ? prev.packingItems
                        : [],
                    }));
                  }}
                  disabled={loading}
                >
                  <option value="">Seleccione vendedor</option>
                  {[...new Set([...SELLER_OPTIONS, formData.sellerName].filter(Boolean))].map((seller) => (
                    <option key={seller} value={seller}>{seller}</option>
                  ))}
                </Input>
                {isLuisFelipeVendorFlow(formData.orderType, formData.sellerName) && (
                  <small className="text-muted d-block mt-1">
                    Esta orden seguirá flujo OPV de vendedor (empaques, ENVP y formato especial de envíos).
                  </small>
                )}
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Fecha Inicio Producción</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  disabled={loading}
                />
                <small className="text-muted">Desde cuándo se puede producir</small>
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Fecha de Entrega</Label>
                <Input
                  type="date"
                  value={formData.deliveryDate}
                  onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                  disabled={loading}
                />
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="12">
              <FormGroup>
                <Label>Observaciones</Label>
                <Input
                  type="textarea"
                  rows="2"
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  placeholder="Observaciones generales de la orden"
                  disabled={loading}
                />
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="12">
              <FormGroup>
                <Label>Estado actual</Label>
                <div>
                  <Badge color="info">{STATUS_LABELS[formData.status] || formData.status || "Pendiente"}</Badge>
                </div>
                <small className="text-muted">
                  El estado se controla automáticamente por el flujo de tareas y despacho.
                </small>
              </FormGroup>
            </Col>
          </Row>

          {/* Detalle de distribución (solo para órdenes tipo DISTRIBUTION) */}
          {formData.orderType === "DISTRIBUTION" && formData.distributionNumber && (
            <>
              <hr />
              <h5 className="mb-3">
                <i className="nc-icon nc-delivery-fast mr-1" />
                Distribución Vinculada{" "}
                <Badge color="warning">{formData.distributionNumber}</Badge>
              </h5>
              <Row className="mb-3">
                <Col md="4">
                  <Label><strong>Número de Distribución</strong></Label>
                  <p>{formData.distributionNumber}</p>
                </Col>
                <Col md="4">
                  <Label><strong>Fecha de Distribución</strong></Label>
                  <p>
                    {formData.distributionDate
                      ? new Date(formData.distributionDate).toLocaleDateString("es-GT")
                      : "N/A"}
                  </p>
                </Col>
                <Col md="4">
                  <Label><strong>Total de Envíos</strong></Label>
                  <p>
                    <Badge color="info">{formData.distributionShipments?.length || 0}</Badge>
                  </p>
                </Col>
              </Row>

              {/* Detalle de envíos */}
              {formData.distributionShipments && formData.distributionShipments.length > 0 && (
                <Card className="mb-3" style={{ backgroundColor: "#f0f8ff" }}>
                  <CardBody>
                    <h6 className="mb-2">Envíos por Kiosko</h6>
                    {formData.distributionShipments.map((shipment) => (
                      <div key={shipment.id} className="mb-3 p-2" style={{ backgroundColor: "white", borderRadius: "4px", border: "1px solid #e0e0e0" }}>
                        <Row>
                          <Col md="4">
                            <small className="text-muted">Envío</small>
                            <p className="mb-1"><strong>{shipment.shipmentNumber}</strong></p>
                          </Col>
                          <Col md="4">
                            <small className="text-muted">Kiosko</small>
                            <p className="mb-1">{shipment.locationName} ({shipment.locationCode})</p>
                          </Col>
                          <Col md="4">
                            <small className="text-muted">Estado</small>
                            <p className="mb-1">
                              <Badge color={shipment.status === "CONFIRMED" ? "info" : "secondary"}>
                                {shipment.status}
                              </Badge>
                            </p>
                          </Col>
                        </Row>
                        {shipment.products && shipment.products.length > 0 && (
                          <Table responsive size="sm" className="mb-0 mt-1">
                            <thead>
                              <tr>
                                <th>Código</th>
                                <th>Producto</th>
                                <th>Color</th>
                                <th>Cantidad</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shipment.products.map((product) => (
                                <tr key={product.id}>
                                  <td><small>{product.productCode}</small></td>
                                  <td><small>{product.productName}</small></td>
                                  <td>
                                    {product.colorName
                                      ? <Badge color="warning" style={{ fontSize: "10px" }}>{product.colorName}</Badge>
                                      : <small className="text-muted">-</small>}
                                  </td>
                                  <td><Badge color="success">{parseFloat(product.quantity).toFixed(0)}</Badge></td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        )}
                      </div>
                    ))}
                  </CardBody>
                </Card>
              )}
            </>
          )}

          <hr />
          <h5 className="mb-3">
            {formData.orderType === "DISTRIBUTION" ? "Productos Totales" : "Items de la Orden"}{" "}
            <Badge color="info">{formData.items.length} item(s) agregado(s)</Badge>
          </h5>

          {errors.items && <div className="text-danger small mb-2">{errors.items}</div>}

          {/* Formulario para agregar items (oculto para DISTRIBUTION) */}
          {formData.orderType !== "DISTRIBUTION" && (
          <Card className="mb-3" style={{ backgroundColor: "#f8f9fa" }}>
            <CardBody>
              <Row>
                <Col md={isCinchoOrderType(formData.orderType) ? "12" : "6"}>
                  <FormGroup>
                    <Label>Producto *</Label>
                    <div style={{ position: "relative" }} data-product-search>
                      <Input
                        type="text"
                        value={itemForm.productId 
                          ? getProductName(parseInt(itemForm.productId))
                          : productSearch
                        }
                        onChange={handleProductSearchChange}
                        onFocus={() => {
                          if (!itemForm.productId) {
                            setShowProductDropdown(true);
                          }
                        }}
                        placeholder="Buscar producto por código o nombre..."
                        invalid={!!itemErrors.productId}
                        disabled={loading}
                        autoComplete="off"
                      />
                      {showProductDropdown && !itemForm.productId && filteredProducts.length > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            zIndex: 1000,
                            width: "100%",
                            maxHeight: "300px",
                            overflowY: "auto",
                            backgroundColor: "white",
                            border: "1px solid #ced4da",
                            borderRadius: "0.25rem",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                            marginTop: "2px",
                          }}
                        >
                          {filteredProducts.map((product) => (
                            <div
                              key={product.id}
                              onClick={() => handleProductSelect(product.id)}
                              style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                borderBottom: "1px solid #f0f0f0",
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.backgroundColor = "#f8f9fa";
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.backgroundColor = "white";
                              }}
                            >
                              <strong>{product.code}</strong> - {product.name || "Sin nombre"}
                            </div>
                          ))}
                        </div>
                      )}
                      {showProductDropdown && !itemForm.productId && productSearch && filteredProducts.length === 0 && (
                        <div
                          style={{
                            position: "absolute",
                            zIndex: 1000,
                            width: "100%",
                            backgroundColor: "white",
                            border: "1px solid #ced4da",
                            borderRadius: "0.25rem",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                            marginTop: "2px",
                            padding: "8px 12px",
                            color: "#6c757d",
                          }}
                        >
                          No se encontraron productos
                        </div>
                      )}
                    </div>
                    {itemForm.productId && (
                      <Button
                        type="button"
                        color="link"
                        size="sm"
                        onClick={() => {
                          setItemForm((prev) => ({ ...prev, productId: "" }));
                          setProductSearch("");
                          setShowProductDropdown(false);
                        }}
                        className="p-0 mt-1"
                      >
                        <small>Limpiar selección</small>
                      </Button>
                    )}
                    {itemErrors.productId && (
                      <div className="text-danger small">{itemErrors.productId}</div>
                    )}
                  </FormGroup>
                </Col>

                {!isCinchoOrderType(formData.orderType) && (
                  <>
                    <Col md="3">
                      <FormGroup>
                        <Label>Color</Label>
                        <Input
                          type="select"
                          value={itemForm.colorId}
                          onChange={(e) => setItemForm({ ...itemForm, colorId: e.target.value })}
                          disabled={loading}
                        >
                          <option value="">Sin color (opcional)</option>
                          {availableColors.map((color) => (
                            <option key={color.id} value={color.id}>
                              {color.name}
                            </option>
                          ))}
                        </Input>
                      </FormGroup>
                    </Col>
                    {formData.orderType === "MARCAS" && (
                      <Col md="3">
                        <FormGroup>
                          <Label>Marca *</Label>
                          <Input
                            type="select"
                            value={itemForm.brandName}
                            onChange={(e) => setItemForm({ ...itemForm, brandName: e.target.value })}
                            invalid={!!itemErrors.brandName}
                            disabled={loading}
                          >
                            <option value="">Seleccione marca</option>
                            {BRAND_OPTIONS.map((brand) => (
                              <option key={brand} value={brand}>
                                {brand}
                              </option>
                            ))}
                          </Input>
                          {itemErrors.brandName && (
                            <div className="text-danger small">{itemErrors.brandName}</div>
                          )}
                        </FormGroup>
                      </Col>
                    )}
                    {showItemUnitPrice && (
                      <Col md="3">
                        <FormGroup>
                          <Label>Precio unitario (Q)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={itemForm.unitPrice}
                            onChange={(e) => setItemForm({ ...itemForm, unitPrice: e.target.value })}
                            placeholder="Precio especial"
                            disabled={loading}
                          />
                        </FormGroup>
                      </Col>
                    )}
                    <Col md="3">
                      <FormGroup>
                        <Label>Cantidad *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={itemForm.quantity}
                          onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                          placeholder="Cantidad"
                          invalid={!!itemErrors.quantity}
                          disabled={loading}
                        />
                        {itemErrors.quantity && (
                          <div className="text-danger small">{itemErrors.quantity}</div>
                        )}
                      </FormGroup>
                    </Col>
                  </>
                )}

                {isCinchoOrderType(formData.orderType) && (
                  <>
                    <Col md="4">
                      <FormGroup>
                        <div className="d-flex justify-content-between align-items-center">
                          <Label>Colores *</Label>
                          {(itemForm.colorIds || []).length > 0 && (
                            <Button type="button" color="link" size="sm" className="p-0" onClick={clearCinchoSelection}>
                              Limpiar
                            </Button>
                          )}
                        </div>
                        <div
                          className="border rounded bg-white p-2"
                          style={{ maxHeight: "220px", overflowY: "auto" }}
                        >
                          {availableColors.map((color) => {
                            const colorId = color.id.toString();
                            return (
                              <FormGroup check key={color.id} className="mb-1">
                                <Label check>
                                  <Input
                                    type="checkbox"
                                    checked={(itemForm.colorIds || []).includes(colorId)}
                                    onChange={() => handleCinchoColorToggle(color.id)}
                                    disabled={loading}
                                  />{" "}
                                  {color.name}
                                </Label>
                              </FormGroup>
                            );
                          })}
                          {availableColors.length === 0 && (
                            <small className="text-muted">No hay colores disponibles.</small>
                          )}
                        </div>
                        {itemErrors.colors && (
                          <div className="text-danger small mt-1">{itemErrors.colors}</div>
                        )}
                        <small className="text-muted">
                          Puede seleccionar varios colores para el mismo producto.
                        </small>
                      </FormGroup>
                    </Col>

                    <Col md="8">
                      <FormGroup>
                        <Label>Tallas *</Label>
                        <div className="d-flex flex-wrap gap-2">
                          {AVAILABLE_SIZES.map((size) => {
                            const selected = (itemForm.selectedSizes || []).includes(size);
                            return (
                              <Button
                                type="button"
                                key={size}
                                color={selected ? "primary" : "secondary"}
                                outline={!selected}
                                size="sm"
                                onClick={() => handleCinchoSizeToggle(size)}
                                disabled={loading}
                                className="mb-1"
                              >
                                {size}
                              </Button>
                            );
                          })}
                        </div>
                        {itemErrors.sizes && (
                          <div className="text-danger small mt-1">{itemErrors.sizes}</div>
                        )}
                        <small className="text-muted">
                          Seleccione las tallas que usará y luego capture cantidades por color.
                        </small>
                      </FormGroup>
                    </Col>

                    {(itemForm.colorIds || []).length > 0 && (itemForm.selectedSizes || []).length > 0 && (
                      <Col md="12">
                        <FormGroup>
                          <Label>Cantidades por color y talla *</Label>
                          <Table responsive size="sm" bordered className="bg-white mb-2">
                            <thead>
                              <tr>
                                <th style={{ minWidth: "140px" }}>Color</th>
                                {(itemForm.selectedSizes || []).map((size) => (
                                  <th key={size} className="text-center" style={{ minWidth: "72px" }}>
                                    {size}
                                  </th>
                                ))}
                                <th className="text-center" style={{ minWidth: "70px" }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {getSelectedCinchoColors().map((color) => {
                                const colorId = color.id.toString();
                                return (
                                  <tr key={color.id}>
                                    <td>{color.name}</td>
                                    {(itemForm.selectedSizes || []).map((size) => (
                                      <td key={`${color.id}-${size}`}>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={itemForm.colorSizes?.[colorId]?.[size] || ""}
                                          onChange={(e) => handleCinchoQuantityChange(color.id, size, e.target.value)}
                                          placeholder="0"
                                          disabled={loading}
                                        />
                                      </td>
                                    ))}
                                    <td className="text-center font-weight-bold">
                                      {getCinchoColorTotal(colorId)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </Table>
                          {itemErrors.quantities && (
                            <div className="text-danger small">{itemErrors.quantities}</div>
                          )}
                        </FormGroup>
                      </Col>
                    )}
                  </>
                )}
              </Row>

              <Row>
                <Col md="12">
                  <FormGroup>
                    <Label>Observaciones del Item</Label>
                    <Input
                      type="text"
                      value={itemForm.observations}
                      onChange={(e) => setItemForm({ ...itemForm, observations: e.target.value })}
                      placeholder="Ej: DISEÑO/METAL, PERFORADO/METAL"
                      disabled={loading}
                    />
                  </FormGroup>
                </Col>
              </Row>

              <Button
                type="button"
                color="success"
                onClick={handleAddItem}
                disabled={loading}
                className="btn-round"
              >
                <i className="fa fa-plus" /> Agregar Item
              </Button>
            </CardBody>
          </Card>
          )}

          {/* Tabla de items agregados */}
          {formData.items.length > 0 && (
            <Table responsive className="mt-3">
              <thead>
                <tr>
                  <th>Producto</th>
                  {formData.orderType === "MARCAS" && <th>Marca</th>}
                  {showItemUnitPrice && <th className="text-right">P. unit. (Q)</th>}
                  <th>Color</th>
                  {isCinchoOrderType(formData.orderType) ? (
                    <th>Tallas</th>
                  ) : (
                    <th>Cantidad</th>
                  )}
                  <th>Total</th>
                  <th>Observaciones</th>
                  {formData.orderType !== "DISTRIBUTION" && <th className="text-right">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {formData.items.map((item, index) => (
                  <tr key={index}>
                    <td>{getProductName(item.productId)}</td>
                    {formData.orderType === "MARCAS" && <td>{item.brandName || "-"}</td>}
                    {showItemUnitPrice && (
                      <td className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          bsSize="sm"
                          style={{ maxWidth: 110, marginLeft: "auto" }}
                          value={item.unitPrice != null ? item.unitPrice : ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              items: prev.items.map((row, i) =>
                                i === index ? { ...row, unitPrice: value } : row
                              ),
                            }));
                          }}
                          disabled={loading}
                        />
                      </td>
                    )}
                    <td>{getColorName(item.colorId)}</td>
                    {isCinchoOrderType(formData.orderType) ? (
                      <td>
                        {item.sizes && Object.keys(item.sizes).length > 0 ? (
                          <div className="d-flex flex-wrap gap-1">
                            {Object.entries(item.sizes)
                              .filter(([_, qty]) => qty > 0)
                              .map(([size, qty]) => (
                                <Badge key={size} color="info">
                                  {size}: {qty}
                                </Badge>
                              ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    ) : (
                      <td>
                        <strong>{item.quantity}</strong>
                      </td>
                    )}
                    <td>
                      <strong>{getTotalQuantity(item)}</strong>
                    </td>
                    <td>
                      <small>{item.observations || "-"}</small>
                    </td>
                    {formData.orderType !== "DISTRIBUTION" && (
                      <td className="text-right">
                        <Button
                          color="danger"
                          size="sm"
                          onClick={() => handleRemoveItem(index)}
                          disabled={loading}
                          className="btn-round"
                        >
                          <i className="fa fa-times" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {orderId && showItemUnitPrice && (
            <div className="mb-3">
              <Button
                color="warning"
                size="sm"
                className="btn-round"
                onClick={() => setOpvPriceReviewOpen(true)}
                disabled={loading || !formData.items.length}
              >
                <i className="fa fa-money mr-1" />
                Revisar precios del envío
              </Button>
            </div>
          )}
          {orderId && orderAllowsPartialReleases(formData) && (
            <ProductionOrderPartialReleasesPanel
              order={{
                id: orderId,
                code: formData.code,
                orderType: formData.orderType,
                sellerName: formData.sellerName,
                customerName: formData.customerName,
                customerAddress: formData.customerAddress,
                customerPhone: formData.customerPhone,
                customerTaxId: formData.customerTaxId,
                shippingCost: formData.shippingCost,
                packingItems: formData.packingItems,
                vendorShipmentNumber: formData.vendorShipmentNumber,
                items: formData.items,
              }}
              onRefresh={loadOrder}
            />
          )}
          {orderId && (
            <>
              <hr />
              <Alert color="light" style={{ border: "1px solid #e2e8f0" }}>
                La gestion de tareas, mesas y distribucion diaria ahora se realiza en{" "}
                <strong>Tareas por Estacion</strong> para mantener este formulario enfocado en la orden.
                <div className="mt-2">
                  <Button
                    color="primary"
                    size="sm"
                    className="btn-round"
                    onClick={() => window.open("/admin/tasks-by-station", "_blank")}
                  >
                    <i className="nc-icon nc-layout-11 mr-1" />
                    Ir a Tareas por Estacion
                  </Button>
                </div>
              </Alert>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          {orderId && isCinchoOrderType(formData.orderType) && (
            <Button
              color="success"
              outline
              type="button"
              disabled={loading}
              onClick={() => setShipmentModalOpen(true)}
              className="mr-auto"
            >
              Generar envío
            </Button>
          )}
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : orderId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>

      <OpvShipmentPriceReviewModal
        isOpen={opvPriceReviewOpen}
        toggle={() => setOpvPriceReviewOpen(false)}
        orderId={orderId}
        productCatalogById={productCatalogById}
        confirmLabel="Guardar precios"
        onSaved={(updated) => {
          setFormData((prev) => ({
            ...prev,
            items: updated.items || prev.items,
            shippingCost: updated.shippingCost ?? prev.shippingCost,
          }));
        }}
      />

      <OpcGenerateShipmentModal
        isOpen={shipmentModalOpen}
        toggle={() => setShipmentModalOpen(false)}
        order={
          orderId
            ? {
                id: orderId,
                code: formData.code,
                orderType: formData.orderType,
                sellerName: formData.sellerName,
                customerName: formData.customerName,
                customerAddress: formData.customerAddress,
                customerPhone: formData.customerPhone,
                customerTaxId: formData.customerTaxId,
                shippingCost: formData.shippingCost,
                packingItems: formData.packingItems,
                vendorShipmentNumber: formData.vendorShipmentNumber,
                items: formData.items,
              }
            : null
        }
        onGenerated={() => setShipmentModalOpen(false)}
      />
    </Modal>
  );
}

export default ProductionOrderForm;

