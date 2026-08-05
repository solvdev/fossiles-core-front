import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Row,
  Spinner,
  Table,
  Label,
} from "reactstrap";
import Select from "react-select";
import * as XLSX from "xlsx";
import { getLocations } from "services/locationService";
import { getKioscoStockReport } from "services/kioscoInventoryService";
import { showError } from "utils/notificationHelper";

const isKioskLocation = (location) => {
  const text = `${location?.categoria || ""} ${location?.name || ""} ${location?.code || ""}`.toUpperCase();
  return text.includes("KIOS") || String(location?.code || "").toUpperCase().startsWith("K");
};

const formatSizes = (sizes) =>
  Object.entries(sizes || {})
    .sort(([left], [right]) => String(left).localeCompare(String(right), undefined, { numeric: true }))
    .map(([size, quantity]) => `${size}: ${quantity}`)
    .join(" · ");

const toSheetName = (location) => {
  const raw = `${location.code || ""} ${location.name || "Kiosko"}`.trim();
  return raw.slice(0, 31) || "Kiosko";
};

function InventoryReports() {
  const [kiosks, setKiosks] = useState([]);
  const [selectedKioskIds, setSelectedKioskIds] = useState([]);
  const [loadingKiosks, setLoadingKiosks] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadKiosks = async () => {
      try {
        setLoadingKiosks(true);
        const locations = await getLocations();
        if (cancelled) return;
        const availableKiosks = (locations || [])
          .filter((location) => isKioskLocation(location) && !location.posTestMode)
          .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "es"));
        setKiosks(availableKiosks);
        setSelectedKioskIds(availableKiosks.map((location) => location.id));
      } catch (err) {
        if (!cancelled) {
          showError(err.message || "No se pudieron cargar los kioskos.");
        }
      } finally {
        if (!cancelled) setLoadingKiosks(false);
      }
    };
    void loadKiosks();
    return () => {
      cancelled = true;
    };
  }, []);

  const kioskOptions = useMemo(
    () =>
      kiosks.map((kiosk) => ({
        value: kiosk.id,
        label: kiosk.code ? `${kiosk.name} (${kiosk.code})` : kiosk.name,
      })),
    [kiosks]
  );

  const exportExcel = async () => {
    if (!selectedKioskIds.length) {
      showError("Selecciona al menos un kiosko.");
      return;
    }
    try {
      setExporting(true);
      const rows = await getKioscoStockReport(selectedKioskIds);
      const rowsByLocation = new Map();
      (rows || []).forEach((row) => {
        const locationRows = rowsByLocation.get(row.locationId) || [];
        locationRows.push(row);
        rowsByLocation.set(row.locationId, locationRows);
      });

      const workbook = XLSX.utils.book_new();
      const summaryRows = [];
      selectedKioskIds.forEach((locationId) => {
        const location = kiosks.find((item) => Number(item.id) === Number(locationId));
        const locationRows = rowsByLocation.get(locationId) || [];
        const data = locationRows.map((row) => ({
          Código: row.productCode || "",
          Producto: row.productName || "",
          Color: row.colorName || "",
          Tallas: formatSizes(row.sizes),
          Herraje: row.hardwareCondition || "",
          "Stock actual": Number(row.currentStock || 0),
          "Stock mínimo": Number(row.minimumStock || 0),
          Estado: row.lowStock ? "Stock bajo" : "Disponible",
          "Última actualización": row.lastUpdatedAt || "",
        }));
        const totalStock = data.reduce((total, item) => total + item["Stock actual"], 0);
        summaryRows.push({
          Kiosko: location?.name || locationRows[0]?.locationName || String(locationId),
          Código: location?.code || locationRows[0]?.locationCode || "",
          "Líneas de stock": data.length,
          "Unidades totales": totalStock,
        });

        const worksheet = XLSX.utils.aoa_to_sheet([
          [`Existencias - ${location?.name || locationRows[0]?.locationName || "Kiosko"}`],
          [],
        ]);
        XLSX.utils.sheet_add_json(worksheet, data, { origin: "A3" });
        XLSX.utils.sheet_add_aoa(worksheet, [["TOTAL", "", "", "", "", totalStock]], {
          origin: `A${data.length + 4}`,
        });
        worksheet["!cols"] = [
          { wch: 16 }, { wch: 34 }, { wch: 20 }, { wch: 32 }, { wch: 12 },
          { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, toSheetName(location || locationRows[0] || {}));
      });

      if (selectedKioskIds.length > 1) {
        const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
        summarySheet["!cols"] = [{ wch: 32 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");
      }
      XLSX.writeFile(workbook, "existencias-kioscos.xlsx");
    } catch (err) {
      showError(err.message || "No se pudo generar el reporte de existencias.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Existencias por kiosco</CardTitle>
            </CardHeader>
            <CardBody>
              <Alert color="info">
                Selecciona los kioskos que deseas incluir. Los kioskos en modo piloto no aparecen en este reporte.
              </Alert>
              <Row>
                <Col md="8">
                  <Label>Kioskos</Label>
                  <Select
                    isMulti
                    isSearchable
                    isClearable
                    isLoading={loadingKiosks}
                    options={kioskOptions}
                    value={kioskOptions.filter((option) => selectedKioskIds.includes(option.value))}
                    onChange={(selected) => setSelectedKioskIds((selected || []).map((option) => option.value))}
                    placeholder="Selecciona kioskos…"
                  />
                </Col>
                <Col md="4" className="d-flex align-items-end">
                  <Button color="primary" className="btn-round" onClick={() => void exportExcel()} disabled={exporting}>
                    {exporting ? <Spinner size="sm" className="mr-2" /> : <i className="nc-icon nc-cloud-download-93 mr-2" />}
                    Descargar Excel
                  </Button>
                </Col>
              </Row>
              <Table responsive className="mt-4 mb-0">
                <thead className="text-primary">
                  <tr>
                    <th>Kioskos disponibles</th>
                    <th>Kioskos seleccionados</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{kioskOptions.length}</td>
                    <td>
                      <Badge color="primary">{selectedKioskIds.length}</Badge>
                    </td>
                  </tr>
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default InventoryReports;

