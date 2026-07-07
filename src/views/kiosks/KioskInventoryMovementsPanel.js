import React, { useMemo } from "react";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  formatKioscoMovementReference,
  formatKioscoMovementRoute,
  getKioscoMovementSignedQuantity,
  getKioscoMovementTypeLabel,
  KIOSCO_MOVEMENT_TYPE_LABELS,
} from "utils/kioskMovementHelper";

const MOVEMENT_TYPE_OPTIONS = Object.entries(KIOSCO_MOVEMENT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
  searchText: label,
}));

function matchesDateRange(createdAt, fromDate, toDate) {
  if (!fromDate && !toDate) return true;
  if (!createdAt) return false;
  const day = String(createdAt).slice(0, 10);
  if (fromDate && day < fromDate) return false;
  if (toDate && day > toDate) return false;
  return true;
}

function KioskInventoryMovementsPanel({
  movements,
  loading,
  filters,
  onFilterChange,
  selectedKiosk,
}) {
  const filteredMovements = useMemo(() => {
    const term = String(filters.productTerm || "").trim().toLowerCase();
    const refTerm = String(filters.referenceTerm || "").trim().toLowerCase();
    return (movements || []).filter((movement) => {
      if (filters.type && String(movement.movementType) !== filters.type) {
        return false;
      }
      if (term) {
        const haystack = [
          movement.productCode,
          movement.productName,
          movement.colorName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (refTerm) {
        const refHaystack = [
          movement.physicalSlipNumber,
          movement.referenceNumber,
          movement.referenceId,
          movement.reason,
        ]
          .filter((v) => v != null && String(v).trim() !== "")
          .join(" ")
          .toLowerCase();
        if (!refHaystack.includes(refTerm)) return false;
      }
      if (!matchesDateRange(movement.createdAt, filters.fromDate, filters.toDate)) {
        return false;
      }
      return true;
    });
  }, [movements, filters]);

  return (
    <Card className="border">
      <CardHeader>
        <CardTitle tag="h6" className="mb-0">
          Historial de movimientos
          {selectedKiosk ? (
            <span className="text-muted font-weight-normal ml-2">
              ({filteredMovements.length} de {movements.length})
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardBody>
        {!selectedKiosk ? (
          <Alert color="light" className="border mb-0">
            Selecciona un kiosko en «Stock por kiosko» para ver movimientos.
          </Alert>
        ) : (
          <>
            <Row className="mb-3">
              <Col md="3" sm="6">
                <FormGroup className="mb-2">
                  <Label className="mb-1">Tipo</Label>
                  <FilterableSelect
                    value={filters.type}
                    onChange={(value) => onFilterChange("type", value)}
                    options={MOVEMENT_TYPE_OPTIONS}
                    placeholder="Todos los tipos…"
                    emptyLabel="Todos"
                  />
                </FormGroup>
              </Col>
              <Col md="3" sm="6">
                <FormGroup className="mb-2">
                  <Label className="mb-1">Producto / color</Label>
                  <Input
                    bsSize="sm"
                    value={filters.productTerm}
                    onChange={(e) => onFilterChange("productTerm", e.target.value)}
                    placeholder="Código o nombre…"
                  />
                </FormGroup>
              </Col>
              <Col md="3" sm="6">
                <FormGroup className="mb-2">
                  <Label className="mb-1">Boleta / referencia</Label>
                  <Input
                    bsSize="sm"
                    value={filters.referenceTerm}
                    onChange={(e) => onFilterChange("referenceTerm", e.target.value)}
                    placeholder="Número o factura…"
                  />
                </FormGroup>
              </Col>
              <Col md="3" sm="6">
                <Row>
                  <Col xs="6">
                    <FormGroup className="mb-2">
                      <Label className="mb-1">Desde</Label>
                      <Input
                        bsSize="sm"
                        type="date"
                        value={filters.fromDate}
                        onChange={(e) => onFilterChange("fromDate", e.target.value)}
                      />
                    </FormGroup>
                  </Col>
                  <Col xs="6">
                    <FormGroup className="mb-2">
                      <Label className="mb-1">Hasta</Label>
                      <Input
                        bsSize="sm"
                        type="date"
                        value={filters.toDate}
                        onChange={(e) => onFilterChange("toDate", e.target.value)}
                      />
                    </FormGroup>
                  </Col>
                </Row>
              </Col>
            </Row>

            {loading ? (
              <div className="text-center py-3">
                <Spinner size="sm" className="mr-2" />
                Cargando movimientos…
              </div>
            ) : movements.length === 0 ? (
              <Alert color="light" className="border mb-0">No hay movimientos para este kiosko.</Alert>
            ) : filteredMovements.length === 0 ? (
              <Alert color="light" className="border mb-0">Ningún movimiento coincide con los filtros.</Alert>
            ) : (
              <Table responsive size="sm" className="mb-0">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Origen → Destino</th>
                    <th>Producto</th>
                    <th>Color</th>
                    <th className="text-right">Cant.</th>
                    <th className="text-right">Antes</th>
                    <th className="text-right">Después</th>
                    <th>Ref. / boleta</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="text-nowrap">
                        {movement.createdAt ? formatDateTimeGt(movement.createdAt) : "—"}
                      </td>
                      <td>
                        <Badge color="secondary">
                          {getKioscoMovementTypeLabel(movement.movementType)}
                        </Badge>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatKioscoMovementRoute(movement)}</td>
                      <td>
                        {movement.productCode || movement.productId}
                        {movement.productName ? ` — ${movement.productName}` : ""}
                      </td>
                      <td>{movement.colorName || "—"}</td>
                      <td className="text-right">{getKioscoMovementSignedQuantity(movement)}</td>
                      <td className="text-right">{movement.stockBefore ?? "—"}</td>
                      <td className="text-right">{movement.stockAfter ?? "—"}</td>
                      <td>{formatKioscoMovementReference(movement)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default KioskInventoryMovementsPanel;
