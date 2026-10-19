import React from "react";
import { Button, Col, Input, Label, Row } from "reactstrap";
import {
  CARRIER_LABELS, METHOD_LABELS, STATUS_META, defaultFilters,
} from "utils/reconciliationHelper";

/** Filtros combinables y compartidos por todas las pestañas: período, método, transportista, vendedor, estado y lote. */
const ReconFilters = ({ filters, onChange, sellers, batches, today, hideStatus, hideBatch }) => {
  const set = (k, v) => onChange({ ...filters, [k]: v });
  const field = (id, label, control, md = 2) => (
    <Col md={md} sm={6} xs={12} className="mb-2">
      <Label for={id} className="mb-0 small text-uppercase text-muted">{label}</Label>
      {control}
    </Col>
  );
  return (
    <Row className="align-items-end" role="search">
      {field("rf-from", "Desde", <Input id="rf-from" type="date" bsSize="sm" value={filters.from} onChange={(e) => set("from", e.target.value)} />)}
      {field("rf-to", "Hasta", <Input id="rf-to" type="date" bsSize="sm" value={filters.to} onChange={(e) => set("to", e.target.value)} />)}
      {field("rf-method", "Método de pago", (
        <Input id="rf-method" type="select" bsSize="sm" value={filters.method} onChange={(e) => set("method", e.target.value)}>
          <option value="">Todos</option>
          {Object.keys(METHOD_LABELS).map((k) => <option key={k} value={k}>{METHOD_LABELS[k]}</option>)}
        </Input>
      ))}
      {field("rf-carrier", "Transportista", (
        <Input id="rf-carrier" type="select" bsSize="sm" value={filters.carrier} onChange={(e) => set("carrier", e.target.value)}>
          <option value="">Todos</option>
          {Object.keys(CARRIER_LABELS).map((k) => <option key={k} value={k}>{CARRIER_LABELS[k]}</option>)}
        </Input>
      ))}
      {field("rf-seller", "Vendedor", (
        <Input id="rf-seller" type="select" bsSize="sm" value={filters.sellerId} onChange={(e) => set("sellerId", e.target.value)}>
          <option value="">Todos</option>
          {(sellers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Input>
      ))}
      {!hideStatus && field("rf-status", "Estado", (
        <Input id="rf-status" type="select" bsSize="sm" value={filters.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">Todos</option>
          {filters.status && filters.status.includes(",") && <option value={filters.status}>Varios estados</option>}
          {Object.keys(STATUS_META).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
        </Input>
      ))}
      {!hideBatch && field("rf-batch", "Lote", (
        <Input id="rf-batch" type="select" bsSize="sm" value={filters.batch} onChange={(e) => set("batch", e.target.value)}>
          <option value="">Todos</option>
          <option value="NONE">Sin lote</option>
          {(batches || []).filter((b) => b.status !== "VOID").map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </Input>
      ))}
      <Col md="auto" className="mb-2">
        <Button size="sm" color="secondary" outline onClick={() => onChange(defaultFilters(today))}>Limpiar filtros</Button>
      </Col>
    </Row>
  );
};

export default ReconFilters;
