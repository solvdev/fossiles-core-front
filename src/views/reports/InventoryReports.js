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
      const locationById = new Map(kiosks.map((kiosk) => [Number(kiosk.id), kiosk]));

      // Una sola hoja con todos los kioskos: filtrable en Excel por Kiosko/Código/Producto/etc.
      const data = (rows || []).map((row) => {
        const location = locationById.get(Number(row.locationId));
        return {
          Kiosko: location?.name || row.locationName || "",
          "Código kiosko": location?.code || row.locationCode || "",
          Código: row.productCode || "",
          Producto: row.productName || "",
          Color: row.colorName || "",
          Tallas: formatSizes(row.sizes),
          Herraje: row.hardwareCondition || "",
          "Stock actual": Number(row.currentStock || 0),
          "Stock mínimo": Number(row.minimumStock || 0),
          Estado: row.lowStock ? "Stock bajo" : "Disponible",
          "Última actualización": row.lastUpdatedAt || "",
        };
      });
      data.sort((left, right) => {
        const byKiosk = String(left.Kiosko).localeCompare(String(right.Kiosko), "es");
        if (byKiosk !== 0) return byKiosk;
        const byCode = String(left.Código).localeCompare(String(right.Código), "es");
        if (byCode !== 0) return byCode;
        return String(left.Color).localeCompare(String(right.Color), "es");
      });

      const totalStock = data.reduce((total, item) => total + item["Stock actual"], 0);
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.sheet_add_aoa(
        worksheet,
        [["", "", "", "", "", "", "TOTAL", totalStock, "", "", ""]],
        { origin: `A${data.length + 2}` }
      );
      worksheet["!cols"] = [
        { wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 34 }, { wch: 20 },
        { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, "Existencias");
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
                Selecciona los kioskos que deseas incluir. El Excel sale en una sola hoja con columna de kiosko
                para filtrar. Incluye stock &gt; 0 y ceros con historial; excluye filas fantasma (nunca tuvieron
                movimiento). Los kioskos en modo piloto no aparecen en este reporte.
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

