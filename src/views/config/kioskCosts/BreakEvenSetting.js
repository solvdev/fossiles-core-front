import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, ButtonGroup, Card, CardBody, CardHeader, CardTitle, Spinner } from "reactstrap";
import { getKioskSettings, updateKioskSettings } from "services/kioskFinancialsService";
import { fmtDateEs } from "utils/financeFormat";
import { BREAK_EVEN_MODES } from "utils/kioskFinancialsGlossary";
import { showError, showSuccess } from "utils/notificationHelper";

const DESCRIPTION = {
  RATES:
    "Costos fijos ÷ (1 − las tasas variables reales de cada kiosco: costo del producto, comisión de venta, tarjeta e IVA). " +
    "Es el punto donde la utilidad es cero. Recomendado.",
  FLAT:
    "Costos fijos ÷ (1 − 0.27) igual para todos los kioscos, como los reportes de Excel desde abril 2026. Es más exigente " +
    "con los kioscos que no pagan comisión de venta, por lo que algunos con utilidad pequeña aparecen bajo el equilibrio.",
};

/**
 * Ajuste global: con qué método se mide el punto de equilibrio. Se guarda y aplica en todos los reportes y descargas
 * de Finanzas (P&L, metas y equilibrio, Excel) hasta que se vuelva a cambiar. Sólo cambia el punto de equilibrio:
 * costos, utilidad y margen siempre usan las tasas reales.
 */
function BreakEvenSetting({ canEdit }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState("RATES");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getKioskSettings();
      setSaved(data);
      setDraft(data.breakEvenMode || "RATES");
    } catch (err) {
      setError(err.message || "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = !!saved && draft !== saved.breakEvenMode;

  const save = async () => {
    setSaving(true);
    try {
      const data = await updateKioskSettings({ breakEvenMode: draft });
      setSaved(data);
      setDraft(data.breakEvenMode);
      showSuccess(`Punto de equilibrio: ${BREAK_EVEN_MODES[data.breakEvenMode].label}`);
    } catch (err) {
      showError(err.message || "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle tag="h5">Punto de equilibrio: método de medición</CardTitle>
        <p className="text-muted small mb-0">
          Se aplica en todos los reportes y descargas de Finanzas hasta que lo cambies. Solo cambia el punto de equilibrio:
          costos, utilidad y margen siempre usan las tasas reales.
        </p>
      </CardHeader>
      <CardBody>
        {loading ? (
          <Spinner size="sm" />
        ) : error ? (
          <Alert color="danger" className="mb-0">
            {error}{" "}
            <Button color="link" size="sm" className="p-0" onClick={load}>
              Reintentar
            </Button>
          </Alert>
        ) : (
          <>
            {saved && saved.persisted === false && (
              <Alert color="warning">
                Falta ejecutar <code>scripts/migration-kiosk-financials-settings.sql</code>: mientras tanto se usa «
                {BREAK_EVEN_MODES.RATES.label}» y no se puede guardar el cambio.
              </Alert>
            )}
            <ButtonGroup role="group" aria-label="Método del punto de equilibrio">
              {Object.entries(BREAK_EVEN_MODES).map(([value, meta]) => (
                <Button
                  key={value}
                  color="primary"
                  outline={draft !== value}
                  aria-pressed={draft === value}
                  disabled={!canEdit || saving}
                  onClick={() => setDraft(value)}
                >
                  {meta.label}
                  {saved && saved.breakEvenMode === value ? " ✓" : ""}
                </Button>
              ))}
            </ButtonGroup>
            <p className="small mt-2 mb-2">{DESCRIPTION[draft]}</p>
            {saved && saved.updatedAt && (
              <p className="small text-muted mb-2">Último cambio: {fmtDateEs(String(saved.updatedAt).slice(0, 10))}.</p>
            )}
            {canEdit ? (
              <Button color="primary" size="sm" disabled={!dirty || saving || (saved && saved.persisted === false)} onClick={save}>
                {saving ? <Spinner size="sm" /> : null} Guardar
              </Button>
            ) : (
              <span className="small text-muted">Solo lectura: necesitas el permiso para editar Finanzas.</span>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default BreakEvenSetting;
