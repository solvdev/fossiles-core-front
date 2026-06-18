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
} from "reactstrap";
import { getBomById, createBom, updateBom } from "services/bomService";
import { getProducts, updateProduct } from "services/productService";
import { isProductLeatherOnly } from "utils/materialRequirementHelper";
import { getMaterials } from "services/materialService";
import { getColors } from "services/colorService";
import { getUoms } from "services/uomService";

// Componente Select con búsqueda mejorado
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  invalid,
  disabled,
  renderOption,
  getOptionLabel,
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find(opt => opt.id === value);

  const filteredOptions = options.filter(opt => {
    const label = getOptionLabel(opt).toLowerCase();
    return label.includes(search.toLowerCase());
  });

  const handleSelect = (option) => {
    onChange(option.id);
    setSearch("");
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
    setIsOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      {!selectedOption ? (
        <Input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          invalid={invalid}
          disabled={disabled}
          style={{
            paddingRight: search ? "35px" : "12px",
          }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "0.375rem 0.75rem",
            border: invalid ? "1px solid #dc3545" : "1px solid #cad1d7",
            borderRadius: "0.25rem",
            backgroundColor: "#f5f7fa",
            cursor: disabled ? "not-allowed" : "pointer",
            minHeight: "calc(1.5em + 0.75rem + 2px)",
          }}
          onClick={() => !disabled && setIsOpen(true)}
        >
          <span style={{ flex: 1, fontSize: "0.875rem" }}>{getOptionLabel(selectedOption)}</span>
          <i
            className="nc-icon nc-simple-remove"
            style={{
              cursor: "pointer",
              color: "#dc3545",
              fontSize: "0.875rem",
            }}
            onClick={handleClear}
          />
        </div>
      )}

      {search && !selectedOption && (
        <i
          className="nc-icon nc-simple-remove"
          onClick={() => setSearch("")}
          style={{
            position: "absolute",
            right: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            cursor: "pointer",
            color: "#6c757d",
            fontSize: "0.875rem",
          }}
        />
      )}

      {isOpen && filteredOptions.length > 0 && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              maxHeight: "250px",
              overflowY: "auto",
              backgroundColor: "white",
              border: "1px solid #cad1d7",
              borderRadius: "0.25rem",
              zIndex: 1000,
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
              marginTop: "2px",
            }}
          >
            {filteredOptions.map((option) => (
              <div
                key={option.id}
                onClick={() => handleSelect(option)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  borderBottom: "1px solid #f0f0f0",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f9fa")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")}
              >
                {renderOption ? renderOption(option) : getOptionLabel(option)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BomForm({ bomId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    bomName: "",
    productId: "",
    colorId: "",
    status: "A",
    leatherMaterialId: "",
    leatherQtyPerUnit: "",
    items: [],
  });
  const [availableProducts, setAvailableProducts] = useState([]);
  const [availableMaterials, setAvailableMaterials] = useState([]);
  const [availableColors, setAvailableColors] = useState([]);
  const [availableUoms, setAvailableUoms] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [itemForm, setItemForm] = useState({
    materialId: "",
    quantity: "",
    measurement: "",
  });
  const [itemErrors, setItemErrors] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [leatherOnly, setLeatherOnly] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProducts();
      loadMaterials();
      loadColors();
      loadUoms();
      if (bomId) {
        loadBom();
      } else {
        resetForm();
      }
    }
  }, [isOpen, bomId]);

  const loadProducts = async () => {
    try {
      const products = await getProducts();
      setAvailableProducts(products || []);
    } catch (err) {
      console.error("Error al cargar productos:", err);
    }
  };

  const loadMaterials = async () => {
    try {
      const materials = await getMaterials();
      setAvailableMaterials(materials || []);
    } catch (err) {
      console.error("Error al cargar materiales:", err);
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

  const loadUoms = async () => {
    try {
      const uoms = await getUoms();
      setAvailableUoms(uoms || []);
    } catch (err) {
      console.error("Error al cargar UOMs:", err);
    }
  };

  const loadBom = async () => {
    try {
      setLoading(true);
      const bom = await getBomById(bomId);
      const products = await getProducts();
      setAvailableProducts(products || []);
      const linkedProduct = (products || []).find((p) => String(p.id) === String(bom.productId));
      setFormData({
        bomName: bom.bomName || "",
        productId: bom.productId || "",
        colorId: bom.colorId || "",
        status: bom.status || "A",
        leatherMaterialId: bom.leatherMaterialId || "",
        leatherQtyPerUnit: bom.leatherQtyPerUnit || "",
        items: bom.items || [],
      });
      setLeatherOnly(isProductLeatherOnly(linkedProduct));
    } catch (err) {
      setError(err.message || "Error al cargar la BOM");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      bomName: "",
      productId: "",
      colorId: "",
      status: "A",
      leatherMaterialId: "",
      leatherQtyPerUnit: "",
      items: [],
    });
    setItemForm({
      materialId: "",
      quantity: "",
      measurement: "",
    });
    setErrors({});
    setItemErrors({});
    setError("");
    setEditingIndex(null);
    setEditingItem(null);
    setLeatherOnly(false);
  };

  const syncProductLeatherOnlyFlag = async (productId, onlyLeather) => {
    const product = availableProducts.find((p) => String(p.id) === String(productId));
    if (!product) return;
    const nextRequiresMaterials = !onlyLeather;
    if ((product.requiresMaterials ?? true) === nextRequiresMaterials) return;
    const updated = await updateProduct(product.id, {
      code: product.code,
      name: product.name,
      categoryId: product.categoryId,
      prdTime: product.prdTime,
      salePrice: product.salePrice,
      discountedPrice: product.discountedPrice,
      sellerPrice: product.sellerPrice,
      imageUrl: product.imageUrl,
      leatherConsumption: product.leatherConsumption,
      requiresMaterials: nextRequiresMaterials,
      status: product.status,
    });
    setAvailableProducts((prev) =>
      prev.map((p) => (String(p.id) === String(updated.id) ? updated : p))
    );
  };

  const handleProductChange = (productId) => {
    const product = availableProducts.find((p) => String(p.id) === String(productId));
    setFormData({ ...formData, productId });
    setLeatherOnly(isProductLeatherOnly(product));
  };

  const handleLeatherOnlyChange = (checked) => {
    setLeatherOnly(checked);
    if (checked) {
      setFormData((prev) => ({ ...prev, items: [] }));
      setItemForm({ materialId: "", quantity: "", measurement: "" });
      setEditingIndex(null);
      setEditingItem(null);
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.bomName.trim()) newErrors.bomName = "El nombre de BOM es requerido";
    if (!formData.productId) newErrors.productId = "El producto es requerido";
    if (!leatherOnly && formData.items.length === 0) {
      newErrors.items = "Debe agregar al menos un item (o marque solo cuero)";
    }
    if (formData.leatherMaterialId && (!formData.leatherQtyPerUnit || parseFloat(formData.leatherQtyPerUnit) <= 0)) {
      newErrors.leatherQtyPerUnit = "La cantidad de cuero debe ser mayor a 0";
    }
    if (!formData.leatherMaterialId && formData.leatherQtyPerUnit) {
      newErrors.leatherMaterialId = "Seleccione el material de cuero";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateItem = () => {
    const newErrors = {};
    if (!itemForm.materialId) newErrors.materialId = "El material es requerido";
    if (!itemForm.quantity || parseFloat(itemForm.quantity) <= 0) {
      newErrors.quantity = "La cantidad debe ser mayor a 0";
    }

    const material = availableMaterials.find(m => m.id === itemForm.materialId);
    if (material && material.uomId !== 3) {
      if (!itemForm.measurement?.trim()) {
        newErrors.measurement = "Especifique la medida";
      } else if (isNaN(parseFloat(itemForm.measurement))) {
        newErrors.measurement = "Debe ser un número válido";
      }
    }

    setItemErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddItem = () => {
    if (!validateItem()) return;

    const material = availableMaterials.find(m => m.id === parseInt(itemForm.materialId));
    if (!material) {
      setError("Material no encontrado");
      return;
    }

    const isUnitType = material.uomId === 3;
    const uomCode = getMaterialUom(material.id);

    const newItem = {
      materialId: parseInt(itemForm.materialId),
      quantity: parseFloat(itemForm.quantity),
      measurement: !isUnitType && itemForm.measurement ? parseFloat(itemForm.measurement) : null,
      measurementUnit: !isUnitType ? uomCode : null,
      lossPercentage: material.lossPercentage || 0,
    };

    setFormData({
      ...formData,
      items: [...formData.items, newItem],
    });

    setItemForm({
      ...itemForm,
      quantity: "",
      measurement: "",
    });
    setItemErrors({});
  };

  const handleRemoveItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      items: newItems,
    });
  };

  const handleEditItem = (index) => {
    setEditingIndex(index);
    setEditingItem({ ...formData.items[index] });
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingItem(null);
  };

  const handleSaveEdit = () => {
    if (!editingItem.quantity || parseFloat(editingItem.quantity) <= 0) {
      alert("La cantidad debe ser mayor a 0");
      return;
    }

    const material = availableMaterials.find(m => m.id === editingItem.materialId);
    const isUnitType = material?.uomId === 3;

    if (!isUnitType && (!editingItem.measurement || parseFloat(editingItem.measurement) <= 0)) {
      alert("La medida debe ser mayor a 0");
      return;
    }

    const newItems = [...formData.items];
    newItems[editingIndex] = {
      ...editingItem,
      quantity: parseFloat(editingItem.quantity),
      measurement: editingItem.measurement ? parseFloat(editingItem.measurement) : null,
      lossPercentage: editingItem.lossPercentage || 0, // ← PRESERVAR
    };

    setFormData({
      ...formData,
      items: newItems,
    });

    setEditingIndex(null);
    setEditingItem(null);
  };

  const getMaterialName = (materialId) => {
    if (!materialId) return "-";
    const material = availableMaterials.find((m) => m.id === materialId);
    if (!material) return `ID: ${materialId}`;
    return material.sku ? `${material.sku} - ${material.name || ""}` : material.name || `ID: ${materialId}`;
  };

  const getMaterialUom = (materialId) => {
    if (!materialId) return "";
    const material = availableMaterials.find((m) => m.id === materialId);
    console.log('getMaterialUom - Material:', material);
    console.log('getMaterialUom - Available UOMs:', availableUoms);
    if (!material || !material.uomId) return "";
    const uom = availableUoms.find((u) => u.id === material.uomId);
    console.log('getMaterialUom - Found UOM:', uom);
    return uom ? uom.code : "";
  };

  const getMaterialCost = (materialId) => {
    if (!materialId) return null;
    const material = availableMaterials.find((m) => m.id === materialId);
    return material && material.cost ? parseFloat(material.cost) : null;
  };

  const calculateItemCost = (materialId, quantity, measurement, lossPercentage) => {
    const materialCost = getMaterialCost(materialId);
    const material = availableMaterials.find(m => m.id === materialId);

    if (!materialCost || !material || !quantity) return null;

    const isUnitType = material.uomId === 3;
    const loss = lossPercentage ? parseFloat(lossPercentage) / 100 : 0;

    if (isUnitType) {
      // Para unidades: aplicar merma a la cantidad
      const adjustedQuantity = parseFloat(quantity) * (1 + loss);
      return materialCost * adjustedQuantity;
    } else {
      // Para otros: aplicar merma al total de material
      if (!measurement) return null;
      const totalMaterial = parseFloat(measurement) * parseFloat(quantity);
      const adjustedMaterial = totalMaterial * (1 + loss);
      return materialCost * adjustedMaterial;
    }
  };

  const calculateTotalCost = () => {
    return formData.items.reduce((total, item) => {
      const itemCost = calculateItemCost(item.materialId, item.quantity, item.measurement, item.lossPercentage);
      return total + (itemCost || 0);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      setError("");
      await syncProductLeatherOnlyFlag(formData.productId, leatherOnly);
      const submitData = {
        bomName: formData.bomName.trim(),
        productId: parseInt(formData.productId),
        colorId: formData.colorId ? parseInt(formData.colorId) : null,
        status: formData.status,
        leatherMaterialId: formData.leatherMaterialId ? parseInt(formData.leatherMaterialId) : null,
        leatherQtyPerUnit: formData.leatherQtyPerUnit ? parseFloat(formData.leatherQtyPerUnit) : null,
        items: formData.items.map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
          measurement: item.measurement || null,
          measurementUnit: item.measurementUnit || null,
          lossPercentage: item.lossPercentage || 0,
        })),
      };
      if (bomId) {
        await updateBom(bomId, submitData);
      } else {
        await createBom(submitData);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar la BOM");
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = availableProducts.find(p => p.id === formData.productId);

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {bomId ? "Editar BOM" : "Nueva BOM"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}

          {selectedProduct?.imageUrl && (
            <div className="text-center mb-4 pb-3" style={{ borderBottom: "1px solid #dee2e6" }}>
              <img
                src={selectedProduct.imageUrl}
                alt="Producto seleccionado"
                style={{
                  maxWidth: "200px",
                  maxHeight: "200px",
                  objectFit: "contain",
                  border: "2px solid #51cbce",
                  borderRadius: "8px",
                  padding: "10px",
                  backgroundColor: "#f8f9fa",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              />
              <div className="mt-2 text-muted small">
                {selectedProduct.code} - {selectedProduct.name}
              </div>
            </div>
          )}

          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Nombre de BOM *</Label>
                <Input
                  type="text"
                  value={formData.bomName}
                  onChange={(e) => setFormData({ ...formData, bomName: e.target.value })}
                  invalid={!!errors.bomName}
                />
                {errors.bomName && <div className="text-danger small">{errors.bomName}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label for="productId">Producto *</Label>
                <SearchableSelect
                  value={formData.productId}
                  onChange={handleProductChange}
                  options={availableProducts}
                  placeholder="Buscar producto..."
                  invalid={!!errors.productId}
                  disabled={loading}
                  getOptionLabel={(opt) => `${opt.code} - ${opt.name}`}
                  renderOption={(opt) => (
                    <>
                      {opt.imageUrl && (
                        <img
                          src={opt.imageUrl}
                          alt={opt.name}
                          style={{
                            width: "40px",
                            height: "40px",
                            objectFit: "cover",
                            borderRadius: "4px",
                          }}
                        />
                      )}
                      <span>{opt.code} - {opt.name}</span>
                    </>
                  )}
                />
                {errors.productId && <div className="text-danger small mt-1">{errors.productId}</div>}
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label for="colorId">Color</Label>
                <SearchableSelect
                  value={formData.colorId}
                  onChange={(id) => setFormData({ ...formData, colorId: id })}
                  options={availableColors}
                  placeholder="Buscar color (opcional)..."
                  disabled={loading}
                  getOptionLabel={(opt) => opt.name}
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Estado</Label>
                <Input
                  type="select"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="A">Activo</option>
                  <option value="I">Inactivo</option>
                </Input>
              </FormGroup>
            </Col>
          </Row>

          <hr />

          <h5>Configuración de cuero</h5>
          <div className="text-muted small mb-3">
            Define el cuero y la cantidad que consume cada unidad de este producto
            {formData.colorId ? " para el color seleccionado." : ". Sin color, aplica a todos los colores."}
          </div>
          <Row>
            <Col md="8">
              <FormGroup>
                <Label for="leatherMaterialId">Material de cuero</Label>
                <SearchableSelect
                  value={formData.leatherMaterialId}
                  onChange={(id) => setFormData({ ...formData, leatherMaterialId: id })}
                  options={availableMaterials}
                  placeholder="Buscar cuero..."
                  invalid={!!errors.leatherMaterialId}
                  disabled={loading}
                  getOptionLabel={(opt) => `${opt.sku || opt.code || ""} - ${opt.name || ""}`}
                />
                {errors.leatherMaterialId && (
                  <div className="text-danger small mt-1">{errors.leatherMaterialId}</div>
                )}
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Cantidad por unidad</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={formData.leatherQtyPerUnit}
                  onChange={(e) => setFormData({ ...formData, leatherQtyPerUnit: e.target.value })}
                  placeholder="Ej: 1"
                  invalid={!!errors.leatherQtyPerUnit}
                  disabled={loading}
                />
                {errors.leatherQtyPerUnit && (
                  <div className="text-danger small">{errors.leatherQtyPerUnit}</div>
                )}
              </FormGroup>
            </Col>
          </Row>

          <FormGroup check className="mt-2 mb-3">
            <Label check className="mb-0">
              <Input
                type="checkbox"
                checked={leatherOnly}
                onChange={(e) => handleLeatherOnlyChange(e.target.checked)}
                disabled={loading || !formData.productId}
              />
              <span className="form-check-sign" />
              <strong>Solo cuero</strong>
              <span className="text-muted font-weight-normal">
                {" "}
                — no requiere entrega de materiales de bodega (sin líneas de BOM)
              </span>
            </Label>
            <p className="text-muted small mb-0 mt-2" style={{ paddingLeft: 35 }}>
              {leatherOnly
                ? "El producto no aparecerá en entrega de materiales; solo aplica cuero en producción."
                : "Desmarque para definir materiales (hebillas, hilos, etc.) en la receta."}
            </p>
          </FormGroup>

          <hr />

          {!leatherOnly && (
          <>
          <h5>Items de BOM</h5>
          {errors.items && <div className="text-danger small mb-2">{errors.items}</div>}

          <Row className="mb-3">
            <Col md="4">
              <FormGroup>
                <Label for="materialId">Material *</Label>
                <SearchableSelect
                  value={itemForm.materialId}
                  onChange={(id) => setItemForm({ ...itemForm, materialId: id })}
                  options={availableMaterials}
                  placeholder="Buscar material..."
                  invalid={!!itemErrors.materialId}
                  getOptionLabel={(opt) => `${opt.sku || opt.code || ""} - ${opt.name || ""}`}
                />
                {itemErrors.materialId && (
                  <div className="text-danger small mt-1">{itemErrors.materialId}</div>
                )}
              </FormGroup>
            </Col>

            {itemForm.materialId && (() => {
              const material = availableMaterials.find(m => m.id === itemForm.materialId);
              return material && material.uomId !== 3;
            })() && (
                <Col md="2">
                  <FormGroup>
                    <Label>
                      Medida ({(() => {
                        const material = availableMaterials.find(m => m.id === itemForm.materialId);
                        return getMaterialUom(material?.id) || "UOM";
                      })()}) *
                    </Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={itemForm.measurement}
                      onChange={(e) => setItemForm({ ...itemForm, measurement: e.target.value })}
                      placeholder="Ej: 8"
                      invalid={!!itemErrors.measurement}
                    />
                    {itemErrors.measurement && (
                      <div className="text-danger small">{itemErrors.measurement}</div>
                    )}
                  </FormGroup>
                </Col>
              )}

            <Col md={itemForm.materialId && (() => {
              const material = availableMaterials.find(m => m.id === itemForm.materialId);
              return material && material.uomId !== 3;
            })() ? "2" : "4"}>
              <FormGroup>
                <Label>
                  {itemForm.materialId && (() => {
                    const material = availableMaterials.find(m => m.id === itemForm.materialId);
                    return material && material.uomId !== 3 ? "Cant. de piezas" : "Cantidad";
                  })() || "Cantidad"} *
                </Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                  placeholder={itemForm.materialId && (() => {
                    const material = availableMaterials.find(m => m.id === itemForm.materialId);
                    return material && material.uomId !== 3 ? "Ej: 2" : "Ej: 5";
                  })() || ""}
                  invalid={!!itemErrors.quantity}
                />
                {itemErrors.quantity && (
                  <div className="text-danger small">{itemErrors.quantity}</div>
                )}
              </FormGroup>
            </Col>

            <Col md={itemForm.materialId && (() => {
              const material = availableMaterials.find(m => m.id === itemForm.materialId);
              return material && material.uomId !== 3;
            })() ? "4" : "4"} className="d-flex align-items-end">
              <Button
                type="button"
                color="primary"
                onClick={handleAddItem}
                className="w-100"
                disabled={loading}
              >
                <i className="nc-icon nc-simple-add" /> Agregar
              </Button>
            </Col>
          </Row>

          {formData.items.length > 0 && (
            <>
              <Table responsive>
                <thead className="text-primary">
                  <tr>
                    <th>Material</th>
                    <th>Medida</th>
                    <th>Cantidad</th>
                    <th>Costo Unit.</th>
                    <th>Costo Total</th>
                    <th className="text-right" style={{ minWidth: "120px" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, index) => {
                    const material = availableMaterials.find(m => m.id === item.materialId);
                    const isUnitType = material?.uomId === 3;
                    const materialCost = getMaterialCost(item.materialId);
                    const itemCost = calculateItemCost(item.materialId, item.quantity, item.measurement, item.lossPercentage);
                    const uomCode = getMaterialUom(item.materialId);
                    const isEditing = editingIndex === index;

                    const loss = item.lossPercentage ? parseFloat(item.lossPercentage) / 100 : 0;
                    const realMeasurement = item.measurement ? parseFloat(item.measurement) * (1 + loss) : null;


                    return (
                      <tr key={index}>
                        <td>{getMaterialName(item.materialId)}</td>
                        <td>
                          {isEditing && !isUnitType ? (
                            <Input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={editingItem.measurement || ""}
                              onChange={(e) => setEditingItem({ ...editingItem, measurement: e.target.value })}
                              style={{ width: "100px" }}
                            />
                          ) : (
                            <>
                              {!isUnitType && realMeasurement ? (
                                <span className="badge badge-info">
                                  {realMeasurement.toFixed(3)} {item.measurementUnit}
                                </span>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <Input
                              type="number"
                              step="1"
                              min="1"
                              value={editingItem.quantity || ""}
                              onChange={(e) => setEditingItem({ ...editingItem, quantity: e.target.value })}
                              style={{ width: "80px" }}
                            />
                          ) : (
                            <>
                              <strong>{parseFloat(item.quantity).toFixed(0)}</strong>
                              {isUnitType && uomCode && <span className="text-muted ml-1">({uomCode})</span>}
                              {!isUnitType && <span className="text-muted ml-1">(piezas)</span>}
                            </>
                          )}
                        </td>
                        <td>
                          {materialCost ? (
                            <>
                              <span className="text-info">Q {materialCost.toFixed(2)}</span>
                              <span className="text-muted small d-block">por {uomCode}</span>
                            </>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>
                          {itemCost ? (
                            <strong className="text-success">Q {itemCost.toFixed(2)}</strong>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing ? (
                            <div style={{ display: "flex", gap: "5px", justifyContent: "flex-end" }}>
                              <Button
                                type="button"
                                color="success"
                                size="sm"
                                onClick={handleSaveEdit}
                                className="btn-round"
                                title="Guardar"
                              >
                                <i className="nc-icon nc-check-2" />
                              </Button>
                              <Button
                                type="button"
                                color="secondary"
                                size="sm"
                                onClick={handleCancelEdit}
                                className="btn-round"
                                title="Cancelar"
                              >
                                <i className="nc-icon nc-simple-remove" />
                              </Button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: "5px", justifyContent: "flex-end" }}>
                              <Button
                                type="button"
                                color="info"
                                size="sm"
                                onClick={() => handleEditItem(index)}
                                className="btn-round"
                                title="Editar"
                              >
                                <i className="nc-icon nc-ruler-pencil" />
                              </Button>
                              <Button
                                type="button"
                                color="danger"
                                size="sm"
                                onClick={() => handleRemoveItem(index)}
                                className="btn-round"
                                title="Eliminar"
                              >
                                <i className="nc-icon nc-simple-remove" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <div className="mt-3 p-3 bg-light rounded">
                <Row>
                  <Col md="6">
                    <strong>Total de Items: {formData.items.length}</strong>
                  </Col>
                  <Col md="6" className="text-right">
                    <strong className="text-success" style={{ fontSize: "1.2em" }}>
                      Costo Total BOM: Q {calculateTotalCost().toFixed(2)}
                    </strong>
                  </Col>
                </Row>
              </div>
            </>
          )}
          </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : bomId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default BomForm;