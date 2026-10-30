import React, { useRef, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, Col, Collapse, Input, Row, Table } from "reactstrap";
import { downloadPriceTemplate, importPriceTemplate } from "services/productService";
import { showError, showSuccess } from "utils/notificationHelper";

const MAX_REVIEW_ROWS = 50;
const EXCEL_TYPES = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const TEMPLATE_TYPES = [
  { tipo: "kiosco", label: "Kioscos", hint: "Cambia el precio de venta." },
  { tipo: "entrecueros", label: "Entrecueros", hint: "Un precio por producto: sus variantes lo comparten." },
];

const money = (value) => (value == null || value === "" ? "—" : `Q${Number(value).toFixed(2)}`);

const priceLabel = (price) => (!price || price === "Venta" ? "Venta" : `Precio ${price}`);

function Step({ number, title, action, children }) {
  return (
    <div className="border rounded p-3 h-100">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <strong>
          <Badge color="info" pill className="mr-2">
            {number}
          </Badge>
          {title}
        </strong>
        {action}
      </div>
      {children}
    </div>
  );
}

function ReviewResult({ review }) {
  const errors = review.errors || [];
  const changes = review.changes || [];

  if (errors.length > 0) {
    return (
      <Alert color="danger" className="mt-3 mb-0">
        <strong>
          {errors.length} fila{errors.length === 1 ? "" : "s"} con error. No se aplicó nada: corrija el archivo y vuelva a subirlo.
        </strong>
        <ul className="mb-0 mt-2 small">
          {errors.slice(0, 8).map((err) => (
            <li key={`${err.sheet}-${err.row}-${err.id || err.code}`}>
              {err.sheet} · fila {err.row}: {err.message}
            </li>
          ))}
          {errors.length > 8 && <li>…y {errors.length - 8} más</li>}
        </ul>
      </Alert>
    );
  }

  if (changes.length === 0) {
    return (
      <Alert color="secondary" className="mt-3 mb-0">
        Nada por cambiar: los precios del archivo ya son los actuales.
      </Alert>
    );
  }

  return (
    <div className="mt-3">
      <p className="mb-2">
        <Badge color="success" className="mr-2">
          {changes.length}
        </Badge>
        precio{changes.length === 1 ? "" : "s"} por actualizar. Revise y presione <strong>Aplicar precios</strong>.
      </p>
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        <Table size="sm" responsive className="mb-0">
          <thead className="text-primary">
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Precio</th>
              <th className="text-right">Actual</th>
              <th className="text-right">Nuevo</th>
            </tr>
          </thead>
          <tbody>
            {changes.slice(0, MAX_REVIEW_ROWS).map((change) => (
              <tr key={`${change.id}-${change.price || "venta"}`}>
                <td>{change.code}</td>
                <td>{change.name}</td>
                <td>{priceLabel(change.price)}</td>
                <td className="text-right text-muted">{money(change.currentPrice)}</td>
                <td className="text-right">
                  <strong>{money(change.newPrice)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      {changes.length > MAX_REVIEW_ROWS && (
        <small className="text-muted">Se muestran los primeros {MAX_REVIEW_ROWS} de {changes.length}.</small>
      )}
    </div>
  );
}

function PriceTemplatePanel({ categories, onApplied }) {
  const [open, setOpen] = useState(false);
  const [categoryIds, setCategoryIds] = useState([]);
  const [file, setFile] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const allSelected = categories.length > 0 && categoryIds.length === categories.length;
  const noCategories = categoryIds.length === 0;
  const canApply = review && (review.errors || []).length === 0 && (review.changes || []).length > 0;

  const toggleCategory = (id) =>
    setCategoryIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const run = async (task, fallbackMessage) => {
    try {
      setBusy(true);
      await task();
    } catch (err) {
      showError(err.message || fallbackMessage);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = (tipo) =>
    run(() => downloadPriceTemplate(categoryIds, tipo), "No se pudo descargar la plantilla");

  const handleFile = (selected) => {
    setFile(selected || null);
    setReview(null);
  };

  const handleReview = () =>
    run(async () => {
      const result = await importPriceTemplate(file, { apply: false });
      setReview(result);
      if ((result.errors || []).length > 0) showError("La plantilla tiene filas con error.");
    }, "No se pudo revisar la plantilla");

  const handleApply = () =>
    run(async () => {
      const result = await importPriceTemplate(file, { apply: true });
      if ((result.errors || []).length > 0) {
        setReview(result);
        showError("No se aplicó nada: el archivo tiene filas con error.");
        return;
      }
      showSuccess(`Precios actualizados: ${(result.changes || []).length}.`);
      setFile(null);
      setReview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await onApplied();
    }, "No se pudieron aplicar los precios");

  return (
    <Card className="mb-0 border">
      <div
        className="d-flex align-items-center justify-content-between px-3 py-2"
        style={{ cursor: "pointer" }}
        onClick={() => setOpen((current) => !current)}
      >
        <div>
          <strong>
            <i className="fa fa-table mr-2" />
            Actualizar precios con plantilla Excel
          </strong>
          <div className="text-muted small">Cambie muchos precios a la vez: descargue, llene las celdas amarillas y suba el archivo.</div>
        </div>
        <i className={`fa fa-chevron-${open ? "up" : "down"}`} />
      </div>
      <Collapse isOpen={open}>
        <CardBody className="pt-0">
          <Row>
            <Col lg="5" className="mb-3">
              <Step
                number="1"
                title="Elija categorías"
                action={
                  <Button
                    color="link"
                    size="sm"
                    className="p-0"
                    disabled={busy || categories.length === 0}
                    onClick={() => setCategoryIds(allSelected ? [] : categories.map((cat) => cat.id))}
                  >
                    {allSelected ? "Quitar todas" : "Marcar todas"}
                  </Button>
                }
              >
                {categories.map((cat) => {
                  const selected = categoryIds.includes(cat.id);
                  return (
                    <Button
                      key={cat.id}
                      size="sm"
                      color="info"
                      outline={!selected}
                      active={selected}
                      disabled={busy}
                      className="mr-1 mb-1"
                      onClick={() => toggleCategory(cat.id)}
                    >
                      {selected && <i className="fa fa-check mr-1" />}
                      {cat.name}
                    </Button>
                  );
                })}
              </Step>
            </Col>
            <Col lg="3" className="mb-3">
              <Step number="2" title="Descargue">
                {TEMPLATE_TYPES.map(({ tipo, label, hint }) => (
                  <div key={tipo} className="mb-2">
                    <Button
                      block
                      size="sm"
                      color="info"
                      disabled={busy || noCategories}
                      onClick={() => handleDownload(tipo)}
                    >
                      <i className="fa fa-download mr-1" /> Plantilla {label}
                    </Button>
                    <small className="text-muted">{hint}</small>
                  </div>
                ))}
                {noCategories && <small className="text-danger">Elija al menos una categoría.</small>}
              </Step>
            </Col>
            <Col lg="4" className="mb-3">
              <Step number="3" title="Suba y revise">
                <Input
                  innerRef={fileInputRef}
                  type="file"
                  accept={EXCEL_TYPES}
                  bsSize="sm"
                  disabled={busy}
                  onChange={(e) => handleFile(e.target.files && e.target.files[0])}
                />
                <div className="d-flex mt-2" style={{ gap: 8 }}>
                  <Button color="primary" size="sm" outline disabled={busy || !file} onClick={handleReview}>
                    Revisar
                  </Button>
                  {canApply && (
                    <Button color="success" size="sm" disabled={busy} onClick={handleApply}>
                      Aplicar precios
                    </Button>
                  )}
                </div>
                <small className="text-muted d-block mt-2">Primero se revisa; solo se guarda si no hay errores.</small>
              </Step>
            </Col>
          </Row>
          {review && <ReviewResult review={review} />}
        </CardBody>
      </Collapse>
    </Card>
  );
}

export default PriceTemplatePanel;
