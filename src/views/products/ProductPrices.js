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
  Row,
  Table,
} from "reactstrap";
import { getProductCategories } from "services/productCategoryService";
import { getProducts, updateProduct, bulkApplyDiscounts, bulkRemoveDiscounts } from "services/productService";
import { showError, showSuccess } from "utils/notificationHelper";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";

function ProductPrices() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingField, setEditingField] = useState(null); // 'salePrice' or 'discountedPrice'
  const [tempPrice, setTempPrice] = useState("");
  const [tempDiscountedPrice, setTempDiscountedPrice] = useState("");
  const [pendingChanges, setPendingChanges] = useState({});
  const [saving, setSaving] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmMessage, setConfirmMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [categoriesData, productsData] = await Promise.all([
        getProductCategories(),
        getProducts(),
      ]);
      setCategories(categoriesData || []);
      setProducts(productsData || []);
    } catch (err) {
      showError(err.message || "Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const normalizePrice = (value) => {
    if (value === null || value === undefined) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  };

  const handleStartEdit = (product, field) => {
    setEditingProductId(product.id);
    setEditingField(field);
    if (pendingChanges[product.id]) {
      if (field === "salePrice") {
        setTempPrice(
          pendingChanges[product.id].salePrice !== null
            ? pendingChanges[product.id].salePrice.toString()
            : ""
        );
      } else {
        setTempDiscountedPrice(
          pendingChanges[product.id].discountedPrice !== null
            ? pendingChanges[product.id].discountedPrice.toString()
            : ""
        );
      }
      return;
    }
    if (field === "salePrice") {
      const price = normalizePrice(product.salePrice);
      setTempPrice(price !== null ? price.toString() : "");
    } else {
      const price = normalizePrice(product.discountedPrice);
      setTempDiscountedPrice(price !== null ? price.toString() : "");
    }
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setEditingField(null);
    setTempPrice("");
    setTempDiscountedPrice("");
  };

  const handlePriceChange = (product, newPrice, field) => {
    const originalSalePrice = normalizePrice(product.salePrice);
    const originalDiscountedPrice = normalizePrice(product.discountedPrice);
    const newPriceNum = newPrice === "" ? null : parseFloat(newPrice);

    if (newPrice !== "" && (isNaN(newPriceNum) || newPriceNum < 0)) {
      showError("Ingresa un precio válido (mayor o igual a 0)");
      return;
    }

    const existingChange = pendingChanges[product.id] || {
      salePrice: originalSalePrice,
      discountedPrice: originalDiscountedPrice,
      product,
    };

    if (field === "salePrice") {
      existingChange.salePrice = newPriceNum;
    } else {
      existingChange.discountedPrice = newPriceNum;
    }

    const hasSalePriceChanged =
      existingChange.salePrice !== null && originalSalePrice !== null
        ? Math.abs(existingChange.salePrice - originalSalePrice) > 0.001
        : existingChange.salePrice !== originalSalePrice;

    const hasDiscountedPriceChanged =
      existingChange.discountedPrice !== null && originalDiscountedPrice !== null
        ? Math.abs(existingChange.discountedPrice - originalDiscountedPrice) > 0.001
        : existingChange.discountedPrice !== originalDiscountedPrice;

    if (!hasSalePriceChanged && !hasDiscountedPriceChanged) {
      const newPending = { ...pendingChanges };
      delete newPending[product.id];
      setPendingChanges(newPending);
      return;
    }

    setPendingChanges({
      ...pendingChanges,
      [product.id]: existingChange,
    });
  };

  const handleSaveBatch = async () => {
    if (Object.keys(pendingChanges).length === 0) return;

    try {
      setSaving(true);
      const updates = Object.values(pendingChanges).map((change) =>
        updateProduct(change.product.id, {
          code: change.product.code,
          name: change.product.name,
          categoryId: change.product.categoryId,
          prdTime: change.product.prdTime,
          salePrice: change.salePrice,
          discountedPrice: change.discountedPrice,
          status: change.product.status,
        })
      );

      await Promise.all(updates);
      const count = Object.keys(pendingChanges).length;
      showSuccess(
        `Se actualizaron ${count} producto${
          count !== 1 ? "s" : ""
        } correctamente`
      );
      setPendingChanges({});
      setEditingProductId(null);
      setEditingField(null);
      setTempPrice("");
      setTempDiscountedPrice("");
      loadData();
    } catch (err) {
      showError(err.message || "Error al actualizar los precios");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setPendingChanges({});
    setEditingProductId(null);
    setEditingField(null);
    setTempPrice("");
    setTempDiscountedPrice("");
  };

  const handleApplyDiscount = () => {
    if (filterCategory === "all") {
      showError("Debes seleccionar una categoría específica para aplicar descuentos");
      return;
    }

    if (!discountPercentage || isNaN(parseFloat(discountPercentage)) || parseFloat(discountPercentage) <= 0) {
      showError("Selecciona un porcentaje de descuento válido");
      return;
    }

    const percentage = parseFloat(discountPercentage);
    if (percentage > 100) {
      showError("El descuento no puede ser mayor al 100%");
      return;
    }

    const categoryId = filterCategory;
    const categoryName = categories.find(c => c.id === filterCategory)?.name || "la categoría seleccionada";

    setConfirmMessage(
      `¿Estás seguro de aplicar un descuento del ${percentage}% a la categoría "${categoryName}"?\n\n` +
      `Esto calculará el precio con descuento basado en el precio original de cada producto en esta categoría.`
    );
    setConfirmAction(() => async () => {
      try {
        setApplyingDiscount(true);
        const result = await bulkApplyDiscounts(percentage, categoryId);
        showSuccess(result);
        setDiscountPercentage("");
        loadData();
      } catch (err) {
        showError(err.message || "Error al aplicar descuentos");
      } finally {
        setApplyingDiscount(false);
      }
    });
    setShowConfirmModal(true);
  };

  const handleRemoveDiscounts = () => {
    if (filterCategory === "all") {
      showError("Debes seleccionar una categoría específica para remover descuentos");
      return;
    }

    const categoryId = filterCategory;
    const categoryName = categories.find(c => c.id === filterCategory)?.name || "la categoría seleccionada";

    setConfirmMessage(
      `¿Estás seguro de remover los descuentos de la categoría "${categoryName}"?\n\n` +
      `Esto eliminará todos los precios con descuento de los productos en esta categoría.`
    );
    setConfirmAction(() => async () => {
      try {
        setApplyingDiscount(true);
        const result = await bulkRemoveDiscounts(categoryId);
        showSuccess(result);
        loadData();
      } catch (err) {
        showError(err.message || "Error al remover descuentos");
      } finally {
        setApplyingDiscount(false);
      }
    });
    setShowConfirmModal(true);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  const getCategoryName = (categoryId) => {
    if (!categoryId) return "-";
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.name : `ID: ${categoryId}`;
  };

  const getCategoryCode = (categoryId) => {
    if (!categoryId) return "-";
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.code : "";
  };

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) =>
      `${p.name || ""} ${p.code || ""}`.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const productsByCategory = useMemo(() => {
    const grouped = {};
    filteredProducts.forEach((product) => {
      const categoryId = product.categoryId || "sin-categoria";
      if (!grouped[categoryId]) {
        grouped[categoryId] = {
          categoryId: categoryId === "sin-categoria" ? null : categoryId,
          categoryName: getCategoryName(product.categoryId),
          categoryCode: getCategoryCode(product.categoryId),
          products: [],
        };
      }
      grouped[categoryId].products.push(product);
    });
    return grouped;
  }, [filteredProducts, categories]);

  const filteredCategories =
    filterCategory === "all" ? Object.keys(productsByCategory) : [filterCategory];

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Precios de Productos</CardTitle>
                  <p className="text-muted small mb-0">
                    Edita precios unitarios y guarda todos los cambios en lote.
                    Haz click sobre el precio para modificarlo.
                  </p>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Filtrar por categoría</Label>
                    <Input
                      type="select"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                    >
                      <option value="all">Todas las categorías</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Buscar por nombre o código</Label>
                    <Input
                      type="search"
                      placeholder="Ej: camisa, PRO-001..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </Col>
              </Row>
              {filterCategory !== "all" ? (
                <Row className="mt-3">
                  <Col md="12">
                    <Alert color="info" className="mb-0">
                      <Row className="align-items-center">
                        <Col md="12">
                          <h6 className="mb-2">
                            <i className="fa fa-tag" /> Descuentos por Categoría
                          </h6>
                          <p className="mb-3 small">
                            Estás trabajando con la categoría: <strong>"{categories.find(c => c.id === filterCategory)?.name || ""}"</strong>
                          </p>
                        </Col>
                        <Col md="4">
                          <FormGroup className="mb-0">
                            <Label>
                              <strong>Selecciona el porcentaje de descuento:</strong>
                            </Label>
                            <Input
                              type="select"
                              value={discountPercentage}
                              onChange={(e) => setDiscountPercentage(e.target.value)}
                              disabled={applyingDiscount}
                              style={{ fontSize: "16px", fontWeight: "bold" }}
                            >
                              <option value="">-- Selecciona un porcentaje --</option>
                              <option value="5">5% de descuento</option>
                              <option value="10">10% de descuento</option>
                              <option value="15">15% de descuento</option>
                              <option value="20">20% de descuento</option>
                              <option value="25">25% de descuento</option>
                              <option value="30">30% de descuento</option>
                              <option value="40">40% de descuento</option>
                              <option value="50">50% de descuento</option>
                            </Input>
                          </FormGroup>
                        </Col>
                        <Col md="4">
                          <FormGroup className="mb-0">
                            <Label>&nbsp;</Label>
                            <div>
                              <Button
                                color="success"
                                size="md"
                                onClick={handleApplyDiscount}
                                disabled={!discountPercentage || applyingDiscount}
                                className="mr-2"
                                block
                              >
                                <i className="fa fa-tag" /> {applyingDiscount ? "Aplicando..." : `Aplicar ${discountPercentage || ""}% de Descuento`}
                              </Button>
                              <Button
                                color="warning"
                                size="sm"
                                onClick={handleRemoveDiscounts}
                                disabled={applyingDiscount}
                                block
                                className="mt-2"
                              >
                                <i className="fa fa-times-circle" /> Remover Todos los Descuentos
                              </Button>
                            </div>
                          </FormGroup>
                        </Col>
                        <Col md="4">
                          <div className="mt-3">
                            <small className="text-muted">
                              <i className="fa fa-info-circle" /> <strong>Instrucciones:</strong><br />
                              1. Selecciona un porcentaje arriba<br />
                              2. Haz clic en "Aplicar Descuento"<br />
                              3. El sistema calculará automáticamente el precio con descuento para todos los productos de esta categoría
                            </small>
                          </div>
                        </Col>
                      </Row>
                    </Alert>
                  </Col>
                </Row>
              ) : (
                <Row className="mt-3">
                  <Col md="12">
                    <Alert color="secondary" className="mb-0">
                      <i className="fa fa-info-circle" /> <strong>Para aplicar descuentos:</strong> Selecciona una categoría específica en el filtro de arriba. Los descuentos se aplican por categoría.
                    </Alert>
                  </Col>
                </Row>
              )}
              {hasPendingChanges && (
                <Row className="mt-3">
                  <Col md="12">
                    <Alert color="warning" className="mb-0">
                      <Row className="align-items-center">
                        <Col md="6">
                          <strong>
                            <i className="fa fa-exclamation-triangle" /> Tienes{" "}
                            {Object.keys(pendingChanges).length} cambio
                            {Object.keys(pendingChanges).length !== 1 ? "s" : ""}{" "}
                            pendiente
                            {Object.keys(pendingChanges).length !== 1 ? "s" : ""}
                          </strong>
                        </Col>
                        <Col md="6" className="text-right">
                          <Button
                            color="success"
                            size="sm"
                            onClick={handleSaveBatch}
                            disabled={saving}
                            className="mr-2"
                          >
                            <i className="fa fa-save" />{" "}
                            {saving ? "Guardando..." : "Guardar Cambios"}
                          </Button>
                          <Button
                            color="secondary"
                            size="sm"
                            onClick={handleDiscardChanges}
                            disabled={saving}
                          >
                            <i className="fa fa-times" /> Descartar
                          </Button>
                        </Col>
                      </Row>
                    </Alert>
                  </Col>
                </Row>
              )}
            </CardHeader>
            <CardBody>
              {loading ? (
                <div className="text-center">
                  <p>Cargando...</p>
                </div>
              ) : Object.keys(productsByCategory).length === 0 ? (
                <div className="text-center">
                  <p>No hay productos disponibles</p>
                </div>
              ) : (
                filteredCategories.map((categoryKey) => {
                  const categoryData = productsByCategory[categoryKey];
                  if (!categoryData) return null;

                  return (
                    <div key={categoryKey} className="mb-4">
                      <h5 className="mb-3">
                        {categoryData.categoryName || "Sin Categoría"}
                        {categoryData.categoryCode && (
                          <Badge color="info" className="ml-2">
                            {categoryData.categoryCode}
                          </Badge>
                        )}
                        <span className="text-muted small ml-2">
                          ({categoryData.products.length} producto
                          {categoryData.products.length !== 1 ? "s" : ""})
                        </span>
                      </h5>
                      <Table responsive className="table-hover">
                        <thead className="text-primary">
                          <tr>
                            <th>Código</th>
                            <th>Nombre</th>
                            <th>Precio Original</th>
                            <th>Precio con Descuento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryData.products.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="text-center text-muted">
                                No hay productos en esta categoría
                              </td>
                            </tr>
                          ) : (
                            categoryData.products.map((product) => {
                              const currentSalePrice = normalizePrice(product.salePrice);
                              const currentDiscountedPrice = normalizePrice(product.discountedPrice);
                              const isEditingSale = editingProductId === product.id && editingField === "salePrice";
                              const isEditingDiscounted = editingProductId === product.id && editingField === "discountedPrice";
                              const hasDiscount = currentDiscountedPrice !== null && currentSalePrice !== null && currentDiscountedPrice < currentSalePrice;
                              const pendingChange = pendingChanges[product.id];
                              const displaySalePrice = pendingChange?.salePrice !== undefined ? pendingChange.salePrice : currentSalePrice;
                              const displayDiscountedPrice = pendingChange?.discountedPrice !== undefined ? pendingChange.discountedPrice : currentDiscountedPrice;

                              return (
                                <tr key={product.id}>
                                  <td>
                                    <Badge color="info">{product.code}</Badge>
                                  </td>
                                  <td>{product.name}</td>
                                  <td>
                                    {isEditingSale ? (
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={tempPrice}
                                        onChange={(e) => {
                                          setTempPrice(e.target.value);
                                          handlePriceChange(product, e.target.value, "salePrice");
                                        }}
                                        onKeyDown={handleKeyPress}
                                        autoFocus
                                        style={{ width: "140px" }}
                                        className="d-inline-block"
                                      />
                                    ) : (
                                      <div
                                        onClick={() => handleStartEdit(product, "salePrice")}
                                        style={{
                                          cursor: "pointer",
                                          padding: "5px",
                                          border: pendingChange?.salePrice !== undefined
                                            ? "2px solid #ffc107"
                                            : "1px dashed #ccc",
                                          borderRadius: "4px",
                                          display: "inline-block",
                                          minWidth: "120px",
                                          backgroundColor: pendingChange?.salePrice !== undefined
                                            ? "#fff3cd"
                                            : "transparent",
                                        }}
                                        title={
                                          pendingChange?.salePrice !== undefined
                                            ? "Cambio pendiente - Click para editar"
                                            : "Click para editar precio original"
                                        }
                                      >
                                        {displaySalePrice !== null ? (
                                          <strong>{displaySalePrice.toFixed(2)}</strong>
                                        ) : (
                                          <span className="text-muted">Click para agregar</span>
                                        )}
                                        {pendingChange?.salePrice !== undefined && (
                                          <i
                                            className="fa fa-asterisk text-warning ml-1"
                                            style={{ fontSize: "10px" }}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    {isEditingDiscounted ? (
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={tempDiscountedPrice}
                                        onChange={(e) => {
                                          setTempDiscountedPrice(e.target.value);
                                          handlePriceChange(product, e.target.value, "discountedPrice");
                                        }}
                                        onKeyDown={handleKeyPress}
                                        autoFocus
                                        style={{ width: "140px" }}
                                        className="d-inline-block"
                                      />
                                    ) : (
                                      <div
                                        onClick={() => handleStartEdit(product, "discountedPrice")}
                                        style={{
                                          cursor: "pointer",
                                          padding: "5px",
                                          border: pendingChange?.discountedPrice !== undefined
                                            ? "2px solid #ffc107"
                                            : hasDiscount
                                            ? "2px solid #28a745"
                                            : "1px dashed #ccc",
                                          borderRadius: "4px",
                                          display: "inline-block",
                                          minWidth: "120px",
                                          backgroundColor: pendingChange?.discountedPrice !== undefined
                                            ? "#fff3cd"
                                            : hasDiscount
                                            ? "#d4edda"
                                            : "transparent",
                                        }}
                                        title={
                                          pendingChange?.discountedPrice !== undefined
                                            ? "Cambio pendiente - Click para editar"
                                            : hasDiscount
                                            ? "Tiene descuento - Click para editar"
                                            : "Click para agregar precio con descuento"
                                        }
                                      >
                                        {displayDiscountedPrice !== null ? (
                                          <>
                                            <strong style={{ color: hasDiscount ? "#28a745" : "inherit" }}>
                                              {displayDiscountedPrice.toFixed(2)}
                                            </strong>
                                            {hasDiscount && displaySalePrice !== null && (
                                              <small className="text-muted ml-2">
                                                ({((1 - displayDiscountedPrice / displaySalePrice) * 100).toFixed(0)}% desc.)
                                              </small>
                                            )}
                                          </>
                                        ) : (
                                          <span className="text-muted">Click para agregar</span>
                                        )}
                                        {pendingChange?.discountedPrice !== undefined && (
                                          <i
                                            className="fa fa-asterisk text-warning ml-1"
                                            style={{ fontSize: "10px" }}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </Table>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
      <div className="mt-3">
        <small className="text-muted">
          <i className="fa fa-info-circle" /> Haz click en cualquier precio para editarlo.
          El precio original es el precio base del producto. El precio con descuento es opcional y se muestra en verde cuando está activo.
          Guarda los cambios usando el botón "Guardar Cambios" cuando existan modificaciones pendientes. Presiona Escape para cancelar la edición actual.
        </small>
      </div>
      <ConfirmModal
        isOpen={showConfirmModal}
        toggle={() => setShowConfirmModal(false)}
        onConfirm={() => {
          if (confirmAction) {
            confirmAction();
          }
        }}
        title="Confirmar acción"
        message={confirmMessage}
        confirmText="Confirmar"
        cancelText="Cancelar"
        confirmColor="primary"
      />
    </div>
  );
}

export default ProductPrices;

