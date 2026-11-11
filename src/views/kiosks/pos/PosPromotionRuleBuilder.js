import React, { useMemo } from "react";
import { Badge, Button, Col, Input, Label, Row } from "reactstrap";
import FilterableSelect from "components/distribution/FilterableSelect";
import {
  ACTION_TYPE_OPTIONS,
  AUDIENCE_OPTIONS,
  DAY_OPTIONS,
  PAYMENT_OPTIONS,
  RULE_TEMPLATES,
  emptyFilter,
} from "./promotionRules";

const toggleInList = (list, value) => {
  const current = list || [];
  return current.some((v) => String(v) === String(value))
    ? current.filter((v) => String(v) !== String(value))
    : [...current, value];
};

function CheckChips({ options, selected, onChange }) {
  return (
    <div className="pr-chips">
      {options.map((opt) => {
        const on = (selected || []).some((v) => String(v) === String(opt.value));
        return (
          <button
            key={`chip-${opt.value}`}
            type="button"
            className={`pr-chip${on ? " is-on" : ""}`}
            onClick={() => onChange(toggleInList(selected, opt.value))}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Lista de seleccionados como chips + buscador para agregar más. */
function MultiPicker({ label, options, selected, onChange, placeholder }) {
  const byValue = useMemo(() => {
    const map = new Map();
    (options || []).forEach((opt) => map.set(String(opt.value), opt.label));
    return map;
  }, [options]);
  const available = useMemo(
    () => (options || []).filter((opt) => !(selected || []).some((v) => String(v) === String(opt.value))),
    [options, selected]
  );
  return (
    <div className="mb-2">
      {label && <Label className="kiosk-pos-label small mb-1">{label}</Label>}
      {(selected || []).length > 0 && (
        <div className="pr-chips mb-1">
          {(selected || []).map((value) => (
            <span key={`sel-${value}`} className="pr-chip is-on">
              {byValue.get(String(value)) || `#${value}`}
              <button
                type="button"
                className="pr-chip-x"
                aria-label="Quitar"
                onClick={() => onChange((selected || []).filter((v) => String(v) !== String(value)))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <FilterableSelect
        value=""
        onChange={(value) => {
          if (value) onChange([...(selected || []), Number(value) || value]);
        }}
        options={available}
        placeholder={placeholder}
        emptyLabel={(selected || []).length ? "Agregar otra…" : "Todas"}
        inputClassName="kiosk-pos-input-lg"
      />
    </div>
  );
}

function FilterEditor({ filter, onChange, categoryOptions, productOptions, compact = false }) {
  const f = filter || emptyFilter();
  const patch = (p) => onChange({ ...f, ...p });
  return (
    <Row>
      <Col md={compact ? "12" : "4"}>
        <Label className="kiosk-pos-label small mb-1">Línea (ninguna marcada = todas)</Label>
        <CheckChips options={AUDIENCE_OPTIONS} selected={f.audiences} onChange={(audiences) => patch({ audiences })} />
      </Col>
      <Col md={compact ? "6" : "4"}>
        <MultiPicker
          label="Categorías"
          options={categoryOptions}
          selected={f.categoryIds}
          onChange={(categoryIds) => patch({ categoryIds })}
          placeholder="Buscar categoría…"
        />
      </Col>
      <Col md={compact ? "6" : "4"}>
        <MultiPicker
          label="Productos específicos"
          options={productOptions}
          selected={f.productIds}
          onChange={(productIds) => patch({ productIds })}
          placeholder="Buscar producto…"
        />
      </Col>
      {!compact && (
        <>
          <Col md="4">
            <Label className="kiosk-pos-label small mb-1">Tallas (separadas por coma)</Label>
            <Input
              className="kiosk-pos-input-lg"
              value={(f.sizes || []).join(", ")}
              placeholder="Ej. 32, 34, 36"
              onChange={(e) =>
                patch({
                  sizes: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Col>
          <Col md="2">
            <Label className="kiosk-pos-label small mb-1">Precio desde Q</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="number"
              min="0"
              value={f.minUnitPrice ?? ""}
              onChange={(e) => patch({ minUnitPrice: e.target.value })}
            />
          </Col>
          <Col md="2">
            <Label className="kiosk-pos-label small mb-1">Precio hasta Q</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="number"
              min="0"
              value={f.maxUnitPrice ?? ""}
              onChange={(e) => patch({ maxUnitPrice: e.target.value })}
            />
          </Col>
          <Col md="2">
            <MultiPicker
              label="Excepto categorías"
              options={categoryOptions}
              selected={f.excludeCategoryIds}
              onChange={(excludeCategoryIds) => patch({ excludeCategoryIds })}
              placeholder="Excluir…"
            />
          </Col>
          <Col md="2">
            <MultiPicker
              label="Excepto productos"
              options={productOptions}
              selected={f.excludeProductIds}
              onChange={(excludeProductIds) => patch({ excludeProductIds })}
              placeholder="Excluir…"
            />
          </Col>
        </>
      )}
    </Row>
  );
}

const NumberField = ({ label, value, onChange, md = "3", min = "0", max, step = "0.01", placeholder, help }) => (
  <Col md={md}>
    <Label className="kiosk-pos-label small mb-1">{label}</Label>
    <Input
      className="kiosk-pos-input-lg"
      type="number"
      min={min}
      max={max}
      step={step}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
    {help && <small className="text-muted d-block">{help}</small>}
  </Col>
);

function ActionEditor({ action, onChange, categoryOptions, productOptions }) {
  const a = action || {};
  const patch = (p) => onChange({ ...a, ...p });
  const typeHelp = ACTION_TYPE_OPTIONS.find((o) => o.value === a.type)?.help;

  const positions = a.positions?.length ? a.positions : [""];
  const setPosition = (i, value) => patch({ positions: positions.map((p, idx) => (idx === i ? value : p)) });

  return (
    <>
      <Row className="align-items-end">
        <Col md="5">
          <Label className="kiosk-pos-label small mb-1">Tipo de descuento</Label>
          <FilterableSelect
            value={a.type || "POSITION"}
            onChange={(value) => patch({ type: value || "POSITION" })}
            options={ACTION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            allowEmpty={false}
            inputClassName="kiosk-pos-input-lg"
          />
        </Col>
        <Col md="7">{typeHelp && <small className="text-muted">{typeHelp}</small>}</Col>
      </Row>

      {["PERCENT", "AMOUNT_EACH", "FIXED_PRICE"].includes(a.type) && (
        <Row className="mt-2">
          <NumberField
            label={a.type === "PERCENT" ? "Descuento %" : a.type === "AMOUNT_EACH" ? "Q menos por pieza" : "Precio fijo Q"}
            value={a.value}
            max={a.type === "PERCENT" ? "100" : undefined}
            onChange={(value) => patch({ value })}
          />
        </Row>
      )}

      {a.type === "POSITION" && (
        <>
          <Row className="mt-2">
            <Col md="3">
              <Label className="kiosk-pos-label small mb-1">Ordenar piezas</Label>
              <Input
                type="select"
                className="kiosk-pos-input-lg"
                value={a.order || "DESC"}
                onChange={(e) => patch({ order: e.target.value })}
              >
                <option value="DESC">De la más cara a la más barata</option>
                <option value="ASC">De la más barata a la más cara</option>
              </Input>
            </Col>
            <NumberField
              label="Piezas por grupo"
              value={a.groupSize}
              step="1"
              help="0 = todas las piezas en un solo grupo"
              onChange={(value) => {
                const size = Number(value) || 0;
                const next = size > 0 ? Array.from({ length: size }, (_, i) => positions[i] ?? "") : positions;
                patch({ groupSize: value, positions: next });
              }}
            />
            <NumberField
              label="% para el resto"
              value={a.remainderPercent}
              max="100"
              help="Piezas sin posición propia"
              onChange={(value) => patch({ remainderPercent: value })}
            />
            {Number(a.groupSize) > 0 && (
              <Col md="3">
                <Label className="kiosk-pos-label small mb-1">Si el último grupo no se completa</Label>
                <Input
                  type="select"
                  className="kiosk-pos-input-lg"
                  value={a.incompleteGroup || "POSITIONS"}
                  onChange={(e) => patch({ incompleteGroup: e.target.value })}
                >
                  <option value="POSITIONS">Usa las mismas posiciones</option>
                  <option value="REMAINDER">Lleva el % del resto</option>
                </Input>
              </Col>
            )}
          </Row>
          <Label className="kiosk-pos-label small mb-1 mt-2">Descuento por posición dentro del grupo</Label>
          <div className="pr-positions">
            {positions.map((p, i) => (
              <div key={`pos-${i}`} className="pr-position">
                <span className="pr-position-label">{i + 1}.ª {i === 0 ? (a.order === "ASC" ? "(más barata)" : "(más cara)") : ""}</span>
                <Input
                  className="kiosk-pos-input-lg"
                  type="number"
                  min="0"
                  max="100"
                  value={p ?? ""}
                  placeholder="%"
                  onChange={(e) => setPosition(i, e.target.value)}
                />
              </div>
            ))}
            {!(Number(a.groupSize) > 0) && (
              <div className="d-flex gap-1 align-items-end">
                <Button size="sm" color="secondary" outline onClick={() => patch({ positions: [...positions, ""] })}>
                  + posición
                </Button>
                {positions.length > 1 && (
                  <Button size="sm" color="secondary" outline onClick={() => patch({ positions: positions.slice(0, -1) })}>
                    − posición
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {a.type === "QTY_TIERS" && (
        <div className="mt-2">
          {(a.qtyTiers || []).map((tier, i) => (
            <Row key={`qt-${i}`} className="align-items-end mb-1">
              <NumberField
                label="Desde (piezas)"
                value={tier.minQty}
                step="1"
                min="1"
                onChange={(value) =>
                  patch({ qtyTiers: a.qtyTiers.map((t, idx) => (idx === i ? { ...t, minQty: value } : t)) })
                }
              />
              <NumberField
                label="Descuento %"
                value={tier.percent}
                max="100"
                onChange={(value) =>
                  patch({ qtyTiers: a.qtyTiers.map((t, idx) => (idx === i ? { ...t, percent: value } : t)) })
                }
              />
              <Col md="2">
                <Button
                  color="danger"
                  outline
                  size="sm"
                  disabled={(a.qtyTiers || []).length <= 1}
                  onClick={() => patch({ qtyTiers: a.qtyTiers.filter((_, idx) => idx !== i) })}
                >
                  Quitar
                </Button>
              </Col>
            </Row>
          ))}
          <Button
            size="sm"
            color="secondary"
            outline
            onClick={() => patch({ qtyTiers: [...(a.qtyTiers || []), { minQty: "", percent: "" }] })}
          >
            + escalón
          </Button>
        </div>
      )}

      {a.type === "AMOUNT_TIERS" && (
        <div className="mt-2">
          {(a.amountTiers || []).map((tier, i) => {
            const set = (p) => patch({ amountTiers: a.amountTiers.map((t, idx) => (idx === i ? { ...t, ...p } : t)) });
            return (
              <Row key={`at-${i}`} className="align-items-end mb-1">
                <NumberField label="Desde Q" value={tier.minAmount} onChange={(value) => set({ minAmount: value })} />
                <NumberField
                  label="Descuento %"
                  value={tier.percent}
                  max="100"
                  placeholder="o usa Q"
                  onChange={(value) => set({ percent: value, amount: value ? "" : tier.amount })}
                />
                <NumberField
                  label="o descuento Q"
                  value={tier.amount}
                  placeholder="o usa %"
                  onChange={(value) => set({ amount: value, percent: value ? "" : tier.percent })}
                />
                <Col md="2">
                  <Button
                    color="danger"
                    outline
                    size="sm"
                    disabled={(a.amountTiers || []).length <= 1}
                    onClick={() => patch({ amountTiers: a.amountTiers.filter((_, idx) => idx !== i) })}
                  >
                    Quitar
                  </Button>
                </Col>
              </Row>
            );
          })}
          <Button
            size="sm"
            color="secondary"
            outline
            onClick={() => patch({ amountTiers: [...(a.amountTiers || []), { minAmount: "", percent: "", amount: "" }] })}
          >
            + escalón
          </Button>
        </div>
      )}

      {a.type === "BUY_GET" && (
        <div className="mt-2">
          <Row>
            <NumberField label="Compra (piezas)" value={a.buyQty} step="1" min="1" onChange={(value) => patch({ buyQty: value })} />
            <NumberField label="Llevan descuento (piezas)" value={a.getQty} step="1" min="1" onChange={(value) => patch({ getQty: value })} />
            <NumberField label="Descuento %" value={a.getPercent} max="100" onChange={(value) => patch({ getPercent: value })} />
            <Col md="3">
              <Label className="kiosk-pos-label small mb-1">¿Cuál lleva el descuento?</Label>
              <Input
                type="select"
                className="kiosk-pos-input-lg"
                value={a.order || "ASC"}
                onChange={(e) => patch({ order: e.target.value })}
              >
                <option value="ASC">La más barata</option>
                <option value="DESC">La más cara</option>
              </Input>
            </Col>
          </Row>
          <div className="pr-subblock mt-2">
            <div className="pr-subblock-title">Piezas que hay que comprar (A)</div>
            <small className="text-muted d-block mb-1">
              Las piezas que llevan el descuento (B) son las del bloque «A qué piezas». Si A queda vacío, A = B.
            </small>
            <FilterEditor
              compact
              filter={a.buyFilter}
              onChange={(buyFilter) => patch({ buyFilter })}
              categoryOptions={categoryOptions}
              productOptions={productOptions}
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Constructor de promociones dinámicas: CUÁNDO · A QUÉ PIEZAS · QUÉ DESCUENTO · LÍMITES.
 */
function PosPromotionRuleBuilder({ value, onChange, categoryOptions, productOptions, summary }) {
  const config = value;
  const patch = (key, p) => onChange({ ...config, [key]: { ...(config[key] || {}), ...p } });
  const c = config.conditions || {};
  const limits = config.limits || {};

  return (
    <div className="pr-builder">
      <div className="pr-block">
        <div className="pr-block-title">
          <Badge color="dark" pill>0</Badge> Empieza con una plantilla (opcional)
        </div>
        <div className="pr-templates">
          {RULE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className={`pr-template${config.template === tpl.id ? " is-on" : ""}`}
              title={tpl.description}
              onClick={() => onChange({ ...tpl.build(), filter: config.filter })}
            >
              <strong>{tpl.label}</strong>
              <span>{tpl.description}</span>
            </button>
          ))}
        </div>
        <small className="text-muted">La plantilla solo llena los campos; después puedes cambiar lo que quieras.</small>
      </div>

      <div className="pr-block">
        <div className="pr-block-title">
          <Badge color="primary" pill>1</Badge> CUÁNDO aplica
        </div>
        <Row>
          <Col md="4">
            <Label className="kiosk-pos-label small mb-1">Días (ninguno = todos)</Label>
            <CheckChips
              options={DAY_OPTIONS}
              selected={c.daysOfWeek}
              onChange={(daysOfWeek) => patch("conditions", { daysOfWeek })}
            />
          </Col>
          <Col md="2">
            <Label className="kiosk-pos-label small mb-1">Desde la hora</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="time"
              value={c.timeFrom || ""}
              onChange={(e) => patch("conditions", { timeFrom: e.target.value })}
            />
          </Col>
          <Col md="2">
            <Label className="kiosk-pos-label small mb-1">Hasta la hora</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="time"
              value={c.timeTo || ""}
              onChange={(e) => patch("conditions", { timeTo: e.target.value })}
            />
          </Col>
          <Col md="4">
            <Label className="kiosk-pos-label small mb-1">Método de pago (ninguno = cualquiera)</Label>
            <CheckChips
              options={PAYMENT_OPTIONS}
              selected={c.paymentMethods}
              onChange={(paymentMethods) => patch("conditions", { paymentMethods })}
            />
          </Col>
        </Row>
        <Row className="mt-2">
          <NumberField
            label="Mínimo de piezas"
            value={c.minQty}
            step="1"
            onChange={(minQty) => patch("conditions", { minQty })}
            help="De las piezas que entran"
          />
          <NumberField
            label="Mínimo de compra Q"
            value={c.minAmount}
            onChange={(minAmount) => patch("conditions", { minAmount })}
            help="Suma de las piezas que entran"
          />
        </Row>
        <small className="text-muted">Las fechas y el kiosco se eligen arriba, con el nombre.</small>
      </div>

      <div className="pr-block">
        <div className="pr-block-title">
          <Badge color="primary" pill>2</Badge> A QUÉ piezas
        </div>
        <FilterEditor
          filter={config.filter}
          onChange={(filter) => onChange({ ...config, filter })}
          categoryOptions={categoryOptions}
          productOptions={productOptions}
        />
        <small className="text-muted">Vacío = todas las piezas. Empaque nunca entra.</small>
      </div>

      <div className="pr-block">
        <div className="pr-block-title">
          <Badge color="primary" pill>3</Badge> QUÉ descuento
        </div>
        <ActionEditor
          action={config.action}
          onChange={(action) => onChange({ ...config, action })}
          categoryOptions={categoryOptions}
          productOptions={productOptions}
        />
      </div>

      <div className="pr-block">
        <div className="pr-block-title">
          <Badge color="primary" pill>4</Badge> LÍMITES (opcional)
        </div>
        <Row>
          <NumberField
            label="Tope de descuento Q por venta"
            value={limits.maxDiscount}
            onChange={(maxDiscount) => patch("limits", { maxDiscount })}
          />
          <NumberField
            label="Máximo de veces por venta"
            value={limits.maxApplications}
            step="1"
            onChange={(maxApplications) => patch("limits", { maxApplications })}
            help="Grupos (por posición) o compras (A lleva B)"
          />
        </Row>
      </div>

      {summary?.length > 0 && (
        <div className="pr-summary">
          <div className="pr-summary-title">Así se lee la promoción</div>
          <ul>
            {summary.map((line, i) => (
              <li key={`sum-${i}`}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default PosPromotionRuleBuilder;
