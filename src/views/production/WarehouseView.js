import React, { useCallback, useEffect, useState } from "react";
import {
  Card, CardBody, CardHeader, CardTitle, Col, Row, Button, Input, Spinner, Alert, Nav, NavItem, NavLink, TabContent, TabPane,
} from "reactstrap";
import classnames from "classnames";
import { getWarehouseView } from "../../services/productionOrderService";
import WarehouseReceiptTab from "./warehouse/WarehouseReceiptTab";
import WarehouseOrdersTab from "./warehouse/WarehouseOrdersTab";

const WarehouseView = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("receipt");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWarehouseView(statusFilter || undefined);
      setOrders(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="5">
                  <CardTitle tag="h4">
                    <i className="nc-icon nc-box mr-2" />
                    Bodega de producto terminado
                  </CardTitle>
                  <p className="text-muted mb-0">
                    Recepción pieza a pieza, cierre de orden en bodega y despacho.
                  </p>
                </Col>
                <Col md="3">
                  <Input
                    type="select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">Todos los estados activos</option>
                    <option value="PENDING">Pendiente</option>
                    <option value="IN_PROGRESS">En progreso</option>
                    <option value="COMPLETED">Completada</option>
                  </Input>
                </Col>
                <Col md="4" className="text-right">
                  <Button size="sm" color="primary" onClick={fetchData} disabled={loading}>
                    <i className="nc-icon nc-refresh-69 mr-1" />
                    Actualizar
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                </div>
              ) : (
                <>
                  <Nav tabs className="mb-3">
                    <NavItem>
                      <NavLink
                        className={classnames({ active: activeTab === "receipt" })}
                        onClick={() => setActiveTab("receipt")}
                        style={{ cursor: "pointer" }}
                      >
                        Recepción
                      </NavLink>
                    </NavItem>
                    <NavItem>
                      <NavLink
                        className={classnames({ active: activeTab === "orders" })}
                        onClick={() => setActiveTab("orders")}
                        style={{ cursor: "pointer" }}
                      >
                        Órdenes y despacho
                      </NavLink>
                    </NavItem>
                  </Nav>
                  <TabContent activeTab={activeTab}>
                    <TabPane tabId="receipt">
                      <WarehouseReceiptTab orders={orders} onRefresh={fetchData} />
                    </TabPane>
                    <TabPane tabId="orders">
                      <WarehouseOrdersTab orders={orders} onRefresh={fetchData} />
                    </TabPane>
                  </TabContent>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default WarehouseView;
