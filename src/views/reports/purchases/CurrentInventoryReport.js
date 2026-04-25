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
import { getCurrentInventoryReport } from "services/purchaseReportService";
import { showError } from "utils/notificationHelper";
import * as XLSX from "xlsx";

function CurrentInventoryReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await getCurrentInventoryReport();
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
      "Stock Máximo": parseFloat(m.maxStock || 0),
      "Costo Unitario": parseFloat(m.unitCost || 0),
      "Valor Total": parseFloat(m.totalValue || 0),
      "Crítico": m.isCritical ? "Sí" : "No",
      Estado: m.status
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario Actual");
    XLSX.writeFile(wb, `inventario_actual_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) return <p>Cargando...</p>;
  if (!report) return null;

  return (
    <div>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle tag="h5">Reporte de Inventario Actual</CardTitle>
          <Button color="success" onClick={handleExportExcel} className="float-right">
            <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
          </Button>
        </CardHeader>
      </Card>

      <Alert color="info">
        <strong>Resumen:</strong> Total Materiales: {report.totalMaterials} | 
        Valor Total Inventario: {formatCurrency(report.totalInventoryValue)} | 
        Materiales Críticos: {report.criticalMaterialsCount}
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
                <th>Stock Máximo</th>
                <th>Costo Unitario</th>
                <th>Valor Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {(report.materials || []).map((m) => (
                <tr key={m.materialId} className={m.isCritical ? "table-danger" : ""}>
                  <td>{m.sku}</td>
                  <td>{m.name}</td>
                  <td>{m.currentStock}</td>
                  <td>{m.minStock}</td>
                  <td>{m.maxStock}</td>
                  <td>{formatCurrency(m.unitCost)}</td>
                  <td>{formatCurrency(m.totalValue)}</td>
                  <td>
                    {m.isCritical && <Badge color="danger">Crítico</Badge>}
                    <Badge color={m.status === "Activo" ? "success" : "secondary"} className="ml-1">
                      {m.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export default CurrentInventoryReport;

