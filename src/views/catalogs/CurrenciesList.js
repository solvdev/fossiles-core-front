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
import { getCurrencies, deleteCurrency } from "services/currencyService";
import CurrenciesForm from "./CurrenciesForm";

function CurrenciesList() {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedCurrencyId, setSelectedCurrencyId] = useState(null);

  useEffect(() => {
    loadCurrencies();
  }, []);

  const handleNew = () => {
    setSelectedCurrencyId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedCurrencyId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadCurrencies();
    setShowForm(false);
    setSelectedCurrencyId(null);
  };

  const loadCurrencies = async () => {
    try {
      setLoading(true);
      const data = await getCurrencies();
      setCurrencies(data);
    } catch (err) {
      setError(err.message || "Error al cargar las monedas");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar esta moneda?")) {
      try {
        await deleteCurrency(id);
        loadCurrencies();
      } catch (err) {
        setError(err.message || "Error al eliminar la moneda");
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
                  <CardTitle tag="h4">Monedas</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nueva Moneda
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center"><p>Cargando monedas...</p></div>
              ) : currencies.length === 0 ? (
                <div className="text-center"><p>No hay monedas registradas.</p></div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>ID</th>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Símbolo</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currencies.map((currency) => (
                      <tr key={currency.id}>
                        <td>{currency.id}</td>
                        <td>{currency.code}</td>
                        <td>{currency.name}</td>
                        <td>{currency.symbol}</td>
                        <td className="text-right">
                          <Button color="info" size="sm" onClick={() => handleEdit(currency.id)} className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button color="danger" size="sm" onClick={() => handleDelete(currency.id)} className="btn-round">
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
      <CurrenciesForm
        currencyId={selectedCurrencyId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedCurrencyId(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}

export default CurrenciesList;

