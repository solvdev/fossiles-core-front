import React, { useEffect, useState } from "react";
import Select from "react-select";
import {
  Button,
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
} from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { MONTHS_ES, MONTHS_ES_SHORT } from "utils/financeFormat";
import { copyKioskConfig } from "services/kioskFinancialsService";
import { showError, showSuccess } from "utils/notificationHelper";

const INCLUDE_OPTIONS = [
  { code: "COSTS", label: "Costos fijos" },
  { code: "RATES", label: "Tasas variables" },
  { code: "GOALS", label: "Metas de ventas" },
];

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** "Copiar de..." -> POST /config/copy */
function CopyModal({ isOpen, toggle, year, years, sites, onCopied }) {
  const [fromYear, setFromYear] = useState(year - 1);
  const [fromMonth, setFromMonth] = useState(12);
  const [toYear, setToYear] = useState(year);
  const [toMonths, setToMonths] = useState([]);
  const [siteSel, setSiteSel] = useState([]);
  const [include, setInclude] = useState(["COSTS", "RATES", "GOALS"]);
  const [overwrite, setOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFromYear(years.includes(year - 1) ? year - 1 : year);
    setFromMonth(12);
    setToYear(year);
    setToMonths(ALL_MONTHS);
    setSiteSel([]);
    setInclude(["COSTS", "RATES", "GOALS"]);
    setOverwrite(false);
  }, [isOpen, year, years]);

  const toggleMonth = (m) =>
    setToMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)));
  const toggleInclude = (code) =>
    setInclude((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));

  const siteOptions = sites.map((s) => ({ value: s.siteId, label: s.name }));
  const samePeriod = fromYear === toYear && toMonths.length === 1 && toMonths[0] === fromMonth;
  const invalid = toMonths.length === 0 || include.length === 0 || samePeriod;

  const run = async () => {
    setSaving(true);
    try {
      const result = await copyKioskConfig({
        fromYear,
        fromMonth,
        toYear,
        toMonths,
        siteIds: siteSel.length ? siteSel.map((s) => s.value) : null,
        include,
        overwrite,
      });
      showSuccess(
        `Copiado: ${result.copiedCells ?? 0} celdas en ${result.copiedMonths ?? 0} mes(es)` +
          (result.skippedCells ? `, ${result.skippedCells} omitidas por tener valor` : "")
      );
      onCopied(result, toYear);
      toggle();
    } catch (err) {
      showError(err.message || "No se pudo copiar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    if (overwrite) setConfirmOverwrite(true);
    else run();
  };

  return (
    <>
      <Modal isOpen={isOpen} toggle={toggle} size="lg" centered>
        <ModalHeader toggle={toggle}>Copiar configuración de otro período</ModalHeader>
        <ModalBody>
          <Row>
            <Col md="6">
              <h6 className="text-primary">Origen</h6>
              <Row form>
                <Col xs="6">
                  <FormGroup>
                    <Label for="kc-copy-from-year">Año</Label>
                    <Input
                      id="kc-copy-from-year"
                      type="select"
                      value={fromYear}
                      onChange={(e) => setFromYear(Number(e.target.value))}
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col xs="6">
                  <FormGroup>
                    <Label for="kc-copy-from-month">Mes</Label>
                    <Input
                      id="kc-copy-from-month"
                      type="select"
                      value={fromMonth}
                      onChange={(e) => setFromMonth(Number(e.target.value))}
                    >
                      {MONTHS_ES.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
              </Row>
            </Col>
            <Col md="6">
              <h6 className="text-primary">Destino</h6>
              <FormGroup>
                <Label for="kc-copy-to-year">Año</Label>
                <Input id="kc-copy-to-year" type="select" value={toYear} onChange={(e) => setToYear(Number(e.target.value))}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
          </Row>
          <FormGroup>
            <Label>Meses destino</Label>
            <div className="d-flex flex-wrap" role="group" aria-label="Meses destino">
              {MONTHS_ES_SHORT.map((label, i) => {
                const m = i + 1;
                const on = toMonths.includes(m);
                return (
                  <Button
                    key={label}
                    size="sm"
                    color={on ? "primary" : "secondary"}
                    outline={!on}
                    aria-pressed={on}
                    className="mr-1 mb-1"
                    onClick={() => toggleMonth(m)}
                  >
                    {on ? "✓ " : ""}
                    {label}
                  </Button>
                );
              })}
              <Button size="sm" color="link" onClick={() => setToMonths(toMonths.length === 12 ? [] : ALL_MONTHS)}>
                {toMonths.length === 12 ? "Ninguno" : "Todos"}
              </Button>
            </div>
          </FormGroup>
          <FormGroup>
            <Label>Kioscos (vacío = todos)</Label>
            <Select
              isMulti
              options={siteOptions}
              value={siteSel}
              onChange={(v) => setSiteSel(v || [])}
              placeholder="Todos los kioscos"
              noOptionsMessage={() => "Sin resultados"}
              classNamePrefix="react-select"
            />
          </FormGroup>
          <FormGroup>
            <Label className="d-block">Qué copiar</Label>
            {INCLUDE_OPTIONS.map((opt) => (
              <FormGroup check inline key={opt.code}>
                <Label check>
                  <Input type="checkbox" checked={include.includes(opt.code)} onChange={() => toggleInclude(opt.code)} />
                  {opt.label}
                  <span className="form-check-sign" />
                </Label>
              </FormGroup>
            ))}
          </FormGroup>
          <FormGroup check>
            <Label check>
              <Input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              Sobrescribir celdas que ya tienen valor
              <span className="form-check-sign" />
            </Label>
            <div className="small text-muted ml-4">
              Desactivado: sólo se llenan celdas vacías. Las celdas copiadas quedan marcadas como COPIED.
            </div>
          </FormGroup>
          {samePeriod && <div className="text-danger small mt-2">El origen y el destino son el mismo período.</div>}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={saving}>
            Cancelar
          </Button>
          <Button color="primary" onClick={submit} disabled={saving || invalid}>
            {saving ? <Spinner size="sm" /> : null} Copiar
          </Button>
        </ModalFooter>
      </Modal>
      <ConfirmModal
        isOpen={confirmOverwrite}
        toggle={() => setConfirmOverwrite(false)}
        onConfirm={run}
        title="Sobrescribir valores existentes"
        message="Se reemplazarán los valores ya capturados en los meses y kioscos seleccionados. ¿Continuar?"
        confirmText="Sí, sobrescribir"
        confirmColor="warning"
      />
    </>
  );
}

export default CopyModal;
