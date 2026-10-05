import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Spinner } from "reactstrap";
import { MONTHS_ES } from "utils/financeFormat";
import { listKioskImports } from "services/kioskFinancialsService";
import RevertButton from "./RevertButton";
import "./ImportWizard.css";

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleString("es-GT", { dateStyle: "short", timeStyle: "short" });
};

/** Historial de lotes (GET /imports) con reversión. `refreshKey` fuerza recarga. */
function ImportHistory({ refreshKey }) {
  const [batches, setBatches] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listKioskImports();
      setBatches(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading && !batches) {
    return (
      <div className="text-center py-3">
        <Spinner size="sm" color="primary" /> Cargando historial...
      </div>
    );
  }
  if (error) {
    return (
      <Alert color="danger">
        {error}{" "}
        <Button size="sm" color="danger" outline className="ml-2" onClick={load}>
          Reintentar
        </Button>
      </Alert>
    );
  }
  if (!batches || batches.length === 0) {
    return <div className="text-muted text-center py-3">Aún no hay importaciones registradas.</div>;
  }

  return (
    <div className="table-responsive">
      <table className="table kiw-table" style={{ minWidth: 720 }}>
        <thead>
          <tr>
            <th>Lote</th>
            <th>Archivo</th>
            <th>Período</th>
            <th>Estado</th>
            <th className="text-right">Ventas</th>
            <th className="text-right">Config.</th>
            <th className="text-right">Costos</th>
            <th>Fecha</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td>#{b.id}</td>
              <td className="kiw-msg">{b.fileName}</td>
              <td>
                {MONTHS_ES[(b.month || 1) - 1]} {b.year}
              </td>
              <td>
                {b.status === "REVERTED" ? (
                  <Badge color="secondary">
                    <span aria-hidden="true">↺</span> Revertido
                  </Badge>
                ) : (
                  <Badge color="success">
                    <span aria-hidden="true">✓</span> Aplicado
                  </Badge>
                )}
                {Array.isArray(b.warnings) && b.warnings.length > 0 && (
                  <span className="kiw-chip ml-1" title={b.warnings.join("\n")}>
                    {b.warnings.length} aviso{b.warnings.length === 1 ? "" : "s"}
                  </span>
                )}
              </td>
              <td className="text-right">{b.salesRows}</td>
              <td className="text-right">{b.configRows}</td>
              <td className="text-right">{b.costRows}</td>
              <td className="small">{fmtDateTime(b.createdAt)}</td>
              <td className="text-right">
                {b.status !== "REVERTED" && <RevertButton batch={b} onReverted={load} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ImportHistory;
