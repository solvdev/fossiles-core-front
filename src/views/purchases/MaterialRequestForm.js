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
} from "reactstrap";
import {
  createMaterialRequest,
  getMaterialRequestById,
  updateMaterialRequest,
} from "services/materialRequestService";
import { getMaterials, searchMaterials, getMaterialById } from "services/materialService";
import { getSuppliers } from "services/supplierService";
import { showSuccess, showError } from "utils/notificationHelper";

// Componente Select con búsqueda mejorado (igual que en BomForm)
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

  // ✅ CORREGIDO: Ahora funciona igual que BomForm - muestra resultados inmediatamente
  const filteredOptions = options.filter(opt => {
    try {
      const label = getOptionLabel(opt).toLowerCase();
      const searchLower = search.toLowerCase();
      const matches = label.includes(searchLower);
      
      // Debug: descomentar para ver qué está pasando
      // if (searchLower.includes('argolla')) {
      //   console.log('Filtrando:', {
      //     optionId: opt.id,
      //     label,
      //     searchLower,
      //     matches
      //   });
      // }
      
      return matches;
    } catch (err) {
      console.error("Error al filtrar opción:", opt, err);
      return false;
    }
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

function MaterialRequestForm({ requestId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    origin: "REPOSICION",
    observations: "",
    items: [],
  });
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [singleSupplierMode, setSingleSupplierMode] = useState(true); // Modo: true = un solo proveedor, false = múltiples
  const [globalSupplierId, setGlobalSupplierId] = useState(""); // Proveedor global cuando es modo único
  const [itemForm, setItemForm] = useState({
    materialId: "",
    quantityRequested: "",
    uomId: "",
    supplierId: "",
  });
  const [errors, setErrors] = useState({});
  const [itemErrors, setItemErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestStatus, setRequestStatus] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadMaterials();
      loadSuppliers();
      if (requestId) {
        loadRequest();
      } else {
        resetForm();
      }
    }
  }, [isOpen, requestId]);

  // Determinar el proveedor a usar según el modo
  const currentSupplierId = singleSupplierMode ? globalSupplierId : itemForm.supplierId;

  // Filtrar materiales por proveedor seleccionado
  const filteredMaterials = useMemo(() => {
    const supplierIdToUse = singleSupplierMode ? globalSupplierId : itemForm.supplierId;
    if (!supplierIdToUse) {
      return materials; // Si no hay proveedor seleccionado, mostrar todos
    }
    return materials.filter((m) => m.supplierId === parseInt(supplierIdToUse));
  }, [materials, singleSupplierMode, globalSupplierId, itemForm.supplierId]);

  // Actualizar selectedMaterial cuando cambia itemForm.materialId
  useEffect(() => {
    if (itemForm.materialId) {
      // Primero buscar en materials cargados
      const material = materials.find((m) => m.id === itemForm.materialId);
      if (material) {
        setSelectedMaterial(material);
      } else {
        // Si no está en materials, cargarlo desde el backend
        loadMaterialById(itemForm.materialId);
      }
    } else {
      setSelectedMaterial(null);
    }
  }, [itemForm.materialId, materials]);

  // Limpiar material cuando cambia el proveedor (solo en modo múltiples)
  useEffect(() => {
    if (!singleSupplierMode && itemForm.supplierId && itemForm.materialId) {
      // Si el material seleccionado no pertenece al nuevo proveedor, limpiarlo
      const material = materials.find((m) => m.id === itemForm.materialId);
      if (material && material.supplierId !== parseInt(itemForm.supplierId)) {
        setItemForm(prev => ({ ...prev, materialId: "" }));
        setSelectedMaterial(null);
      }
    } else if (!singleSupplierMode && !itemForm.supplierId && itemForm.materialId) {
      // Si se quita el proveedor, limpiar el material también
      setItemForm(prev => ({ ...prev, materialId: "" }));
      setSelectedMaterial(null);
    }
  }, [itemForm.supplierId, itemForm.materialId, materials, singleSupplierMode]);

  // Limpiar material cuando cambia el proveedor global (modo único)
  useEffect(() => {
    if (singleSupplierMode && globalSupplierId && itemForm.materialId) {
      const material = materials.find((m) => m.id === itemForm.materialId);
      if (material && material.supplierId !== parseInt(globalSupplierId)) {
        setItemForm(prev => ({ ...prev, materialId: "" }));
        setSelectedMaterial(null);
      }
    } else if (singleSupplierMode && !globalSupplierId && itemForm.materialId) {
      setItemForm(prev => ({ ...prev, materialId: "" }));
      setSelectedMaterial(null);
    }
  }, [globalSupplierId, itemForm.materialId, materials, singleSupplierMode]);

  const loadMaterialById = async (materialId) => {
    try {
      const material = await getMaterialById(materialId);
      if (material) {
        setSelectedMaterial(material);
        // Agregar a materials si no está
        if (!materials.find((m) => m.id === materialId)) {
          setMaterials([...materials, material]);
        }
      }
    } catch (err) {
      console.error("Error al cargar material:", err);
    }
  };

  const loadMaterials = async () => {
    try {
      const data = await getMaterials();
      setMaterials(data || []);
    } catch (err) {
      console.error("Error al cargar materiales:", err);
    }
  };

  const loadSuppliers = async () => {
    try {
      const data = await getSuppliers();
      setSuppliers(data || []);
    } catch (err) {
      console.error("Error al cargar proveedores:", err);
    }
  };


  const loadRequest = async () => {
    try {
      setLoading(true);
      const data = await getMaterialRequestById(requestId);
      setRequestStatus(data.status);
      
      // Validar que solo se puedan editar solicitudes pendientes o rechazadas
      if (data.status !== "PENDIENTE" && data.status !== "RECHAZADA") {
        let message = "";
        if (data.status === "COMPRADA") {
          message = "No se puede editar una solicitud que ya ha sido comprada.";
        } else if (data.status === "APROBADA") {
          message = "No se puede editar una solicitud aprobada. Si necesita cambios, debe rechazarla primero desde la revisión de solicitudes.";
        } else {
          message = `No se puede editar una solicitud en estado ${data.status}. Solo se pueden editar solicitudes en estado PENDIENTE o RECHAZADA.`;
        }
        setError(message);
        showError(message);
        return;
      }
      
      setFormData({
        origin: data.origin || "REPOSICION",
        observations: data.observations || "",
        items: data.items || [],
      });

      // Cargar materiales de los items para que estén disponibles en el select
      if (data.items && data.items.length > 0) {
        const materialIds = data.items.map(item => item.materialId).filter(Boolean);
        const uniqueMaterialIds = [...new Set(materialIds)];
        const loadedMaterials = await Promise.all(
          uniqueMaterialIds.map(async (materialId) => {
            try {
              return await getMaterialById(materialId);
            } catch (err) {
              console.error(`Error al cargar material ${materialId}:`, err);
              return null;
            }
          })
        );
        const validMaterials = loadedMaterials.filter(Boolean);
        // Agregar materiales cargados al estado sin duplicados
        setMaterials(prevMaterials => {
          const existingIds = new Set(prevMaterials.map(m => m.id));
          const newMaterials = validMaterials.filter(m => !existingIds.has(m.id));
          return [...prevMaterials, ...newMaterials];
        });
      }
    } catch (err) {
      setError(err.message || "Error al cargar la solicitud");
      showError(err.message || "Error al cargar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      origin: "REPOSICION",
      observations: "",
      items: [],
    });
    setItemForm({
      materialId: "",
      quantityRequested: "",
      uomId: "",
      supplierId: "",
    });
    setSelectedMaterial(null);
    setSingleSupplierMode(true);
    setGlobalSupplierId("");
    setErrors({});
    setItemErrors({});
    setError("");
    setRequestStatus(null);
  };

  const validate = () => {
    const newErrors = {};
    // El origen ya no es obligatorio
    if (formData.items.length === 0) {
      newErrors.items = "Debe agregar al menos un material";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateItem = () => {
    const newErrors = {};
    const supplierIdToUse = singleSupplierMode ? globalSupplierId : itemForm.supplierId;
    if (!supplierIdToUse) {
      if (singleSupplierMode) {
        newErrors.globalSupplier = "El proveedor es requerido";
      } else {
        newErrors.supplierId = "El proveedor es requerido";
      }
    }
    if (!itemForm.materialId) newErrors.materialId = "El material es requerido";
    if (!itemForm.quantityRequested || parseFloat(itemForm.quantityRequested) <= 0) {
      newErrors.quantityRequested = "La cantidad debe ser mayor a 0";
    }
    setItemErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddItem = () => {
    if (!validateItem()) return;

    // Usar el proveedor según el modo
    let supplierIdToUse = singleSupplierMode ? globalSupplierId : itemForm.supplierId;
    
    // Si no hay proveedor seleccionado, usar el proveedor del material como fallback
    if (!supplierIdToUse && selectedMaterial && selectedMaterial.supplierId) {
      supplierIdToUse = selectedMaterial.supplierId.toString();
    }

    const newItem = {
      materialId: itemForm.materialId,
      quantityRequested: parseFloat(itemForm.quantityRequested),
      uomId: itemForm.uomId ? parseInt(itemForm.uomId) : null,
      supplierId: supplierIdToUse ? parseInt(supplierIdToUse) : null,
    };

    setFormData({
      ...formData,
      items: [...formData.items, newItem],
    });

    // Limpiar formulario según el modo
    if (singleSupplierMode) {
      // En modo único, mantener el proveedor global, solo limpiar material y cantidad
      setItemForm({
        materialId: "",
        quantityRequested: "",
        uomId: "",
        supplierId: "", // No se usa en modo único pero lo mantenemos limpio
      });
    } else {
      // En modo múltiple, limpiar todo incluyendo el proveedor
      setItemForm({
        materialId: "",
        quantityRequested: "",
        uomId: "",
        supplierId: "",
      });
    }
    setItemErrors({});
    setSelectedMaterial(null);
  };

  const handleRemoveItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const getMaterialName = (materialId) => {
    if (!materialId) return "-";
    const material = materials.find((m) => m.id === materialId);
    return material ? `${material.sku} - ${material.name}` : `ID: ${materialId}`;
  };

  // Calcular equivalencia en tiempo real
  const calculateEquivalence = () => {
    if (!selectedMaterial || !itemForm.quantityRequested) return null;
    const quantity = parseFloat(itemForm.quantityRequested);
    if (isNaN(quantity) || quantity <= 0) return null;
    
    // purchaseQuantity es el factor de conversión: cuántas unidades de manufactura hay en 1 unidad de compra
    // NO usar selectedMaterial.quantity como fallback porque es el stock actual, no el factor de conversión
    const purchaseQuantity = selectedMaterial.purchaseQuantity ?? 1;
    const equivalentQuantity = quantity * purchaseQuantity;
    const totalCost = quantity * (selectedMaterial.purchasePrice || 0);
    
    return {
      equivalentQuantity,
      totalCost,
      purchaseUom: selectedMaterial.purchaseUomName || selectedMaterial.purchaseUomCode || "unidad",
      manufacturingUom: selectedMaterial.manufacturingUomName || selectedMaterial.manufacturingUomCode || "unidad",
    };
  };

  const equivalence = calculateEquivalence();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validación adicional: Si está editando, verificar el estado
    if (requestId && requestStatus) {
      if (requestStatus !== "PENDIENTE" && requestStatus !== "RECHAZADA") {
        let message = "";
        if (requestStatus === "COMPRADA") {
          message = "No se puede editar una solicitud que ya ha sido comprada.";
        } else if (requestStatus === "APROBADA") {
          message = "No se puede editar una solicitud aprobada. Si necesita cambios, debe rechazarla primero desde la revisión de solicitudes.";
        } else {
          message = `No se puede editar una solicitud en estado ${requestStatus}. Solo se pueden editar solicitudes en estado PENDIENTE o RECHAZADA.`;
        }
        setError(message);
        showError(message);
        return;
      }
    }
    
    if (!validate()) {
      showError("Por favor complete todos los campos requeridos");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const submitData = {
        origin: formData.origin,
        items: formData.items,
        ...(formData.observations && { observations: formData.observations }),
      };

      if (requestId) {
        await updateMaterialRequest(requestId, submitData);
        showSuccess("Solicitud de materiales actualizada correctamente");
      } else {
        await createMaterialRequest(submitData);
        showSuccess("Solicitud de materiales creada correctamente");
      }
      resetForm();
      setRequestStatus(null);
      onSuccess();
    } catch (err) {
      const errorMessage = err.message || "Error al guardar la solicitud";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>
        {requestId ? "Editar Solicitud de Materiales" : "Nueva Solicitud de Materiales"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}

          <hr />
          <h5>Agregar Materiales</h5>
          
          {/* Selector de modo */}
          <Row className="mb-3">
            <Col md="12">
              <FormGroup>
                <Label>Tipo de Solicitud</Label>
                <Input
                  type="select"
                  value={singleSupplierMode ? "single" : "multiple"}
                  onChange={(e) => {
                    const isSingle = e.target.value === "single";
                    setSingleSupplierMode(isSingle);
                    if (isSingle) {
                      // Limpiar proveedor del itemForm cuando cambia a modo único
                      setItemForm({ ...itemForm, supplierId: "", materialId: "" });
                      setSelectedMaterial(null);
                    } else {
                      // Limpiar proveedor global cuando cambia a modo múltiple
                      setGlobalSupplierId("");
                      setItemForm({ ...itemForm, materialId: "" });
                      setSelectedMaterial(null);
                    }
                  }}
                  disabled={formData.items.length > 0} // Bloquear si ya hay materiales agregados
                >
                  <option value="single">Un solo proveedor (seleccionar una vez)</option>
                  <option value="multiple">Múltiples proveedores (seleccionar por cada material)</option>
                </Input>
                {formData.items.length > 0 && (
                  <small className="text-muted d-block mt-1">
                    El tipo de solicitud está bloqueado porque ya hay materiales agregados. Elimine los materiales para cambiar el tipo.
                  </small>
                )}
              </FormGroup>
            </Col>
          </Row>

          {/* Proveedor según el modo */}
          {singleSupplierMode ? (
            <Row className="mb-3">
              <Col md="12">
                <FormGroup>
                  <Label>Proveedor * (aplicará a todos los materiales)</Label>
                  <Input
                    type="select"
                    value={globalSupplierId}
                    onChange={(e) => {
                      const supplierId = e.target.value;
                      setGlobalSupplierId(supplierId);
                      setItemForm({ ...itemForm, materialId: "" }); // Limpiar material al cambiar proveedor
                      setSelectedMaterial(null);
                    }}
                    invalid={!!itemErrors.globalSupplier}
                    disabled={formData.items.length > 0} // Bloquear si ya hay materiales agregados
                  >
                    <option value="">Seleccione un proveedor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </Input>
                  {formData.items.length > 0 && (
                    <small className="text-muted d-block mt-1">
                      El proveedor está bloqueado porque ya hay materiales agregados. Elimine los materiales para cambiar el proveedor.
                    </small>
                  )}
                  {itemErrors.globalSupplier && (
                    <div className="text-danger small mt-1">{itemErrors.globalSupplier}</div>
                  )}
                </FormGroup>
              </Col>
            </Row>
          ) : (
            <Row className="mb-3">
              <Col md="12">
                <FormGroup>
                  <Label>Proveedor * (por material)</Label>
                  <Input
                    type="select"
                    value={itemForm.supplierId}
                    onChange={(e) => {
                      const supplierId = e.target.value;
                      setItemForm({ 
                        ...itemForm, 
                        supplierId: supplierId,
                        materialId: "" // Limpiar material al cambiar proveedor
                      });
                      setSelectedMaterial(null);
                    }}
                    invalid={!!itemErrors.supplierId}
                  >
                    <option value="">Seleccione un proveedor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </Input>
                  {itemErrors.supplierId && (
                    <div className="text-danger small mt-1">{itemErrors.supplierId}</div>
                  )}
                </FormGroup>
              </Col>
            </Row>
          )}
          {/* Segunda fila: Material, Cantidad y Botón */}
          <Row className="align-items-start">
            <Col md="6">
              <FormGroup>
                <Label>Material *</Label>
                <SearchableSelect
                  value={itemForm.materialId}
                  onChange={(id) => {
                    const material = filteredMaterials.find((m) => m.id === id);
                    setItemForm({ ...itemForm, materialId: id });
                    setSelectedMaterial(material || null);
                  }}
                  options={filteredMaterials}
                  placeholder={currentSupplierId ? "Buscar material..." : "Seleccione proveedor primero"}
                  invalid={!!itemErrors.materialId}
                  disabled={!currentSupplierId}
                  getOptionLabel={(opt) => {
                    const sku = opt.sku || opt.code || "";
                    const name = opt.name || "";
                    return sku && name ? `${sku} - ${name}` : name || sku || `ID: ${opt.id}`;
                  }}
                />
                {itemErrors.materialId && (
                  <div className="text-danger small mt-1">{itemErrors.materialId}</div>
                )}
                {/* Información del material seleccionado - aparece debajo del select */}
                {selectedMaterial && (
                  <div className="p-2 bg-light rounded mt-2">
                    <div>
                      <strong>{selectedMaterial.sku} - {selectedMaterial.name}</strong>
                    </div>
                    {selectedMaterial.conversionText && (
                      <small className="d-block">{selectedMaterial.conversionText}</small>
                    )}
                    {selectedMaterial.priceBreakdown && (
                      <small className="d-block">{selectedMaterial.priceBreakdown}</small>
                    )}
                    {selectedMaterial.currentStock !== undefined && (
                      <small className="d-block">
                        Stock actual: <strong>{selectedMaterial.currentStock} {selectedMaterial.manufacturingUomName || ""}</strong>
                      </small>
                    )}
                  </div>
                )}
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Cantidad *</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={itemForm.quantityRequested}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, quantityRequested: e.target.value })
                  }
                  invalid={!!itemErrors.quantityRequested}
                  placeholder="Cantidad"
                  disabled={!itemForm.materialId}
                />
                {selectedMaterial && (
                  <small className="text-muted">
                    en {selectedMaterial.purchaseUomName || selectedMaterial.purchaseUomCode || "unidades"}
                  </small>
                )}
                {itemErrors.quantityRequested && (
                  <div className="text-danger small">{itemErrors.quantityRequested}</div>
                )}
                {/* Info de equivalencia justo debajo del campo de cantidad */}
                {equivalence && (
                  <div className="p-2 bg-info text-white rounded mt-2" style={{ fontSize: '0.85rem' }}>
                    <div>
                      <strong>Equivale a:</strong> {equivalence.equivalentQuantity.toFixed(2)} {equivalence.manufacturingUom}
                    </div>
                    <div className="mt-1">
                      <strong>Costo:</strong> Q {equivalence.totalCost.toFixed(2)}
                    </div>
                  </div>
                )}
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup style={{ marginBottom: 0 }}>
                <Label style={{ marginBottom: '0.5rem', display: 'block' }}>&nbsp;</Label>
                <Button 
                  color="primary" 
                  block 
                  onClick={handleAddItem}
                  disabled={!currentSupplierId || !itemForm.materialId}
                  style={{ 
                    fontSize: '0.95rem', 
                    padding: '0.375rem 0.75rem',
                    height: 'calc(1.5em + 0.75rem + 2px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <strong>+</strong> Agregar
                </Button>
              </FormGroup>
            </Col>
          </Row>

          {errors.items && (
            <div className="text-danger small mb-2">{errors.items}</div>
          )}

          {formData.items.length > 0 && (
            <div className="mt-3">
              <h5>Materiales en esta solicitud</h5>
              <Table responsive>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Cantidad (Compra)</th>
                    <th>Equivale a (Manufactura)</th>
                    <th>Proveedor</th>
                    <th>Costo</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, index) => {
                    const material = materials.find((m) => m.id === item.materialId);
                    // Usar supplierId del item, o si no tiene, usar el del material como fallback
                    const supplierIdToUse = item.supplierId || (material?.supplierId || null);
                    
                    // Buscar el proveedor: primero por supplierId del item, luego del material
                    let supplier = null;
                    if (supplierIdToUse) {
                      supplier = suppliers.find((s) => s.id === supplierIdToUse);
                    }
                    // Si no se encuentra en suppliers, usar el supplierName del material si está disponible
                    const supplierName = supplier 
                      ? supplier.name 
                      : (material?.supplierName || null);
                    
                    // purchaseQuantity es el factor de conversión: cuántas unidades de manufactura hay en 1 unidad de compra
                    // NO usar material.quantity como fallback porque es el stock actual, no el factor de conversión
                    const purchaseQuantity = material?.purchaseQuantity ?? 1;
                    const equivalentQty = material
                      ? (item.quantityRequested * purchaseQuantity).toFixed(2)
                      : "-";
                    const totalCost = material && material.purchasePrice
                      ? (item.quantityRequested * material.purchasePrice).toFixed(2)
                      : "-";
                    return (
                      <tr key={index}>
                        <td>{getMaterialName(item.materialId)}</td>
                        <td>
                          {parseFloat(item.quantityRequested).toFixed(2)} {material?.purchaseUomName || material?.purchaseUomCode || ""}
                        </td>
                        <td>
                          {equivalentQty} {material?.manufacturingUomName || material?.manufacturingUomCode || ""}
                        </td>
                        <td>
                          {supplierName ? (
                            <Badge color="info">{supplierName}</Badge>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>Q {totalCost}</td>
                        <td>
                          <Button
                            color="danger"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                          >
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" className="text-right">
                      <strong>Total:</strong>
                    </td>
                    <td>
                      <strong>
                        Q{" "}
                        {formData.items
                          .reduce((sum, item) => {
                            const material = materials.find((m) => m.id === item.materialId);
                            return (
                              sum +
                              (material && material.purchasePrice
                                ? item.quantityRequested * material.purchasePrice
                                : 0)
                            );
                          }, 0)
                          .toFixed(2)}
                      </strong>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          )}

          <FormGroup>
            <Label>Observaciones</Label>
            <Input
              type="textarea"
              rows="3"
              value={formData.observations}
              onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
              disabled={loading}
            />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default MaterialRequestForm;