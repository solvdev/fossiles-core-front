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
} from "reactstrap";
import { getProductCategories, deleteProductCategory } from "services/productCategoryService";
import ProductCategoriesForm from "./ProductCategoriesForm";

function ProductCategoriesList() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const handleNew = () => {
    setSelectedCategoryId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedCategoryId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadCategories();
    setShowForm(false);
    setSelectedCategoryId(null);
  };

  const loadCategories = async () => {
    try {
      setLoading(true);
      const data = await getProductCategories();
      setCategories(data);
    } catch (err) {
      setError(err.message || "Error al cargar las categorías");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar esta categoría?")) {
      try {
        await deleteProductCategory(id);
        loadCategories();
      } catch (err) {
        setError(err.message || "Error al eliminar la categoría");
      }
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Categorías de Producto</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nueva Categoría
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center"><p>Cargando categorías...</p></div>
              ) : categories.length === 0 ? (
                <div className="text-center"><p>No hay categorías registradas.</p></div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>ID</th>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category) => (
                      <tr key={category.id}>
                        <td>{category.id}</td>
                        <td>{category.code}</td>
                        <td>{category.name}</td>
                        <td className="text-right">
                          <Button color="info" size="sm" onClick={() => handleEdit(category.id)} className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button color="danger" size="sm" onClick={() => handleDelete(category.id)} className="btn-round">
                            <i className="nc-icon nc-simple-remove" /> Eliminar
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
      <ProductCategoriesForm
        categoryId={selectedCategoryId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedCategoryId(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}

export default ProductCategoriesList;

