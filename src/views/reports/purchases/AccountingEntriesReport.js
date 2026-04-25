import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Alert,
  Badge,
  Row,
  Col,
  FormGroup,
  Label,
  Input,
  Button,
} from "reactstrap";
import { getAccountingEntriesReport } from "services/purchaseReportService";
import { showError } from "utils/notificationHelper";
import * as XLSX from "xlsx";

function AccountingEntriesReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [documentType, setDocumentType] = useState("");

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await getAccountingEntriesReport(
        startDate || null,
        endDate || null,
        documentType || null
      );
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
    const data = (report.entries || []).map(e => ({
      ID: e.id,
      "Tipo Documento": e.documentType,
      "ID Documento": e.documentId,
      Referencia: e.referenceNumber || "",
      Fecha: new Date(e.entryDate).toLocaleDateString(),
      "Código Cuenta": e.accountCode,
      "Nombre Cuenta": e.accountName || "",
      Débito: parseFloat(e.debitAmount || 0),
      Crédito: parseFloat(e.creditAmount || 0),
      Descripción: e.description || "",
      "Centro de Costo": e.costCenterName || e.costCenterId || ""
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asientos Contables");
    XLSX.writeFile(wb, `asientos_contables_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) return <p>Cargando...</p>;
  if (!report) return null;

  return (
    <div>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle tag="h5">Reporte de Asientos Contables</CardTitle>
          <Button color="success" onClick={handleExportExcel} className="float-right">
            <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
          </Button>
        </CardHeader>
        <CardBody>
          <Row>
            <Col md="3">
              <FormGroup>
                <Label>Fecha Inicio</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Fecha Fin</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Tipo Documento</Label>
                <Input
                  type="select"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="PURCHASE_ORDER">Orden de Compra</option>
                  <option value="MATERIAL_RECEIPT">Recepción</option>
                  <option value="PURCHASE_ORDER_CANCELLATION">Cancelación</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="3" className="d-flex align-items-end">
              <Button color="primary" onClick={loadReport}>Generar</Button>
            </Col>
          </Row>
        </CardBody>
      </Card>

      <Alert color={Math.abs(parseFloat(report.balance || 0)) < 0.01 ? "success" : "warning"}>
        <strong>Balance:</strong> Débitos: {formatCurrency(report.totalDebits)} | 
        Créditos: {formatCurrency(report.totalCredits)} | 
        Diferencia: {formatCurrency(report.balance)}
        {Math.abs(parseFloat(report.balance || 0)) < 0.01 && " ✅ Balance = 0"}
      </Alert>

      <Card>
        <CardBody>
          <Table responsive striped>
            <thead>
              <tr>
                <th>ID</th>
                <th>Tipo</th>
                <th>Referencia</th>
                <th>Fecha</th>
                <th>Cuenta</th>
                <th>Débito</th>
                <th>Crédito</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              {(report.entries || []).map((e) => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td>
                    <Badge
                      color={
                        e.documentType === "PURCHASE_ORDER"
                          ? "info"
                          : e.documentType === "MATERIAL_RECEIPT"
                          ? "success"
                          : "danger"
                      }
                    >
                      {e.documentType}
                    </Badge>
                  </td>
                  <td>{e.referenceNumber || "-"}</td>
                  <td>{new Date(e.entryDate).toLocaleDateString()}</td>
                  <td>{e.accountCode}</td>
                  <td>{e.debitAmount && parseFloat(e.debitAmount) > 0 ? formatCurrency(e.debitAmount) : "-"}</td>
                  <td>{e.creditAmount && parseFloat(e.creditAmount) > 0 ? formatCurrency(e.creditAmount) : "-"}</td>
                  <td>{e.description || "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan="5">TOTALES</th>
                <th>{formatCurrency(report.totalDebits)}</th>
                <th>{formatCurrency(report.totalCredits)}</th>
                <th></th>
              </tr>
            </tfoot>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export default AccountingEntriesReport;

