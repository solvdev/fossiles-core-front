import React, { useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Badge,
  Input,
  Label,
} from "reactstrap";

// Helper function from Paper Dashboard
const hexToRGB = (hex, alpha) => {
  var r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);

  if (alpha) {
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  } else {
    return "rgb(" + r + ", " + g + ", " + b + ")";
  }
};

function SalesDashboard() {
  const [viewMode, setViewMode] = useState("general"); // "general" o "kioskos"
  const [selectedKiosk, setSelectedKiosk] = useState("all"); // Solo cuando viewMode es "kioskos"

  // Datos generales (todos los canales: Kioskos + Vendedor + Online)
  const generalSalesData = {
    monthlySales: { amount: 267000, growth: 15 },
    dailySales: 22000,
    topProducts: [
      { name: "Cincho Cafe", units: 300 },
      { name: "Billetera Negra", units: 120 },
      { name: "Bolsa Cafe", units: 87 },
    ],
    // Productos más vendidos trimestrales
    topProductsQuarterly: {
      labels: ["Q1", "Q2", "Q3", "Q4"],
      products: [
        { name: "Cincho Cafe", data: [850, 920, 880, 950] },
        { name: "Billetera Negra", data: [320, 380, 350, 400] },
        { name: "Bolsa Cafe", data: [250, 280, 270, 290] },
        { name: "Cinturón", data: [180, 200, 190, 210] },
        { name: "Billetera Marrón", data: [120, 140, 130, 150] },
      ],
    },
    monthlyGrowth: {
      labels: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio"],
      data2023: [45000, 27000, 30000, 30000, 35000, 40000],
      data2024: [37000, 30000, 55000, 35000, 40000, 45000],
      data2025: [85000, 52000, 75000, 67000, 80000, 90000],
    },
    // Ventas por canal
    channelSales: {
      kioscos: { amount: 112000, growth: 12, daily: 7500 },
      vendedor: { amount: 98000, growth: 8, daily: 6500 },
      online: { amount: 57000, growth: 25, daily: 3800 },
    },
  };

  // Datos de kioskos (solo ventas de kioskos)
  const kiosksSalesData = {
    all: { // Todos los kioskos juntos
      monthlySales: { amount: 112000, growth: 12 },
      dailySales: 7500,
      topProducts: [
        { name: "Cincho Cafe", units: 150 },
        { name: "Billetera Negra", units: 60 },
        { name: "Bolsa Cafe", units: 45 },
      ],
      topProductsQuarterly: {
        labels: ["Q1", "Q2", "Q3", "Q4"],
        products: [
          { name: "Cincho Cafe", data: [450, 510, 480, 540] },
          { name: "Billetera Negra", data: [180, 200, 190, 210] },
          { name: "Bolsa Cafe", data: [135, 150, 145, 160] },
        ],
      },
      monthlyGrowth: {
        labels: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio"],
        data2023: [30000, 20000, 22000, 21000, 23000, 25000],
        data2024: [32000, 21000, 24000, 22000, 24000, 26000],
        data2025: [45000, 35000, 40000, 38000, 42000, 48000],
      },
      topKiosks: [
        { name: "Miraflores", sales: 45000 },
        { name: "Xela", sales: 32000 },
        { name: "Escuintla", sales: 37000 },
      ],
    },
    "1": { // Miraflores
      monthlySales: { amount: 45000, growth: 15 },
      dailySales: 3000,
      topProducts: [
        { name: "Cincho Cafe", units: 60 },
        { name: "Billetera Negra", units: 25 },
        { name: "Bolsa Cafe", units: 18 },
      ],
      topProductsQuarterly: {
        labels: ["Q1", "Q2", "Q3", "Q4"],
        products: [
          { name: "Cincho Cafe", data: [180, 200, 190, 210] },
          { name: "Billetera Negra", data: [75, 85, 80, 90] },
          { name: "Bolsa Cafe", data: [55, 60, 58, 65] },
        ],
      },
      monthlyGrowth: {
        labels: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio"],
        data2023: [12000, 9000, 10000, 9500, 10500, 11000],
        data2024: [13000, 10000, 11000, 10500, 11500, 12000],
        data2025: [18000, 14000, 16000, 15000, 17000, 19000],
      },
    },
    "2": { // Xela
      monthlySales: { amount: 32000, growth: 10 },
      dailySales: 2100,
      topProducts: [
        { name: "Cincho Cafe", units: 45 },
        { name: "Billetera Negra", units: 18 },
        { name: "Bolsa Cafe", units: 12 },
      ],
      topProductsQuarterly: {
        labels: ["Q1", "Q2", "Q3", "Q4"],
        products: [
          { name: "Cincho Cafe", data: [130, 150, 140, 160] },
          { name: "Billetera Negra", data: [55, 60, 58, 65] },
          { name: "Bolsa Cafe", data: [35, 40, 38, 42] },
        ],
      },
      monthlyGrowth: {
        labels: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio"],
        data2023: [9000, 7000, 8000, 7500, 8500, 9000],
        data2024: [10000, 8000, 9000, 8500, 9500, 10000],
        data2025: [14000, 11000, 13000, 12000, 14000, 15000],
      },
    },
    "3": { // Escuintla
      monthlySales: { amount: 37000, growth: 8 },
      dailySales: 2400,
      topProducts: [
        { name: "Cincho Cafe", units: 45 },
        { name: "Billetera Negra", units: 17 },
        { name: "Bolsa Cafe", units: 15 },
      ],
      topProductsQuarterly: {
        labels: ["Q1", "Q2", "Q3", "Q4"],
        products: [
          { name: "Cincho Cafe", data: [140, 160, 150, 170] },
          { name: "Billetera Negra", data: [50, 55, 52, 58] },
          { name: "Bolsa Cafe", data: [45, 50, 48, 52] },
        ],
      },
      monthlyGrowth: {
        labels: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio"],
        data2023: [9000, 7000, 8000, 7500, 8500, 9000],
        data2024: [9000, 8000, 9000, 8500, 9500, 10000],
        data2025: [13000, 10000, 12000, 11000, 13000, 14000],
      },
    },
  };

  // Obtener datos según modo de vista
  const getCurrentData = () => {
    if (viewMode === "general") {
      return generalSalesData;
    } else {
      // Modo kioskos
      return kiosksSalesData[selectedKiosk] || kiosksSalesData.all;
    }
  };

  const currentData = getCurrentData();

  // Gráfica de crecimiento por mes (con estilos avanzados de la plantilla)
  const getGrowthChartData = () => {
    const data = currentData.monthlyGrowth;
    return {
      labels: data.labels,
      datasets: [
        {
          label: "2023",
          data: data.data2023,
          borderColor: "#6bd098",
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          borderWidth: 3,
          tension: 0.4,
        },
        {
          label: "2024",
          data: data.data2024,
          borderColor: "#fcc468",
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          borderWidth: 3,
          tension: 0.4,
        },
        {
          label: "2025",
          data: data.data2025,
          borderColor: "#2CA8FF",
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          borderWidth: 3,
          tension: 0.4,
        },
      ],
    };
  };

  const growthChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top",
      },
      tooltips: {
        enabled: false,
      },
    },
    scales: {
      y: {
        ticks: {
          color: "#9f9f9f",
          beginAtZero: false,
          maxTicksLimit: 5,
          callback: function (value) {
            return value.toLocaleString();
          },
        },
        grid: {
          drawBorder: false,
          display: false,
        },
      },
      x: {
        grid: {
          drawBorder: false,
          display: false,
        },
        ticks: {
          padding: 20,
          color: "#9f9f9f",
        },
      },
    },
  };

  // Gráfica de ventas por canal (solo para vista general) - Estilo avanzado
  const getChannelChartData = () => {
    if (viewMode !== "general") return null;
    return {
      labels: ["Kioscos", "Vendedor", "En Linea"],
      datasets: [
        {
          label: "Ventas",
          data: [
            generalSalesData.channelSales.kioscos.amount,
            generalSalesData.channelSales.vendedor.amount,
            generalSalesData.channelSales.online.amount,
          ],
          borderColor: "#6bd098",
          fill: true,
          backgroundColor: "#6bd098",
          hoverBorderColor: "#6bd098",
          borderWidth: 8,
          barPercentage: 0.4,
        },
      ],
    };
  };

  const channelChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltips: {
        tooltipFillColor: "rgba(0,0,0,0.5)",
        tooltipFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
        tooltipFontSize: 14,
        tooltipFontStyle: "normal",
        tooltipFontColor: "#fff",
        tooltipTitleFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
        tooltipTitleFontSize: 14,
        tooltipTitleFontStyle: "bold",
        tooltipTitleFontColor: "#fff",
        tooltipYPadding: 6,
        tooltipXPadding: 6,
        tooltipCaretSize: 8,
        tooltipCornerRadius: 6,
        tooltipXOffset: 10,
      },
    },
    scales: {
      y: {
        ticks: {
          color: "#9f9f9f",
          beginAtZero: true,
          maxTicksLimit: 5,
          padding: 20,
          callback: function (value) {
            return value.toLocaleString();
          },
        },
        grid: {
          zeroLineColor: "transparent",
          display: true,
          drawBorder: false,
          color: "#9f9f9f",
        },
      },
      x: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          padding: 20,
          color: "#9f9f9f",
        },
      },
    },
  };

  // Gráfica de mejores kioscos (solo para vista de kioskos - todos) - Estilo avanzado
  const getKioskChartData = () => {
    if (viewMode !== "kioskos" || selectedKiosk !== "all") return null;
    return {
      labels: kiosksSalesData.all.topKiosks.map(k => k.name),
      datasets: [
        {
          label: "Ventas",
          data: kiosksSalesData.all.topKiosks.map(k => k.sales),
          borderColor: "#4cbdd7",
          fill: true,
          backgroundColor: "#4cbdd7",
          hoverBorderColor: "#4cbdd7",
          borderWidth: 8,
          barPercentage: 0.4,
        },
      ],
    };
  };

  const kioskChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltips: {
        tooltipFillColor: "rgba(0,0,0,0.5)",
        tooltipFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
        tooltipFontSize: 14,
        tooltipFontStyle: "normal",
        tooltipFontColor: "#fff",
        tooltipTitleFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
        tooltipTitleFontSize: 14,
        tooltipTitleFontStyle: "bold",
        tooltipTitleFontColor: "#fff",
        tooltipYPadding: 6,
        tooltipXPadding: 6,
        tooltipCaretSize: 8,
        tooltipCornerRadius: 6,
        tooltipXOffset: 10,
      },
    },
    scales: {
      y: {
        ticks: {
          color: "#9f9f9f",
          beginAtZero: true,
          maxTicksLimit: 5,
          padding: 20,
          callback: function (value) {
            return value.toLocaleString();
          },
        },
        grid: {
          zeroLineColor: "transparent",
          display: true,
          drawBorder: false,
          color: "#9f9f9f",
        },
      },
      x: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          padding: 20,
          color: "#9f9f9f",
        },
      },
    },
  };

  // Gráfica de productos más vendidos (trimestral) - Estilo avanzado
  const getProductsChartData = () => {
    const quarterlyData = currentData.topProductsQuarterly || generalSalesData.topProductsQuarterly;
    const colors = [
      "#6bd098",
      "#fcc468",
      "#4cbdd7",
      "#ef8156",
      "#2CA8FF",
    ];

    return {
      labels: quarterlyData.labels,
      datasets: quarterlyData.products.map((product, idx) => ({
        label: product.name,
        data: product.data,
        borderColor: colors[idx % colors.length],
        fill: true,
        backgroundColor: colors[idx % colors.length],
        hoverBorderColor: colors[idx % colors.length],
        borderWidth: 8,
        barPercentage: 0.4,
      })),
    };
  };

  const productsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top",
      },
      tooltips: {
        tooltipFillColor: "rgba(0,0,0,0.5)",
        tooltipFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
        tooltipFontSize: 14,
        tooltipFontStyle: "normal",
        tooltipFontColor: "#fff",
        tooltipTitleFontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
        tooltipTitleFontSize: 14,
        tooltipTitleFontStyle: "bold",
        tooltipTitleFontColor: "#fff",
        tooltipYPadding: 6,
        tooltipXPadding: 6,
        tooltipCaretSize: 8,
        tooltipCornerRadius: 6,
        tooltipXOffset: 10,
      },
    },
    scales: {
      y: {
        ticks: {
          color: "#9f9f9f",
          beginAtZero: true,
          maxTicksLimit: 5,
          padding: 20,
        },
        grid: {
          zeroLineColor: "transparent",
          display: true,
          drawBorder: false,
          color: "#9f9f9f",
        },
      },
      x: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          padding: 20,
          color: "#9f9f9f",
        },
      },
    },
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          {/* Header con selector de vista */}
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Ventas</CardTitle>
                </Col>
                <Col md="3">
                  <Label>Vista</Label>
                  <Input
                    type="select"
                    value={viewMode}
                    onChange={(e) => {
                      setViewMode(e.target.value);
                      if (e.target.value === "general") {
                        setSelectedKiosk("all");
                      }
                    }}
                  >
                    <option value="general">General (Todos los Canales)</option>
                    <option value="kioskos">Kioskos</option>
                  </Input>
                </Col>
                {viewMode === "kioskos" && (
                  <Col md="3">
                    <Label>Filtrar por Kiosko</Label>
                    <Input
                      type="select"
                      value={selectedKiosk}
                      onChange={(e) => setSelectedKiosk(e.target.value)}
                    >
                      <option value="all">Todos los Kioskos</option>
                      <option value="1">Miraflores</option>
                      <option value="2">Xela</option>
                      <option value="3">Escuintla</option>
                    </Input>
                  </Col>
                )}
              </Row>
            </CardHeader>
          </Card>

          {/* Cards de Ventas por Canal (solo en vista general) */}
          {viewMode === "general" && (
            <Row className="mt-3">
              <Col md="4">
                <Card>
                  <CardBody>
                    <h6>Ventas por Kioskos</h6>
                    <h3>Q. {generalSalesData.channelSales.kioscos.amount.toLocaleString()}</h3>
                    <Badge color="success">(+{generalSalesData.channelSales.kioscos.growth}%)</Badge>
                    <div className="mt-2">
                      <small className="text-muted">Hoy: Q. {generalSalesData.channelSales.kioscos.daily.toLocaleString()}</small>
                    </div>
                  </CardBody>
                </Card>
              </Col>
              <Col md="4">
                <Card>
                  <CardBody>
                    <h6>Ventas por Vendedor</h6>
                    <h3>Q. {generalSalesData.channelSales.vendedor.amount.toLocaleString()}</h3>
                    <Badge color="success">(+{generalSalesData.channelSales.vendedor.growth}%)</Badge>
                    <div className="mt-2">
                      <small className="text-muted">Hoy: Q. {generalSalesData.channelSales.vendedor.daily.toLocaleString()}</small>
                    </div>
                  </CardBody>
                </Card>
              </Col>
              <Col md="4">
                <Card>
                  <CardBody>
                    <h6>Ventas Online</h6>
                    <h3>Q. {generalSalesData.channelSales.online.amount.toLocaleString()}</h3>
                    <Badge color="success">(+{generalSalesData.channelSales.online.growth}%)</Badge>
                    <div className="mt-2">
                      <small className="text-muted">Hoy: Q. {generalSalesData.channelSales.online.daily.toLocaleString()}</small>
                    </div>
                  </CardBody>
                </Card>
              </Col>
            </Row>
          )}

          {/* KPIs Principales */}
          <Row className="mt-3">
            <Col md="4">
              <Card>
                <CardBody>
                  <h6>Ventas del Mes</h6>
                  <h3>Q. {currentData.monthlySales.amount.toLocaleString()}</h3>
                  <Badge color="success">(+{currentData.monthlySales.growth}%)</Badge>
                </CardBody>
              </Card>
            </Col>
            <Col md="4">
              <Card>
                <CardBody>
                  <h6>Ventas del Día</h6>
                  <h3>Q. {currentData.dailySales.toLocaleString()}</h3>
                </CardBody>
              </Card>
            </Col>
            <Col md="4">
              <Card>
                <CardHeader>
                  <CardTitle tag="h6">Productos más vendidos</CardTitle>
                </CardHeader>
                <CardBody>
                  <ul className="list-unstyled">
                    {currentData.topProducts.map((product, idx) => (
                      <li key={idx} className="mb-2">
                        <strong>{product.name}</strong> ({product.units} uds)
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </Col>
          </Row>

          {/* Gráficas */}
          <Row className="mt-3">
            <Col md={viewMode === "general" ? "4" : viewMode === "kioskos" && selectedKiosk === "all" ? "4" : "6"}>
              <Card>
                <CardHeader>
                  <CardTitle tag="h5">Crecimiento por mes</CardTitle>
                </CardHeader>
                <CardBody>
                  <div style={{ height: "300px" }}>
                    <Line data={getGrowthChartData()} options={growthChartOptions} />
                  </div>
                </CardBody>
              </Card>
            </Col>
            {viewMode === "general" && (
              <Col md="4">
                <Card>
                  <CardHeader>
                    <CardTitle tag="h5">Ventas por canal en el mes</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <div style={{ height: "300px" }}>
                      <Bar data={getChannelChartData()} options={channelChartOptions} />
                    </div>
                  </CardBody>
                </Card>
              </Col>
            )}
            {viewMode === "kioskos" && selectedKiosk === "all" && (
              <Col md="4">
                <Card>
                  <CardHeader>
                    <CardTitle tag="h5">Mejores Kioscos en ventas</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <div style={{ height: "300px" }}>
                      <Bar data={getKioskChartData()} options={kioskChartOptions} />
                    </div>
                  </CardBody>
                </Card>
              </Col>
            )}
            <Col md={viewMode === "general" ? "4" : viewMode === "kioskos" && selectedKiosk === "all" ? "4" : "6"}>
              <Card>
                <CardHeader>
                  <CardTitle tag="h5">Productos más vendidos (Trimestral)</CardTitle>
                </CardHeader>
                <CardBody>
                  <div style={{ height: "300px" }}>
                    <Bar data={getProductsChartData()} options={productsChartOptions} />
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>

          {/* Tabla de Ventas */}
          <Row className="mt-3">
            <Col md="12">
              <Card>
                <CardHeader>
                  <CardTitle tag="h5">
                    {viewMode === "general" 
                      ? "Ventas Totales (Todos los Canales)" 
                      : selectedKiosk === "all"
                      ? "Ventas de Todos los Kioskos"
                      : `Ventas del Kiosko ${selectedKiosk === "1" ? "Miraflores" : selectedKiosk === "2" ? "Xela" : "Escuintla"}`}
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Table responsive>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        {viewMode === "general" && <th>Canal</th>}
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Total</th>
                        {viewMode === "kioskos" && selectedKiosk === "all" && <th>Kiosko</th>}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>03/12/2025</td>
                        {viewMode === "general" && <td>Kiosko</td>}
                        <td>Cincho Cafe</td>
                        <td>10</td>
                        <td>Q 500.00</td>
                        {viewMode === "kioskos" && selectedKiosk === "all" && <td>Miraflores</td>}
                      </tr>
                      <tr>
                        <td colSpan={viewMode === "general" ? "5" : selectedKiosk === "all" ? "6" : "5"} className="text-center text-muted">
                          {viewMode === "general"
                            ? "Mostrando todas las ventas de todos los canales"
                            : selectedKiosk === "all"
                            ? "Mostrando ventas de todos los kioskos"
                            : `Mostrando ventas del kiosko seleccionado`}
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  );
}

export default SalesDashboard;
