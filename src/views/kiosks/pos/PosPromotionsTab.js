import React, { useMemo } from "react";
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
import {
  PROMO_AUDIENCE_OPTIONS,
  PROMO_TIER_AUDIENCE_OPTIONS,
  formatPromotionTierSummary,
  getPromoAudienceLabel,
} from "utils/productAudienceHelper";
import { formatCurrency } from "./posUtils";

const EMPTY_TIER_PERCENTS = { DAMA: "", CABALLERO: "", UNISEX: "" };

const DISCOUNT_TYPE_OPTIONS = [
  { value: "PERCENT", label: "Porcentaje (%)" },
  { value: "TIERED_PERCENT", label: "Porcentaje por línea" },
  { value: "FIXED", label: "Monto fijo (Q)" },
  { value: "COMBO", label: "Combo (2x1)" },
];

function PosPromotionsTab({ promoForm, onPromoFormChange, promotions, onCreatePromotion, kiosks }) {
  const isCombo = promoForm.discountType === "COMBO";
  const isTiered = promoForm.discountType === "TIERED_PERCENT";

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
              onChange={(value) => onPromoFormChange({ discountType: value || "PERCENT" })}
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
            PROMO_TIER_AUDIENCE_OPTIONS.map((opt) => (
              <Col md="4" key={`promo-tier-${opt.value}`}>
                <Label className="kiosk-pos-label">% {opt.label}</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={(promoForm.tierPercents || EMPTY_TIER_PERCENTS)[opt.value] || ""}
                  onChange={(e) =>
                    onPromoFormChange({
                      tierPercents: {
                        ...(promoForm.tierPercents || EMPTY_TIER_PERCENTS),
                        [opt.value]: e.target.value,
                      },
                    })
                  }
                />
              </Col>
            ))
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
                    ? "Por línea"
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
