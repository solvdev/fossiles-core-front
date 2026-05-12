import React, { useState, useEffect } from "react";
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
} from "services/productionOrderService";
import { getProducts } from "services/productService";
import { getColors } from "services/colorService";
import { getCustomers } from "services/customerService";
import { getAuthHeader } from "services/authService";
import { showSuccess, showError } from "utils/notificationHelper";

// Tallas disponibles para cinchos (16-50)
const AVAILABLE_SIZES = Array.from({ length: 35 }, (_, i) => (i + 16).toString());

const STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En Progreso",
  IN_QA: "En Progreso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const SELLER_OPTIONS = ["LUIS FELIPE", "MADELYN"];
const normalizeSeller = (value) => String(value || "").trim().toUpperCase();
const isLuisFelipeSeller = (value) => normalizeSeller(value).includes("LUIS FELIPE");

function ProductionOrderForm({ orderId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    code: "",
    orderType: "NORMAL",
    customerId: "",
    customerName: "",
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
  const [itemForm, setItemForm] = useState({
    productId: "",
    colorId: "",
    quantity: "",
    sizes: {}, // Para cinchos: { "16": 3, "18": 5, ... }
    observations: "",
  });
  const [itemErrors, setItemErrors] = useState({});
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [packingMaterials, setPackingMaterials] = useState([]);
  const [packingForm, setPackingForm] = useState({ materialId: "", quantity: "", unitPrice: "" });

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
        sellerName: isLuisFelipeSeller(order.sellerName) ? "LUIS FELIPE" : (order.sellerName || ""),
        startDate: order.startDate
          ? new Date(order.startDate).toISOString().split("T")[0]
          : "",
        deliveryDate: order.deliveryDate
          ? new Date(order.deliveryDate).toISOString().split("T")[0]
          : "",
        observations: order.observations || "",
        shippingCost: order.shippingCost || "",
        packingItems: order.packingItems || [],
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
    setItemForm({
      productId: "",
      colorId: "",
      quantity: "",
      sizes: {},
      observations: "",
    });
    setProductSearch("");
    setShowProductDropdown(false);
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
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateItem = () => {
    const newErrors = {};
    if (!itemForm.productId) newErrors.productId = "El producto es requerido";

    if (formData.orderType === "CINCHOS") {
      // Para cinchos, validar que haya al menos una talla con cantidad
      const hasSizes = Object.values(itemForm.sizes || {}).some((qty) => qty > 0);
      if (!hasSizes) {
        newErrors.sizes = "Debe ingresar al menos una talla con cantidad";
      }
    } else {
      // Para MARCAS y NORMAL, validar cantidad
      if (!itemForm.quantity || parseInt(itemForm.quantity) <= 0) {
        newErrors.quantity = "La cantidad debe ser mayor a 0";
      }
    }

    setItemErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddItem = () => {
    if (!validateItem()) return;

    const newItem = {
      productId: parseInt(itemForm.productId),
      colorId: itemForm.colorId ? parseInt(itemForm.colorId) : null,
      quantity: formData.orderType === "CINCHOS" ? null : parseInt(itemForm.quantity),
      sizes: formData.orderType === "CINCHOS" ? { ...itemForm.sizes } : null,
      observations: itemForm.observations || "",
    };

    setFormData({
      ...formData,
      items: [...formData.items, newItem],
    });

    setItemForm({
      productId: "",
      colorId: "",
      quantity: "",
      sizes: {},
      observations: "",
    });
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

  const handleSizeChange = (size, value) => {
    const newSizes = { ...itemForm.sizes };
    const qty = parseInt(value) || 0;
    if (qty > 0) {
      newSizes[size] = qty;
    } else {
      delete newSizes[size];
    }
    setItemForm({ ...itemForm, sizes: newSizes });
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
    setItemForm({ ...itemForm, productId: productId.toString() });
    setProductSearch("");
    setShowProductDropdown(false);
  };

  const handleProductSearchChange = (e) => {
    const value = e.target.value;
    setProductSearch(value);
    setShowProductDropdown(true);
    if (!value) {
      setItemForm({ ...itemForm, productId: "" });
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
          quantity: item.quantity,
          sizes: item.sizes,
          observations: item.observations,
        })),
      };

      if (orderId) {
        await updateProductionOrder(orderId, submitData);
        showSuccess("Orden de producción actualizada correctamente");
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
      packingItems: newType === "MARCAS" ? formData.packingItems : [],
    });
    setItemForm({
      productId: "",
      colorId: "",
      quantity: "",
      sizes: {},
      observations: "",
    });
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
          {error && <Alert color="danger">{error}</Alert>}

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
                    ? "Se genera automáticamente por correlativo según tipo/origen (OPK/OPV/OPI/OPC/OPD/OPL)."
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
                  <option value="NORMAL">NORMAL (Productos normales)</option>
                  <option value="MARCAS">MARCAS (Productos con marcas conocidas)</option>
                  <option value="INTERNA">INTERNA (OPI — producción interna)</option>
                  <option value="CINCHOS">CINCHOS (Con tallas)</option>
                  {formData.orderType === "DISTRIBUTION" && (
                    <option value="DISTRIBUTION">DISTRIBUCIÓN (Generada automáticamente)</option>
                  )}
                </Input>
                {errors.orderType && <div className="text-danger small">{errors.orderType}</div>}
              </FormGroup>
            </Col>
          </Row>

          {isLuisFelipeSeller(formData.sellerName) && (
            <>
              <hr />
              <h5 className="mb-3">Empaques y costo de envío (OPV vendedor)</h5>
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
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      customerId: e.target.value,
                      customerName: e.target.value
                        ? availableCustomers.find((c) => c.id === parseInt(e.target.value))?.name || ""
                        : "",
                    })
                  }
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
                      orderType: isLuisFelipeSeller(nextSeller) ? "MARCAS" : prev.orderType,
                    }));
                  }}
                  disabled={loading}
                >
                  <option value="">Seleccione vendedor</option>
                  {[...new Set([...SELLER_OPTIONS, formData.sellerName].filter(Boolean))].map((seller) => (
                    <option key={seller} value={seller}>{seller}</option>
                  ))}
                </Input>
                {isLuisFelipeSeller(formData.sellerName) && (
                  <small className="text-muted d-block mt-1">
                    Esta orden seguirá flujo OPV de vendedor (formato especial de envíos).
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
                <Col md={formData.orderType === "CINCHOS" ? "12" : "6"}>
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
                        color="link"
                        size="sm"
                        onClick={() => {
                          setItemForm({ ...itemForm, productId: "" });
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

                {formData.orderType !== "CINCHOS" && (
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

                {formData.orderType === "CINCHOS" && (
                  <Col md="12">
                    <FormGroup>
                      <Label>Tallas y Cantidades *</Label>
                      <div className="d-flex flex-wrap gap-2">
                        {AVAILABLE_SIZES.map((size) => (
                          <div key={size} style={{ minWidth: "80px" }}>
                            <Label className="small">{size}</Label>
                            <Input
                              type="number"
                              min="0"
                              value={itemForm.sizes[size] || ""}
                              onChange={(e) => handleSizeChange(size, e.target.value)}
                              placeholder="0"
                              disabled={loading}
                            />
                          </div>
                        ))}
                      </div>
                      {itemErrors.sizes && (
                        <div className="text-danger small mt-1">{itemErrors.sizes}</div>
                      )}
                      <small className="text-muted">
                        Ingrese la cantidad para cada talla (deje en 0 o vacío si no aplica)
                      </small>
                    </FormGroup>
                  </Col>
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
                  {formData.orderType !== "CINCHOS" && <th>Color</th>}
                  {formData.orderType === "CINCHOS" ? (
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
                    {formData.orderType !== "CINCHOS" && (
                      <td>{getColorName(item.colorId)}</td>
                    )}
                    {formData.orderType === "CINCHOS" ? (
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
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : orderId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>

    </Modal>
  );
}

export default ProductionOrderForm;

