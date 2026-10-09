import React, { useState } from "react";
import {
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "reactstrap";
import { getKioskConfig } from "services/kioskFinancialsService";
import { downloadKioskTemplate } from "utils/kioskFinancialsTemplate";
import { MONTHS_ES } from "utils/financeFormat";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";

/** Descarga de la plantilla estándar (mismo layout que el reporte mensual original). */
function TemplateModal({ isOpen, toggle, sites }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [prefill, setPrefill] = useState(true);
  const [busy, setBusy] = useState(false);

  const activeSites = (sites || [])
    .filter((s) => s.status === "ACTIVE")
    .sort((a, b) => a.name.localeCompare(b.name));

  const generate = async () => {
    if (activeSites.length === 0) {
      showWarning("No hay sitios activos para generar la plantilla.");
      return;
    }
    setBusy(true);
    try {
      let categories = null;
      let siteConfigs = [];
      if (prefill) {
        try {
          const config = await getKioskConfig({ year });
          categories = config.categories || null;
          const byId = new Map((config.sites || []).map((s) => [s.siteId, s]));
          siteConfigs = activeSites.map((site) => {
            const entry = byId.get(site.id);
            const m = entry && (entry.months || []).find((x) => x.month === month);
            return m
              ? {
                  goal: m.goal ?? null,
                  productCostPct: m.productCostPct ?? null,
                  salesCommissionPct: m.salesCommissionPct ?? null,
                  cardCommissionPct: m.cardCommissionPct ?? null,
                  taxPct: m.taxPct ?? null,
                  costs: m.costs || {},
                }
              : null;
          });
        } catch (err) {
          showWarning("No se pudo prellenar con la configuración; se genera la plantilla vacía.");
        }
      }
      downloadKioskTemplate({
        year,
        month,
        siteNames: activeSites.map((s) => s.name),
        categories,
        siteConfigs,
      });
      showSuccess("Plantilla generada.");
      toggle();
    } catch (err) {
      showError(err.message || "No se pudo generar la plantilla.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} centered>
      <ModalHeader toggle={toggle}>Descargar plantilla estándar</ModalHeader>
      <ModalBody>
        <p className="small text-muted">
          Genera un .xlsx con el mismo formato del reporte mensual: encabezado con los {activeSites.length} kioscos activos,
          filas de días, Total, METAS, tasas variables y los 10 costos fijos. Las celdas amarillas son de captura.
        </p>
        <div className="d-flex">
          <FormGroup className="mr-3">
            <Label for="kiw-tpl-year">Año</Label>
            <Input id="kiw-tpl-year" type="number" min="2024" max="2100" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
          </FormGroup>
          <FormGroup className="flex-grow-1">
            <Label for="kiw-tpl-month">Mes</Label>
            <Input id="kiw-tpl-month" type="select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS_ES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Input>
          </FormGroup>
        </div>
        <FormGroup check>
          <Label check>
            <Input type="checkbox" checked={prefill} onChange={(e) => setPrefill(e.target.checked)} />
            Prellenar metas, tasas y costos con la configuración actual
            <span className="form-check-sign" />
          </Label>
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle} disabled={busy}>
          Cancelar
        </Button>
        <Button color="primary" onClick={generate} disabled={busy || activeSites.length === 0}>
          {busy ? <Spinner size="sm" /> : <i className="nc-icon nc-cloud-download-93" aria-hidden="true" />} Descargar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default TemplateModal;
