import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  FormGroup,
  Label,
  Input,
  Row,
  Col,
  Alert,
  Spinner,
  Badge,
} from "reactstrap";
import {
  getActiveAnnouncement,
  broadcastAnnouncement,
  dismissAnnouncement,
} from "services/systemAnnouncementService";

export default function BroadcastAnnouncementModal({ isOpen, toggle, onBroadcastSent }) {
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modo formulario personalizado vs presets
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [title, setTitle] = useState("Reinicio del Sistema Programado");
  const [message, setMessage] = useState(
    "El servidor se reiniciará en breve para aplicar actualizaciones. Por favor guarde sus operaciones pendientes."
  );
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [announcementType, setAnnouncementType] = useState("RESTART_WARNING"); // RESTART_WARNING, MAINTENANCE, INFO, URGENT

  const loadCurrentStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const active = await getActiveAnnouncement();
      if (active && active.isActive && active.remainingSeconds > 0) {
        setActiveAnnouncement(active);
        setRemainingSeconds(active.remainingSeconds);
      } else {
        setActiveAnnouncement(null);
        setRemainingSeconds(null);
      }
    } catch (err) {
      setError(err.message || "Error al consultar estado de alertas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCurrentStatus();
      setSuccessMsg("");
      setError("");
    }
  }, [isOpen, loadCurrentStatus]);

  // Cuenta regresiva en el modal
  useEffect(() => {
    if (!activeAnnouncement || remainingSeconds === null || remainingSeconds <= 0) return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeAnnouncement, remainingSeconds]);

  const handleSendBroadcast = async (mins, customTitle, customMsg, customType) => {
    try {
      setSending(true);
      setError("");
      setSuccessMsg("");

      const finalTitle = customTitle || title || "Reinicio del Sistema Programado";
      const finalMsg =
        customMsg ||
        message ||
        `El servidor se reiniciará en ${mins} minutos. Por favor guarde sus cambios.`;
      const finalType = customType || announcementType || "RESTART_WARNING";

      const res = await broadcastAnnouncement({
        title: finalTitle,
        message: finalMsg,
        durationMinutes: mins || 5,
        announcementType: finalType,
        targetAction: finalType === "RESTART_WARNING" ? "RESTART" : "NONE",
      });

      setActiveAnnouncement(res);
      setRemainingSeconds(res.remainingSeconds);
      setSuccessMsg(`¡Alerta emitida a todos los usuarios conectados (${mins} minutos de cuenta regresiva)!`);
      if (onBroadcastSent) onBroadcastSent(res);
    } catch (err) {
      setError(err.message || "Error al emitir la alerta");
    } finally {
      setSending(false);
    }
  };

  const handleDismiss = async () => {
    try {
      setSending(true);
      setError("");
      setSuccessMsg("");
      await dismissAnnouncement();
      setActiveAnnouncement(null);
      setRemainingSeconds(null);
      setSuccessMsg("La alerta ha sido cancelada y retirada de todas las pantallas.");
      if (onBroadcastSent) onBroadcastSent(null);
    } catch (err) {
      setError(err.message || "Error al cancelar la alerta");
    } finally {
      setSending(false);
    }
  };

  const formatCountdown = (secs) => {
    if (!secs || secs <= 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle} className="border-bottom pb-3">
        <i className="nc-icon nc-bell-55 mr-2 text-danger" />
        <strong>Emitir Alerta de Reinicio / Notificación Global</strong>
      </ModalHeader>

      <ModalBody className="py-3">
        {error && (
          <Alert color="danger">
            <i className="nc-icon nc-simple-remove mr-2" />
            {error}
          </Alert>
        )}

        {successMsg && (
          <Alert color="success">
            <i className="nc-icon nc-check-2 mr-2" />
            {successMsg}
          </Alert>
        )}

        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
            <p className="mt-2 text-muted">Consultando estado del sistema...</p>
          </div>
        ) : (
          <div>
            {/* Si ya hay alerta activa */}
            {activeAnnouncement && remainingSeconds > 0 ? (
              <div
                className="p-3 mb-4 rounded border"
                style={{
                  background: "#fff5f5",
                  borderColor: "#feb2b2",
                }}
              >
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div>
                    <Badge color="danger" className="mr-2 px-2 py-1">
                      <i className="nc-icon nc-sound-wave mr-1" /> ALERTA EN CURSO
                    </Badge>
                    <strong className="text-danger" style={{ fontSize: "16px" }}>
                      {activeAnnouncement.title}
                    </strong>
                    <div className="text-muted small mt-1">
                      {activeAnnouncement.message}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      style={{
                        fontSize: "24px",
                        fontWeight: 900,
                        color: "#e53e3e",
                        fontFamily: "monospace",
                      }}
                    >
                      ⏳ {formatCountdown(remainingSeconds)}
                    </div>
                    <small className="text-muted">Tiempo restante</small>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-top d-flex justify-content-end">
                  <Button
                    color="danger"
                    size="sm"
                    className="btn-round"
                    onClick={handleDismiss}
                    disabled={sending}
                  >
                    {sending ? <Spinner size="sm" className="mr-1" /> : <i className="nc-icon nc-simple-remove mr-1" />}
                    Cancelar Reinicio / Apagar Alerta
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-muted mb-3">
                Al emitir una alerta, aparecerá inmediatamente un banner llamativo con cuenta regresiva en las pantallas de todos los usuarios conectados en la web.
              </p>
            )}

            {/* PRESETS DE 1 CLIC */}
            <h6 className="text-muted font-weight-bold mb-2">
              <i className="nc-icon nc-tap-01 mr-1" /> Opciones Rápidas (1 Clic):
            </h6>
            <Row className="mb-3">
              <Col md="4" sm="6" className="mb-2">
                <Button
                  color="warning"
                  block
                  outline
                  className="py-3"
                  onClick={() =>
                    handleSendBroadcast(
                      3,
                      "Reinicio del Sistema en 3 Minutos",
                      "El servidor se reiniciará en 3 minutos. Guarde sus cambios inmediatamente."
                    )
                  }
                  disabled={sending}
                >
                  <div className="font-weight-bold" style={{ fontSize: "16px" }}>
                    ⏱️ En 3 Minutos
                  </div>
                  <small className="text-muted">Reinicio urgente</small>
                </Button>
              </Col>

              <Col md="4" sm="6" className="mb-2">
                <Button
                  color="danger"
                  block
                  className="py-3 shadow-sm"
                  onClick={() =>
                    handleSendBroadcast(
                      5,
                      "Reinicio del Sistema en 5 Minutos",
                      "El servidor se reiniciará en 5 minutos para aplicar actualizaciones. Por favor guarde sus operaciones pendientes."
                    )
                  }
                  disabled={sending}
                >
                  <div className="font-weight-bold" style={{ fontSize: "16px" }}>
                    ⏱️ En 5 Minutos (Recomendado)
                  </div>
                  <small style={{ opacity: 0.9 }}>Tiempo ideal</small>
                </Button>
              </Col>

              <Col md="4" sm="6" className="mb-2">
                <Button
                  color="info"
                  block
                  outline
                  className="py-3"
                  onClick={() =>
                    handleSendBroadcast(
                      10,
                      "Reinicio del Sistema en 10 Minutos",
                      "El servidor se reiniciará en 10 minutos. Por favor finalice sus procesos."
                    )
                  }
                  disabled={sending}
                >
                  <div className="font-weight-bold" style={{ fontSize: "16px" }}>
                    ⏱️ En 10 Minutos
                  </div>
                  <small className="text-muted">Aviso con margen</small>
                </Button>
              </Col>
            </Row>

            {/* OPCIÓN PERSONALIZADA */}
            <div className="border-top pt-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="text-muted font-weight-bold mb-0">
                  <i className="nc-icon nc-settings mr-1" /> Mensaje Personalizado
                </h6>
                <Button
                  color="link"
                  size="sm"
                  className="p-0 text-primary"
                  onClick={() => setIsCustomMode(!isCustomMode)}
                >
                  {isCustomMode ? "Ocultar formulario" : "Personalizar título, texto o tiempo"}
                </Button>
              </div>

              {isCustomMode && (
                <div className="p-3 bg-light rounded border mt-2">
                  <Row>
                    <Col md="6">
                      <FormGroup>
                        <Label className="font-weight-bold">Tipo de Aviso</Label>
                        <Input
                          type="select"
                          value={announcementType}
                          onChange={(e) => setAnnouncementType(e.target.value)}
                        >
                          <option value="RESTART_WARNING">🚨 Reinicio del Servidor / Sistema</option>
                          <option value="MAINTENANCE">🛠️ Mantenimiento Programado</option>
                          <option value="URGENT">⚠️ Alerta Urgente / Importante</option>
                          <option value="INFO">📢 Comunicado / Notificación Informativa</option>
                        </Input>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label className="font-weight-bold">Tiempo de Cuenta Regresiva (Minutos)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="120"
                          value={durationMinutes}
                          onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 5)}
                        />
                      </FormGroup>
                    </Col>
                  </Row>

                  <FormGroup>
                    <Label className="font-weight-bold">Título de la Alerta</Label>
                    <Input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ej. Mantenimiento del Sistema, Actualización de Inventario, etc."
                    />
                  </FormGroup>

                  <FormGroup>
                    <Label className="font-weight-bold">Mensaje para los usuarios</Label>
                    <Input
                      type="textarea"
                      rows="2"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Escribe las instrucciones detalladas para los usuarios..."
                    />
                  </FormGroup>

                  <div className="text-right">
                    <Button
                      color="primary"
                      onClick={() => handleSendBroadcast(durationMinutes, title, message, announcementType)}
                      disabled={sending || !title.trim() || !message.trim()}
                      className="btn-round"
                    >
                      {sending ? <Spinner size="sm" className="mr-1" /> : <i className="nc-icon nc-send mr-1" />}
                      Emitir Alerta Personalizada
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button color="secondary" onClick={toggle} disabled={sending}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}
