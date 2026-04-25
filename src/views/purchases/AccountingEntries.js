import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Alert,
  FormGroup,
  Label,
  Input,
  Row,
  Col,
  Badge,
} from "reactstrap";
import {
  getAllAccountingEntries,
  getAccountingEntriesByDocumentType,
  getAccountingEntriesByAccount,
  getAccountingEntriesByDateRange,
} from "services/accountingService";
import { showError } from "utils/notificationHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import * as XLSX from "xlsx";

function AccountingEntries() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    documentType: "",
    accountCode: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async (customFilters = null) => {
    try {
      setLoading(true);
      setError("");

      const activeFilters = customFilters || filters;
      let data = [];

      if (activeFilters.documentType && !activeFilters.accountCode && !activeFilters.startDate) {
        data = await getAccountingEntriesByDocumentType(activeFilters.documentType);
      } else if (activeFilters.accountCode && !activeFilters.documentType && !activeFilters.startDate) {
        data = await getAccountingEntriesByAccount(activeFilters.accountCode);
      } else if (activeFilters.startDate && activeFilters.endDate) {
        // Convertir fechas a formato ISO con hora
        const startDateTime = new Date(activeFilters.startDate + "T00:00:00").toISOString();
        const endDateTime = new Date(activeFilters.endDate + "T23:59:59").toISOString();
        data = await getAccountingEntriesByDateRange(startDateTime, endDateTime);
      } else {
        data = await getAllAccountingEntries(activeFilters);
      }

      setEntries(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar los asientos contables");
      showError(err.message || "Error al cargar los asientos contables");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };

  const handleApplyFilters = () => {
    loadEntries();
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      documentType: "",
      accountCode: "",
      startDate: "",
      endDate: "",
    };
    setFilters(clearedFilters);
    loadEntries(clearedFilters);
  };

  const formatCurrency = (amount) => {
    if (!amount) return "Q 0.00";
    return `Q ${parseFloat(amount).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return formatDateTimeGt(dateString);
  };

  const getDocumentTypeBadge = (type) => {
    const typeMap = {
      PURCHASE_ORDER: { color: "info", text: "Orden de Compra" },
      MATERIAL_RECEIPT: { color: "success", text: "Recepción" },
      PURCHASE_ORDER_CANCELLATION: { color: "danger", text: "Cancelación" },
    };
    const typeInfo = typeMap[type] || { color: "secondary", text: type };
    return <Badge color={typeInfo.color}>{typeInfo.text}</Badge>;
  };

  const getTotalDebits = () => {
    return entries.reduce((sum, entry) => sum + (parseFloat(entry.debitAmount) || 0), 0);
  };

  const getTotalCredits = () => {
    return entries.reduce((sum, entry) => sum + (parseFloat(entry.creditAmount) || 0), 0);
  };

  const getAccountBalance = (accountCode) => {
    const accountEntries = entries.filter(e => e.accountCode === accountCode);
    const debits = accountEntries.reduce((sum, e) => sum + (parseFloat(e.debitAmount) || 0), 0);
    const credits = accountEntries.reduce((sum, e) => sum + (parseFloat(e.creditAmount) || 0), 0);
    return debits - credits;
  };

  const getUniqueAccounts = () => {
    const accounts = new Set(entries.map(e => e.accountCode));
    return Array.from(accounts);
  };

  const handleExportExcel = () => {
    try {
      const worksheetData = entries.map(entry => ({
        "ID": entry.id,
        "Tipo Documento": entry.documentType,
        "ID Documento": entry.documentId,
        "Referencia": entry.referenceNumber || "",
        "Fecha": formatDate(entry.entryDate),
        "Código Cuenta": entry.accountCode,
        "Nombre Cuenta": entry.accountName || "",
        "Débito": parseFloat(entry.debitAmount) || 0,
        "Crédito": parseFloat(entry.creditAmount) || 0,
        "Descripción": entry.description || "",
        "Centro de Costo": entry.costCenterName || entry.costCenterId || "",
      }));

      const ws = XLSX.utils.json_to_sheet(worksheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Asientos Contables");
      
      // Agregar resumen
      const summaryData = [
        { "": "RESUMEN" },
        { "": "Total Débitos", "Valor": getTotalDebits() },
        { "": "Total Créditos", "Valor": getTotalCredits() },
        { "": "Diferencia", "Valor": getTotalDebits() - getTotalCredits() },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");
      
      XLSX.writeFile(wb, `asientos_contables_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      showError("Error al exportar a Excel: " + error.message);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const printContent = `
      <html>
        <head>
          <title>Asientos Contables</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .text-right { text-align: right; }
            .summary { margin-top: 20px; padding: 10px; background-color: #f9f9f9; }
          </style>
        </head>
        <body>
          <h2>Asientos Contables - Módulo de Compras</h2>
          <div class="summary">
            <p><strong>Filtros aplicados:</strong></p>
            <ul>
              ${filters.documentType ? `<li>Tipo Documento: ${filters.documentType}</li>` : ''}
              ${filters.accountCode ? `<li>Cuenta: ${filters.accountCode}</li>` : ''}
              ${filters.startDate ? `<li>Fecha Inicio: ${filters.startDate}</li>` : ''}
              ${filters.endDate ? `<li>Fecha Fin: ${filters.endDate}</li>` : ''}
            </ul>
            <p><strong>Resumen:</strong> Total Débitos: ${formatCurrency(getTotalDebits())} | 
            Total Créditos: ${formatCurrency(getTotalCredits())} | 
            Diferencia: ${formatCurrency(getTotalDebits() - getTotalCredits())}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Tipo</th>
                <th>Referencia</th>
                <th>Fecha</th>
                <th>Cuenta</th>
                <th>Nombre Cuenta</th>
                <th>Débito</th>
                <th>Crédito</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map(entry => `
                <tr>
                  <td>${entry.id}</td>
                  <td>${entry.documentType}</td>
                  <td>${entry.referenceNumber || "-"}</td>
                  <td>${formatDate(entry.entryDate)}</td>
                  <td>${entry.accountCode}</td>
                  <td>${entry.accountName || "-"}</td>
                  <td class="text-right">${entry.debitAmount && parseFloat(entry.debitAmount) > 0 ? formatCurrency(entry.debitAmount) : "-"}</td>
                  <td class="text-right">${entry.creditAmount && parseFloat(entry.creditAmount) > 0 ? formatCurrency(entry.creditAmount) : "-"}</td>
                  <td>${entry.description || "-"}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6" class="text-right"><strong>TOTALES:</strong></td>
                <td class="text-right"><strong>${formatCurrency(getTotalDebits())}</strong></td>
                <td class="text-right"><strong>${formatCurrency(getTotalCredits())}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Asientos Contables - Módulo de Compras</CardTitle>
          <div className="float-right">
            <Button color="success" onClick={handleExportExcel} className="mr-2">
              <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
            </Button>
            <Button color="info" onClick={handlePrint}>
              <i className="nc-icon nc-paper" /> Imprimir
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}

          {/* Filtros */}
          <Card className="mb-4">
            <CardBody>
              <Row>
                <Col md="3">
                  <FormGroup>
                    <Label>Tipo de Documento</Label>
                    <Input
                      type="select"
                      value={filters.documentType}
                      onChange={(e) => handleFilterChange("documentType", e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="PURCHASE_ORDER">Orden de Compra</option>
                      <option value="MATERIAL_RECEIPT">Recepción de Materiales</option>
                      <option value="PURCHASE_ORDER_CANCELLATION">Cancelación de Orden</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Código de Cuenta</Label>
                    <Input
                      type="text"
                      value={filters.accountCode}
                      onChange={(e) => handleFilterChange("accountCode", e.target.value)}
                      placeholder="Ej: 1.1.3.01"
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Fecha Inicio</Label>
                    <Input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => handleFilterChange("startDate", e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Fecha Fin</Label>
                    <Input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => handleFilterChange("endDate", e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>&nbsp;</Label>
                    <div>
                      <Button color="primary" onClick={handleApplyFilters} block>
                        Filtrar
                      </Button>
                      <Button color="secondary" onClick={handleClearFilters} block className="mt-2">
                        Limpiar
                      </Button>
                    </div>
                  </FormGroup>
                </Col>
              </Row>
            </CardBody>
          </Card>

          {/* Resumen y Contador */}
          {entries.length > 0 && (
            <>
              <Alert color="info" className="mb-3">
                <Row>
                  <Col md="8">
                    <strong>Resumen:</strong> Total Débitos: {formatCurrency(getTotalDebits())} | 
                    Total Créditos: {formatCurrency(getTotalCredits())} | 
                    Diferencia: {formatCurrency(getTotalDebits() - getTotalCredits())}
                  </Col>
                  <Col md="4" className="text-right">
                    <strong>Total de asientos: {entries.length}</strong>
                  </Col>
                </Row>
              </Alert>
              
              {/* Saldos por Cuenta */}
              {filters.accountCode && (
                <Alert color="success" className="mb-3">
                  <strong>Saldo de la cuenta {filters.accountCode}:</strong> {formatCurrency(getAccountBalance(filters.accountCode))}
                  {getAccountBalance(filters.accountCode) > 0 && " (Deudor)"}
                  {getAccountBalance(filters.accountCode) < 0 && " (Acreedor)"}
                  {getAccountBalance(filters.accountCode) === 0 && " (Saldo en cero)"}
                </Alert>
              )}
            </>
          )}

          {loading ? (
            <p>Cargando asientos contables...</p>
          ) : entries.length === 0 ? (
            <p>No hay asientos contables registrados.</p>
          ) : (
            <Table responsive striped>
              <thead className="text-primary">
                <tr>
                  <th>ID</th>
                  <th>Tipo Documento</th>
                  <th>ID Documento</th>
                  <th>Referencia</th>
                  <th>Fecha</th>
                  <th>Cuenta</th>
                  <th>Nombre Cuenta</th>
                  <th>Débito</th>
                  <th>Crédito</th>
                  <th>Descripción</th>
                  <th>Centro de Costo</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.id}</td>
                    <td>{getDocumentTypeBadge(entry.documentType)}</td>
                    <td>{entry.documentId}</td>
                    <td>{entry.referenceNumber || "-"}</td>
                    <td>{formatDate(entry.entryDate)}</td>
                    <td>
                      <strong>{entry.accountCode}</strong>
                    </td>
                    <td>{entry.accountName || "-"}</td>
                    <td className="text-right">
                      {entry.debitAmount && parseFloat(entry.debitAmount) > 0
                        ? formatCurrency(entry.debitAmount)
                        : "-"}
                    </td>
                    <td className="text-right">
                      {entry.creditAmount && parseFloat(entry.creditAmount) > 0
                        ? formatCurrency(entry.creditAmount)
                        : "-"}
                    </td>
                    <td>{entry.description || "-"}</td>
                    <td>{entry.costCenterName || entry.costCenterId || "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-weight-bold">
                  <td colSpan="7" className="text-right">
                    <strong>TOTALES:</strong>
                  </td>
                  <td className="text-right">
                    <strong>{formatCurrency(getTotalDebits())}</strong>
                  </td>
                  <td className="text-right">
                    <strong>{formatCurrency(getTotalCredits())}</strong>
                  </td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default AccountingEntries;

