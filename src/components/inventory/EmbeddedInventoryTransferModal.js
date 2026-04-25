import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Row,
  Col,
  FormGroup,
  Label,
  Input,
  Spinner,
  Alert,
} from "reactstrap";
import { createInventoryTransfer } from "services/inventoryService";
import { getLocations } from "services/locationService";
import { getProducts } from "services/productService";
import { getMaterials } from "services/materialService";
import { getColors } from "services/colorService";
import { showError, showSuccess } from "utils/notificationHelper";

/**
 * Crear transferencia desde inventario (material o producto) con valores iniciales opcionales.
 */
function EmbeddedInventoryTransferModal({
  isOpen,
  toggle,
  transferMode = "material",
  initialMaterialId,
  initialProductId,
  initialColorId,
  initialFromLocationId,
  lockTransferMode = false,
  title,
  /** Resumen del ítem elegido en inventario (texto o JSX) */
  selectionSummary = null,
  onCreated,
}) {
  const [mode, setMode] = useState(transferMode);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fromLocationId: "",
    toLocationId: "",
    productId: "",
    colorId: "",
    materialId: "",
    quantity: "",
    reason: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    setMode(transferMode);
    setFormData({
      fromLocationId: initialFromLocationId ? String(initialFromLocationId) : "",
      toLocationId: "",
      productId: initialProductId ? String(initialProductId) : "",
      colorId: initialColorId ? String(initialColorId) : "",
      materialId: initialMaterialId ? String(initialMaterialId) : "",
      quantity: "",
      reason: "",
    });
  }, [
    isOpen,
    transferMode,
    initialMaterialId,
    initialProductId,
    initialColorId,
    initialFromLocationId,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const [l, p, m, c] = await Promise.all([
          getLocations(),
          getProducts(),
          getMaterials(),
          getColors(),
        ]);
        setLocations(l || []);
        setProducts(p || []);
        setMaterials(m || []);
        setColors(c || []);
      } catch (e) {
        showError(e.message || "Error al cargar catálogos");
      }
    })();
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!formData.fromLocationId || !formData.toLocationId) {
      showError("Debe seleccionar ubicación origen y destino");
      return;
    }
    if (formData.fromLocationId === formData.toLocationId) {
      showError("La ubicación origen y destino deben ser diferentes");
      return;
    }
    if (mode === "product" && !formData.productId) {
      showError("Debe seleccionar un producto");
      return;
    }
    if (mode === "material" && !formData.materialId) {
      showError("Debe seleccionar un material");
      return;
    }
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      showError("Debe ingresar una cantidad válida mayor a cero");
      return;
    }

    try {
      setLoading(true);
      const transferData = {
        fromLocationId: parseInt(formData.fromLocationId, 10),
        toLocationId: parseInt(formData.toLocationId, 10),
        quantity: parseFloat(formData.quantity),
        reason: formData.reason || "Transferencia desde inventario",
        ...(mode === "product"
          ? {
              productId: parseInt(formData.productId, 10),
              colorId: formData.colorId ? parseInt(formData.colorId, 10) : null,
            }
          : { materialId: parseInt(formData.materialId, 10) }),
      };
      await createInventoryTransfer(transferData);
      showSuccess("Transferencia creada correctamente");
      onCreated?.();
      toggle();
    } catch (err) {
      showError(err.message || "Error al crear la transferencia");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {title || "Nueva transferencia"}
      </ModalHeader>
      <ModalBody>
        {selectionSummary ? (
          <Alert color="light" className="border mb-3">
            <div className="small font-weight-bold text-uppercase text-muted mb-1">
              Ítem seleccionado en inventario
            </div>
            <div className="small mb-0">{selectionSummary}</div>
          </Alert>
        ) : null}
        <Row>
          <Col md="12" className="mb-3">
            <FormGroup>
              <Label>Tipo</Label>
              <Input
                type="select"
                value={mode}
                disabled={lockTransferMode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setFormData((f) => ({
                    ...f,
                    productId: "",
                    colorId: "",
                    materialId: "",
                  }));
                }}
              >
                <option value="product">Producto</option>
                <option value="material">Material</option>
              </Input>
            </FormGroup>
          </Col>
          <Col md="6">
            <FormGroup>
              <Label>Ubicación origen *</Label>
              <Input
                type="select"
                value={formData.fromLocationId}
                onChange={(e) =>
                  setFormData({ ...formData, fromLocationId: e.target.value })
                }
              >
                <option value="">Seleccione...</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </Input>
            </FormGroup>
          </Col>
          <Col md="6">
            <FormGroup>
              <Label>Ubicación destino *</Label>
              <Input
                type="select"
                value={formData.toLocationId}
                onChange={(e) =>
                  setFormData({ ...formData, toLocationId: e.target.value })
                }
              >
                <option value="">Seleccione...</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </Input>
            </FormGroup>
          </Col>
          <Col md="6">
            <FormGroup>
              <Label>{mode === "product" ? "Producto *" : "Material *"}</Label>
              <Input
                type="select"
                value={mode === "product" ? formData.productId : formData.materialId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    [mode === "product" ? "productId" : "materialId"]: e.target.value,
                  })
                }
                disabled={
                  (mode === "material" && !!initialMaterialId) ||
                  (mode === "product" && !!initialProductId)
                }
              >
                <option value="">Seleccione...</option>
                {mode === "product"
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
          {mode === "product" && (
            <Col md="6">
              <FormGroup>
                <Label>Color (opcional)</Label>
                <Input
                  type="select"
                  value={formData.colorId}
                  onChange={(e) =>
                    setFormData({ ...formData, colorId: e.target.value })
                  }
                  disabled={!formData.productId}
                >
                  <option value="">Sin color</option>
                  {colors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
          )}
          <Col md={mode === "product" ? 12 : 6}>
            <FormGroup>
              <Label>Cantidad *</Label>
              <Input
                type="number"
                step="0.001"
                min="0.001"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: e.target.value })
                }
                placeholder="0.000"
              />
            </FormGroup>
          </Col>
          <Col md="12">
            <FormGroup>
              <Label>Motivo</Label>
              <Input
                type="textarea"
                rows="2"
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
                placeholder="Motivo de la transferencia..."
              />
            </FormGroup>
          </Col>
        </Row>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle} disabled={loading}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Creando...
            </>
          ) : (
            "Crear transferencia"
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default EmbeddedInventoryTransferModal;
