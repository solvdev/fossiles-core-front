import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Input,
  Label,
  Row,
  Table,
} from "reactstrap";
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
import { formatCurrency } from "./posUtils";
import PosPromotionRuleBuilder from "./PosPromotionRuleBuilder";
import PosPromotionSimulator from "./PosPromotionSimulator";
import {
  RULES_TYPE,
  buildPromotionPayload,
  describePromotionRule,
  isDraftPromotion,
  isRulesPromotion,
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

  const productOptions = useMemo(
    () =>
      (products || [])
        .filter((p) => String(p.status || "ACTIVE").toUpperCase() !== "INACTIVE")
        .map((p) => ({
          value: String(p.id),
          label: `${p.code || ""} · ${p.name || ""}${Number(p.salePrice) > 0 ? ` · ${formatCurrency(p.salePrice)}` : ""}`,
          searchText: `${p.code || ""} ${p.name || ""}`,
        })),
    [products]
  );

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
    <Card className="kiosk-pos-block">
      <CardHeader>
        <CardTitle tag="h5">
          {editingPromotionId ? "Editar promoción" : "Nueva promoción"}
        </CardTitle>
        <small className="text-muted">
          Toda promoción nueva o editada queda en <strong>borrador</strong>: pruébala en el simulador y apruébala para
          que el POS la use.
        </small>
      </CardHeader>
      <CardBody>
        <Row>
          <Col md="4">
            <Label className="kiosk-pos-label">Nombre</Label>
            <Input
              className="kiosk-pos-input-lg"
              value={promoForm.name}
              placeholder="Ej. Black Friday 2026"
              onChange={(e) => onPromoFormChange({ name: e.target.value })}
            />
          </Col>
          <Col md="4">
            <Label className="kiosk-pos-label">Tipo</Label>
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
          </Col>
          <Col md="4">
            <Label className="kiosk-pos-label">Kiosko (vacío = todos)</Label>
            <FilterableSelect
              value={promoForm.kioskLocationId}
              onChange={(value) => onPromoFormChange({ kioskLocationId: value })}
              options={kioskOptions}
              placeholder="Buscar kiosko..."
              emptyLabel="Todos"
              inputClassName="kiosk-pos-input-lg"
            />
          </Col>
          {!isTiered && !isRules && (
            <Col md="4">
              <Label className="kiosk-pos-label">Línea (vacío = todas)</Label>
              <FilterableSelect
                value={promoForm.audienceCategory}
                onChange={(value) => onPromoFormChange({ audienceCategory: value })}
                options={audienceOptions}
                placeholder="Buscar línea..."
                emptyLabel="Todas las líneas"
                inputClassName="kiosk-pos-input-lg"
              />
            </Col>
          )}
          <Col md="3">
            <Label className="kiosk-pos-label">Inicio</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="date"
              value={promoForm.startDate}
              onChange={(e) => onPromoFormChange({ startDate: e.target.value })}
            />
          </Col>
          <Col md="3">
            <Label className="kiosk-pos-label">Fin</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="date"
              value={promoForm.endDate}
              onChange={(e) => onPromoFormChange({ endDate: e.target.value })}
            />
          </Col>
          <Col md="2" className="d-flex align-items-end">
            <Label check className="ms-4 mb-2">
              <Input
                type="checkbox"
                checked={Boolean(promoForm.active)}
                onChange={(e) => onPromoFormChange({ active: e.target.checked })}
              />{" "}
              Activa
            </Label>
          </Col>
        </Row>

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
          <Row className="mt-2">
            {isTiered ? (
              <Col md="12">
                <Alert color="light" className="py-2 mb-2">
                  Cada fila define audiencia + categoría + %. Se aplica sola en caja cuando el producto cumple ambos
                  criterios. Si hay varias promos vigentes, el sistema usa la que más beneficio da al cliente.
                </Alert>
                <Label className="kiosk-pos-label">Tiers — audiencia + categoría + descuento</Label>
                {tiers.map((tier, index) => (
                  <Row key={`promo-tier-row-${index}`} className="mb-2 align-items-end">
                    <Col md="3">
                      <Label className="kiosk-pos-label small mb-1">Audiencia</Label>
                      <FilterableSelect
                        value={tier.audienceCategory || "CABALLERO"}
                        onChange={(value) => updateTier(index, { audienceCategory: value || "CABALLERO" })}
                        options={tierAudienceOptions}
                        placeholder="Audiencia..."
                        allowEmpty={false}
                        inputClassName="kiosk-pos-input-lg"
                      />
                    </Col>
                    <Col md="4">
                      <Label className="kiosk-pos-label small mb-1">Categoría de producto</Label>
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
                    </Col>
                    <Col md="3">
                      <Label className="kiosk-pos-label small mb-1">Descuento %</Label>
                      <Input
                        className="kiosk-pos-input-lg"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={tier.discountValue || ""}
                        onChange={(e) => updateTier(index, { discountValue: e.target.value })}
                      />
                    </Col>
                    <Col md="2">
                      <Button
                        color="danger"
                        outline
                        className="kiosk-pos-btn-lg"
                        onClick={() => removeTier(index)}
                        disabled={tiers.length <= 1}
                      >
                        Quitar
                      </Button>
                    </Col>
                  </Row>
                ))}
                <Button color="secondary" outline className="kiosk-pos-btn-main" onClick={addTier}>
                  Agregar tier
                </Button>
              </Col>
            ) : isCombo ? (
              <>
                <Col md="3">
                  <Label className="kiosk-pos-label">Lleva (uds)</Label>
                  <Input
                    className="kiosk-pos-input-lg"
                    type="number"
                    min="2"
                    value={promoForm.comboBuyQty}
                    onChange={(e) => onPromoFormChange({ comboBuyQty: e.target.value })}
                  />
                </Col>
                <Col md="3">
                  <Label className="kiosk-pos-label">Paga (uds)</Label>
                  <Input
                    className="kiosk-pos-input-lg"
                    type="number"
                    min="1"
                    value={promoForm.comboPayQty}
                    onChange={(e) => onPromoFormChange({ comboPayQty: e.target.value })}
                  />
                </Col>
              </>
            ) : (
              <Col md="4">
                <Label className="kiosk-pos-label">Valor descuento</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  type="number"
                  min="0"
                  step="0.01"
                  value={promoForm.discountValue}
                  onChange={(e) => onPromoFormChange({ discountValue: e.target.value })}
                />
              </Col>
            )}
          </Row>
        )}

        {formError && (
          <Alert color="danger" className="py-2 mt-3 mb-0">
            {formError}
          </Alert>
        )}
        <div className="d-flex flex-wrap gap-2 mt-3">
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
              kiosks={kiosks}
              productOptions={productOptions}
              onApprove={onApprovePromotion}
              approving={Boolean(simPromotion) && statusBusyId === simPromotion.id}
              onClose={() => {
                setShowDraftSim(false);
                setSimPromotionId(null);
              }}
            />
          </div>
        )}

        <Table responsive className="mt-4 pr-list">
          <thead className="text-primary">
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Regla</th>
              <th>Kiosko</th>
              <th>Vigencia</th>
              <th>Estado</th>
              <th style={{ minWidth: 260 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(promotions || []).length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted text-center">
                  No hay promociones registradas.
                </td>
              </tr>
            ) : (
              (promotions || []).map((promo) => {
                const draft = isDraftPromotion(promo);
                const busy = statusBusyId === promo.id;
                return (
                  <tr key={`tbl-promo-${promo.id}`} className={editingPromotionId === promo.id ? "pr-row-editing" : ""}>
                    <td>{promo.name}</td>
                    <td>{typeLabel(promo)}</td>
                    <td className="small" style={{ maxWidth: 380 }}>
                      {valueLabel(promo)}
                      {!isRulesPromotion(promo) && !String(promo.discountType || "").toUpperCase().includes("TIERED") && (
                        <div className="text-muted">{getPromoAudienceLabel(promo.audienceCategory)}</div>
                      )}
                    </td>
                    <td>
                      {promo.kioskLocationId
                        ? kioskNameById[String(promo.kioskLocationId)] || promo.kioskLocationId
                        : "Todos"}
                    </td>
                    <td className="small">
                      {(promo.startDate || "-")} - {(promo.endDate || "-")}
                    </td>
                    <td>
                      {draft ? (
                        <Badge color="warning" className="text-dark">Borrador</Badge>
                      ) : (
                        <Badge color="success">Aprobada</Badge>
                      )}
                      <div className="small text-muted">{promoStatusLabel(promo)}</div>
                      {!draft && promo.approvedByName && (
                        <div className="small text-muted">por {promo.approvedByName}</div>
                      )}
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
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
