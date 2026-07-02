import React, { useEffect, useMemo, useState } from "react";
import {
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
import {
  PROMO_AUDIENCE_OPTIONS,
  PROMO_TIER_AUDIENCE_OPTIONS,
  formatPromotionTierSummary,
  getPromoAudienceLabel,
} from "utils/productAudienceHelper";
import { formatCurrency } from "./posUtils";

const EMPTY_TIER = { audienceCategory: "CABALLERO", categoryId: "", discountValue: "" };

const DISCOUNT_TYPE_OPTIONS = [
  { value: "PERCENT", label: "Porcentaje (%)" },
  { value: "TIERED_PERCENT", label: "Porcentaje por línea" },
  { value: "FIXED", label: "Monto fijo (Q)" },
  { value: "COMBO", label: "Combo (2x1)" },
];

function PosPromotionsTab({ promoForm, onPromoFormChange, promotions, onCreatePromotion, kiosks }) {
  const [categories, setCategories] = useState([]);
  const isCombo = promoForm.discountType === "COMBO";
  const isTiered = promoForm.discountType === "TIERED_PERCENT";
  const tiers = promoForm.tiers?.length ? promoForm.tiers : [EMPTY_TIER];

  useEffect(() => {
    getProductCategories()
      .then((rows) => setCategories(Array.isArray(rows) ? rows : []))
      .catch(() => setCategories([]));
  }, []);

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
    () =>
      PROMO_AUDIENCE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    []
  );

  const tierAudienceOptions = useMemo(
    () =>
      PROMO_TIER_AUDIENCE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
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

  return (
    <Card className="kiosk-pos-block">
      <CardHeader>
        <CardTitle tag="h5">Promociones</CardTitle>
      </CardHeader>
      <CardBody>
        <Row>
          <Col md="4">
            <Label className="kiosk-pos-label">Nombre</Label>
            <Input
              className="kiosk-pos-input-lg"
              value={promoForm.name}
              onChange={(e) => onPromoFormChange({ name: e.target.value })}
            />
          </Col>
          <Col md="4">
            <Label className="kiosk-pos-label">Tipo</Label>
            <FilterableSelect
              value={promoForm.discountType}
              onChange={(value) =>
                onPromoFormChange({
                  discountType: value || "PERCENT",
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
          {!isTiered && (
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
        </Row>
        <Row className="mt-2">
          {isTiered ? (
            <Col md="12">
              <Label className="kiosk-pos-label">Tiers (audiencia + categoría + %)</Label>
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
                    <Label className="kiosk-pos-label small mb-1">Categoría</Label>
                    <FilterableSelect
                      value={tier.categoryId ? String(tier.categoryId) : ""}
                      onChange={(value) => updateTier(index, { categoryId: value || "" })}
                      options={categoryOptions}
                      placeholder="Buscar categoría..."
                      emptyLabel="Seleccione categoría"
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
        </Row>
        <Button color="primary" className="kiosk-pos-btn-main mt-3" onClick={onCreatePromotion}>
          Crear promoción
        </Button>

        <Table responsive className="mt-3">
          <thead className="text-primary">
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Línea</th>
              <th>Kiosko</th>
              <th>Vigencia</th>
            </tr>
          </thead>
          <tbody>
            {(promotions || []).map((promo) => (
              <tr key={`tbl-promo-${promo.id}`}>
                <td>{promo.name}</td>
                <td>
                  {promo.discountType === "COMBO"
                    ? `Combo ${promo.comboBuyQty}x${promo.comboPayQty}`
                    : String(promo.discountType || "").toUpperCase().includes("TIERED")
                      ? "Por línea"
                      : promo.discountType === "PERCENT"
                        ? "Porcentaje"
                        : "Monto fijo"}
                </td>
                <td>
                  {String(promo.discountType || "").toUpperCase().includes("TIERED")
                    ? formatPromotionTierSummary(promo) || "-"
                    : promo.discountType === "PERCENT"
                      ? `${promo.discountValue}%`
                      : promo.discountType === "COMBO"
                        ? "-"
                        : formatCurrency(promo.discountValue)}
                </td>
                <td>
                  {String(promo.discountType || "").toUpperCase().includes("TIERED")
                    ? "Audiencia + categoría"
                    : getPromoAudienceLabel(promo.audienceCategory)}
                </td>
                <td>{promo.kioskLocationId ? promo.kioskLocationId : "Todos"}</td>
                <td>
                  {(promo.startDate || "-")} - {(promo.endDate || "-")}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardBody>
    </Card>
  );
}

export default PosPromotionsTab;
