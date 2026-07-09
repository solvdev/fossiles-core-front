import React, { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Input,
  Label,
  Row,
  Table,
} from "reactstrap";
import { useAuth } from "contexts/AuthContext";
import { getGeneralKioskReport, getGeneralKioskSalesDetail } from "services/kioskPosService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { exportKioskSalesToExcel, exportKioskSalesToPdf } from "utils/kioskPosReportExport";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";

function resolveUserFullName(user) {
  if (!user) return "";
  const composed = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return composed || user.fullName || user.name || user.username || "";
}

function SalesReports() {
  const { user } = useAuth();
  const today = getTodayYmdGuatemala();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedKioskId, setSelectedKioskId] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [exportMode, setExportMode] = useState("consolidated"); // consolidated | byDay

  const generatedByName = useMemo(() => resolveUserFullName(user), [user]);

  const formatCurrency = (value) => `Q ${Number(value || 0).toFixed(2)}`;
  const formatQty = (value) => Number(value || 0).toFixed(2);

  const generateReport = async () => {
    try {
      setLoading(true);
      setError("");
      const from = startDate || today;
      const to = endDate || from;
      setStartDate(from);
      setEndDate(to);
      const response = await getGeneralKioskReport(from, to);
      setReport(response || null);
    } catch (err) {
      setError(err.message || "No se pudo generar el reporte general de kioskos.");
    } finally {
      setLoading(false);
    }
  };

  const loadSalesForExport = async () => {
    const from = startDate || today;
    const to = endDate || from;
    if (!from) {
      showWarning("Selecciona el día (o rango) a exportar.");
      return null;
    }
    const sales = await getGeneralKioskSalesDetail(
      from,
      to,
      selectedKioskId ? Number(selectedKioskId) : undefined
    );
    const list = Array.isArray(sales) ? sales : [];
    if (!list.length) {
      showWarning("No hay ventas para exportar en el período seleccionado.");
      return null;
    }
    return { sales: list, from, to };
  };

  const resolveExportKioskName = (sales) => {
    if (selectedKioskId && report?.kiosks) {
      const match = report.kiosks.find((k) => String(k.kioskId) === String(selectedKioskId));
      if (match?.kioskName) return match.kioskName;
    }
    const names = [...new Set((sales || []).map((s) => s.kioskName).filter(Boolean))];
    if (names.length === 1) return names[0];
    if (names.length > 1) return "TODOS LOS KIOSKOS";
    return "KIOSKOS";
  };

  const resolveExportMode = (from, to) => {
    if (from && to && from !== to) return exportMode;
    return "single";
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const payload = await loadSalesForExport();
      if (!payload) return;
      const mode = resolveExportMode(payload.from, payload.to);
      exportKioskSalesToExcel({
        sales: payload.sales,
        startDate: payload.from,
        endDate: payload.to,
        kioskName: resolveExportKioskName(payload.sales),
        kioskCode: selectedKioskId ? `K${selectedKioskId}` : "ALL",
        generatedByName,
        mode,
      });
      showSuccess(
        mode === "byDay"
          ? "Excel por día descargado (una hoja por fecha)."
          : "Excel descargado correctamente."
      );
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const payload = await loadSalesForExport();
      if (!payload) return;
      const mode = resolveExportMode(payload.from, payload.to);
      const opened = exportKioskSalesToPdf({
        sales: payload.sales,
        startDate: payload.from,
        endDate: payload.to,
        kioskName: resolveExportKioskName(payload.sales),
        generatedByName,
        mode,
      });
      if (opened === false) {
        showWarning("Permite ventanas emergentes para imprimir o guardar el PDF.");
        return;
      }
      showSuccess("PDF listo para imprimir o guardar.");
    } catch (err) {
      showError(err.message || "No se pudo generar el PDF.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader className="d-flex flex-wrap align-items-center justify-content-between">
              <CardTitle tag="h4" className="mb-0">
                Reportes de Ventas
              </CardTitle>
              <div className="mt-2 mt-md-0 d-flex flex-wrap align-items-center">
                {startDate && endDate && startDate !== endDate && (
                  <Input
                    type="select"
                    bsSize="sm"
                    className="mr-2 mb-0"
                    style={{ width: "auto", minWidth: 200 }}
                    value={exportMode}
                    onChange={(e) => setExportMode(e.target.value)}
                    disabled={loading || exporting}
                  >
                    <option value="consolidated">Consolidado (FECHA al inicio de cada día)</option>
                    <option value="byDay">Separado por día (una hoja c/u)</option>
                  </Input>
                )}
                <Button
                  color="success"
                  size="sm"
                  className="btn-round mr-2"
                  onClick={handleExportExcel}
                  disabled={loading || exporting}
                >
                  Excel
                </Button>
                <Button
                  color="info"
                  size="sm"
                  className="btn-round"
                  onClick={handleExportPdf}
                  disabled={loading || exporting}
                >
                  PDF / Imprimir
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <Alert color="light" className="border">
                Formato <strong>REPORTE DE VENTAS</strong> (factura interna, X en Efectivo/POS). En un rango
                puedes bajar <strong>consolidado</strong> (con <em>DIA:</em> sobre cada bloque) o{" "}
                <strong>separado por día</strong> (una hoja Excel / sección PDF por fecha).
              </Alert>
              <Row className="mb-3">
                <Col md="3">
                  <Label>Inicio</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </Col>
                <Col md="3">
                  <Label>Fin</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </Col>
                <Col md="3">
                  <Label>Kiosko (opcional)</Label>
                  <Input
                    type="select"
                    value={selectedKioskId}
                    onChange={(e) => setSelectedKioskId(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {(report?.kiosks || []).map((row) => (
                      <option key={row.kioskId} value={row.kioskId}>
                        {row.kioskName}
                      </option>
                    ))}
                  </Input>
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <Button color="primary" className="btn-round" onClick={generateReport} disabled={loading}>
                    <i className="nc-icon nc-zoom-split" /> {loading ? "Generando..." : "Generar resumen"}
                  </Button>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md="4">
                  <Card body>
                    <strong>Total ventas:</strong> {report?.salesCount || 0}
                  </Card>
                </Col>
                <Col md="4">
                  <Card body>
                    <strong>Total unidades:</strong> {formatQty(report?.totalItems || 0)}
                  </Card>
                </Col>
                <Col md="4">
                  <Card body>
                    <strong>Total monto:</strong> {formatCurrency(report?.totalAmount || 0)}
                  </Card>
                </Col>
              </Row>

              <Table responsive>
                <thead className="text-primary">
                  <tr>
                    <th>Kiosko</th>
                    <th>Ventas</th>
                    <th>Unidades</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.kiosks || []).map((row) => (
                    <tr key={`report-kiosk-${row.kioskId}`}>
                      <td>{row.kioskName}</td>
                      <td>{row.salesCount}</td>
                      <td>{formatQty(row.totalItems)}</td>
                      <td>{formatCurrency(row.totalAmount)}</td>
                    </tr>
                  ))}
                  {(!report?.kiosks || report.kiosks.length === 0) && (
                    <tr>
                      <td colSpan="4" className="text-center text-muted">
                        Seleccione fechas y genere el reporte
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default SalesReports;
