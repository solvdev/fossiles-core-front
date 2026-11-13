import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Input, Table } from "reactstrap";
import FilterableSelect from "components/distribution/FilterableSelect";
import { getProductCategories } from "services/productCategoryService";
import { getProducts } from "services/productService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import {
  PROMO_AUDIENCE_OPTIONS,
  PROMO_TIER_AUDIENCE_OPTIONS,
  formatPromotionTierSummary,
  getPromoAudienceLabel,
} from "utils/productAudienceHelper";
import { formatCurrency, isEntrecuerosPosMode } from "./posUtils";
import PosExcelFilter from "./PosExcelFilter";
import PosPromotionRuleBuilder from "./PosPromotionRuleBuilder";
import PosPromotionSimulator from "./PosPromotionSimulator";
import {
  RULES_TYPE,
  buildPromotionPayload,
  collectRuleProductIds,
  describeKioskScope,
  describePromotionRule,
  isDraftPromotion,
  isEntrecuerosOnlyProduct,
  isRulesPromotion,
  promoKioskIds,
} from "./promotionRules";
import "./PosPromotions.css";

const EMPTY_TIER = { audienceCategory: "CABALLERO", categoryId: "", discountValue: "" };

const DISCOUNT_TYPE_OPTIONS = [
  {
    value: RULES_TYPE,
    label: "Dinámica (cuándo · a qué · qué descuento)",
    searchText: "dinamica reglas bloques posicion escalones black friday",
  },
  { value: "PERCENT", label: "Porcentaje (%)" },
  {
    value: "TIERED_PERCENT",
    label: "Por audiencia + categoría (auto en caja)",
    searchText: "porcentaje por linea tier categoria billeteras auto",
  },
  { value: "FIXED", label: "Monto fijo (Q)" },
  { value: "COMBO", label: "Combo (2x1)" },
];

function PosPromotionsTab({
  promoForm,
  onPromoFormChange,
  promotions,
  onSavePromotion,
  onDeletePromotion,
  deletingPromotionId,
  kiosks,
  editingPromotionId,
  onEditPromotion,
  onCancelEdit,
  onApprovePromotion,
  onDraftPromotion,
  statusBusyId,
  saving,
}) {
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState("");
  const [products, setProducts] = useState([]);
  const [simPromotionId, setSimPromotionId] = useState(null);
  const [showDraftSim, setShowDraftSim] = useState(false);
  const [formError, setFormError] = useState("");
  const isCombo = promoForm.discountType === "COMBO";
  const isTiered = promoForm.discountType === "TIERED_PERCENT";
  const isRules = promoForm.discountType === RULES_TYPE;
  const tiers = promoForm.tiers?.length ? promoForm.tiers : [EMPTY_TIER];

  const kioskNameById = useMemo(() => {
    const map = {};
    (kiosks || []).forEach((k) => {
      map[String(k.kioskId)] = k.kioskName || k.kioskCode || String(k.kioskId);
    });
    return map;
  }, [kiosks]);

  const categoriesById = useMemo(() => {
    const map = {};
    (categories || []).forEach((cat) => {
      map[String(cat.id)] = cat.name;
    });
    return map;
  }, [categories]);

  const productsById = useMemo(() => {
    const map = {};
    (products || []).forEach((p) => {
      map[String(p.id)] = `${p.code || ""} ${p.name || ""}`.trim();
    });
    return map;
  }, [products]);

  const promoStatusLabel = (promo) => {
    if (promo?.active === false) return "Inactiva";
    const today = getTodayYmdGuatemala();
    if (promo?.startDate && promo.startDate > today) return "Programada";
    if (promo?.endDate && promo.endDate < today) return "Vencida";
    return "Vigente";
  };

  const loadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      setCategoriesError("");
      const rows = await getProductCategories();
      setCategories(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setCategories([]);
      setCategoriesError(err.message || "No se pudieron cargar las categorías.");
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
    getProducts()
      .then((rows) => setProducts(Array.isArray(rows) ? rows : []))
      .catch(() => setProducts([]));
  }, [loadCategories]);

  const kioskOptions = useMemo(
    () =>
      (kiosks || []).map((k) => ({
        value: String(k.kioskId),
        label: k.kioskName,
        searchText: `${k.kioskName || ""} ${k.kioskCode || ""}`,
      })),
    [kiosks]
  );

  const audienceOptions = useMemo(
    () => PROMO_AUDIENCE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
    []
  );

  const tierAudienceOptions = useMemo(
    () => PROMO_TIER_AUDIENCE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
    []
  );

  const categoryOptions = useMemo(
    () =>
      (categories || []).map((cat) => ({
        value: String(cat.id),
        label: cat.name,
        searchText: `${cat.name || ""} ${cat.code || ""}`,
      })),
    [categories]
  );

  // Todos los productos activos; entrecuerosOnly = solo se venden en Entrecueros (ver isEntrecuerosOnlyProduct).
  const allProductOptions = useMemo(
    () =>
      (products || [])
        .filter((p) => String(p.status || "ACTIVE").toUpperCase() !== "INACTIVE")
        .map((p) => ({
          value: String(p.id),
          label: `${p.code || ""} · ${p.name || ""}${Number(p.salePrice) > 0 ? ` · ${formatCurrency(p.salePrice)}` : ""}`,
          searchText: `${p.code || ""} ${p.name || ""}`,
          entrecuerosOnly: isEntrecuerosOnlyProduct(p),
        })),
    [products]
  );

  // ¿Hay algún kiosco Entrecueros entre los marcados? (sin marcar = todos)
  const includesEntrecuerosKiosk = useMemo(() => {
    const entrecuerosIds = new Set(
      (kiosks || []).filter((k) => isEntrecuerosPosMode(k)).map((k) => String(k.kioskId))
    );
    if (entrecuerosIds.size === 0) return false;
    const picked = promoKioskIds(promoForm);
    return picked.length === 0 || picked.some((id) => entrecuerosIds.has(id));
  }, [kiosks, promoForm]);

  // Productos del constructor: sin los solo-Entrecueros si no hay kiosco Entrecueros marcado
  // (los que ya están elegidos en la regla se conservan para no dejar chips huérfanos).
  const productOptions = useMemo(() => {
    if (includesEntrecuerosKiosk) return allProductOptions;
    const inUse = collectRuleProductIds(promoForm.ruleConfig);
    return allProductOptions.filter((o) => !o.entrecuerosOnly || inUse.has(o.value));
  }, [allProductOptions, includesEntrecuerosKiosk, promoForm.ruleConfig]);

  const hiddenEntrecuerosCount = allProductOptions.length - productOptions.length;

  const summary = useMemo(
    () => (isRules ? describePromotionRule(promoForm, { categoriesById, productsById, kioskNameById }) : []),
    [isRules, promoForm, categoriesById, productsById, kioskNameById]
  );

  const simPromotion = useMemo(
    () => (simPromotionId ? (promotions || []).find((p) => p.id === simPromotionId) || null : null),
    [promotions, simPromotionId]
  );

  const buildDraftPayload = () => {
    const payload = buildPromotionPayload(promoForm);
    if (!payload.name) payload.name = "Prueba sin nombre";
    return payload;
  };

  const updateTier = (index, patch) => {
    onPromoFormChange({
      tiers: tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    });
  };

  const addTier = () => {
    onPromoFormChange({ tiers: [...tiers, { ...EMPTY_TIER }] });
  };

  const removeTier = (index) => {
    if (tiers.length <= 1) return;
    onPromoFormChange({ tiers: tiers.filter((_, i) => i !== index) });
  };

  const save = async () => {
    setFormError("");
    if (!String(promoForm.name || "").trim()) {
      setFormError("Ponle nombre a la promoción.");
      return;
    }
    const saved = await onSavePromotion?.();
    if (saved?.id) {
      setShowDraftSim(false);
      setSimPromotionId(saved.id);
    }
  };

  const typeLabel = (promo) => {
    if (isRulesPromotion(promo)) return "Dinámica";
    if (promo.discountType === "COMBO") return `Combo ${promo.comboBuyQty}x${promo.comboPayQty}`;
    if (String(promo.discountType || "").toUpperCase().includes("TIERED")) return "Por línea";
    return promo.discountType === "PERCENT" ? "Porcentaje" : "Monto fijo";
  };

  const valueLabel = (promo) => {
    if (isRulesPromotion(promo)) {
      const lines = describePromotionRule(
        {
          ruleConfig: promo.ruleConfig,
          startDate: promo.startDate,
          endDate: promo.endDate,
          kioskLocationIds: promo.kioskLocationIds,
          kioskLocationId: promo.kioskLocationId,
        },
        { categoriesById, productsById, kioskNameById }
      );
      return lines.slice(1, -1).join(" ");
    }
    if (String(promo.discountType || "").toUpperCase().includes("TIERED")) return formatPromotionTierSummary(promo) || "-";
    if (promo.discountType === "PERCENT") return `${promo.discountValue}%`;
    if (promo.discountType === "COMBO") return "-";
    return formatCurrency(promo.discountValue);
  };

  return (
    <Card className="kiosk-pos-block pr-root">
      <CardHeader className="pr-head">
        <div>
          <CardTitle tag="h5" className="pr-head-title">
            {editingPromotionId ? "Editar promoción" : "Nueva promoción"}
            {editingPromotionId && <span className="pr-badge is-editing">Editando</span>}
          </CardTitle>
          <small className="pr-hint">
            Toda promoción nueva o editada queda en <strong>borrador</strong>: pruébala en el simulador y apruébala para
            que el POS la use.
          </small>
        </div>
      </CardHeader>
      <CardBody className="pr-body">
        <section className="pr-general">
          <div className="pr-grid">
            <div className="pr-field pr-span-2">
              <label className="pr-field-label">Nombre</label>
              <Input
                className="kiosk-pos-input-lg"
                value={promoForm.name}
                placeholder="Ej. Black Friday 2026"
                onChange={(e) => onPromoFormChange({ name: e.target.value })}
              />
            </div>
            <div className="pr-field pr-span-2">
              <label className="pr-field-label">Tipo</label>
              <FilterableSelect
                value={promoForm.discountType}
                onChange={(value) =>
                  onPromoFormChange({
                    discountType: value || RULES_TYPE,
                    tiers: value === "TIERED_PERCENT" ? [{ ...EMPTY_TIER }] : promoForm.tiers,
                  })
                }
                options={DISCOUNT_TYPE_OPTIONS}
                placeholder="Buscar tipo..."
                allowEmpty={false}
                inputClassName="kiosk-pos-input-lg"
              />
            </div>
            <PosExcelFilter
              label="Kioscos"
              options={kioskOptions}
              selected={promoForm.kioskLocationIds || []}
              onChange={(kioskLocationIds) => onPromoFormChange({ kioskLocationIds })}
              emptyMeansAll
              allLabel="Todos los kioscos"
              noun="kioscos"
              searchPlaceholder="Buscar kiosco…"
              hint={hiddenEntrecuerosCount > 0 ? `${hiddenEntrecuerosCount} productos solo de Entrecueros ocultos (marca un kiosco Entrecueros para verlos).` : undefined}
            />
            {!isTiered && !isRules && (
              <div className="pr-field">
                <label className="pr-field-label">Línea (vacío = todas)</label>
                <FilterableSelect
                  value={promoForm.audienceCategory}
                  onChange={(value) => onPromoFormChange({ audienceCategory: value })}
                  options={audienceOptions}
                  placeholder="Buscar línea..."
                  emptyLabel="Todas las líneas"
                  inputClassName="kiosk-pos-input-lg"
                />
              </div>
            )}
            <div className="pr-field">
              <label className="pr-field-label">Inicio</label>
              <Input
                className="kiosk-pos-input-lg"
                type="date"
                value={promoForm.startDate}
                onChange={(e) => onPromoFormChange({ startDate: e.target.value })}
              />
            </div>
            <div className="pr-field">
              <label className="pr-field-label">Fin</label>
              <Input
                className="kiosk-pos-input-lg"
                type="date"
                value={promoForm.endDate}
                onChange={(e) => onPromoFormChange({ endDate: e.target.value })}
              />
            </div>
            <div className="pr-field pr-field-switch">
              <label className="pr-switch">
                <input
                  type="checkbox"
                  checked={Boolean(promoForm.active)}
                  onChange={(e) => onPromoFormChange({ active: e.target.checked })}
                />
                <span className="pr-switch-track" aria-hidden="true" />
                <span>{promoForm.active ? "Activa" : "Inactiva"}</span>
              </label>
            </div>
          </div>
        </section>

        {categoriesError && (
          <Alert color="warning" className="py-2 mt-2 mb-0">
            {categoriesError}{" "}
            <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={loadCategories}>
              Reintentar
            </button>
          </Alert>
        )}

        {isRules ? (
          <div className="mt-3">
            <PosPromotionRuleBuilder
              value={promoForm.ruleConfig}
              onChange={(ruleConfig) => onPromoFormChange({ ruleConfig })}
              categoryOptions={categoryOptions}
              productOptions={productOptions}
              summary={summary}
            />
          </div>
        ) : (
          <section className="pr-block mt-3">
            <header className="pr-block-head">
              <span className="pr-step-number">1</span>
              <div className="pr-block-title">Descuento</div>
            </header>
            <div className="pr-block-body">
              {isTiered ? (
                <>
                  <Alert color="light" className="py-2 mb-2">
                    Cada fila define audiencia + categoría + %. Se aplica sola en caja cuando el producto cumple ambos
                    criterios. Si hay varias promos vigentes, el sistema usa la que más beneficio da al cliente.
                  </Alert>
                  <div className="pr-field-label">Tiers — audiencia + categoría + descuento</div>
                  {tiers.map((tier, index) => (
                    <div key={`promo-tier-row-${index}`} className="pr-tier-row pr-tier-row-wide">
                      <div className="pr-field">
                        <label className="pr-field-label">Audiencia</label>
                        <FilterableSelect
                          value={tier.audienceCategory || "CABALLERO"}
                          onChange={(value) => updateTier(index, { audienceCategory: value || "CABALLERO" })}
                          options={tierAudienceOptions}
                          placeholder="Audiencia..."
                          allowEmpty={false}
                          inputClassName="kiosk-pos-input-lg"
                        />
                      </div>
                      <div className="pr-field">
                        <label className="pr-field-label">Categoría de producto</label>
                        <FilterableSelect
                          value={tier.categoryId ? String(tier.categoryId) : ""}
                          onChange={(value) => updateTier(index, { categoryId: value || "" })}
                          options={categoryOptions}
                          placeholder={categoriesLoading ? "Cargando categorías..." : "Buscar categoría..."}
                          emptyLabel="Seleccione categoría"
                          allowEmpty={false}
                          disabled={categoriesLoading || categoryOptions.length === 0}
                          inputClassName="kiosk-pos-input-lg"
                        />
                      </div>
                      <div className="pr-field">
                        <label className="pr-field-label">Descuento %</label>
                        <Input
                          className="kiosk-pos-input-lg"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={tier.discountValue || ""}
                          onChange={(e) => updateTier(index, { discountValue: e.target.value })}
                        />
                      </div>
                      <Button
                        color="danger"
                        outline
                        className="kiosk-pos-btn-lg"
                        onClick={() => removeTier(index)}
                        disabled={tiers.length <= 1}
                      >
                        Quitar
                      </Button>
                    </div>
                  ))}
                  <Button color="secondary" outline className="mt-2" onClick={addTier}>
                    Agregar tier
                  </Button>
                </>
              ) : isCombo ? (
                <div className="pr-grid">
                  <div className="pr-field">
                    <label className="pr-field-label">Lleva (uds)</label>
                    <Input
                      className="kiosk-pos-input-lg"
                      type="number"
                      min="2"
                      value={promoForm.comboBuyQty}
                      onChange={(e) => onPromoFormChange({ comboBuyQty: e.target.value })}
                    />
                  </div>
                  <div className="pr-field">
                    <label className="pr-field-label">Paga (uds)</label>
                    <Input
                      className="kiosk-pos-input-lg"
                      type="number"
                      min="1"
                      value={promoForm.comboPayQty}
                      onChange={(e) => onPromoFormChange({ comboPayQty: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <div className="pr-grid">
                  <div className="pr-field">
                    <label className="pr-field-label">Valor descuento</label>
                    <Input
                      className="kiosk-pos-input-lg"
                      type="number"
                      min="0"
                      step="0.01"
                      value={promoForm.discountValue}
                      onChange={(e) => onPromoFormChange({ discountValue: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {formError && (
          <Alert color="danger" className="py-2 mt-3 mb-0">
            {formError}
          </Alert>
        )}
        <div className="pr-actions">
          <Button color="primary" className="kiosk-pos-btn-main" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : editingPromotionId ? "Guardar cambios (queda en borrador)" : "Guardar como borrador"}
          </Button>
          <Button
            color="info"
            outline
            className="kiosk-pos-btn-main"
            onClick={() => {
              setSimPromotionId(null);
              setShowDraftSim(true);
            }}
          >
            Probar lo que estoy armando
          </Button>
          {editingPromotionId && (
            <Button color="secondary" outline className="kiosk-pos-btn-main" onClick={onCancelEdit}>
              Cancelar edición
            </Button>
          )}
        </div>

        {(showDraftSim || simPromotion) && (
          <div className="mt-3">
            <PosPromotionSimulator
              promotion={simPromotion}
              buildDraftPayload={buildDraftPayload}
              draftKioskIds={promoKioskIds(promoForm)}
              kiosks={kiosks}
              allProductOptions={allProductOptions}
              onApprove={onApprovePromotion}
              approving={Boolean(simPromotion) && statusBusyId === simPromotion.id}
              onClose={() => {
                setShowDraftSim(false);
                setSimPromotionId(null);
              }}
            />
          </div>
        )}

        <div className="pr-list-head">
          <h6 className="mb-0">Promociones registradas</h6>
          <span className="pr-hint">{(promotions || []).length} en total</span>
        </div>
        <Table responsive className="pr-list">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Regla</th>
              <th>Kioscos</th>
              <th>Vigencia</th>
              <th>Estado</th>
              <th className="pr-col-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(promotions || []).length === 0 ? (
              <tr>
                <td colSpan={7} className="pr-empty">
                  No hay promociones registradas.
                </td>
              </tr>
            ) : (
              (promotions || []).map((promo) => {
                const draft = isDraftPromotion(promo);
                const busy = statusBusyId === promo.id;
                const vigencia = promoStatusLabel(promo);
                return (
                  <tr key={`tbl-promo-${promo.id}`} className={editingPromotionId === promo.id ? "pr-row-editing" : ""}>
                    <td data-label="Nombre" className="pr-cell-name">
                      <strong>{promo.name}</strong>
                    </td>
                    <td data-label="Tipo">{typeLabel(promo)}</td>
                    <td data-label="Regla" className="pr-cell-rule">
                      {valueLabel(promo)}
                      {!isRulesPromotion(promo) && !String(promo.discountType || "").toUpperCase().includes("TIERED") && (
                        <div className="pr-hint">{getPromoAudienceLabel(promo.audienceCategory)}</div>
                      )}
                    </td>
                    <td data-label="Kioscos">
                      <span className={`pr-scope${promoKioskIds(promo).length ? " is-limited" : ""}`}>
                        {describeKioskScope(promoKioskIds(promo), kioskNameById, { compact: true })}
                      </span>
                    </td>
                    <td data-label="Vigencia" className="pr-cell-dates">
                      {(promo.startDate || "—")} → {(promo.endDate || "—")}
                    </td>
                    <td data-label="Estado">
                      <span className={`pr-badge ${draft ? "is-draft" : "is-approved"}`}>
                        {draft ? "Borrador" : "Aprobada"}
                      </span>
                      <span className={`pr-pill is-${vigencia.toLowerCase()}`}>{vigencia}</span>
                      {!draft && promo.approvedByName && <div className="pr-hint">por {promo.approvedByName}</div>}
                    </td>
                    <td data-label="Acciones">
                      <div className="pr-row-actions">
                        <Button
                          color="info"
                          outline
                          size="sm"
                          onClick={() => {
                            setShowDraftSim(false);
                            setSimPromotionId(promo.id);
                          }}
                        >
                          Simular
                        </Button>
                        <Button color="secondary" outline size="sm" onClick={() => onEditPromotion?.(promo)}>
                          Editar
                        </Button>
                        {draft ? (
                          <Button color="success" size="sm" disabled={busy} onClick={() => onApprovePromotion?.(promo)}>
                            {busy ? "…" : "Aprobar"}
                          </Button>
                        ) : (
                          <Button color="warning" outline size="sm" disabled={busy} onClick={() => onDraftPromotion?.(promo)}>
                            {busy ? "…" : "Pasar a borrador"}
                          </Button>
                        )}
                        <Button
                          color="danger"
                          outline
                          size="sm"
                          disabled={deletingPromotionId === promo.id}
                          onClick={() => onDeletePromotion?.(promo)}
                        >
                          {deletingPromotionId === promo.id ? "..." : "Eliminar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </CardBody>
    </Card>
  );
}

export default PosPromotionsTab;
