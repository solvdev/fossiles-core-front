import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  FormGroup,
  Label,
  Input,
} from "reactstrap";
import { getMaterialColors, deleteMaterialColor } from "services/materialColorService";
import MaterialColorsForm from "./MaterialColorsForm";

function MaterialColorsList() {
  const navigate = useNavigate();
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedColorId, setSelectedColorId] = useState(null);

  useEffect(() => {
    loadColors();
  }, []);

  const handleNew = () => {
    setSelectedColorId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedColorId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadColors();
    setShowForm(false);
    setSelectedColorId(null);
  };

  const loadColors = async () => {
    try {
      setLoading(true);
      const data = await getMaterialColors();
      setColors(data);
    } catch (err) {
      setError(err.message || "Error al cargar los colores de materiales");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar este color de material?")) {
      try {
        await deleteMaterialColor(id);
        loadColors();
      } catch (err) {
        setError(err.message || "Error al eliminar el color");
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
                  <CardTitle tag="h4">Colores de Materiales</CardTitle>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Tipo de Color</Label>
                    <Input
                      type="select"
                      value="material"
                      onChange={(e) => {
                        if (e.target.value === "product") {
                          navigate("/admin/colors");
                        }
                      }}
                    >
                      <option value="product">Color de Producto</option>
                      <option value="material">Color de Material</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3" className="text-right">
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nuevo Color
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center"><p>Cargando colores...</p></div>
              ) : colors.length === 0 ? (
                <div className="text-center"><p>No hay colores de materiales registrados.</p></div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>ID</th>
                      <th>Nombre</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {colors.map((color) => (
                      <tr key={color.id}>
                        <td>{color.id}</td>
                        <td>{color.name}</td>
                        <td className="text-right">
                          <Button color="info" size="sm" onClick={() => handleEdit(color.id)} className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button color="danger" size="sm" onClick={() => handleDelete(color.id)} className="btn-round">
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
      <MaterialColorsForm
        colorId={selectedColorId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedColorId(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}

export default MaterialColorsList;

