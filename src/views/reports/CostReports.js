import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardBody, CardTitle, Row, Col, Table, Button, Alert } from "reactstrap";
import * as XLSX from "xlsx";
import { getProductAverageCostsReport } from "services/purchaseReportService";
import { showError, showSuccess } from "utils/notificationHelper";

function CostReports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadReport = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getProductAverageCostsReport();
      setReport(data);
      showSuccess("Reporte de costos actualizado");
    } catch (err) {
      const msg = err?.message || "No se pudo cargar el reporte de costos";
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const formatCurrency = (value) => {
    const n = Number(value || 0);
    return `Q ${n.toFixed(2)}`;
  };

  const formatPercentage = (value) => {
    const n = Number(value || 0);
    return `${n.toFixed(2)}%`;
  };

  const exportExcel = () => {
    if (!report) return;

    const costs = report.productCosts || [];
    const productsEvaluated = costs.length;

    const summaryRows = [
      ["REPORTE EJECUTIVO DE COSTOS VS PRECIO"],
      [],
      ["Nota", "Por fila: % = 100 x (costo / precio). KPI % = promedio de esas filas."],
      [],
      ["Productos evaluados", productsEvaluated],
      ["Costo promedio general", formatCurrency(report.averageCostAcrossProducts)],
      ["Precio venta promedio", formatCurrency(report.averageSalePriceAcrossProducts)],
      ["% costo / precio promedio (de filas)", formatPercentage(report.averageCostVsSalePercentage)],
    ];

    const avgCostsRows = [
      [
        "Código", "Producto", "Costo total", "Precio venta", "% Costo / precio",
      ],
      ...costs.map((item) => [
        item.productCode || "",
        item.productName || "",
        Number(item.averageRecipeCost || 0),
        Number(item.salePrice || 0),
        Number(item.costVsSalePercentage || 0),
      ]),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(avgCostsRows), "Costo Promedio");
    XLSX.writeFile(wb, `reporte_costos_promedio_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const costs = report?.productCosts || [];
  const productsEvaluated = costs.length;

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader className="d-flex justify-content-between align-items-center">
              <CardTitle tag="h4">Reporte Promedio de Costos por Producto</CardTitle>
              <div className="d-flex" style={{ gap: 8 }}>
                <Button color="info" onClick={loadReport} disabled={loading}>
                  <i className="nc-icon nc-refresh-69 mr-1" />
                  {loading ? "Cargando..." : "Actualizar"}
                </Button>
                <Button color="success" onClick={exportExcel} disabled={!report || loading}>
                  <i className="nc-icon nc-cloud-download-93 mr-1" />
                  Exportar Excel
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-muted mb-3">
                Por producto: costo y precio en quetzales; el porcentaje es 100 × costo ÷ precio.
                El indicador global es el promedio de esos porcentajes (no es 100 × costos÷precios agregados).
              </p>

              {error && <Alert color="danger">{error}</Alert>}

              {report && (
                <Row className="mb-3">
                  <Col md="3">
                    <Card className="mb-0">
                      <CardBody className="py-2">
                        <div className="text-muted small">Productos evaluados</div>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>{productsEvaluated}</div>
                      </CardBody>
                    </Card>
                  </Col>
                  <Col md="3">
                    <Card className="mb-0">
                      <CardBody className="py-2">
                        <div className="text-muted small">Costo promedio</div>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>
                          {formatCurrency(report.averageCostAcrossProducts)}
                        </div>
                      </CardBody>
                    </Card>
                  </Col>
                  <Col md="3">
                    <Card className="mb-0">
                      <CardBody className="py-2">
                        <div className="text-muted small">Precio venta promedio</div>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>
                          {formatCurrency(report.averageSalePriceAcrossProducts)}
                        </div>
                      </CardBody>
                    </Card>
                  </Col>
                  <Col md="3">
                    <Card className="mb-0">
                      <CardBody className="py-2">
                        <div className="text-muted small">% costo / precio (prom. filas)</div>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>
                          {formatPercentage(report.averageCostVsSalePercentage)}
                        </div>
                      </CardBody>
                    </Card>
                  </Col>
                </Row>
              )}

              <Table responsive size="sm">
                <thead className="text-primary">
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th className="text-right">Costo</th>
                    <th className="text-right">Precio venta</th>
                    <th className="text-right">% Costo / precio</th>
                  </tr>
                </thead>
                <tbody>
                  {!costs.length ? (
                    <tr>
                      <td colSpan="5" className="text-center text-muted">
                        {loading ? "Cargando..." : "No hay datos para mostrar"}
                      </td>
                    </tr>
                  ) : (
                    costs.map((item) => (
                      <tr key={item.productId}>
                        <td>{item.productCode}</td>
                        <td>{item.productName}</td>
                        <td className="text-right"><strong>{formatCurrency(item.averageRecipeCost)}</strong></td>
                        <td className="text-right">{formatCurrency(item.salePrice)}</td>
                        <td className="text-right">
                          {item.costVsSalePercentage != null && item.salePrice > 0
                            ? formatPercentage(item.costVsSalePercentage)
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {costs.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: "bold", borderTop: "2px solid #333" }}>
                      <td colSpan="2">Promedios (costo y precio: media simple; %: media de la columna)</td>
                      <td className="text-right">{formatCurrency(report.averageCostAcrossProducts)}</td>
                      <td className="text-right">{formatCurrency(report.averageSalePriceAcrossProducts)}</td>
                      <td className="text-right">{formatPercentage(report.averageCostVsSalePercentage)}</td>
                    </tr>
                  </tfoot>
                )}
              </Table>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default CostReports;

