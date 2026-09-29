import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
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
import { getLocations } from "services/locationService";
import { getKioskGoalHistory, getKioskGoalProgress, upsertKioskGoal } from "services/kioskGoalService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency } from "./pos/posUtils";

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const isKioskLocation = (location) => {
  const categoria = String(location?.categoria || "").toUpperCase();
  const name = String(location?.name || "").toUpperCase();
  const code = String(location?.code || "").toUpperCase();
  return categoria.includes("KIOS") || name.includes("KIOS") || code.startsWith("K");
};

function KioskGoalsAdmin() {
  const [kiosks, setKiosks] = useState([]);
  const [selectedKioskId, setSelectedKioskId] = useState("");
  const [history, setHistory] = useState([]);
  const [currentProgress, setCurrentProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = getTodayYmdGuatemala();
  const [goalYear, setGoalYear] = useState(Number(today.slice(0, 4)));
  const [goalMonth, setGoalMonth] = useState(Number(today.slice(5, 7)));
  const [goalAmount, setGoalAmount] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await getLocations();
        const kioskLocations = (data || []).filter(isKioskLocation);
        setKiosks(kioskLocations);
        if (kioskLocations.length > 0) {
          setSelectedKioskId(String(kioskLocations[0].id));
        }
      } catch (err) {
        showError(err.message || "No se pudieron cargar los kioskos.");
      }
    })();
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedKioskId) {
      setHistory([]);
      setCurrentProgress(null);
      return;
    }
    try {
      setLoading(true);
      const [historyData, progressData] = await Promise.all([
        getKioskGoalHistory(selectedKioskId),
        getKioskGoalProgress(selectedKioskId, goalYear, goalMonth),
      ]);
      setHistory(historyData || []);
      setCurrentProgress(progressData || null);
      setGoalAmount(progressData?.goalAmount != null ? String(progressData.goalAmount) : "");
    } catch (err) {
      showError(err.message || "No se pudo cargar la meta del kiosko.");
    } finally {
      setLoading(false);
    }
  }, [selectedKioskId, goalYear, goalMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedKioskName = useMemo(() => {
    const match = kiosks.find((k) => String(k.id) === String(selectedKioskId));
    return match?.name || "";
  }, [kiosks, selectedKioskId]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedKioskId) return;
    const amount = Number(goalAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      showError("Ingresa una meta válida (mayor o igual a cero).");
      return;
    }
    try {
      setSaving(true);
      await upsertKioskGoal(selectedKioskId, { goalYear, goalMonth, goalAmount: amount });
      showSuccess("Meta guardada correctamente.");
      await loadData();
    } catch (err) {
      showError(err.message || "No se pudo guardar la meta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Metas mensuales de kioskos</CardTitle>
            </CardHeader>
            <CardBody>
              <Row>
                <Col md="6">
                  <FormGroup>
                    <Label>Kiosko</Label>
                    <Input
                      type="select"
                      value={selectedKioskId}
                      onChange={(e) => setSelectedKioskId(e.target.value)}
                    >
                      {kiosks.length === 0 && <option value="">No hay kioskos</option>}
                      {kiosks.map((kiosk) => (
                        <option key={kiosk.id} value={kiosk.id}>
                          {kiosk.name} {kiosk.code ? `(${kiosk.code})` : ""}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
              </Row>

              {loading && !currentProgress ? (
                <div className="text-center py-3">
                  <Spinner size="sm" /> Cargando...
                </div>
              ) : (
                <>
                  <hr />
                  <h6 className="text-muted mb-3">Configurar meta</h6>
                  <form onSubmit={handleSave}>
                    <Row>
                      <Col md="3">
                        <FormGroup>
                          <Label>Año</Label>
                          <Input
                            type="number"
                            value={goalYear}
                            onChange={(e) => setGoalYear(Number(e.target.value))}
                          />
                        </FormGroup>
                      </Col>
                      <Col md="3">
                        <FormGroup>
                          <Label>Mes</Label>
                          <Input
                            type="select"
                            value={goalMonth}
                            onChange={(e) => setGoalMonth(Number(e.target.value))}
                          >
                            {MONTH_LABELS.map((label, idx) => (
                              <option key={label} value={idx + 1}>
                                {label}
                              </option>
                            ))}
                          </Input>
                        </FormGroup>
                      </Col>
                      <Col md="4">
                        <FormGroup>
                          <Label>Meta de ventas (Q)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={goalAmount}
                            onChange={(e) => setGoalAmount(e.target.value)}
                          />
                        </FormGroup>
                      </Col>
                      <Col md="2" className="d-flex align-items-end">
                        <Button color="primary" type="submit" disabled={saving || !selectedKioskId} block>
                          {saving ? "Guardando..." : "Guardar"}
                        </Button>
                      </Col>
                    </Row>
                  </form>

                  {currentProgress && (
                    <Alert color="info" className="mt-2">
                      {selectedKioskName}: vendido {formatCurrency(currentProgress.soldAmount)}
                      {currentProgress.hasGoalConfigured
                        ? ` de ${formatCurrency(currentProgress.goalAmount)} (${Number(
                            currentProgress.percentAchieved || 0
                          ).toFixed(1)}%)`
                        : " — sin meta configurada para este período."}
                    </Alert>
                  )}

                  <hr />
                  <h6 className="text-muted mb-3">Histórico de metas</h6>
                  <Table responsive size="sm">
                    <thead>
                      <tr>
                        <th>Mes</th>
                        <th className="text-right">Meta</th>
                        <th className="text-right">Vendido</th>
                        <th className="text-right">% logrado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <tr key={`${item.goalYear}-${item.goalMonth}`}>
                          <td>{MONTH_LABELS[item.goalMonth - 1]} {item.goalYear}</td>
                          <td className="text-right">{formatCurrency(item.goalAmount)}</td>
                          <td className="text-right">{formatCurrency(item.soldAmount)}</td>
                          <td className="text-right">{Number(item.percentAchieved || 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                      {history.length === 0 && (
                        <tr>
                          <td colSpan="4" className="text-center text-muted">
                            Sin metas configuradas todavía para este kiosko.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default KioskGoalsAdmin;
