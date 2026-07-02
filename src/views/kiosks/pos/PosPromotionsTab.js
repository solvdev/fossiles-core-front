import React from "react";
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
import { PROMO_AUDIENCE_OPTIONS, getPromoAudienceLabel } from "utils/productAudienceHelper";
import { formatCurrency } from "./posUtils";

function PosPromotionsTab({ promoForm, onPromoFormChange, promotions, onCreatePromotion, kiosks }) {
  const isCombo = promoForm.discountType === "COMBO";

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
            <Input
              className="kiosk-pos-input-lg"
              type="select"
              value={promoForm.discountType}
              onChange={(e) => onPromoFormChange({ discountType: e.target.value })}
            >
              <option value="PERCENT">Porcentaje (%)</option>
              <option value="FIXED">Monto fijo (Q)</option>
              <option value="COMBO">Combo (2x1)</option>
            </Input>
          </Col>
          <Col md="4">
            <Label className="kiosk-pos-label">Kiosko (vacío = todos)</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="select"
              value={promoForm.kioskLocationId}
              onChange={(e) => onPromoFormChange({ kioskLocationId: e.target.value })}
            >
              <option value="">Todos</option>
              {(kiosks || []).map((k) => (
                <option key={`promo-k-${k.kioskId}`} value={String(k.kioskId)}>
                  {k.kioskName}
                </option>
              ))}
            </Input>
          </Col>
          <Col md="4">
            <Label className="kiosk-pos-label">Línea (vacío = todas)</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="select"
              value={promoForm.audienceCategory}
              onChange={(e) => onPromoFormChange({ audienceCategory: e.target.value })}
            >
              {PROMO_AUDIENCE_OPTIONS.map((opt) => (
                <option key={`promo-aud-${opt.value || "all"}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Input>
          </Col>
        </Row>
        <Row className="mt-2">
          {isCombo ? (
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
                    : promo.discountType === "PERCENT"
                      ? "Porcentaje"
                      : "Monto fijo"}
                </td>
                <td>
                  {promo.discountType === "PERCENT"
                    ? `${promo.discountValue}%`
                    : promo.discountType === "COMBO"
                      ? "-"
                      : formatCurrency(promo.discountValue)}
                </td>
                <td>{getPromoAudienceLabel(promo.audienceCategory)}</td>
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
