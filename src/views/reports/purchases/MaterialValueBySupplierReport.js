import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardBody, CardTitle, Table, Button, Spinner } from "reactstrap";
import { getMaterialValueBySupplier } from "services/purchaseReportService";
import { showError } from "utils/notificationHelper";
import { datedFileName, exportValueTableExcel, exportValueTablePdf, fmtGeneratedAt } from "utils/valueTableExport";

const formatCurrency = (amount) =>
  `Q ${Number(amount || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Valor del stock de materiales: La Bandola de Oro y Otros (sin materiales de cuero). */
function MaterialValueBySupplierReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadReport = async () => {
    try {
      setLoading(true);
      setReport(await getMaterialValueBySupplier());
    } catch (err) {
      showError(err.message || "Error al cargar el reporte");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const table = (ext) => ({
    title: "Valor de materiales por proveedor",
    subtitle: `Existencias al ${fmtGeneratedAt(report.generatedAt)} · a costo unitario · sin cuero`,
    headers: ["Proveedor", "Valor en materiales"],
    rows: [...(report.groups || []).map((g) => [g.name, Number(g.value) || 0]), ["Total", Number(report.totalValue) || 0]],
    sheetName: "Valor materiales",
    fileName: datedFileName("Valor_Materiales_Proveedor", report.generatedAt, ext),
  });

  const handlePdf = async () => {
    try {
      await exportValueTablePdf(table("pdf"));
    } catch (err) {
      showError(err.message || "No se pudo generar el PDF");
    }
  };

  if (loading && !report) return <p>Cargando...</p>;
  if (!report) return null;

  return (
    <div>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle tag="h5">
            Valor de materiales por proveedor{" "}
            <small className="text-muted">existencias al {fmtGeneratedAt(report.generatedAt)}</small>
          </CardTitle>
          <div className="float-right">
            <Button color="default" onClick={loadReport} disabled={loading} className="mr-2">
              {loading ? <Spinner size="sm" /> : null} Actualizar
            </Button>
            <Button color="success" onClick={() => exportValueTableExcel(table("xlsx"))} className="mr-2">
              <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
            </Button>
            <Button color="danger" onClick={handlePdf}>
              <i className="nc-icon nc-paper" /> Exportar PDF
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardBody>
          <p className="text-muted mb-2">
            Existencias × costo unitario de cada material. No incluye materiales cuyo nombre dice "cuero".
          </p>
          <Table striped style={{ maxWidth: 520 }}>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">Valor en materiales</th>
              </tr>
            </thead>
            <tbody>
              {(report.groups || []).map((g) => (
                <tr key={g.name}>
                  <td>{g.name}</td>
                  <td className="text-right">{formatCurrency(g.value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <th className="text-right">{formatCurrency(report.totalValue)}</th>
              </tr>
            </tfoot>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export default MaterialValueBySupplierReport;
