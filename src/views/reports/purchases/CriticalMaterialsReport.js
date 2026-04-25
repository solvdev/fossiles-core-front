import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Alert,
  Badge,
  Button,
} from "reactstrap";
import { getCriticalMaterialsReport } from "services/purchaseReportService";
import { showError } from "utils/notificationHelper";
import * as XLSX from "xlsx";

function CriticalMaterialsReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await getCriticalMaterialsReport();
      setReport(data);
    } catch (err) {
      showError(err.message || "Error al cargar el reporte");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => `Q ${parseFloat(amount || 0).toFixed(2)}`;

  const handleExportExcel = () => {
    if (!report) return;
    const data = (report.materials || []).map(m => ({
      SKU: m.sku,
      Nombre: m.name,
      "Stock Actual": parseFloat(m.currentStock || 0),
      "Stock Mínimo": parseFloat(m.minStock || 0),
      "Punto de Reorden": parseFloat(m.reorderPoint || 0),
      "Días de Inventario": parseFloat(m.daysOfInventory || 0).toFixed(1),
      "Cantidad Sugerida": parseFloat(m.suggestedQuantity || 0),
      Prioridad: m.priority,
      "Costo Unitario": parseFloat(m.unitCost || 0),
      "Valor Total": parseFloat(m.totalValue || 0)
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales Críticos");
    XLSX.writeFile(wb, `materiales_criticos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) return <p>Cargando...</p>;
  if (!report) return null;

  return (
    <div>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle tag="h5">Reporte de Materiales Críticos</CardTitle>
          <Button color="success" onClick={handleExportExcel} className="float-right">
            <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
          </Button>
        </CardHeader>
      </Card>

      <Alert color="warning">
        <strong>Total de Materiales Críticos: {report.totalCritical}</strong>
      </Alert>

      <Card>
        <CardBody>
          <Table responsive striped>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Stock Actual</th>
                <th>Stock Mínimo</th>
                <th>Punto Reorden</th>
                <th>Días Inventario</th>
                <th>Cantidad Sugerida</th>
                <th>Prioridad</th>
                <th>Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {(report.materials || []).map((m) => (
                <tr key={m.materialId}>
                  <td>{m.sku}</td>
                  <td>{m.name}</td>
                  <td>{m.currentStock}</td>
                  <td>{m.minStock}</td>
                  <td>{m.reorderPoint}</td>
                  <td>{m.daysOfInventory?.toFixed(1)}</td>
                  <td>{m.suggestedQuantity}</td>
                  <td>
                    <Badge
                      color={
                        m.priority === "ALTA"
                          ? "danger"
                          : m.priority === "MEDIA"
                          ? "warning"
                          : "info"
                      }
                    >
                      {m.priority}
                    </Badge>
                  </td>
                  <td>{formatCurrency(m.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export default CriticalMaterialsReport;

