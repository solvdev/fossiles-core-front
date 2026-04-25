import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Badge,
  Input,
  FormGroup,
  Label,
  Button,
  Alert,
} from "reactstrap";
import { getProductCategories } from "services/productCategoryService";
import { getProducts, updateProduct } from "services/productService";
import { showSuccess, showError } from "utils/notificationHelper";

function ProductionTimes() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingProductId, setEditingProductId] = useState(null);
  const [tempMinutes, setTempMinutes] = useState("");
  const [pendingChanges, setPendingChanges] = useState({}); // { productId: { minutes, originalMinutes } }
  const [saving, setSaving] = useState(false);

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

  const handleStartEdit = (product) => {
    setEditingProductId(product.id);
    const timeInMinutes = getTimeInMinutes(product.prdTime);
    const minutesStr = timeInMinutes !== null ? timeInMinutes.toString() : "";
    setTempMinutes(minutesStr);
    
    // Si ya hay cambios pendientes para este producto, mantenerlos
    if (pendingChanges[product.id]) {
      setTempMinutes(pendingChanges[product.id].minutes.toString());
    }
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setTempMinutes("");
  };

  const handleTimeChange = (product, newMinutes) => {
    const timeInMinutes = getTimeInMinutes(product.prdTime);
    const originalMinutes = timeInMinutes !== null ? timeInMinutes : null;
    // No redondear minutos, mantener la precisión del usuario
    const newMinutesNum = newMinutes === "" ? null : parseFloat(newMinutes);
    
    // Verificar si hay cambio (comparar con tolerancia para evitar problemas de precisión)
    const hasChanged = newMinutesNum !== null && originalMinutes !== null
      ? Math.abs(newMinutesNum - originalMinutes) > 0.001
      : newMinutesNum !== originalMinutes;
    
    if (!hasChanged && (newMinutes === "" && originalMinutes === null)) {
      // No hay cambio, eliminar de pendingChanges
      const newPending = { ...pendingChanges };
      delete newPending[product.id];
      setPendingChanges(newPending);
    } else if (hasChanged) {
      // Hay cambio, agregar a pendingChanges
      setPendingChanges({
        ...pendingChanges,
        [product.id]: {
          minutes: newMinutesNum,
          originalMinutes: originalMinutes,
          product: product,
        },
      });
    }
  };

  const handleSaveBatch = async () => {
    if (Object.keys(pendingChanges).length === 0) return;

    try {
      setSaving(true);
      const updates = Object.values(pendingChanges).map((change) => {
        // Convertir minutos a horas y redondear a 2 decimales SOLO para guardar en BD
        const timeInHours = Math.round((change.minutes / 60) * 100) / 100;
        return updateProduct(change.product.id, {
          code: change.product.code,
          name: change.product.name,
          categoryId: change.product.categoryId,
          prdTime: timeInHours, // Guardamos en horas con 2 decimales
          salePrice: change.product.salePrice,
          status: change.product.status,
        });
      });

      await Promise.all(updates);
      
      const count = Object.keys(pendingChanges).length;
      showSuccess(`Se actualizaron ${count} producto${count !== 1 ? "s" : ""} correctamente`);
      setPendingChanges({});
      setEditingProductId(null);
      setTempMinutes("");
      loadData();
    } catch (err) {
      showError(err.message || "Error al actualizar los tiempos de producción");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    setPendingChanges({});
    setEditingProductId(null);
    setTempMinutes("");
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

  // Agrupar productos por categoría
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

  // Convertir tiempo a minutos para mostrar
  const getTimeInMinutes = (prdTime) => {
    if (!prdTime) return null;
    // Si prdTime es menor que 24, asumimos que está en horas, si no, en minutos
    return prdTime < 24 ? prdTime * 60 : prdTime;
  };

  // Convertir tiempo a horas para mostrar
  const getTimeInHours = (prdTime) => {
    if (!prdTime) return null;
    // Si prdTime es menor que 24, asumimos que está en horas, si no, convertir de minutos
    return prdTime < 24 ? prdTime : prdTime / 60;
  };

  const filteredCategories = filterCategory === "all" 
    ? Object.keys(productsByCategory)
    : [filterCategory];

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Tiempos de Producción</CardTitle>
                  <p className="text-muted small mb-0">
                    Los tiempos se ingresan en minutos. El sistema los convierte automáticamente a horas para los cálculos.
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
                      placeholder="Ej: CANGURERA SAUL, P-1..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </Col>
              </Row>
              {hasPendingChanges && (
                <Row className="mt-3">
                  <Col md="12">
                    <Alert color="warning" className="mb-0">
                      <Row className="align-items-center">
                        <Col md="6">
                          <strong>
                            <i className="fa fa-exclamation-triangle" /> Tienes {Object.keys(pendingChanges).length} cambio{Object.keys(pendingChanges).length !== 1 ? "s" : ""} pendiente{Object.keys(pendingChanges).length !== 1 ? "s" : ""}
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
                            <i className="fa fa-save" /> {saving ? "Guardando..." : "Guardar Cambios"}
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
                <div className="text-center"><p>Cargando...</p></div>
              ) : Object.keys(productsByCategory).length === 0 ? (
                <div className="text-center"><p>No hay productos disponibles</p></div>
              ) : (
                filteredCategories.map((categoryKey) => {
                  const categoryData = productsByCategory[categoryKey];
                  if (!categoryData) return null;

                  return (
                    <div key={categoryKey} className="mb-4">
                      <h5 className="mb-3">
                        {categoryData.categoryName || "Sin Categoría"}
                        {categoryData.categoryCode && (
                          <Badge color="info" className="ml-2">{categoryData.categoryCode}</Badge>
                        )}
                        <span className="text-muted small ml-2">
                          ({categoryData.products.length} producto{categoryData.products.length !== 1 ? "s" : ""})
                        </span>
                      </h5>
                      <Table responsive className="table-hover">
                        <thead className="text-primary">
                          <tr>
                            <th>Código</th>
                            <th>Nombre</th>
                            <th>Tiempo (minutos)</th>
                            <th>Tiempo (horas)</th>
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
                              const timeInMinutes = getTimeInMinutes(product.prdTime);
                              const timeInHours = getTimeInHours(product.prdTime);
                              const isEditing = editingProductId === product.id;
                              
                              return (
                                <tr key={product.id}>
                                  <td>
                                    <Badge color="info">{product.code}</Badge>
                                  </td>
                                  <td>{product.name}</td>
                                  <td>
                                    {isEditing ? (
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={tempMinutes}
                                        onChange={(e) => {
                                          setTempMinutes(e.target.value);
                                          handleTimeChange(product, e.target.value);
                                        }}
                                        onKeyDown={handleKeyPress}
                                        autoFocus
                                        style={{ width: "120px" }}
                                        className="d-inline-block"
                                      />
                                    ) : (
                                      <div
                                        onClick={() => handleStartEdit(product)}
                                        style={{ 
                                          cursor: "pointer", 
                                          padding: "5px", 
                                          border: pendingChanges[product.id] ? "2px solid #ffc107" : "1px dashed #ccc", 
                                          borderRadius: "4px", 
                                          display: "inline-block", 
                                          minWidth: "100px",
                                          backgroundColor: pendingChanges[product.id] ? "#fff3cd" : "transparent"
                                        }}
                                        title={pendingChanges[product.id] ? "Cambio pendiente - Click para editar" : "Click para editar"}
                                      >
                                        {pendingChanges[product.id] ? (
                                          <strong>{Math.round(pendingChanges[product.id].minutes)} min</strong>
                                        ) : timeInMinutes !== null ? (
                                          <strong>{Math.round(timeInMinutes)} min</strong>
                                        ) : (
                                          <span className="text-muted">Click para agregar</span>
                                        )}
                                        {pendingChanges[product.id] && (
                                          <i className="fa fa-asterisk text-warning ml-1" style={{ fontSize: "10px" }} />
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    {isEditing ? (
                                      <span className="text-muted">
                                        {tempMinutes && !isNaN(parseFloat(tempMinutes))
                                          ? `= ${(parseFloat(tempMinutes) / 60).toFixed(2)} hrs`
                                          : ""}
                                      </span>
                                    ) : (
                                      (() => {
                                        const displayMinutes = pendingChanges[product.id] 
                                          ? pendingChanges[product.id].minutes 
                                          : timeInMinutes;
                                        const displayHours = displayMinutes !== null ? displayMinutes / 60 : null;
                                        return displayHours !== null ? (
                                          <strong>{displayHours.toFixed(2)} hrs</strong>
                                        ) : (
                                          <span className="text-muted">-</span>
                                        );
                                      })()
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
          <i className="fa fa-info-circle" /> Click en el tiempo en minutos para editarlo. 
          Los cambios se guardan en lote usando el botón "Guardar Cambios" cuando hay modificaciones pendientes.
          Presione Escape para cancelar la edición actual.
        </small>
      </div>
    </div>
  );
}

export default ProductionTimes;
