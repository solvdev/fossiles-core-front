import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Col,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
} from "reactstrap";
import {
  createPublicMaterialMovement,
  getPublicMaterialById,
  getPublicMaterialInventory,
  getPublicMaterialKardex,
  searchPublicMaterials,
  uploadPublicMaterialImage,
} from "services/publicMaterialKardexService";
import { formatDateTimeGt } from "utils/dateTimeHelper";

const MOVEMENT_LABELS = {
  ENTRY: { text: "Entrada", color: "success" },
  EXIT: { text: "Salida", color: "danger" },
  ADJUSTMENT_IN: { text: "Ajuste +", color: "primary" },
  ADJUSTMENT_OUT: { text: "Ajuste -", color: "warning" },
};

const formatDateTime = (dateValue) => {
  if (!dateValue) return "Sin fecha";
  try {
    return formatDateTimeGt(dateValue, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return dateValue;
  }
};

const formatQuantity = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toFixed(3) : "0.000";
};

const isLocalOrPrivateHost = (host = "") => {
  const normalized = host.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("172.16.") ||
    normalized.startsWith("172.17.") ||
    normalized.startsWith("172.18.") ||
    normalized.startsWith("172.19.") ||
    normalized.startsWith("172.20.") ||
    normalized.startsWith("172.21.") ||
    normalized.startsWith("172.22.") ||
    normalized.startsWith("172.23.") ||
    normalized.startsWith("172.24.") ||
    normalized.startsWith("172.25.") ||
    normalized.startsWith("172.26.") ||
    normalized.startsWith("172.27.") ||
    normalized.startsWith("172.28.") ||
    normalized.startsWith("172.29.") ||
    normalized.startsWith("172.30.") ||
    normalized.startsWith("172.31.")
  );
};

function PublicMaterialKardexMobile() {
  const { materialId } = useParams();
  const navigate = useNavigate();
  const [material, setMaterial] = useState(null);
  const [inventory, setInventory] = useState({ totalQuantity: 0 });
  const [kardex, setKardex] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [manualQrValue, setManualQrValue] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchingMaterial, setSearchingMaterial] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const qrImageInputRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const codeReaderRef = useRef(null);
  const [form, setForm] = useState({
    movementType: "IN",
    quantity: "",
    reason: "",
  });
  const [captureUnitMode, setCaptureUnitMode] = useState("BASE");
  const [customFactorToBase, setCustomFactorToBase] = useState("");
  const movementUom =
    material?.manufacturingUomName ||
    material?.manufacturingUomCode ||
    "unidades";
  const baseUomId = material?.manufacturingUomId || material?.uomId || null;
  const baseUomLabel = movementUom;
  const purchaseUom =
    material?.purchaseUomName ||
    material?.purchaseUomCode ||
    "unidad de compra";
  const purchaseUomId = material?.purchaseUomId || null;
  const purchaseQuantity = Number(material?.purchaseQuantity || 0);
  const capturedQuantity = Number(form.quantity || 0);
  const customFactor = Number(customFactorToBase || 0);
  const convertedToBaseQty =
    captureUnitMode === "PURCHASE" && purchaseQuantity > 0
      ? capturedQuantity * purchaseQuantity
      : captureUnitMode === "CUSTOM" && customFactor > 0
      ? capturedQuantity * customFactor
      : capturedQuantity;

  const loadData = useCallback(async () => {
    if (!materialId) return;

    setLoading(true);
    setError("");
    try {
      const [materialResult, inventoryResult, kardexResult] = await Promise.allSettled([
        getPublicMaterialById(materialId),
        getPublicMaterialInventory(materialId),
        getPublicMaterialKardex(materialId),
      ]);

      if (materialResult.status === "fulfilled") {
        setMaterial(materialResult.value);
      }

      if (inventoryResult.status === "fulfilled") {
        setInventory(inventoryResult.value || { totalQuantity: 0 });
      } else {
        setInventory({ totalQuantity: 0 });
      }

      if (kardexResult.status === "fulfilled") {
        setKardex(kardexResult.value || []);
      } else {
        setKardex([]);
      }

      if (
        materialResult.status === "rejected" &&
        inventoryResult.status === "rejected" &&
        kardexResult.status === "rejected"
      ) {
        throw new Error("No se pudo cargar la información del material");
      }
    } catch (requestError) {
      setError(requestError.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    if (materialId) {
      loadData();
    } else {
      setLoading(false);
      setMaterial(null);
      setInventory({ totalQuantity: 0 });
      setKardex([]);
      setError("");
    }
  }, [loadData, materialId]);

  useEffect(() => {
    if (captureUnitMode === "PURCHASE" && (!purchaseUomId || purchaseQuantity <= 0)) {
      setCaptureUnitMode("BASE");
    }
  }, [captureUnitMode, purchaseUomId, purchaseQuantity]);

  useEffect(() => {
    const stopScanner = () => {
      if (scannerControlsRef.current) {
        if (typeof scannerControlsRef.current.stop === "function") {
          scannerControlsRef.current.stop();
        }
        scannerControlsRef.current = null;
      }
      if (codeReaderRef.current) {
        if (typeof codeReaderRef.current.reset === "function") {
          codeReaderRef.current.reset();
        } else if (typeof codeReaderRef.current.stopContinuousDecode === "function") {
          codeReaderRef.current.stopContinuousDecode();
        } else if (typeof codeReaderRef.current.stopAsyncDecode === "function") {
          codeReaderRef.current.stopAsyncDecode();
        }
        codeReaderRef.current = null;
      }
      if (videoRef.current) {
        const activeStream = videoRef.current.srcObject;
        if (activeStream && typeof activeStream.getTracks === "function") {
          activeStream.getTracks().forEach((track) => track.stop());
        }
        videoRef.current.srcObject = null;
      }
    };

    const startScanner = async () => {
      if (!scannerOpen) {
        stopScanner();
        return;
      }

      setScannerError("");

      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        codeReaderRef.current = reader;

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, scanError, activeControls) => {
            if (result?.getText) {
              const scannedValue = result.getText();
              if (scannedValue) {
                activeControls.stop();
                openMaterialByQrValue(scannedValue);
              }
            }
          }
        );
        scannerControlsRef.current = controls;
      } catch (cameraError) {
        let cameraMessage = "No se pudo abrir la camara en vivo.";
        if (cameraError?.name === "NotAllowedError") {
          cameraMessage = "Permiso de camara denegado. Habilitalo en el navegador.";
        } else if (cameraError?.name === "NotFoundError") {
          cameraMessage = "No se detecto camara en este dispositivo.";
        } else if (cameraError?.name === "NotReadableError") {
          cameraMessage = "La camara esta en uso por otra aplicacion.";
        } else if (cameraError?.name === "SecurityError") {
          cameraMessage = "El navegador bloqueo la camara para esta pagina.";
        }
        setScannerError(`${cameraMessage} Usa "Tomar foto del QR" o el campo manual.`);
        stopScanner();
      }
    };

    startScanner();
    return stopScanner;
  }, [scannerOpen]);

  const handleSubmitMovement = async (event) => {
    event.preventDefault();
    if (!materialId) return;

    if (!capturedQuantity || capturedQuantity <= 0) {
      setError("La cantidad debe ser mayor que cero");
      return;
    }
    if (captureUnitMode === "CUSTOM" && (!customFactor || customFactor <= 0)) {
      setError("Para unidad personalizada debes indicar un factor de conversión válido.");
      return;
    }
    if (captureUnitMode === "PURCHASE" && (!purchaseUomId || purchaseQuantity <= 0)) {
      setError("Este material no tiene conversión de unidad de compra configurada.");
      return;
    }

    if (!form.reason.trim()) {
      setError("Debe ingresar una razón del movimiento");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const inputUomId = captureUnitMode === "PURCHASE" ? purchaseUomId : baseUomId;
      await createPublicMaterialMovement(materialId, {
        movementType: form.movementType,
        quantity: convertedToBaseQty,
        inputQuantity: capturedQuantity,
        inputUomId: captureUnitMode === "CUSTOM" ? null : inputUomId,
        conversionFactorToBase: captureUnitMode === "CUSTOM" ? customFactor : null,
        reason: form.reason.trim(),
      });

      setForm((prev) => ({ ...prev, quantity: "", reason: "" }));
      setCustomFactorToBase("");
      await loadData();
    } catch (requestError) {
      setError(requestError.message || "No se pudo registrar el movimiento");
    } finally {
      setSubmitting(false);
    }
  };

  const resolveMaterialIdFromQrValue = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return trimmed;

    const match = trimmed.match(/materials-kardex\/(\d+)/i);
    return match ? match[1] : null;
  };

  const normalizeQrValue = (value) => {
    const rawValue = String(value || "").trim();
    if (!rawValue) return "";

    try {
      const parsed = new URL(rawValue);
      if (isLocalOrPrivateHost(parsed.hostname)) {
        const redirectBase =
          process.env.REACT_APP_QR_REDIRECT_BASE_URL || "https://core.fossilescorp.com";
        return `${redirectBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return rawValue;
    } catch (error) {
      return rawValue;
    }
  };

  const openMaterialByQrValue = async (value) => {
    const normalizedValue = normalizeQrValue(value);
    const resolvedId = resolveMaterialIdFromQrValue(normalizedValue);
    if (resolvedId) {
      setScannerOpen(false);
      navigate(`/admin/materials-kardex/${resolvedId}`);
      return;
    }

    const query = String(normalizedValue || "").trim();
    if (!query) {
      setScannerError("Ingresa ID, SKU o nombre para buscar");
      return;
    }

    setSearchingMaterial(true);
    setScannerError("");
    try {
      const foundMaterials = await searchPublicMaterials(query);
      setSearchResults(foundMaterials || []);

      if (!foundMaterials || foundMaterials.length === 0) {
        setScannerError("No se encontro material con ese dato");
        return;
      }

      if (foundMaterials.length === 1) {
        setScannerOpen(false);
        navigate(`/admin/materials-kardex/${foundMaterials[0].id}`);
      }
    } catch (requestError) {
      setScannerError(requestError.message || "No se pudo buscar el material");
    } finally {
      setSearchingMaterial(false);
    }
  };

  const handleImageUpload = async (file) => {
    if (!file || !materialId) return;

    setUploadingImage(true);
    setError("");
    try {
      const optimizedFile = await optimizeImageForUpload(file);
      const updatedMaterial = await uploadPublicMaterialImage(materialId, optimizedFile);
      setMaterial(updatedMaterial);
    } catch (requestError) {
      setError(requestError.message || "No se pudo subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  };

  const optimizeImageForUpload = async (file) => {
    if (!file.type?.startsWith("image/")) {
      throw new Error("El archivo debe ser una imagen");
    }

    // Si ya es liviana, no convertir.
    if (file.size <= 900 * 1024) {
      return file;
    }

    const imageDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageDataUrl;
    });

    const maxWidth = 1600;
    const scale = image.width > maxWidth ? maxWidth / image.width : 1;
    const targetWidth = Math.round(image.width * scale);
    const targetHeight = Math.round(image.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.82)
    );

    if (!blob) {
      throw new Error("No se pudo procesar la imagen");
    }

    return new File([blob], `${file.name.replace(/\.[^/.]+$/, "") || "material"}_opt.jpg`, {
      type: "image/jpeg",
    });
  };

  const handleQrImageDecode = async (file) => {
    if (!file) return;

    setScannerError("");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const imageUrl = URL.createObjectURL(file);
      const reader = new BrowserMultiFormatReader();

      let rawValue = "";
      if (typeof reader.decodeFromImageUrl === "function") {
        const result = await reader.decodeFromImageUrl(imageUrl);
        rawValue = result?.getText?.() || "";
      } else {
        const imageElement = document.createElement("img");
        imageElement.src = imageUrl;
        await new Promise((resolve, reject) => {
          imageElement.onload = resolve;
          imageElement.onerror = reject;
        });
        const result = await reader.decodeFromImageElement(imageElement);
        rawValue = result?.getText?.() || "";
      }

      URL.revokeObjectURL(imageUrl);

      if (!rawValue) {
        setScannerError("No se detecto QR en la imagen.");
        return;
      }

      await openMaterialByQrValue(rawValue);
    } catch (decodeError) {
      setScannerError("No se pudo leer el QR de la imagen.");
    }
  };

  return (
    <div className="content" style={{ maxWidth: "560px", margin: "0 auto", padding: "12px" }}>
      <Row>
        <Col xs="12">
          <Card>
            <CardHeader>
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <h5 className="mb-1">Kardex de Material</h5>
                  <small className="text-muted">Vista rápida para conteo y entrega</small>
                </div>
                <Button size="sm" color="info" onClick={() => setScannerOpen(true)}>
                  Escanear QR
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              {!materialId ? (
                <Card className="mb-0">
                  <CardBody>
                    <Alert color="info" className="mb-3">
                      Escanea un sticker o pega el contenido del QR para abrir el kardex del material.
                    </Alert>
                    <Button color="primary" block onClick={() => setScannerOpen(true)}>
                      Escanear QR
                    </Button>
                  </CardBody>
                </Card>
              ) : loading ? (
                <div className="text-center py-4">
                  <Spinner color="primary" />
                  <div className="mt-2">Cargando...</div>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="font-weight-bold">{material?.sku || inventory?.materialSku || "N/A"}</div>
                    <div>{material?.name || inventory?.materialName || "Material"}</div>
                  </div>

                  {material?.imageUrl ? (
                    <div className="mb-3 text-center">
                      <img
                        src={material.imageUrl}
                        alt={material?.name || "Material"}
                        style={{
                          width: "100%",
                          maxHeight: "220px",
                          objectFit: "contain",
                          borderRadius: "8px",
                          border: "1px solid #e9ecef",
                        }}
                      />
                    </div>
                  ) : null}

                  <Card className="mb-3">
                    <CardBody style={{ padding: "0.75rem" }}>
                      <strong className="d-block mb-1">
                        {material?.imageUrl ? "Cambiar foto del material" : "Este material no tiene foto"}
                      </strong>
                      <small className="text-muted d-block mb-2">
                        {material?.imageUrl
                          ? "Puedes reemplazarla tomando una nueva foto."
                          : "Puedes tomarla ahora desde el telefono para asociarla al material."}
                      </small>
                      <Input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={uploadingImage}
                        onChange={(event) => handleImageUpload(event.target.files?.[0])}
                      />
                      <small className="text-muted d-block mt-1">
                        Se optimiza automaticamente antes de subir.
                      </small>
                      {uploadingImage ? (
                        <small className="text-muted d-block mt-2">Subiendo imagen...</small>
                      ) : null}
                    </CardBody>
                  </Card>

                  <Card className="mb-3" body inverse color="dark">
                    <div className="d-flex justify-content-between align-items-center">
                      <span>Stock actual</span>
                      <h4 className="mb-0">{formatQuantity(inventory?.totalQuantity)} {movementUom}</h4>
                    </div>
                  </Card>
                  {material?.conversionText ? (
                    <Alert color="info" className="py-2">
                      <strong>Equivalencia:</strong> {material.conversionText}
                    </Alert>
                  ) : null}

                  <form onSubmit={handleSubmitMovement} className="mb-3">
                    <Row form>
                      <Col xs="12" className="mb-2">
                        <Label className="mb-1">Movimiento</Label>
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            color={form.movementType === "IN" ? "success" : "secondary"}
                            className="mr-2"
                            onClick={() => setForm((prev) => ({ ...prev, movementType: "IN" }))}
                          >
                            + Agregar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            color={form.movementType === "OUT" ? "danger" : "secondary"}
                            onClick={() => setForm((prev) => ({ ...prev, movementType: "OUT" }))}
                          >
                            - Quitar
                          </Button>
                        </div>
                      </Col>

                      <Col xs="12" className="mb-2">
                        <Label className="mb-1">Unidad de captura</Label>
                        <Input
                          type="select"
                          value={captureUnitMode}
                          onChange={(event) => setCaptureUnitMode(event.target.value)}
                          disabled={submitting}
                        >
                          <option value="BASE">{baseUomLabel}</option>
                          {purchaseUomId && purchaseQuantity > 0 && (
                            <option value="PURCHASE">
                              {purchaseUom} (1 = {formatQuantity(purchaseQuantity)} {baseUomLabel})
                            </option>
                          )}
                          <option value="CUSTOM">Otra unidad (factor manual)</option>
                        </Input>
                      </Col>

                      {captureUnitMode === "CUSTOM" && (
                        <Col xs="12" className="mb-2">
                          <Label className="mb-1">Factor a {baseUomLabel}</Label>
                          <Input
                            type="number"
                            min="0.000001"
                            step="0.000001"
                            value={customFactorToBase}
                            onChange={(event) => setCustomFactorToBase(event.target.value)}
                            placeholder={`1 unidad = ? ${baseUomLabel}`}
                            disabled={submitting}
                          />
                        </Col>
                      )}

                      <Col xs="12" className="mb-2">
                        <Label className="mb-1">
                          Cantidad en {captureUnitMode === "PURCHASE" ? purchaseUom : captureUnitMode === "CUSTOM" ? "unidad personalizada" : baseUomLabel}
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          value={form.quantity}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, quantity: event.target.value }))
                          }
                          placeholder="0.000"
                          disabled={submitting}
                        />
                        <small className="text-muted">
                          Se guardará como {formatQuantity(convertedToBaseQty || 0)} {baseUomLabel}.
                        </small>
                      </Col>

                      <Col xs="12" className="mb-2">
                        <Label className="mb-1">Razón</Label>
                        <Input
                          type="text"
                          value={form.reason}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, reason: event.target.value }))
                          }
                          placeholder="Conteo, entrega, ajuste..."
                          disabled={submitting}
                        />
                      </Col>

                      <Col xs="12">
                        <Button color="primary" block type="submit" disabled={submitting}>
                          {submitting ? "Guardando..." : "Registrar movimiento"}
                        </Button>
                      </Col>
                    </Row>
                  </form>

                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong>Movimientos recientes</strong>
                    <small className="text-muted">{kardex.length}</small>
                  </div>

                  {kardex.length === 0 ? (
                    <Alert color="light" className="mb-0">
                      No hay movimientos registrados.
                    </Alert>
                  ) : (
                    kardex.map((movement) => {
                      const movementMeta =
                        MOVEMENT_LABELS[movement.movementType] || {
                          text: movement.movementType || "Movimiento",
                          color: "secondary",
                        };

                      return (
                        <Card key={movement.id} className="mb-2">
                          <CardBody style={{ padding: "0.75rem" }}>
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <Badge color={movementMeta.color}>{movementMeta.text}</Badge>
                              <strong
                                className={
                                  Number(movement.quantity) >= 0 ? "text-success" : "text-danger"
                                }
                              >
                                {Number(movement.quantity) >= 0 ? "+" : ""}
                                {formatQuantity(movement.quantity)} {movementUom}
                              </strong>
                            </div>
                            <small className="text-muted d-block">
                              {formatDateTime(movement.movementDate)}
                            </small>
                            <small className="d-block">
                              Stock: {formatQuantity(movement.quantityBefore)} {"->"}{" "}
                              {formatQuantity(movement.quantityAfter)} {movementUom}
                            </small>
                            {movement.description ? (
                              <small className="d-block">{movement.description}</small>
                            ) : null}
                          </CardBody>
                        </Card>
                      );
                    })
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Modal isOpen={scannerOpen} toggle={() => setScannerOpen(false)}>
        <ModalHeader toggle={() => setScannerOpen(false)}>Escanear QR de material</ModalHeader>
        <ModalBody>
          {scannerError ? <Alert color="danger">{scannerError}</Alert> : null}
          <video
            ref={videoRef}
            muted
            playsInline
            style={{
              width: "100%",
              borderRadius: "8px",
              backgroundColor: "#111",
              marginBottom: "12px",
            }}
          />
          <Alert color="info" className="mb-2">
            Abre la camara del telefono y escanea el sticker. Si tu navegador no soporta escaneo directo,
            pega aqui el contenido del QR o la URL.
          </Alert>
          <Button
            color="secondary"
            size="sm"
            className="mb-3"
            onClick={() => qrImageInputRef.current?.click()}
          >
            Tomar foto del QR
          </Button>
          <input
            ref={qrImageInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(event) => handleQrImageDecode(event.target.files?.[0])}
          />
          <Label className="mb-1">Contenido del QR</Label>
          <Input
            type="text"
            value={manualQrValue}
            onChange={(event) => {
              setManualQrValue(event.target.value);
              setSearchResults([]);
              setScannerError("");
            }}
            placeholder="ID, SKU, nombre o URL"
          />
          {searchResults.length > 1 ? (
            <div className="mt-3">
              <small className="text-muted d-block mb-2">Selecciona un material:</small>
              {searchResults.slice(0, 8).map((result) => (
                <Button
                  key={result.id}
                  size="sm"
                  color="light"
                  className="mr-2 mb-2"
                  onClick={() => {
                    setScannerOpen(false);
                    navigate(`/admin/materials-kardex/${result.id}`);
                  }}
                >
                  {result.sku || "SIN-SKU"} - {result.name}
                </Button>
              ))}
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setScannerOpen(false)}>
            Cerrar
          </Button>
          <Button
            color="primary"
            onClick={() => openMaterialByQrValue(manualQrValue)}
            disabled={searchingMaterial}
          >
            {searchingMaterial ? "Buscando..." : "Abrir material"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default PublicMaterialKardexMobile;
