import React, { useEffect, useState } from "react";
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
} from "reactstrap";
import { getLocations } from "services/locationService";
import {
  getEligibleSupervisors,
  getSupervisorAssignments,
  updateSupervisorAssignments,
} from "services/kioskGoalService";
import { showError, showSuccess } from "utils/notificationHelper";

const isKioskLocation = (location) => {
  const categoria = String(location?.categoria || "").toUpperCase();
  const name = String(location?.name || "").toUpperCase();
  const code = String(location?.code || "").toUpperCase();
  return categoria.includes("KIOS") || name.includes("KIOS") || code.startsWith("K");
};

function KioskSupervisorAssignments() {
  const [supervisors, setSupervisors] = useState([]);
  const [kiosks, setKiosks] = useState([]);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");
  const [selectedKioskIds, setSelectedKioskIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [supervisorList, locations] = await Promise.all([getEligibleSupervisors(), getLocations()]);
        setSupervisors(supervisorList || []);
        setKiosks((locations || []).filter(isKioskLocation));
        if ((supervisorList || []).length > 0) {
          setSelectedSupervisorId(String(supervisorList[0].id));
        }
      } catch (err) {
        showError(err.message || "No se pudieron cargar las supervisoras o los kioskos.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedSupervisorId) {
      setSelectedKioskIds([]);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const data = await getSupervisorAssignments(selectedSupervisorId);
        setSelectedKioskIds((data?.kiosks || []).map((k) => String(k.id)));
      } catch (err) {
        showError(err.message || "No se pudo cargar la asignación de la supervisora.");
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedSupervisorId]);

  const handleToggle = (kioskId, checked) => {
    const idStr = String(kioskId);
    setSelectedKioskIds((prev) => (checked ? [...prev, idStr] : prev.filter((id) => id !== idStr)));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedSupervisorId) return;
    try {
      setSaving(true);
      await updateSupervisorAssignments(
        selectedSupervisorId,
        selectedKioskIds.map((id) => Number(id))
      );
      showSuccess("Asignación guardada correctamente.");
    } catch (err) {
      showError(err.message || "No se pudo guardar la asignación.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="10">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Supervisoras y kioskos</CardTitle>
            </CardHeader>
            <CardBody>
              <form onSubmit={handleSave}>
                <FormGroup>
                  <Label>Supervisora</Label>
                  <Input
                    type="select"
                    value={selectedSupervisorId}
                    onChange={(e) => setSelectedSupervisorId(e.target.value)}
                  >
                    {supervisors.length === 0 && <option value="">No hay supervisoras</option>}
                    {supervisors.map((supervisor) => (
                      <option key={supervisor.id} value={supervisor.id}>
                        {supervisor.name}
                      </option>
                    ))}
                  </Input>
                  <small className="text-muted d-block mt-1">
                    Los kioskos marcados cuentan para la meta y comisión agregada de esta supervisora. No
                    afecta su acceso operativo general (ella ya ve todos los kioskos para inventario, ventas, etc.).
                  </small>
                </FormGroup>

                {loading ? (
                  <div className="text-center py-3">
                    <Spinner size="sm" /> Cargando...
                  </div>
                ) : (
                  <FormGroup>
                    <Label>Kioskos asignados</Label>
                    {kiosks.length === 0 && <Alert color="warning">No hay kioskos disponibles.</Alert>}
                    <Row>
                      {kiosks.map((kiosk) => (
                        <Col md="4" key={kiosk.id} className="mb-2">
                          <FormGroup check>
                            <Label check>
                              <Input
                                type="checkbox"
                                checked={selectedKioskIds.includes(String(kiosk.id))}
                                onChange={(e) => handleToggle(kiosk.id, e.target.checked)}
                                disabled={saving}
                              />
                              <span className="form-check-sign" />
                              {kiosk.name} {kiosk.code ? `(${kiosk.code})` : ""}
                            </Label>
                          </FormGroup>
                        </Col>
                      ))}
                    </Row>
                  </FormGroup>
                )}

                <Button color="primary" type="submit" disabled={saving || !selectedSupervisorId} className="btn-round">
                  {saving ? "Guardando..." : "Guardar asignación"}
                </Button>
              </form>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default KioskSupervisorAssignments;
