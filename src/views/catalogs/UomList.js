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
import { getUoms, deleteUom } from "services/uomService";
import UomForm from "./UomForm";

function UomList() {
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedUomId, setSelectedUomId] = useState(null);

  useEffect(() => {
    loadUoms();
  }, []);

  const loadUoms = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getUoms();
      setUoms(data);
    } catch (err) {
      setError(err.message || "Error al cargar las unidades de medida");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedUomId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedUomId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadUoms();
    setShowForm(false);
    setSelectedUomId(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar esta unidad de medida?")) {
      try {
        await deleteUom(id);
        loadUoms();
      } catch (err) {
        setError(err.message || "Error al eliminar la unidad de medida");
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
                  <CardTitle tag="h4">Unidades de Medida (UOM)</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nueva UOM
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center"><p>Cargando unidades de medida...</p></div>
              ) : uoms.length === 0 ? (
                <div className="text-center"><p>No hay unidades de medida registradas.</p></div>
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
                    {uoms.map((uom) => (
                      <tr key={uom.id}>
                        <td>{uom.id}</td>
                        <td>{uom.code}</td>
                        <td>{uom.name}</td>
                        <td className="text-right">
                          <Button color="info" size="sm" onClick={() => handleEdit(uom.id)} className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button color="danger" size="sm" onClick={() => handleDelete(uom.id)} className="btn-round">
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
      <UomForm
        uomId={selectedUomId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedUomId(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}

export default UomList;

