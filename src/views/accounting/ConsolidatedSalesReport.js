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
  Spinner,
  Table,
} from "reactstrap";
import Select from "react-select";
import { useAuth } from "contexts/AuthContext";
import { getLocations } from "services/locationService";
import { getConsolidatedKioskSalesReport } from "services/kioskPosService";
import { getMonthStartYmdGuatemala, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import {
  buildConsolidatedSalesRows,
  exportConsolidatedSalesToExcel,
  exportConsolidatedSalesToPdf,
} from "utils/consolidatedSalesReportExport";
import { showError } from "utils/notificationHelper";

const isKioskLocation = (location) => {
  const categoria = String(location?.categoria || "").toUpperCase();
  const name = String(location?.name || "").toUpperCase();
  const code = String(location?.code || "").toUpperCase();
  return categoria.includes("KIOS") || name.includes("KIOS") || code.startsWith("K");
};

const resolveUserFullName = (user) => {
  if (!user) return "";
  const composed = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return composed || user.fullName || user.name || user.username || "";
};

const formatCurrency = (value) => `Q ${Number(value || 0).toFixed(2)}`;

function ConsolidatedSalesReport() {
  const { user } = useAuth();
  const generatedByName = useMemo(() => resolveUserFullName(user), [user]);

  const [startDate, setStartDate] = useState(getMonthStartYmdGuatemala());
  const [endDate, setEndDate] = useState(getTodayYmdGuatemala());
  const [kioskOptions, setKioskOptions] = useState([]);
  const [loadingKiosks, setLoadingKiosks] = useState(false);
  const [selectedKiosks, setSelectedKiosks] = useState([]);
  const [sales, setSales] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadKiosks = async () => {
      setLoadingKiosks(true);
      try {
        const locations = await getLocations();
        const options = (locations || [])
          .filter((loc) => isKioskLocation(loc) && !loc.posTestMode)
          .map((loc) => ({ value: loc.id, label: loc.name }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setKioskOptions(options);
      } catch (err) {
        showError(err.message || "No se pudieron cargar los kioscos");
      } finally {
        setLoadingKiosks(false);
      }
    };
    loadKiosks();
  }, []);

  const rows = useMemo(() => buildConsolidatedSalesRows(sales || []), [sales]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          anulado: acc.anulado + row.anulado,
          creditos: acc.creditos + row.creditos,
          totalFacturado: acc.totalFacturado + row.totalFacturado,
        }),
        { anulado: 0, creditos: 0, totalFacturado: 0 }
      ),
    [rows]
  );

  const handleGenerate = async () => {
    setError("");
    setLoading(true);
    try {
      const kioskIds = selectedKiosks.map((opt) => opt.value);
      const data = await getConsolidatedKioskSalesReport(startDate, endDate, kioskIds);
      setSales(data);
    } catch (err) {
      setError(err.message || "No se pudo generar el reporte");
      setSales(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!sales) return;
    exportConsolidatedSalesToExcel({ sales, startDate, endDate, generatedByName });
  };

  const handleExportPdf = () => {
    if (!sales) return;
    exportConsolidatedSalesToPdf({ sales, startDate, endDate, generatedByName });
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Reporte de Ventas Consolidadas</CardTitle>
              <p className="text-muted mb-0">
                Ventas por kiosco en el período seleccionado, con estado, cliente, vendedor y totales.
              </p>
            </CardHeader>
            <CardBody>
              <Row>
                <Col md="3">
                  <FormGroup>
                    <Label>Desde</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Hasta</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>Kiosco</Label>
                    <Select
                      isMulti
                      isLoading={loadingKiosks}
                      closeMenuOnSelect={false}
                      placeholder="Selecciona los kioscos..."
                      noOptionsMessage={() => "No hay kioscos disponibles"}
                      options={kioskOptions}
                      value={selectedKiosks}
                      onChange={(opts) => setSelectedKiosks(opts || [])}
                    />
                  </FormGroup>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col className="d-flex" style={{ gap: 8 }}>
                  <Button color="primary" onClick={handleGenerate} disabled={loading}>
                    {loading ? <Spinner size="sm" /> : "Generar reporte"}
                  </Button>
                  <Button color="success" outline onClick={handleExportExcel} disabled={!sales || !rows.length}>
                    Excel
                  </Button>
                  <Button color="danger" outline onClick={handleExportPdf} disabled={!sales || !rows.length}>
                    PDF
                  </Button>
                </Col>
              </Row>

              {error && <Alert color="danger">{error}</Alert>}

              {sales !== null && (
                <>
                  <Row className="mb-2">
                    <Col>
                      <Badge color="secondary" className="p-2 mr-2">
                        {rows.length} venta(s)
                      </Badge>
                      <Badge color="danger" className="p-2 mr-2">
                        Anulado: {formatCurrency(totals.anulado)}
                      </Badge>
                      <Badge color="info" className="p-2 mr-2">
                        Créditos: {formatCurrency(totals.creditos)}
                      </Badge>
                      <Badge color="success" className="p-2">
                        Total Facturado: {formatCurrency(totals.totalFacturado)}
                      </Badge>
                    </Col>
                  </Row>

                  <div style={{ overflowX: "auto" }}>
                    <Table responsive hover size="sm">
                      <thead className="text-primary">
                        <tr>
                          <th>Kiosco</th>
                          <th>No. Factura</th>
                          <th>Fecha Emisión</th>
                          <th>Estado Venta</th>
                          <th>Cliente</th>
                          <th>Vendedor</th>
                          <th className="text-right">Anulado</th>
                          <th className="text-right">Créditos</th>
                          <th className="text-right">Total Facturado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan="9" className="text-center text-muted">
                              No hay ventas en el período seleccionado.
                            </td>
                          </tr>
                        ) : (
                          rows.map((row, idx) => (
                            <tr key={idx} className={row.voided ? "text-danger font-weight-bold" : ""}>
                              <td>{row.kiosco}</td>
                              <td>{row.noFactura}</td>
                              <td>{row.fechaEmision}</td>
                              <td>{row.estado}</td>
                              <td>{row.cliente}</td>
                              <td>{row.vendedor}</td>
                              <td className="text-right">{formatCurrency(row.anulado)}</td>
                              <td className="text-right">{formatCurrency(row.creditos)}</td>
                              <td className="text-right">{formatCurrency(row.totalFacturado)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {rows.length > 0 && (
                        <tfoot>
                          <tr className="font-weight-bold">
                            <td colSpan="6">TOTAL</td>
                            <td className="text-right">{formatCurrency(totals.anulado)}</td>
                            <td className="text-right">{formatCurrency(totals.creditos)}</td>
                            <td className="text-right">{formatCurrency(totals.totalFacturado)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </Table>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ConsolidatedSalesReport;
