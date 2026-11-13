import React, { useMemo, useState } from "react";
import { Badge, Button, Card, CardBody, Collapse, Input, Table } from "reactstrap";
import { setProductEmployeeDiscounts } from "services/productService";
import { showError, showSuccess } from "utils/notificationHelper";

/** Descuento general de colaborador cuando el producto no tiene uno propio. */
export const DEFAULT_EMPLOYEE_DISCOUNT = 50;

const money = (value) => `Q${Number(value).toFixed(2)}`;
const asText = (value) => (value == null ? "" : String(Number(value)));

/**
 * Descuento que recibe el colaborador al comprar cada producto. `products` son los que muestra la pantalla (ya filtrados
 * por categoría y búsqueda). Vacío: el 50 % general. Las compras ya registradas no cambian.
 */
function EmployeeDiscountPanel({ products, onSaved }) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [bulk, setBulk] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = useMemo(
    () => (products || []).filter((p) => Number(p.salePrice) > 0),
    [products]
  );

  const valueOf = (product) => (drafts[product.id] !== undefined ? drafts[product.id] : asText(product.employeeDiscountPercent));
  const invalid = (text) => text !== "" && !(Number(text) >= 0 && Number(text) <= 100);
  const changed = rows.filter((p) => drafts[p.id] !== undefined && drafts[p.id] !== asText(p.employeeDiscountPercent));
  const hasInvalid = changed.some((p) => invalid(drafts[p.id]));

  const setDraft = (product, text) => {
    setDrafts((current) => {
      const next = { ...current };
      if (text === asText(product.employeeDiscountPercent)) delete next[product.id];
      else next[product.id] = text;
      return next;
    });
  };

  const applyBulk = (text) => {
    if (invalid(text) || (text !== "" && Number.isNaN(Number(text)))) {
      showError("Indique un descuento entre 0 y 100.");
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      rows.forEach((p) => {
        if (text === asText(p.employeeDiscountPercent)) delete next[p.id];
        else next[p.id] = text;
      });
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await setProductEmployeeDiscounts(changed.map((p) => ({
        productId: p.id,
        discountPercent: drafts[p.id] === "" ? null : Number(drafts[p.id]),
      })));
      showSuccess(`Descuento de colaborador guardado en ${changed.length} producto${changed.length === 1 ? "" : "s"}.`);
      setDrafts({});
      if (onSaved) await onSaved();
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3">
      <Button color="info" outline size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        Descuento a colaboradores
        {changed.length > 0 && <Badge color="warning" pill className="ml-2">{changed.length} sin guardar</Badge>}
      </Button>
      <Collapse isOpen={open}>
        <Card className="mt-2 mb-0">
          <CardBody>
            <p className="small text-muted mb-3">
              Es lo que se le descuenta al colaborador al comprar el producto. Vacío usa el {DEFAULT_EMPLOYEE_DISCOUNT} % general.
              Las compras que ya están registradas no cambian. Se muestran los {rows.length} productos con precio de la
              lista de abajo: filtre por categoría o búsqueda para trabajar por grupo.
            </p>
            <div className="d-flex flex-wrap align-items-center mb-3" style={{ gap: 8 }}>
              <Input type="number" min="0" max="100" step="1" bsSize="sm" style={{ width: 110 }} placeholder="Descuento %"
                aria-label="Descuento para todos los productos mostrados" value={bulk} onChange={(e) => setBulk(e.target.value)} />
              <Button size="sm" color="secondary" className="m-0" disabled={bulk === "" || rows.length === 0}
                onClick={() => applyBulk(bulk)}>
                Poner a los {rows.length} mostrados
              </Button>
              <Button size="sm" color="link" className="m-0" disabled={rows.length === 0} onClick={() => applyBulk("")}>
                Volver al {DEFAULT_EMPLOYEE_DISCOUNT} % general
              </Button>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <Table size="sm" responsive className="mb-0">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="text-right">Precio</th>
                    <th style={{ width: 140 }}>Descuento %</th>
                    <th className="text-right">Paga el colaborador</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan="4" className="text-muted">No hay productos con precio en esta lista.</td></tr>}
                  {rows.map((product) => {
                    const text = valueOf(product);
                    const effective = text === "" ? DEFAULT_EMPLOYEE_DISCOUNT : Number(text);
                    const bad = invalid(text);
                    return (
                      <tr key={product.id} className={drafts[product.id] !== undefined ? "table-warning" : undefined}>
                        <td>{product.code} · {product.name}</td>
                        <td className="text-right">{money(product.salePrice)}</td>
                        <td>
                          <Input type="number" min="0" max="100" step="1" bsSize="sm" value={text}
                            placeholder={String(DEFAULT_EMPLOYEE_DISCOUNT)} invalid={bad}
                            aria-label={`Descuento de colaborador de ${product.code}`}
                            onChange={(e) => setDraft(product, e.target.value)} />
                        </td>
                        <td className="text-right">{bad ? "—" : money(Number(product.salePrice) * (100 - effective) / 100)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <div className="d-flex justify-content-end mt-3" style={{ gap: 8 }}>
              <Button color="secondary" outline size="sm" className="m-0" disabled={changed.length === 0 || saving}
                onClick={() => setDrafts({})}>
                Descartar
              </Button>
              <Button color="primary" size="sm" className="m-0" disabled={changed.length === 0 || hasInvalid || saving} onClick={save}>
                {saving ? "Guardando…" : `Guardar ${changed.length} cambio${changed.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </CardBody>
        </Card>
      </Collapse>
    </div>
  );
}

export default EmployeeDiscountPanel;
