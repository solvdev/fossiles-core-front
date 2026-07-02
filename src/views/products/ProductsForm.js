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
} from "reactstrap";
import { getProductById, createProduct, updateProduct } from "services/productService";
import { getProductCategories } from "services/productCategoryService";
import { PRODUCT_AUDIENCE_OPTIONS } from "utils/productAudienceHelper";
import { CINCHO_TYPE_OPTIONS } from "utils/productCinchoHelper";
import { uploadImage } from "services/uploadService";

function ProductsForm({ productId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    categoryId: "",
    audienceCategory: "UNISEX",
    cinchoType: "",
    prdTime: "",
    salePrice: "",
    sellerPrice: "",
    leatherConsumption: "",
    imageUrl: "",
    status: "A",
  });
  const [availableCategories, setAvailableCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      if (productId) {
        loadProduct();
      } else {
        resetForm();
      }
    }
  }, [isOpen, productId]);

  const loadCategories = async () => {
    try {
      const categories = await getProductCategories();
      setAvailableCategories(categories || []);
    } catch (err) {
      console.error("Error al cargar categorías:", err);
    }
  };

  const loadProduct = async () => {
    try {
      setLoading(true);
      const product = await getProductById(productId);
      setFormData({
        code: product.code || "",
        name: product.name || "",
        categoryId: product.categoryId || "",
        audienceCategory: product.audienceCategory || "UNISEX",
        cinchoType: product.cinchoType || "",
        prdTime: product.prdTime || "",
        salePrice: product.salePrice || "",
        sellerPrice: product.sellerPrice || "",
        leatherConsumption: product.leatherConsumption || "",
        imageUrl: product.imageUrl || "",
        status: product.status || "A",
      });
    } catch (err) {
      setError(err.message || "Error al cargar el producto");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      categoryId: "",
      audienceCategory: "UNISEX",
      cinchoType: "",
      prdTime: "",
      salePrice: "",
      sellerPrice: "",
      leatherConsumption: "",
      imageUrl: "",
      status: "A",
    });
    setErrors({});
    setError("");
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

  const validate = () => {
    const newErrors = {};
    if (!formData.code.trim()) newErrors.code = "El código es requerido";
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.categoryId) newErrors.categoryId = "La categoría es requerida";
    if (formData.prdTime && isNaN(formData.prdTime)) newErrors.prdTime = "El tiempo debe ser un número válido";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      setError("");
      const submitData = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        categoryId: parseInt(formData.categoryId),
        audienceCategory: formData.audienceCategory || "UNISEX",
        cinchoType: formData.cinchoType || null,
        prdTime: formData.prdTime ? parseFloat(formData.prdTime) : null,
        salePrice: formData.salePrice ? parseFloat(formData.salePrice) : null,
        sellerPrice: formData.sellerPrice ? parseFloat(formData.sellerPrice) : null,
        leatherConsumption: formData.leatherConsumption ? parseFloat(formData.leatherConsumption) : null,
        imageUrl: formData.imageUrl.trim() || null,
        status: formData.status,
      };
      if (productId) {
        await updateProduct(productId, submitData);
      } else {
        await createProduct(submitData);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar el producto");
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = availableCategories.find(
    (c) => String(c.id) === String(formData.categoryId)
  );
  const showCinchoType = selectedCategory?.code === "FOSS"
    || String(formData.code || "").toUpperCase().includes("CINCHO")
    || String(formData.name || "").toUpperCase().includes("CINCHO");

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {productId ? "Editar Producto" : "Nuevo Producto"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Código *</Label>
                <Input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  invalid={!!errors.code}
                />
                {errors.code && <div className="text-danger small">{errors.code}</div>}
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
            <Col md="6">
              <FormGroup>
                <Label>Categoría *</Label>
                <Input
                  type="select"
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  invalid={!!errors.categoryId}
                  disabled={loading}
                >
                  <option value="">Seleccione categoría</option>
                  {availableCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.code} - {category.name}
                    </option>
                  ))}
                </Input>
                {errors.categoryId && <div className="text-danger small">{errors.categoryId}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Línea (Dama / Caballero / Unisex)</Label>
                <Input
                  type="select"
                  value={formData.audienceCategory}
                  onChange={(e) => setFormData({ ...formData, audienceCategory: e.target.value })}
                  disabled={loading}
                >
                  {PRODUCT_AUDIENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Input>
                <small className="form-text text-muted">
                  Clasificación para kiosko, promociones y reportes. Empaques SUM- suelen ser Unisex.
                </small>
              </FormGroup>
            </Col>
            {showCinchoType && (
              <Col md="6">
                <FormGroup>
                  <Label>Tipo de cincho</Label>
                  <Input
                    type="select"
                    value={formData.cinchoType}
                    onChange={(e) => setFormData({ ...formData, cinchoType: e.target.value })}
                    disabled={loading}
                  >
                    {CINCHO_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value || "none"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              </Col>
            )}
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Tiempo de Producción (horas)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.prdTime}
                  onChange={(e) => setFormData({ ...formData, prdTime: e.target.value })}
                  invalid={!!errors.prdTime}
                />
                {errors.prdTime && <div className="text-danger small">{errors.prdTime}</div>}
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Precio de Venta (Q)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.salePrice}
                  onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                  placeholder="Ej: 150.00"
                />
                <small className="form-text text-muted">
                  Precio de venta manual
                </small>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Precio vendedor Luis Felipe (Q)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.sellerPrice}
                  onChange={(e) => setFormData({ ...formData, sellerPrice: e.target.value })}
                  placeholder="Ej: 140.00"
                />
                <small className="form-text text-muted">
                  Se usa para OPV cuando el vendedor es Luis Felipe
                </small>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Consumo de Cuero (ft²)</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.leatherConsumption}
                  onChange={(e) => setFormData({ ...formData, leatherConsumption: e.target.value })}
                  placeholder="Ej: 2.5"
                />
                <small className="form-text text-muted">
                  Pies² de cuero por unidad producida
                </small>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Imagen</Label>
                <div className="d-flex align-items-center">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e.target.files[0])}
                    disabled={uploadingImage}
                  />
                </div>
                <small className="form-text text-muted">
                  Sube la imagen y se guardará en S3. Usamos la URL devuelta automáticamente.
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
            </Col>
          </Row>
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
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : productId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default ProductsForm;

