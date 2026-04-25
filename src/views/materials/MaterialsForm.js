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
  Spinner,
} from "reactstrap";
import Price from "react-forex-price";
import { getMaterialById, createMaterial, updateMaterial } from "services/materialService";
import { getUoms } from "services/uomService";
import { getMaterialColors } from "services/materialColorService";
import { getSuppliers } from "services/supplierService";
import { uploadImage } from "services/uploadService";

function MaterialsForm({ materialId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    // Información de compra
    purchaseUomId: "",
    purchaseQuantity: "",
    purchasePrice: "",
    purchasePriceCurrency: "GTQ", // GTQ o USD
    exchangeRate: null, // Tasa de cambio USD a GTQ (se carga automáticamente)
    // Información de manufactura
    manufacturingUomId: "",
    unitCost: "", // Calculado automáticamente
    // Campos legacy (mantener por compatibilidad)
    uomId: "",
    quantity: "",
    cost: "",
    // Otros campos
    min: "",
    max: "",
    deliveryDays: "",
    materialColorId: "",
    supplierId: "",
    description: "",
    imageUrl: "",
    status: "active",
    lossPercentage: null,
  });
  const [availableUoms, setAvailableUoms] = useState([]);
  const [availableMaterialColors, setAvailableMaterialColors] = useState([]);
  const [availableSuppliers, setAvailableSuppliers] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [loadingExchangeRate, setLoadingExchangeRate] = useState(false);
  const [exchangeRateError, setExchangeRateError] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadUoms();
      loadMaterialColors();
      loadSuppliers();
      if (materialId) {
        loadMaterial();
      } else {
        resetForm();
      }
    }
  }, [isOpen, materialId]);

  // Cargar tasa de cambio automáticamente cuando se selecciona USD
  useEffect(() => {
    if (isOpen && (formData.purchasePriceCurrency === "USD" || formData.purchasePriceCurrency === "MXN")) {
      loadExchangeRate(formData.purchasePriceCurrency);
    }
  }, [isOpen, formData.purchasePriceCurrency]);

  const loadExchangeRate = async (currency = "USD") => {
    try {
      setLoadingExchangeRate(true);
      setExchangeRateError("");

      const response = await fetch(
        `https://api.exchangerate-api.com/v4/latest/${currency}`
      );

      if (!response.ok) throw new Error("Error al obtener tasa de cambio");

      const data = await response.json();
      const rate = data.rates?.GTQ;

      if (!rate) throw new Error("Tasa de cambio GTQ no disponible");

      setFormData(prev => ({
        ...prev,
        exchangeRate: parseFloat(rate.toFixed(4))
      }));
    } catch (err) {
      console.error("Error al cargar tasa de cambio:", err);
      setExchangeRateError("No se pudo cargar la tasa de cambio.");
      setFormData(prev => ({ ...prev, exchangeRate: null }));
    } finally {
      setLoadingExchangeRate(false);
    }
  };

  const loadUoms = async () => {
    try {
      const uoms = await getUoms();
      setAvailableUoms(uoms || []);
    } catch (err) {
      console.error("Error al cargar UOMs:", err);
    }
  };

  const loadMaterialColors = async () => {
    try {
      const colors = await getMaterialColors();
      setAvailableMaterialColors(colors || []);
    } catch (err) {
      console.error("Error al cargar colores de materiales:", err);
    }
  };

  const loadSuppliers = async () => {
    try {
      const suppliers = await getSuppliers();
      setAvailableSuppliers(suppliers || []);
    } catch (err) {
      console.error("Error al cargar proveedores:", err);
    }
  };

  const handleImageUpload = async (file) => {
    if (!file) return;
    setUploadingImage(true);
    setUploadError("");
    try {
      const result = await uploadImage(file);
      setFormData((prev) => ({ ...prev, imageUrl: result.url }));
    } catch (err) {
      setUploadError(err.message || "Error al subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  };

  const loadMaterial = async () => {
    try {
      setLoading(true);
      const material = await getMaterialById(materialId);
      setFormData({
        sku: material.sku || "",
        name: material.name || "",
        // Nuevos campos
        purchaseUomId: material.purchaseUomId || "",
        purchaseQuantity: material.purchaseQuantity || "",
        purchasePrice: material.purchasePrice || "",
        purchasePriceCurrency: "GTQ", // Por defecto GTQ (el precio guardado siempre está en quetzales)
        exchangeRate: null, // Se carga cuando se selecciona USD
        manufacturingUomId: material.manufacturingUomId || "",
        unitCost: material.unitCost || "",
        // Campos legacy
        uomId: material.uomId || "",
        quantity: material.quantity || "",
        cost: material.cost || "",
        // Otros campos
        min: material.min || "",
        max: material.max || "",
        deliveryDays: material.deliveryDays || "",
        materialColorId: material.materialColorId || "",
        supplierId: material.supplierId || "",
        description: material.description || "",
        imageUrl: material.imageUrl || "",
        status: material.status || "active",
        lossPercentage: material.lossPercentage || 0.0,
      });
    } catch (err) {
      setError(err.message || "Error al cargar el material");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      sku: "",
      name: "",
      purchaseUomId: "",
      purchaseQuantity: "",
      purchasePrice: "",
      purchasePriceCurrency: "GTQ",
      exchangeRate: null,
      manufacturingUomId: "",
      unitCost: "",
      uomId: "",
      quantity: "",
      cost: "",
      min: "",
      max: "",
      deliveryDays: "",
      materialColorId: "",
      supplierId: "",
      description: "",
      imageUrl: "",
      status: "active",
      lossPercentage: 0.0,
    });
    setErrors({});
    setError("");
  };

  const calculateUnitCost = () => {
    if (formData.purchasePrice && formData.purchaseQuantity) {
      let purchasePrice = parseFloat(formData.purchasePrice);
      // Convertir a quetzales si está en dólares
      if (formData.purchasePriceCurrency === "USD" || formData.purchasePriceCurrency === "MXN") {
        if (!formData.exchangeRate) return; // No calcular si no hay tasa
        purchasePrice = purchasePrice * parseFloat(formData.exchangeRate);
      }
      const purchaseQuantity = parseFloat(formData.purchaseQuantity);
      if (!isNaN(purchasePrice) && !isNaN(purchaseQuantity) && purchaseQuantity > 0) {
        const unitCost = purchasePrice / purchaseQuantity;
        setFormData(prev => ({ ...prev, unitCost: unitCost.toFixed(4) }));
      }
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.sku.trim()) newErrors.sku = "El SKU es requerido";
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.uomId) newErrors.uomId = "La unidad de medida es requerida";
    if (formData.quantity && (isNaN(formData.quantity) || parseFloat(formData.quantity) <= 0)) {
      newErrors.quantity = "La cantidad debe ser un número mayor a 0";
    }
    if (formData.purchasePrice && (isNaN(formData.purchasePrice) || parseFloat(formData.purchasePrice) < 0)) {
      newErrors.purchasePrice = "El precio de compra debe ser un número válido";
    }
    // Validar que si está en USD, debe tener tasa de cambio
    if (formData.purchasePriceCurrency === "USD" && (!formData.exchangeRate || formData.exchangeRate <= 0)) {
      newErrors.exchangeRate = "Debe cargarse la tasa de cambio para USD";
    }
    // Validar nuevos campos de compra y manufactura
    if (!formData.purchaseUomId) newErrors.purchaseUomId = "La unidad de compra es requerida";
    if (!formData.manufacturingUomId) newErrors.manufacturingUomId = "La unidad de manufactura es requerida";
    if (!formData.purchaseQuantity || isNaN(formData.purchaseQuantity) || parseFloat(formData.purchaseQuantity) <= 0) {
      newErrors.purchaseQuantity = "La cantidad por unidad de compra debe ser mayor a 0";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      setError("");
      // No enviar cost, el backend lo calculará automáticamente
      // Esto asegura que siempre se guarde correctamente en la base de datos

      // Convertir precio a quetzales si está en dólares
      let purchasePriceInQuetzales = null;
      if (formData.purchasePrice) {
        const price = parseFloat(formData.purchasePrice);
        if (formData.purchasePriceCurrency === "USD" || formData.purchasePriceCurrency === "MXN") {
          // Convertir de dólares a quetzales
          if (!formData.exchangeRate) {
            throw new Error("La tasa de cambio no está disponible. Por favor, espere a que se cargue.");
          }
          purchasePriceInQuetzales = price * parseFloat(formData.exchangeRate);
        } else {
          // Ya está en quetzales
          purchasePriceInQuetzales = price;
        }
      }

      const submitData = {
        sku: formData.sku.trim(),
        name: formData.name.trim(),
        // Nuevos campos
        purchaseUomId: parseInt(formData.purchaseUomId),
        purchaseQuantity: formData.purchaseQuantity ? parseFloat(formData.purchaseQuantity) : null,
        purchasePrice: purchasePriceInQuetzales,
        manufacturingUomId: parseInt(formData.manufacturingUomId),
        // unitCost se calculará automáticamente en el backend
        // Campos legacy (mantener por compatibilidad)
        uomId: formData.uomId ? parseInt(formData.uomId) : null,
        quantity: formData.quantity ? parseFloat(formData.quantity) : null,
        cost: formData.cost ? parseFloat(formData.cost) : null,
        // Otros campos
        min: formData.min ? parseInt(formData.min) : null,
        max: formData.max ? parseInt(formData.max) : null,
        deliveryDays: formData.deliveryDays ? parseInt(formData.deliveryDays) : null,
        materialColorId: formData.materialColorId ? parseInt(formData.materialColorId) : null,
        supplierId: formData.supplierId ? parseInt(formData.supplierId) : null,
        description: formData.description.trim() || null,
        imageUrl: formData.imageUrl.trim() || null,
        status: formData.status,
        lossPercentage: formData.lossPercentage,
      };
      if (materialId) {
        await updateMaterial(materialId, submitData);
      } else {
        await createMaterial(submitData);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar el material");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {materialId ? "Editar Material" : "Nuevo Material"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>SKU *</Label>
                <Input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  invalid={!!errors.sku}
                />
                {errors.sku && <div className="text-danger small">{errors.sku}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Nombre *</Label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  invalid={!!errors.name}
                />
                {errors.name && <div className="text-danger small">{errors.name}</div>}
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Unidad de Medida *</Label>
                <Input
                  type="select"
                  value={formData.uomId}
                  onChange={(e) => setFormData({ ...formData, uomId: e.target.value })}
                  invalid={!!errors.uomId}
                  disabled={loading}
                >
                  <option value="">Seleccione UOM</option>
                  {availableUoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.code} - {uom.name}
                    </option>
                  ))}
                </Input>
                {errors.uomId && <div className="text-danger small">{errors.uomId}</div>}
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Cantidad por Unidad *</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => {
                    setFormData({ ...formData, quantity: e.target.value });
                    // Calcular costo unitario automáticamente
                    setTimeout(() => {
                      if (formData.purchasePrice && e.target.value) {
                        let purchasePrice = parseFloat(formData.purchasePrice);
                        // Convertir a quetzales para el cálculo si está en dólares
                        if (formData.purchasePriceCurrency === "USD") {
                          if (!formData.exchangeRate) return; // No calcular si no hay tasa
                          purchasePrice = purchasePrice * parseFloat(formData.exchangeRate);
                        }
                        const quantity = parseFloat(e.target.value);
                        if (!isNaN(purchasePrice) && !isNaN(quantity) && quantity > 0) {
                          const unitCost = purchasePrice / quantity;
                          setFormData(prev => ({ ...prev, cost: unitCost.toFixed(4) }));
                        }
                      }
                    }, 100);
                  }}
                  placeholder="Ej: 25, 144, 200"
                  invalid={!!errors.quantity}
                />
                {errors.quantity && <div className="text-danger small">{errors.quantity}</div>}
                <small className="text-muted">Cantidad que viene en el rollo/bolsa/unidad</small>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Precio de Compra *</Label>
                <Row className="mb-2">
                  <Col md="6">
                    <Input
                      type="select"
                      value={formData.purchasePriceCurrency}
                      onChange={(e) => {
                        setFormData({ ...formData, purchasePriceCurrency: e.target.value });
                        // Recalcular costo unitario al cambiar moneda
                        setTimeout(() => {
                          if (formData.purchasePrice && formData.quantity) {
                            let purchasePrice = parseFloat(formData.purchasePrice);
                            if (e.target.value === "USD" || e.target.value === "MXN") {
                              if (!formData.exchangeRate) return; // No calcular si no hay tasa
                              purchasePrice = purchasePrice * parseFloat(formData.exchangeRate);
                            }
                            const quantity = parseFloat(formData.quantity);
                            if (!isNaN(purchasePrice) && !isNaN(quantity) && quantity > 0) {
                              const unitCost = purchasePrice / quantity;
                              setFormData(prev => ({ ...prev, cost: unitCost.toFixed(4) }));
                            }
                          }
                        }, 100);
                      }}
                    >
                      <option value="GTQ">Quetzales (GTQ)</option>
                      <option value="USD">Dólares (USD)</option>
                      <option value="MXN">Pesos Mexicanos (MXN)</option>
                    </Input>
                  </Col>
                  <Col md="6">
                    {(formData.purchasePriceCurrency === "USD" || formData.purchasePriceCurrency === "MXN") && (
                      <div>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0.01"
                          value={formData.exchangeRate || ""}
                          onChange={(e) => {
                            const newRate = parseFloat(e.target.value);
                            if (isNaN(newRate) || newRate <= 0) return;
                            setFormData({ ...formData, exchangeRate: newRate });
                            // Recalcular costo unitario al cambiar tasa
                            setTimeout(() => {
                              if (formData.purchasePrice && formData.quantity) {
                                let purchasePrice = parseFloat(formData.purchasePrice);
                                purchasePrice = purchasePrice * newRate;
                                const quantity = parseFloat(formData.quantity);
                                if (!isNaN(purchasePrice) && !isNaN(quantity) && quantity > 0) {
                                  const unitCost = purchasePrice / quantity;
                                  setFormData(prev => ({ ...prev, cost: unitCost.toFixed(4) }));
                                }
                              }
                            }, 100);
                          }}
                          placeholder="Tasa de cambio"
                          style={{ fontSize: "0.9rem" }}
                          disabled={loadingExchangeRate}
                        />
                        {loadingExchangeRate && (
                          <small className="text-muted d-block mt-1">
                            <Spinner size="sm" className="mr-1" />
                            Cargando tasa de cambio...
                          </small>
                        )}
                        {exchangeRateError && (
                          <div className="mt-1">
                            <small className="text-danger d-block">{exchangeRateError}</small>
                            <Button
                              color="link"
                              size="sm"
                              className="p-0 mt-1"
                              onClick={() => loadExchangeRate(formData.purchasePriceCurrency)}
                              disabled={loadingExchangeRate}
                            >
                              <small>Reintentar</small>
                            </Button>
                          </div>
                        )}
                        {!loadingExchangeRate && !exchangeRateError && formData.exchangeRate && (
                          <small className="text-success d-block mt-1">
                            ✓ Tasa actualizada automáticamente
                          </small>
                        )}
                        {errors.exchangeRate && (
                          <small className="text-danger d-block mt-1">{errors.exchangeRate}</small>
                        )}
                      </div>
                    )}
                  </Col>
                </Row>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.purchasePrice}
                  onChange={(e) => {
                    setFormData({ ...formData, purchasePrice: e.target.value });
                    // Calcular costo unitario automáticamente
                    setTimeout(() => {
                      if (formData.quantity && e.target.value) {
                        let purchasePrice = parseFloat(e.target.value);
                        // Convertir a quetzales para el cálculo si está en dólares
                        if (formData.purchasePriceCurrency === "USD" || formData.purchasePriceCurrency === "MXN") {
                          if (!formData.exchangeRate) return; // No calcular si no hay tasa
                          purchasePrice = purchasePrice * parseFloat(formData.exchangeRate);
                        }
                        const quantity = parseFloat(formData.quantity);
                        if (!isNaN(purchasePrice) && !isNaN(quantity) && quantity > 0) {
                          const unitCost = purchasePrice / quantity;
                          setFormData(prev => ({ ...prev, cost: unitCost.toFixed(4) }));
                        }
                      }
                    }, 100);
                  }}
                  placeholder={formData.purchasePriceCurrency === "USD" ? "USD 10.00" : "Q 50.00"}
                  invalid={!!errors.purchasePrice}
                />
                {errors.purchasePrice && <div className="text-danger small">{errors.purchasePrice}</div>}
                <small className="text-muted">
                  Precio al que compras el rollo/bolsa/unidad completa
                  {formData.purchasePriceCurrency === "USD" && formData.purchasePrice && (
                    <span className="ml-2 text-info">
                      (≈{" "}
                      <Price
                        amount={parseFloat(formData.purchasePrice) || 0}
                        baseCurrency="USD"
                        displayCurrency="GTQ"
                        rounding={2}
                      />)
                    </span>
                  )}
                </small>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Costo Unitario (Calculado)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  readOnly
                  style={{ backgroundColor: "#f5f5f5" }}
                />
                <small className="text-muted">Se calcula automáticamente: Precio de Compra ÷ Cantidad</small>
              </FormGroup>
            </Col>
          </Row>
          <hr />
          <h5>Información de Compra y Manufactura</h5>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Unidad de Compra *</Label>
                <Input
                  type="select"
                  value={formData.purchaseUomId}
                  onChange={(e) => setFormData({ ...formData, purchaseUomId: e.target.value })}
                  invalid={!!errors.purchaseUomId}
                  disabled={loading}
                >
                  <option value="">Seleccione UOM de Compra</option>
                  {availableUoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.code} - {uom.name}
                    </option>
                  ))}
                </Input>
                {errors.purchaseUomId && <div className="text-danger small">{errors.purchaseUomId}</div>}
                <small className="text-muted">Ej: Rollo, Gruesa, Caja, Paquete</small>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Unidad de Manufactura *</Label>
                <Input
                  type="select"
                  value={formData.manufacturingUomId}
                  onChange={(e) => setFormData({ ...formData, manufacturingUomId: e.target.value })}
                  invalid={!!errors.manufacturingUomId}
                  disabled={loading}
                >
                  <option value="">Seleccione UOM de Manufactura</option>
                  {availableUoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.code} - {uom.name}
                    </option>
                  ))}
                </Input>
                {errors.manufacturingUomId && <div className="text-danger small">{errors.manufacturingUomId}</div>}
                <small className="text-muted">Ej: Pulgadas, Unidades, Metros</small>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="12">
              <FormGroup>
                <Label>Cantidad por Unidad de Compra *</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.purchaseQuantity}
                  onChange={(e) => {
                    setFormData({ ...formData, purchaseQuantity: e.target.value });
                    // Calcular costo unitario automáticamente
                    setTimeout(() => {
                      if (formData.purchasePrice && e.target.value) {
                        let purchasePrice = parseFloat(formData.purchasePrice);
                        if (formData.purchasePriceCurrency === "USD" || formData.purchasePriceCurrency === "MXN") {
                          if (!formData.exchangeRate) return;
                          purchasePrice = purchasePrice * parseFloat(formData.exchangeRate);
                        }
                        const purchaseQuantity = parseFloat(e.target.value);
                        if (!isNaN(purchasePrice) && !isNaN(purchaseQuantity) && purchaseQuantity > 0) {
                          const unitCost = purchasePrice / purchaseQuantity;
                          setFormData(prev => ({ ...prev, unitCost: unitCost.toFixed(4) }));
                        }
                      }
                    }, 100);
                  }}
                  placeholder="Ej: 25, 144, 100"
                  invalid={!!errors.purchaseQuantity}
                />
                {errors.purchaseQuantity && <div className="text-danger small">{errors.purchaseQuantity}</div>}
                <small className="text-muted">
                  ¿Cuántas unidades de manufactura vienen en 1 unidad de compra? (Ej: 1 rollo = 25 pulgadas, 1 gruesa = 144 unidades)
                </small>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Merma</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.lossPercentage}
                  onChange={(e) => setFormData({ ...formData, lossPercentage: e.target.value })}
                  style={{ backgroundColor: "#f5f5f5" }}
                />
                <small className="text-muted">Pérdida física (cuantitativa o cualitativa) de insumos, materiales o productos durante su almacenamiento, transporte o proceso de producción</small>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="3">
              <FormGroup>
                <Label>Stock Mínimo</Label>
                <Input
                  type="number"
                  value={formData.min}
                  onChange={(e) => setFormData({ ...formData, min: e.target.value })}
                  placeholder="Mínimo"
                />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Stock Máximo</Label>
                <Input
                  type="number"
                  value={formData.max}
                  onChange={(e) => setFormData({ ...formData, max: e.target.value })}
                  placeholder="Máximo"
                />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Días de Entrega</Label>
                <Input
                  type="number"
                  value={formData.deliveryDays}
                  onChange={(e) => setFormData({ ...formData, deliveryDays: e.target.value })}
                  placeholder="Días"
                />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Estado</Label>
                <Input
                  type="select"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </Input>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Color del Material</Label>
                <Input
                  type="select"
                  value={formData.materialColorId}
                  onChange={(e) => setFormData({ ...formData, materialColorId: e.target.value })}
                  disabled={loading}
                >
                  <option value="">Sin color (opcional)</option>
                  {availableMaterialColors.map((color) => (
                    <option key={color.id} value={color.id}>
                      {color.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Proveedor</Label>
                <Input
                  type="select"
                  value={formData.supplierId}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                  disabled={loading}
                >
                  <option value="">Sin proveedor (opcional)</option>
                  {availableSuppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
          </Row>
          <FormGroup>
            <Label>Descripción</Label>
            <Input
              type="textarea"
              rows="3"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </FormGroup>
          <FormGroup>
            <Label>Imagen</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e.target.files[0])}
              disabled={uploadingImage}
            />
            <small className="form-text text-muted">
              Sube la imagen y se guardará en S3 automáticamente.
            </small>
            {uploadError && <div className="text-danger small">{uploadError}</div>}
            {uploadingImage && <div className="text-muted small">Subiendo imagen...</div>}
            {formData.imageUrl && (
              <div className="mt-2 text-center">
                <img
                  src={formData.imageUrl}
                  alt="Vista previa"
                  style={{ maxHeight: 140, maxWidth: "100%", objectFit: "contain" }}
                />
              </div>
            )}
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : materialId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default MaterialsForm;

