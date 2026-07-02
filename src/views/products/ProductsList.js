import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Alert,
  Badge,
  FormGroup,
  Label,
  Input,
} from "reactstrap";
import { getProducts, deleteProduct } from "services/productService";
import { getProductCategories } from "services/productCategoryService";
import { getProductAudienceLabel, PRODUCT_AUDIENCE_OPTIONS } from "utils/productAudienceHelper";
import ProductsForm from "./ProductsForm";
import ProductRecipeModal from "./ProductRecipeModal";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { showSuccess, showError } from "utils/notificationHelper";

function ProductsList() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAudience, setFilterAudience] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await getProductCategories();
      setCategories(data || []);
    } catch (err) {
      console.error("Error al cargar categorías:", err);
    }
  };

  const handleNew = () => {
    setSelectedProductId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedProductId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadProducts();
    setShowForm(false);
    setSelectedProductId(null);
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getProducts();
      setProducts(data);
    } catch (err) {
      const errorMessage = err.message || "Error al cargar los productos";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id) => {
    const product = products.find((p) => p.id === id);
    setProductToDelete({ id, name: product?.name || "este producto" });
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;
    
    try {
      await deleteProduct(productToDelete.id);
      showSuccess("Producto eliminado correctamente");
      loadProducts();
    } catch (err) {
      showError(err.message || "Error al eliminar el producto");
    } finally {
      setProductToDelete(null);
    }
  };

  const getStatusBadge = (status) => {
    return status === "A" ? (
      <Badge color="success">Activo</Badge>
    ) : (
      <Badge color="secondary">Inactivo</Badge>
    );
  };

  const getCategoryName = (categoryId) => {
    if (!categoryId) return "-";
    const category = categories.find((cat) => cat.id === categoryId);
    return category ? category.name : `ID: ${categoryId}`;
  };

  const handleViewRecipe = (product) => {
    setSelectedProduct(product);
    setShowRecipeModal(true);
  };

  const filteredProducts = products.filter((product) => {
    // Filtro de búsqueda por texto
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      const searchText = `${product.code || ""} ${product.name || ""}`.toLowerCase();
      if (!searchText.includes(term)) return false;
    }

    // Filtro por estado
    if (filterStatus !== "all") {
      const productStatus = product.status === "A" ? "A" : "I";
      if (productStatus !== filterStatus) return false;
    }

    // Filtro por categoría
    if (filterCategory !== "all") {
      if (product.categoryId?.toString() !== filterCategory) return false;
    }

    if (filterAudience !== "all") {
      const audience = String(product.audienceCategory || "UNISEX").toUpperCase();
      if (audience !== filterAudience) return false;
    }

    return true;
  });

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Productos Terminados</CardTitle>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Buscar por nombre o código</Label>
                    <Input
                      type="search"
                      placeholder="Ej: PROD-001, Producto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="3" className="text-right">
                  <FormGroup>
                    <Label>&nbsp;</Label>
                    <div>
                      <Button color="primary" onClick={handleNew} className="btn-round" block>
                        <i className="nc-icon nc-simple-add" /> Nuevo Producto
                      </Button>
                    </div>
                  </FormGroup>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {/* Filtros */}
              <Row className="mb-3">
                <Col md="4">
                  <FormGroup>
                    <Label>Estado</Label>
                    <Input
                      type="select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      <option value="A">Activo</option>
                      <option value="I">Inactivo</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Categoría</Label>
                    <Input
                      type="select"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id.toString()}>
                          {category.name}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Línea</Label>
                    <Input
                      type="select"
                      value={filterAudience}
                      onChange={(e) => setFilterAudience(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      {PRODUCT_AUDIENCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>&nbsp;</Label>
                    <div>
                      {(filterStatus !== "all" || filterCategory !== "all" || filterAudience !== "all") && (
                        <Button
                          color="secondary"
                          size="sm"
                          onClick={() => {
                            setFilterStatus("all");
                            setFilterCategory("all");
                            setFilterAudience("all");
                          }}
                          block
                        >
                          <i className="fa fa-times" /> Limpiar Filtros
                        </Button>
                      )}
                    </div>
                  </FormGroup>
                </Col>
              </Row>
              {(filterStatus !== "all" || filterCategory !== "all" || filterAudience !== "all") && (
                <Row className="mb-2">
                  <Col>
                    <Badge color="info">
                      {filteredProducts.length} resultado(s)
                    </Badge>
                  </Col>
                </Row>
              )}
              {loading ? (
                <div className="text-center"><p>Cargando productos...</p></div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center">
                  <p>{products.length === 0 ? "No hay productos registrados." : "No se encontraron productos que coincidan con la búsqueda."}</p>
                </div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Imagen</th>
                      <th>ID</th>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Categoría</th>
                      <th>Línea</th>
                      <th>Tiempo Prod.</th>
                      <th>Cuero (ft²)</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id}>
                        <td>
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt="img"
                              style={{ height: 50, width: 50, objectFit: "cover", borderRadius: 6 }}
                            />
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>{product.id}</td>
                        <td>
                          <Badge color="info">{product.code}</Badge>
                        </td>
                        <td>{product.name}</td>
                        <td>{getCategoryName(product.categoryId)}</td>
                        <td>{getProductAudienceLabel(product.audienceCategory)}</td>
                        <td>{product.prdTime ? `${product.prdTime} hrs` : "-"}</td>
                        <td>{product.leatherConsumption ? `${product.leatherConsumption}` : "-"}</td>
                        <td>{getStatusBadge(product.status)}</td>
                        <td className="text-right">
                          <Button
                            onClick={() => handleViewRecipe(product)}
                            color="info"
                            size="sm"
                            className="btn-icon btn-link view mr-1"
                            title="Ver Receta"
                          >
                            <i className="fa fa-eye" />
                          </Button>
                          <Button
                            onClick={() => handleEdit(product.id)}
                            color="warning"
                            size="sm"
                            className="btn-icon btn-link edit mr-1"
                            title="Editar"
                          >
                            <i className="fa fa-edit" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteClick(product.id)}
                            color="danger"
                            size="sm"
                            className="btn-icon btn-link remove"
                            title="Eliminar"
                          >
                            <i className="fa fa-times" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
      <ProductsForm
        productId={selectedProductId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedProductId(null);
        }}
        onSuccess={handleFormSuccess}
      />
      <ProductRecipeModal
        productId={selectedProduct?.id}
        productName={selectedProduct?.name}
        isOpen={showRecipeModal}
        toggle={() => {
          setShowRecipeModal(false);
          setSelectedProduct(null);
        }}
      />
      <ConfirmModal
        isOpen={showDeleteModal}
        toggle={() => {
          setShowDeleteModal(false);
          setProductToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Eliminar Producto"
        message={`¿Está seguro de eliminar el producto "${productToDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmColor="danger"
      />
    </div>
  );
}

export default ProductsList;

