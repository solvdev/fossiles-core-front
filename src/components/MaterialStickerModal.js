import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
  Alert,
  Input,
  Label,
  FormGroup,
  ButtonGroup,
} from "reactstrap";
import { getMaterialStickerData } from "services/materialService";
import { showError, showSuccess } from "utils/notificationHelper";

/* =========================
   QR Code Preview (HTML)
========================= */
const QRCode = ({ value, size = 150 }) => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    value
  )}`;
  return (
    <img
      src={qrUrl}
      alt="QR Code"
      style={{ width: size, height: size }}
    />
  );
};

function MaterialStickerModal({ isOpen, toggle, materialId }) {
  const STICKER_WIDTH = 460;
  const QR_SIZE = 180;
  const [stickerData, setStickerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [printMode, setPrintMode] = useState("normal"); // normal | zebra
  const [zebraReady, setZebraReady] = useState(false);

  /* =========================
     Load data
  ========================= */
  useEffect(() => {
    if (isOpen && materialId) {
      loadStickerData();
      checkZebraBrowserPrint();
    } else {
      setStickerData(null);
      setError("");
    }
  }, [isOpen, materialId]);

  const loadStickerData = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getMaterialStickerData(materialId);
      const fallbackQrUrl = `${window.location.origin}/admin/materials-kardex/${data.materialId}`;
      let qrUrl = data.qrData || fallbackQrUrl;

      // Si el backend devuelve localhost, usar el origen actual para que funcione en teléfono.
      try {
        const parsedUrl = new URL(qrUrl);
        if (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1") {
          qrUrl = `${window.location.origin}${parsedUrl.pathname}`;
        }
      } catch (e) {
        qrUrl = fallbackQrUrl;
      }

      setStickerData({ ...data, qrUrl });
    } catch (err) {
      const msg = err.message || "Error al cargar datos del sticker";
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     Zebra Browser Print check
  ========================= */
  const checkZebraBrowserPrint = () => {
    if (window.BrowserPrint) {
      window.BrowserPrint.getDefaultDevice(
        "printer",
        () => setZebraReady(true),
        () => setZebraReady(false)
      );
    } else {
      setZebraReady(false);
    }
  };

  /* =========================
     ZPL Generator
  ========================= */
  const generateZPL = () => {
    if (!stickerData) return "";

    const sku = stickerData.sku || "N/A";
    const name = stickerData.name || "Sin nombre";
    const qrData = stickerData.qrUrl || "";

    const cleanName =
      name.length > 30 ? name.substring(0, 27) + "..." : name;

    return `
^XA
^PW600
^LL400
^FO40,30^A0N,40,40^FD${sku}^FS
^FO40,80^A0N,25,25^FD${cleanName}^FS
^FO40,120^BQN,2,5^FDLA,${qrData}^FS
^FO40,300^A0N,20,20^FDEscanee para ver kardex^FS
^XZ
`;
  };

  /* =========================
     Print handlers
  ========================= */
  const handlePrint = () => {
    if (printMode === "zebra") {
      handleZebraPrint();
    } else {
      handleNormalPrint();
    }
  };

  const handleNormalPrint = () => {
    if (!stickerData) return;

    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sticker ${stickerData.sku || stickerData.materialId}</title>
          <style>
            @media print {
              @page {
                margin: 8mm;
              }
              body {
                margin: 0;
                padding: 0;
                display: flex;
                justify-content: center;
                align-items: flex-start;
              }
            }
            body {
              font-family: Arial, sans-serif;
              background: #fff;
              padding: 16px;
            }
            .sticker {
              width: ${STICKER_WIDTH}px;
              min-height: ${STICKER_WIDTH}px;
              border: 2px solid #000;
              padding: 24px;
              text-align: center;
              box-sizing: border-box;
            }
            .sku {
              font-size: 36px;
              margin: 8px 0 16px;
              font-weight: 600;
            }
            .name {
              font-size: 22px;
              margin: 0 0 20px;
            }
            .qr {
              width: ${QR_SIZE}px;
              height: ${QR_SIZE}px;
            }
            .footer {
              font-size: 14px;
              margin-top: 16px;
            }
          </style>
        </head>
        <body>
          <div class="sticker">
            <div class="sku">${stickerData.sku || ""}</div>
            <div class="name">${stickerData.name || ""}</div>
            <img
              class="qr"
              src="https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(stickerData.qrUrl || "")}"
              alt="QR Code"
            />
            <div class="footer">Escanee para ver kardex</div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  const handleZebraPrint = () => {
    if (!window.BrowserPrint) {
      showError(
        "Zebra Browser Print no está instalado. Instálalo para imprimir."
      );
      return;
    }

    const zpl = generateZPL();

    window.BrowserPrint.getDefaultDevice(
      "printer",
      (printer) => {
        printer.send(
          zpl,
          () => showSuccess("Etiqueta enviada a la impresora Zebra"),
          () => showError("Error al enviar a la impresora Zebra")
        );
      },
      () => showError("No se detectó ninguna impresora Zebra")
    );
  };

  const copyZPLToClipboard = () => {
    navigator.clipboard
      .writeText(generateZPL())
      .then(() => showSuccess("ZPL copiado al portapapeles"))
      .catch(() => showError("No se pudo copiar el ZPL"));
  };

  const downloadZPLFile = () => {
    const blob = new Blob([generateZPL()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `sticker_${stickerData.sku || stickerData.materialId}.zpl`;
    a.click();
    URL.revokeObjectURL(url);

    showSuccess("Archivo ZPL descargado");
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        Imprimir Sticker de Material
      </ModalHeader>

      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}

        {loading ? (
          <div className="text-center py-5">
            <Spinner color="primary" />
            <p className="mt-2">Cargando datos...</p>
          </div>
        ) : (
          stickerData && (
            <>
              <FormGroup>
                <Label>Modo de impresión</Label>
                <ButtonGroup>
                  <Button
                    size="sm"
                    color={printMode === "normal" ? "primary" : "secondary"}
                    onClick={() => setPrintMode("normal")}
                  >
                    Normal
                  </Button>
                  <Button
                    size="sm"
                    color={printMode === "zebra" ? "primary" : "secondary"}
                    onClick={() => setPrintMode("zebra")}
                  >
                    Zebra (ZPL)
                  </Button>
                </ButtonGroup>
              </FormGroup>

              {printMode === "zebra" && !zebraReady && (
                <Alert color="warning">
                  Zebra Browser Print no detectado.  
                  Descarga e instala el servicio para imprimir.
                </Alert>
              )}

              <div
                id="sticker-content"
                style={{
                  border: "2px solid #000",
                  padding: 24,
                  textAlign: "center",
                  backgroundColor: "#fff",
                  width: STICKER_WIDTH,
                  minHeight: STICKER_WIDTH,
                  margin: "0 auto",
                  boxSizing: "border-box",
                }}
              >
                <h4>{stickerData.sku}</h4>
                <p>{stickerData.name}</p>
                <QRCode value={stickerData.qrUrl} size={QR_SIZE} />
                <div style={{ fontSize: 10, marginTop: 10 }}>
                  Escanee para ver kardex
                </div>
              </div>
            </>
          )
        )}
      </ModalBody>

      <ModalFooter>
        <Button color="secondary" onClick={toggle}>
          Cerrar
        </Button>

        {stickerData && printMode === "zebra" && (
          <>
            <Button color="info" onClick={copyZPLToClipboard}>
              Copiar ZPL
            </Button>
            <Button color="success" onClick={downloadZPLFile}>
              Descargar ZPL
            </Button>
          </>
        )}

        {stickerData && (
          <Button color="primary" onClick={handlePrint}>
            {printMode === "zebra" ? "Imprimir Zebra" : "Imprimir"}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

export default MaterialStickerModal;
