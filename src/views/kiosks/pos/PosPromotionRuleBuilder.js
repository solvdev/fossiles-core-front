import React, { useMemo } from "react";
import { Button, Input } from "reactstrap";
import FilterableSelect from "components/distribution/FilterableSelect";
import { ALL_CINCHO_SIZES } from "utils/productCinchoHelper";
import PosExcelFilter from "./PosExcelFilter";
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

/** Pocas opciones fijas (días, formas de pago): botones de toque grande. */
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
            aria-pressed={on}
            onClick={() => onChange(toggleInList(selected, opt.value))}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const Field = ({ label, help, span, children }) => (
  <div className={`pr-field${span ? ` pr-span-${span}` : ""}`}>
    {label && <label className="pr-field-label">{label}</label>}
    {children}
    {help && <small className="pr-hint">{help}</small>}
  </div>
);

const NumberField = ({ label, value, onChange, min = "0", max, step = "0.01", placeholder, help, span }) => (
  <Field label={label} help={help} span={span}>
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
  </Field>
);

/** Filtro de piezas: línea, categorías, productos, tallas, rango de precio y excepciones. */
function FilterEditor({ filter, onChange, categoryOptions, productOptions, compact = false }) {
  const f = filter || emptyFilter();
  const patch = (p) => onChange({ ...f, ...p });

  // Tallas que maneja el sistema + las que ya estén elegidas (por si vienen de una regla vieja).
  const sizeOptions = useMemo(() => {
    const known = new Set(ALL_CINCHO_SIZES.map(String));
    const extra = (f.sizes || []).map(String).filter((s) => !known.has(s));
    return [...ALL_CINCHO_SIZES, ...extra].map((size) => ({ value: String(size), label: `Talla ${size}`, searchText: String(size) }));
  }, [f.sizes]);

  return (
    <div className="pr-grid">
      <PosExcelFilter
        label="Línea"
        options={AUDIENCE_OPTIONS}
        selected={f.audiences}
        onChange={(audiences) => patch({ audiences })}
        allLabel="Todas las líneas"
        noun="líneas"
        searchPlaceholder="Buscar línea…"
      />
      <PosExcelFilter
        label="Categorías"
        options={categoryOptions}
        selected={f.categoryIds}
        onChange={(categoryIds) => patch({ categoryIds })}
        allLabel="Todas las categorías"
        noun="categorías"
        searchPlaceholder="Buscar categoría…"
      />
      <PosExcelFilter
        label="Productos"
        options={productOptions}
        selected={f.productIds}
        onChange={(productIds) => patch({ productIds })}
        allLabel="Todos los productos"
        noun="productos"
        searchPlaceholder="Buscar por código o nombre…"
      />
      <PosExcelFilter
        label="Tallas"
        options={sizeOptions}
        selected={f.sizes}
        onChange={(sizes) => patch({ sizes })}
        allLabel="Todas las tallas"
        noun="tallas"
        searchPlaceholder="Buscar talla…"
      />
      {!compact && (
        <>
          <Field label="Precio de la pieza (Q)" span="2">
            <div className="pr-range">
              <Input
                className="kiosk-pos-input-lg"
                type="number"
                min="0"
                placeholder="Desde"
                aria-label="Precio desde"
                value={f.minUnitPrice ?? ""}
                onChange={(e) => patch({ minUnitPrice: e.target.value })}
              />
              <span>a</span>
              <Input
                className="kiosk-pos-input-lg"
                type="number"
                min="0"
                placeholder="Hasta"
                aria-label="Precio hasta"
                value={f.maxUnitPrice ?? ""}
                onChange={(e) => patch({ maxUnitPrice: e.target.value })}
              />
            </div>
          </Field>
          <PosExcelFilter
            label="Excepto categorías"
            options={categoryOptions}
            selected={f.excludeCategoryIds}
            onChange={(excludeCategoryIds) => patch({ excludeCategoryIds })}
            allLabel="Ninguna"
            noun="categorías"
            searchPlaceholder="Buscar categoría…"
          />
          <PosExcelFilter
            label="Excepto productos"
            options={productOptions}
            selected={f.excludeProductIds}
            onChange={(excludeProductIds) => patch({ excludeProductIds })}
            allLabel="Ninguno"
            noun="productos"
            searchPlaceholder="Buscar por código o nombre…"
          />
        </>
      )}
    </div>
  );
}

function ActionEditor({ action, onChange, categoryOptions, productOptions }) {
  const a = action || {};
  const patch = (p) => onChange({ ...a, ...p });
  const typeHelp = ACTION_TYPE_OPTIONS.find((o) => o.value === a.type)?.help;

  const positions = a.positions?.length ? a.positions : [""];
  const setPosition = (i, value) => patch({ positions: positions.map((p, idx) => (idx === i ? value : p)) });

  return (
    <>
      <div className="pr-grid">
        <Field label="Tipo de descuento" help={typeHelp} span="2">
          <FilterableSelect
            value={a.type || "POSITION"}
            onChange={(value) => patch({ type: value || "POSITION" })}
            options={ACTION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            allowEmpty={false}
            inputClassName="kiosk-pos-input-lg"
          />
        </Field>
        {["PERCENT", "AMOUNT_EACH", "FIXED_PRICE"].includes(a.type) && (
          <NumberField
            label={a.type === "PERCENT" ? "Descuento %" : a.type === "AMOUNT_EACH" ? "Q menos por pieza" : "Precio fijo Q"}
            value={a.value}
            max={a.type === "PERCENT" ? "100" : undefined}
            onChange={(value) => patch({ value })}
          />
        )}
      </div>

      {a.type === "POSITION" && (
        <>
          <div className="pr-grid mt-3">
            <Field label="Ordenar piezas">
              <Input
                type="select"
                className="kiosk-pos-input-lg"
                value={a.order || "DESC"}
                onChange={(e) => patch({ order: e.target.value })}
              >
                <option value="DESC">De la más cara a la más barata</option>
                <option value="ASC">De la más barata a la más cara</option>
              </Input>
            </Field>
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
            <NumberField
              label="Posiciones desde (piezas)"
              value={a.positionsMinQty}
              step="1"
              help="Con menos piezas, todas llevan el % del resto"
              onChange={(value) => patch({ positionsMinQty: value })}
            />
            {Number(a.groupSize) > 0 && (
              <Field label="Si el último grupo no se completa">
                <Input
                  type="select"
                  className="kiosk-pos-input-lg"
                  value={a.incompleteGroup || "POSITIONS"}
                  onChange={(e) => patch({ incompleteGroup: e.target.value })}
                >
                  <option value="POSITIONS">Usa las mismas posiciones</option>
                  <option value="REMAINDER">Lleva el % del resto</option>
                </Input>
              </Field>
            )}
          </div>
          <div className="pr-field-label mt-3">Descuento por posición dentro del grupo</div>
          <div className="pr-positions">
            {positions.map((p, i) => (
              <div key={`pos-${i}`} className="pr-position">
                <span className="pr-position-label">
                  {i + 1}.ª {i === 0 ? (a.order === "ASC" ? "(más barata)" : "(más cara)") : ""}
                </span>
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
              <div className="pr-position-actions">
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
        <div className="pr-tier-list mt-3">
          {(a.qtyTiers || []).map((tier, i) => (
            <div key={`qt-${i}`} className="pr-tier-row">
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
              <Button
                color="danger"
                outline
                size="sm"
                disabled={(a.qtyTiers || []).length <= 1}
                onClick={() => patch({ qtyTiers: a.qtyTiers.filter((_, idx) => idx !== i) })}
              >
                Quitar
              </Button>
            </div>
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
        <div className="pr-tier-list mt-3">
          {(a.amountTiers || []).map((tier, i) => {
            const set = (p) => patch({ amountTiers: a.amountTiers.map((t, idx) => (idx === i ? { ...t, ...p } : t)) });
            return (
              <div key={`at-${i}`} className="pr-tier-row">
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
                <Button
                  color="danger"
                  outline
                  size="sm"
                  disabled={(a.amountTiers || []).length <= 1}
                  onClick={() => patch({ amountTiers: a.amountTiers.filter((_, idx) => idx !== i) })}
                >
                  Quitar
                </Button>
              </div>
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
        <div className="mt-3">
          <div className="pr-grid">
            <NumberField label="Compra (piezas)" value={a.buyQty} step="1" min="1" onChange={(value) => patch({ buyQty: value })} />
            <NumberField label="Llevan descuento (piezas)" value={a.getQty} step="1" min="1" onChange={(value) => patch({ getQty: value })} />
            <NumberField label="Descuento %" value={a.getPercent} max="100" onChange={(value) => patch({ getPercent: value })} />
            <Field label="¿Cuál lleva el descuento?">
              <Input
                type="select"
                className="kiosk-pos-input-lg"
                value={a.order || "ASC"}
                onChange={(e) => patch({ order: e.target.value })}
              >
                <option value="ASC">La más barata</option>
                <option value="DESC">La más cara</option>
              </Input>
            </Field>
          </div>
          <div className="pr-subblock mt-3">
            <div className="pr-subblock-title">Piezas que hay que comprar (A)</div>
            <small className="pr-hint d-block mb-2">
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

const Step = ({ number, title, subtitle, children }) => (
  <section className="pr-block">
    <header className="pr-block-head">
      <span className="pr-step-number">{number}</span>
      <div>
        <div className="pr-block-title">{title}</div>
        {subtitle && <div className="pr-block-sub">{subtitle}</div>}
      </div>
    </header>
    <div className="pr-block-body">{children}</div>
  </section>
);

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
      <Step number="0" title="Empieza con una plantilla" subtitle="Opcional: solo llena los campos, después cambias lo que quieras.">
        <div className="pr-templates">
          {RULE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className={`pr-template${config.template === tpl.id ? " is-on" : ""}`}
              title={tpl.description}
              aria-pressed={config.template === tpl.id}
              onClick={() => onChange({ ...tpl.build(), filter: config.filter })}
            >
              <strong>{tpl.label}</strong>
              <span>{tpl.description}</span>
            </button>
          ))}
        </div>
      </Step>

      <Step number="1" title="Cuándo aplica" subtitle="Las fechas y los kioscos se eligen arriba, junto al nombre.">
        <div className="pr-grid">
          <Field label="Días" help="Ninguno marcado = todos los días" span="2">
            <CheckChips
              options={DAY_OPTIONS}
              selected={c.daysOfWeek}
              onChange={(daysOfWeek) => patch("conditions", { daysOfWeek })}
            />
          </Field>
          <Field label="Desde la hora">
            <Input
              className="kiosk-pos-input-lg"
              type="time"
              value={c.timeFrom || ""}
              onChange={(e) => patch("conditions", { timeFrom: e.target.value })}
            />
          </Field>
          <Field label="Hasta la hora">
            <Input
              className="kiosk-pos-input-lg"
              type="time"
              value={c.timeTo || ""}
              onChange={(e) => patch("conditions", { timeTo: e.target.value })}
            />
          </Field>
          <Field label="Método de pago" help="Ninguno marcado = cualquiera" span="2">
            <CheckChips
              options={PAYMENT_OPTIONS}
              selected={c.paymentMethods}
              onChange={(paymentMethods) => patch("conditions", { paymentMethods })}
            />
          </Field>
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
        </div>
      </Step>

      <Step number="2" title="A qué piezas" subtitle="Sin marcar nada = todas las piezas. El empaque nunca entra.">
        <FilterEditor
          filter={config.filter}
          onChange={(filter) => onChange({ ...config, filter })}
          categoryOptions={categoryOptions}
          productOptions={productOptions}
        />
      </Step>

      <Step number="3" title="Qué descuento">
        <ActionEditor
          action={config.action}
          onChange={(action) => onChange({ ...config, action })}
          categoryOptions={categoryOptions}
          productOptions={productOptions}
        />
      </Step>

      <Step number="4" title="Límites" subtitle="Opcional.">
        <div className="pr-grid">
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
        </div>
      </Step>

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
