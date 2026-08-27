import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card, CardBody, CardHeader, CardTitle, Col, Row, Button, Input, Spinner, Alert, Nav, NavItem, NavLink, TabContent, TabPane, Badge,
} from "reactstrap";
import classnames from "classnames";
import { getWarehouseView } from "../../services/productionOrderService";
import WarehouseReceiptTab from "./warehouse/WarehouseReceiptTab";
import WarehouseOrdersTab from "./warehouse/WarehouseOrdersTab";
import { getPendingReceiptQty } from "./warehouse/warehouseUtils";

const WarehouseView = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("receipt");

  const fetchData = useCallback(async (options = {}) => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await getWarehouseView(statusFilter || undefined);
      setOrders(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const pendingReceiptCount = useMemo(
    () => (orders || []).filter((o) => getPendingReceiptQty(o) > 0).length,
    [orders]
  );

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card className="shadow-sm">
            <CardHeader style={{ background: "linear-gradient(120deg, #f4faf6 0%, #ffffff 55%)" }}>
              <Row className="align-items-center">
                <Col md="6">
                  <CardTitle tag="h4" className="mb-1">
                    <i className="nc-icon nc-box mr-2" />
                    Bodega de producto terminado
                  </CardTitle>
                  <p className="text-muted mb-0">
                    Recibe piezas de las OP / OPL. Usa la búsqueda y los atajos para no perderte con mucha data.
                  </p>
                </Col>
                <Col md="3" className="mt-3 mt-md-0">
                  <label className="small text-muted mb-1 d-block">Estado de la OP</label>
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
                <Col md="3" className="text-md-right mt-3 mt-md-0">
                  <Button color="primary" onClick={() => void fetchData()} disabled={loading}>
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
                  <div className="text-muted mt-2">Cargando órdenes de bodega…</div>
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
                        {pendingReceiptCount > 0 && (
                          <Badge color="warning" pill className="ml-2">
                            {pendingReceiptCount}
                          </Badge>
                        )}
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
