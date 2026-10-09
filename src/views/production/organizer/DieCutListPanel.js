import React, { useMemo, useState } from "react";
import {
  Card, CardHeader, CardBody, Button, Table, Badge, Input,
  InputGroup, InputGroupAddon, InputGroupText, Alert, Spinner,
} from "reactstrap";
import {
  setTaskItemDieCut,
  setTaskItemDieCutPlannedDate,
  splitUncutDieCutItems,
  setTaskItemLeatherDelivery,
} from "services/taskService";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import DatePickerField from "components/common/DatePickerField";
import { exportRowsToCsv } from "utils/reportExportHelper";
import { formatDateGt } from "utils/dateTimeHelper";
import { contar, concordar } from "utils/textHelper";
import { showSuccess, showError } from "utils/notificationHelper";

/** La tarea y su orden, que es como se identifica una fila al hablar de ella. */
const refTarea = (tarea) =>
  `Tarea ${tarea.code || "-"}${tarea.productionOrderCode ? ` · ${tarea.productionOrderCode}` : ""}`;

/** Para que las confirmaciones digan qué producto es y no un genérico «este producto». */
const nombreProducto = (item) => {
  const code = (item.productCode || "").trim();
  const name = (item.productName || "").trim();
  if (code && name) return `${code} — ${name}`;
  return code || name || "este producto";
};

const CABECERAS_CSV = [
  { label: "Tarea", value: "tarea" },
  { label: "OP", value: "op" },
  { label: "Cliente", value: "cliente" },
  { label: "Cod. Producto", value: "codigo" },
  { label: "Producto", value: "producto" },
  { label: "Color", value: "color" },
  { label: "Cantidad", value: "cantidad" },
  { label: "Cuero", value: "cuero" },
  { label: "Troquelar el", value: "previsto" },
  { label: "Entrega OP", value: "entrega" },
];

/**
 * Lista por troquelar: el paso entre la tarea borrador y la cola del día.
 *
 * Se marca por producto y no por tarea, porque una orden puede bajar a mesa a medias: si de
 * cinco productos hay tres cortados, esos tres se producen y los otros dos esperan.
 *
 * El cuero va antes del troquel y el backend lo exige, por eso cada fila lo deja entregar
 * aquí mismo en vez de obligar a salir al Centro de Producción. Se acepta el de la tarea o
 * el del producto: la entrega se registra por orden y marca la tarea sin bajar a sus
 * productos.
 */
export default function DieCutListPanel({ tareas, loading, onReload }) {
  const [trabajando, setTrabajando] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  // "todas" | "sinCuero" | "conCuero" | "aMedias" | "conFecha"
  const [filtro, setFiltro] = useState("todas");

  /**
   * Las tareas que pasan el buscador y el filtro rápido.
   *
   * Se filtra por TAREA y no por producto suelto: la pantalla se marca por producto pero se
   * trabaja por tarea —se separa, se ve el estado, se entrega el cuero de la orden—, así que
   * partir una tarea por la mitad al buscar dejaría a la vista un trozo sin su contexto. Una
   * tarea entra si alguno de sus productos coincide.
   */
  const tareasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (tareas || []).filter((t) => {
      const items = t.items || [];
      if (q) {
        const enTarea = [t.code, t.productionOrderCode, t.customerName]
          .some((v) => (v || "").toLowerCase().includes(q));
        const enProductos = items.some((i) =>
          [i.productCode, i.productName, i.colorName]
            .some((v) => (v || "").toLowerCase().includes(q)));
        if (!enTarea && !enProductos) return false;
      }
      if (filtro === "sinCuero") {
        return items.some((i) => !i.dieCutReady && !i.leatherDelivered && !t.leatherDelivered);
      }
      if (filtro === "conCuero") {
        return items.some((i) => !i.dieCutReady && (i.leatherDelivered || t.leatherDelivered));
      }
      if (filtro === "aMedias") {
        const n = items.filter((i) => i.dieCutReady).length;
        return n > 0 && n < items.length;
      }
      if (filtro === "conFecha") {
        return items.some((i) => !i.dieCutReady && i.dieCutPlannedDate);
      }
      return true;
    });
  }, [tareas, busqueda, filtro]);

  const hayFiltro = busqueda.trim() !== "" || filtro !== "todas";

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltro("todas");
  };

  const filas = useMemo(() => {
    const out = [];
    (tareas || []).forEach((t) => {
      (t.items || []).forEach((it) => {
        out.push({ tarea: t, item: it });
      });
    });
    return out;
  }, [tareas]);

  const resumen = useMemo(() => {
    const total = filas.length;
    const cortados = filas.filter((f) => f.item.dieCutReady).length;
    const sinCuero = filas.filter((f) => !f.item.leatherDelivered).length;
    const parciales = (tareas || []).filter((t) => {
      const items = t.items || [];
      const n = items.filter((i) => i.dieCutReady).length;
      return n > 0 && n < items.length;
    }).length;
    return { total, cortados, sinCuero, parciales };
  }, [filas, tareas]);

  const conBloqueo = async (clave, accion, exito) => {
    setTrabajando(clave);
    try {
      await accion();
      if (exito) showSuccess(exito);
      if (onReload) await onReload();
    } catch (e) {
      showError(e.message);
    } finally {
      setTrabajando(null);
    }
  };

  /**
   * Las dos acciones que cambian el estado pasan por el diálogo de confirmación.
   *
   * Se guarda la acción pendiente entera, no solo un indicador: así el diálogo puede nombrar
   * el producto y la tarea, y al aceptar se ejecuta exactamente lo que se mostró. Con un
   * simple booleano habría que volver a deducir sobre qué fila se preguntó.
   */
  const pedirTroquel = (tarea, item, valor) => {
    // Cuántos quedarían sin cortar después de esto: decir «faltan dos» o «era el último»
    // es más útil que explicar cómo funciona la compuerta.
    const faltan = (tarea.items || []).filter((i) => !i.dieCutReady && i.id !== item.id).length;
    setConfirmacion({
      tipo: "troquel",
      tone: valor ? "info" : "warning",
      title: valor ? "Marcar el corte" : "Quitar el corte",
      message: nombreProducto(item),
      detail: refTarea(tarea),
      warning: valor
        ? (faltan === 0
          ? `${tarea.code || "La tarea"} queda completa y ya puede bajar a mesa.`
          : `Quedan ${contar(faltan, "producto")} por cortar en ${tarea.code || "la tarea"}.`)
        : `${tarea.code || "La tarea"} vuelve a esta lista y no bajará a mesa.`,
      confirmText: valor ? "Marcar" : "Quitar",
      accion: () =>
        conBloqueo(
          `tq-${item.id}`,
          () => setTaskItemDieCut(tarea.id, item.id, valor),
          valor ? "Corte marcado" : "Corte quitado"
        ),
    });
  };

  const pedirCuero = (tarea, item) =>
    setConfirmacion({
      tipo: "cuero",
      tone: "warning",
      title: "Entregar cuero",
      message: nombreProducto(item),
      detail: refTarea(tarea),
      // Esta pantalla no devuelve el cuero: se corrige desde el Centro de Producción.
      warning: "El cuero no se devuelve desde esta pantalla.",
      confirmText: "Entregar",
      accion: () =>
        conBloqueo(
          `cu-${item.id}`,
          () => setTaskItemLeatherDelivery(tarea.id, item.id, true),
          "Cuero entregado"
        ),
    });

  const fijarFecha = (tarea, item, fecha) =>
    conBloqueo(`fe-${item.id}`, () => setTaskItemDieCutPlannedDate(tarea.id, item.id, fecha));

  /**
   * Separar también pregunta, y con más razón que las otras dos: crea una tarea nueva y le
   * mueve productos. El diálogo dice cuántos se van y cuántos se quedan, que es lo que hay
   * que mirar antes de partir una tarea en dos.
   */
  const pedirSeparar = (tarea) => {
    const items = tarea.items || [];
    const sinCortar = items.filter((i) => !i.dieCutReady).length;
    const cortados = items.length - sinCortar;
    setConfirmacion({
      tipo: "separar",
      tone: "info",
      title: "Separar lo que falta cortar",
      message: `${contar(sinCortar, "producto")} ${concordar(sinCortar, "pasa", "pasan")} a una tarea nueva. `
        + `${contar(cortados, "producto")} ${concordar(cortados, "se queda", "se quedan")} en ${tarea.code || "la tarea"}, `
        + "lista para mesa.",
      detail: "La tarea nueva queda sin mesa ni día, dentro de la misma orden.",
      confirmText: "Separar",
      accion: () =>
        conBloqueo(`sp-${tarea.id}`, async () => {
          const r = await splitUncutDieCutItems(tarea.id);
          if (r && r.split) showSuccess(r.message);
          else showError(r && r.message ? r.message : "No había nada que separar.");
        }),
    });
  };

  const descargar = () => {
    if (filas.length === 0) {
      showError("No hay nada pendiente de troquel.");
      return;
    }
    // Solo lo que falta cortar: el listado es para el troquel, no un inventario de la tarea.
    const pendientes = filas.filter((f) => !f.item.dieCutReady);
    if (pendientes.length === 0) {
      showError("Todo lo de la lista ya está cortado.");
      return;
    }
    const rows = pendientes.map(({ tarea, item }) => ({
      tarea: tarea.code || "-",
      op: tarea.productionOrderCode || "-",
      cliente: tarea.customerName || "-",
      codigo: item.productCode || "-",
      producto: item.productName || "-",
      color: item.colorName || "-",
      cantidad: item.quantity ?? 0,
      cuero: item.leatherDelivered ? "Entregado" : "Falta",
      previsto: item.dieCutPlannedDate ? formatDateGt(item.dieCutPlannedDate) : "Sin fecha",
      entrega: tarea.deliveryDate ? formatDateGt(tarea.deliveryDate) : "-",
    }));
    exportRowsToCsv("lista_por_troquelar", CABECERAS_CSV, rows);
  };

  const estadoTarea = (t) => {
    const items = t.items || [];
    const n = items.filter((i) => i.dieCutReady).length;
    if (n === 0) return { texto: "Sin cortar", color: "secondary", parcial: false };
    if (n < items.length) return { texto: `Parcial ${n}/${items.length}`, color: "warning", parcial: true };
    return { texto: "Cortada", color: "success", parcial: false };
  };

  return (
    <Card>
      <CardHeader className="d-flex flex-wrap align-items-center justify-content-between">
        <div>
          <strong>Lista por troquelar</strong>
          <small className="text-muted d-block">
            Los productos que esperan troquel. A mesa solo baja lo que ya está cortado.
          </small>
        </div>
        <div className="d-flex flex-wrap align-items-center" style={{ gap: 6 }}>
          <Badge color="secondary">{resumen.total - resumen.cortados} por cortar</Badge>
          {resumen.sinCuero > 0 && <Badge color="danger">{resumen.sinCuero} sin cuero</Badge>}
          {resumen.parciales > 0 && <Badge color="warning">{resumen.parciales} a medias</Badge>}
          <Button color="secondary" outline size="sm" onClick={onReload} disabled={loading}>
            Actualizar
          </Button>
          <Button color="success" size="sm" onClick={descargar} disabled={loading || filas.length === 0}>
            Descargar lista
          </Button>
        </div>
      </CardHeader>

      <CardBody>
        {loading ? (
          <div className="text-center py-4"><Spinner size="sm" /> Cargando…</div>
        ) : filas.length === 0 ? (
          <Alert color="success" className="mb-0">
            Nada pendiente de troquel. Todas las tareas tienen su corte hecho.
          </Alert>
        ) : (
          <>
            {resumen.sinCuero > 0 && (
              <Alert color="warning">
                {contar(resumen.sinCuero, "producto")} sin cuero. El cuero va antes del
                troquel, así que hasta entregarlo el corte queda bloqueado.
              </Alert>
            )}

            <div className="fossiles-filtros mb-3">
              <div className="d-flex flex-wrap align-items-center" style={{ gap: 8 }}>
                <InputGroup size="sm" style={{ maxWidth: 320 }}>
                  <InputGroupAddon addonType="prepend">
                    <InputGroupText><i className="nc-icon nc-zoom-split" /></InputGroupText>
                  </InputGroupAddon>
                  <Input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Tarea, OP, cliente, producto o color…"
                  />
                  {busqueda && (
                    <InputGroupAddon addonType="append">
                      <Button color="secondary" outline onClick={() => setBusqueda("")} title="Limpiar la búsqueda">
                        ×
                      </Button>
                    </InputGroupAddon>
                  )}
                </InputGroup>

                {/* Los cuatro filtros son las preguntas que se hacen de verdad frente a esta
                    lista: qué puedo cortar ya, qué está trabado por cuero, qué quedó a medias
                    y qué tiene día puesto. */}
                {[
                  { id: "todas", texto: "Todas", color: "secondary" },
                  { id: "conCuero", texto: "Listas para cortar", color: "success" },
                  { id: "sinCuero", texto: "Falta cuero", color: "danger" },
                  { id: "aMedias", texto: "A medias", color: "warning" },
                  { id: "conFecha", texto: "Con día puesto", color: "info" },
                ].map((f) => (
                  <Button
                    key={f.id}
                    size="sm"
                    className="fossiles-chip"
                    color={f.color}
                    outline={filtro !== f.id}
                    onClick={() => setFiltro(f.id)}
                  >
                    {f.texto}
                  </Button>
                ))}

                <div className="ml-auto d-flex align-items-center" style={{ gap: 8 }}>
                  <small className="text-muted">
                    {tareasFiltradas.length} de {(tareas || []).length} tarea(s)
                  </small>
                  {hayFiltro && (
                    <Button color="link" size="sm" className="p-0" onClick={limpiarFiltros}>
                      Quitar filtros
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {tareasFiltradas.length === 0 ? (
              <Alert color="info" className="mb-0">
                Ninguna tarea coincide.{" "}
                <Button color="link" size="sm" className="p-0 align-baseline" onClick={limpiarFiltros}>
                  Quitar los filtros
                </Button>
              </Alert>
            ) : tareasFiltradas.map((t) => {
              const est = estadoTarea(t);
              return (
                <div key={t.id} className="mb-4">
                  <div className="d-flex flex-wrap align-items-center mb-2" style={{ gap: 8 }}>
                    <Badge color="info">{t.code}</Badge>
                    <strong>{t.productionOrderCode}</strong>
                    <span className="text-muted">{t.customerName || "-"}</span>
                    <Badge color={est.color}>{est.texto}</Badge>
                    {t.deliveryDate && (
                      <small className="text-muted">Entrega {formatDateGt(t.deliveryDate)}</small>
                    )}
                    {est.parcial && (
                      <Button
                        color="primary"
                        size="sm"
                        className="ml-auto"
                        disabled={trabajando === `sp-${t.id}`}
                        onClick={() => pedirSeparar(t)}
                        title="Deja en esta tarea lo cortado y manda el resto a una tarea nueva que espera su troquel"
                      >
                        {trabajando === `sp-${t.id}` ? "Separando…" : "Separar lo cortado"}
                      </Button>
                    )}
                  </div>

                  <Table size="sm" className="mb-0" style={{ tableLayout: "fixed", width: "100%" }}>
                    {/* Anchos fijos: con el automático las columnas de texto crecían hasta el
                        nombre de producto más largo y empujaban la casilla del corte —la
                        acción principal— detrás del scroll horizontal. Producto va sin ancho
                        porque es la que absorbe lo que sobre; las demás llevan lo justo para
                        que su cabecera no parta a mitad de palabra. Por eso también «Corte» y
                        no «Troquelado»: la palabra larga le fijaba un suelo de ancho. */}
                    <colgroup>
                      <col />
                      <col style={{ width: 94 }} />
                      <col style={{ width: 54 }} />
                      {/* 116 y no menos: el botón de entregar mide 102 y con una columna más
                          estrecha se desbordaba encima del campo de fecha. */}
                      <col style={{ width: 116 }} />
                      <col style={{ width: 134 }} />
                      <col style={{ width: 62 }} />
                    </colgroup>
                    <thead className="text-primary">
                      <tr style={{ whiteSpace: "nowrap" }}>
                        <th>Producto</th>
                        <th>Color</th>
                        <th className="text-right">Cant.</th>
                        <th>Cuero</th>
                        <th>Troquelar el</th>
                        <th className="text-center" title="Troquelado">Corte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(t.items || []).map((it) => {
                        const ocupado = trabajando === `tq-${it.id}` || trabajando === `cu-${it.id}`;
                        return (
                          <tr key={it.id}>
                            <td>
                              <div>{it.productName || "-"}</div>
                              <small className="text-muted">{it.productCode || ""}</small>
                            </td>
                            <td>{it.colorName || "-"}</td>
                            <td className="text-right">{it.quantity ?? 0}</td>
                            <td>
                              {it.leatherDelivered ? (
                                <Badge color="success">Entregado</Badge>
                              ) : (
                                <Button
                                  color="warning"
                                  outline
                                  size="sm"
                                  disabled={ocupado}
                                  onClick={() => pedirCuero(t, it)}
                                  title="Entregar el cuero de este producto"
                                >
                                  {/* Solo «Entregar»: con el nombre largo el botón partía en
                                      dos líneas, llenaba su columna y quedaba pegado al campo
                                      de fecha. La cabecera de la columna ya dice «Cuero». */}
                                  Entregar
                                </Button>
                              )}
                            </td>
                            <td style={{ width: 120 }}>
                              <DatePickerField
                                value={it.dieCutPlannedDate || ""}
                                onChange={(v) => fijarFecha(t, it, v)}
                                disabled={trabajando === `fe-${it.id}`}
                                soloHabiles
                              />
                            </td>
                            <td className="text-center">
                              <Input
                                type="checkbox"
                                style={{ position: "static", margin: 0 }}
                                checked={!!it.dieCutReady}
                                disabled={ocupado || (!it.dieCutReady && !it.leatherDelivered)}
                                onChange={(e) => pedirTroquel(t, it, e.target.checked)}
                                title={
                                  !it.dieCutReady && !it.leatherDelivered
                                    ? "Falta entregar el cuero de este producto"
                                    : "Marcar que este producto ya se troqueló"
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              );
            })}
          </>
        )}
      </CardBody>

      {/* Un solo diálogo para las dos acciones: lo que cambia entre entregar cuero y marcar
          el corte es el texto, no la mecánica, y dos modales casi iguales se desincronizan
          en cuanto alguien toca uno. */}
      <ConfirmModal
        isOpen={!!confirmacion}
        toggle={() => setConfirmacion(null)}
        onConfirm={() => confirmacion && confirmacion.accion()}
        tone={confirmacion?.tone}
        title={confirmacion?.title}
        message={confirmacion?.message}
        detail={confirmacion?.detail}
        warning={confirmacion?.warning}
        confirmText={confirmacion?.confirmText}
        cancelText="Cancelar"
      />
    </Card>
  );
}
