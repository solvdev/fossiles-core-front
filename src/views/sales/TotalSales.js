import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Input,
  Label,
  Spinner,
} from "reactstrap";
import { getUnifiedSales } from "services/salesDashboardService";
import { formatDateGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";

const CHANNELS = [
  { value: "all", label: "Todos los canales" },
  { value: "kiosko", label: "Kioskos" },
  { value: "vendedor", label: "Vendedor LF" },
  { value: "online", label: "Online" },
];

const monthStart = (ymd) => `${ymd.slice(0, 7)}-01`;
const fmtMoney = (value) => `Q ${Number(value || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtQty = (value) => Number(value || 0).toLocaleString("es-GT", { maximumFractionDigits: 0 });

function TotalSales() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = getTodayYmdGuatemala();

  const [startDate, setStartDate] = useState(searchParams.get("startDate") || monthStart(today));
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || today);
  const [filter, setFilter] = useState(searchParams.get("channel") || "all");
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSales = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const rows = await getUnifiedSales({
        startDate,
        endDate,
        channel: filter === "all" ? undefined : filter,
        limit: 1000,
      });
      setSales(rows || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las ventas.");
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, filter]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (filter && filter !== "all") params.set("channel", filter);
    setSearchParams(params, { replace: true });
  }, [startDate, endDate, filter, setSearchParams]);

  const totalAmount = useMemo(
    () => sales.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0),
    [sales]
  );

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader className="d-flex justify-content-between align-items-center">
              <div>
                <CardTitle tag="h4" className="mb-0">Ventas totales</CardTitle>
                <small className="text-muted">Kiosko, online y vendedor LF en un solo listado</small>
              </div>
              <Button color="secondary" outline size="sm" onClick={() => navigate("/admin/dashboard-sales")}>
                Ir al dashboard
              </Button>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <Row className="mb-3">
                <Col md="3">
                  <Label>Desde</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </Col>
                <Col md="3">
                  <Label>Hasta</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </Col>
                <Col md="3">
                  <Label>Canal</Label>
                  <Input type="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                    {CHANNELS.map((channel) => (
                      <option key={channel.value} value={channel.value}>{channel.label}</option>
                    ))}
                  </Input>
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <Button color="primary" outline onClick={loadSales} disabled={loading}>
                    {loading ? "Cargando..." : "Actualizar"}
                  </Button>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md="4"><strong>Registros:</strong> {sales.length}</Col>
                <Col md="4"><strong>Total periodo:</strong> {fmtMoney(totalAmount)}</Col>
              </Row>

              {loading ? (
                <div className="text-center py-4"><Spinner /></div>
              ) : sales.length === 0 ? (
                <div className="text-center"><p>No hay ventas registradas en el periodo.</p></div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Fecha</th>
                      <th>Canal</th>
                      <th>Referencia</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Total</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => (
                      <tr key={sale.id}>
                        <td>{formatDateGt(sale.saleDate)}</td>
                        <td>{sale.channelLabel}</td>
                        <td>{sale.reference || "-"}</td>
                        <td>{sale.productName}</td>
                        <td>{fmtQty(sale.quantity)}</td>
                        <td>{fmtMoney(sale.totalAmount)}</td>
                        <td>{sale.kioskName || sale.sellerName || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default TotalSales;
