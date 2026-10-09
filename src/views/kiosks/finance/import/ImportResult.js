import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, Button } from "reactstrap";
import { MONTHS_ES } from "utils/financeFormat";
import ImportHistory from "./ImportHistory";
import RevertButton from "./RevertButton";
import "./ImportWizard.css";

/** Resultado del commit: lotes creados con "Revertir lote" + historial. */
function ImportResult({ result, onReset }) {
  const [reverted, setReverted] = useState({});
  const [historyKey, setHistoryKey] = useState(0);
  const batches = (result && result.batches) || [];
  const totalSales = batches.reduce((s, b) => s + (b.salesRows || 0), 0);

  return (
    <div>
      <Alert color="success" role="status">
        <strong>✓ Importación completada.</strong> Se crearon {batches.length} lote{batches.length === 1 ? "" : "s"} con{" "}
        {totalSales.toLocaleString("es-GT")} filas de ventas.
      </Alert>

      <div className="table-responsive">
        <table className="table kiw-table" style={{ minWidth: 700 }}>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Archivo</th>
              <th>Período</th>
              <th className="text-right">Ventas</th>
              <th className="text-right">Config.</th>
              <th className="text-right">Costos</th>
              <th className="text-right">Reemplazadas</th>
              <th>Avisos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batchId}>
                <td>#{b.batchId}</td>
                <td className="kiw-msg">{b.fileName}</td>
                <td>
                  {MONTHS_ES[(b.month || 1) - 1]} {b.year}
                </td>
                <td className="text-right">{b.salesRows}</td>
                <td className="text-right">{b.configRows}</td>
                <td className="text-right">{b.costRows}</td>
                <td className="text-right">{b.replacedRows}</td>
                <td className="small kiw-msg">
                  {Array.isArray(b.warnings) && b.warnings.length > 0 ? (
                    <ul className="pl-3 mb-0">
                      {b.warnings.slice(0, 4).map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                      {b.warnings.length > 4 && <li>+{b.warnings.length - 4} más</li>}
                    </ul>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="text-right">
                  {reverted[b.batchId] ? (
                    <Badge color="secondary">↺ Revertido</Badge>
                  ) : (
                    <RevertButton
                      batch={b}
                      onReverted={(id) => {
                        setReverted((prev) => ({ ...prev, [id]: true }));
                        setHistoryKey((k) => k + 1);
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kiw-actions">
        <Link to="/admin/kiosk-costs" className="btn btn-outline-info btn-round">
          Revisar costos por kiosco
        </Link>
        <Button color="primary" className="btn-round" onClick={onReset}>
          <i className="nc-icon nc-simple-add" aria-hidden="true" /> Importar más archivos
        </Button>
      </div>

      <h6 className="mt-4">Historial de importaciones</h6>
      <ImportHistory refreshKey={historyKey} />
    </div>
  );
}

export default ImportResult;
