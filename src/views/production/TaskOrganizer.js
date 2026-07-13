import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Row, Col, Card, CardBody, Nav, NavItem, NavLink, TabContent, TabPane, Badge, Button,
} from "reactstrap";
import classnames from "classnames";
import useTaskOrganizer from "./organizer/useTaskOrganizer";
import OrganizerOrderBrowser from "./organizer/OrganizerOrderBrowser";
import DraftTaskPanel from "./organizer/DraftTaskPanel";
import PendingTasksBacklog from "./organizer/PendingTasksBacklog";
import RedistributeBoard from "./components/RedistributeBoard";
import useMoveTaskItem from "./hooks/useMoveTaskItem";

/**
 * Organizador de Tareas: reemplaza la generación automática del Centro de
 * Producción. 1) Armar tareas manualmente desde OPs con productos pendientes,
 * 2) asignarlas a mesas arrastrando en el tablero, 3) retomar tareas atrasadas.
 */
export default function TaskOrganizer() {
  const [activeTab, setActiveTab] = useState("organize");
  const navigate = useNavigate();
  const org = useTaskOrganizer();
  const onMove = useMoveTaskItem(org.setTasks);

  const unassignedCount = org.tasks.filter(
    (t) => t.status === "PENDING" && t.desk == null
  ).length;

  return (
    <div className="content">
      <Row className="mb-2">
        <Col className="d-flex align-items-center justify-content-between">
          <div>
            <h4 className="mb-0">Organizador de Tareas</h4>
            <small className="text-muted">
              Arma tareas por cantidades, créalas y asígnalas a mesas. Sin reparto automático.
            </small>
          </div>
          <Button size="sm" color="secondary" outline onClick={() => navigate("/admin/tasks-by-station")}>
            Ir al Centro de Producción
          </Button>
        </Col>
      </Row>

      <Nav tabs className="mb-3">
        <NavItem>
          <NavLink
            role="button"
            className={classnames({ active: activeTab === "organize" })}
            onClick={() => setActiveTab("organize")}
          >
            1 · Organizar
            {org.draftLines.length > 0 && (
              <Badge color="primary" className="ml-1">{org.draftLines.length}</Badge>
            )}
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink
            role="button"
            className={classnames({ active: activeTab === "board" })}
            onClick={() => { setActiveTab("board"); org.loadTasks(); }}
          >
            2 · Tablero de mesas
            {unassignedCount > 0 && (
              <Badge color="warning" className="ml-1">{unassignedCount} sin asignar</Badge>
            )}
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink
            role="button"
            className={classnames({ active: activeTab === "backlog" })}
            onClick={() => { setActiveTab("backlog"); org.loadBacklog(); }}
          >
            3 · Pendientes
            {org.backlog.length > 0 && (
              <Badge color="danger" className="ml-1">{org.backlog.length}</Badge>
            )}
          </NavLink>
        </NavItem>
      </Nav>

      <TabContent activeTab={activeTab}>
        <TabPane tabId="organize">
          <Row>
            <Col lg="7" xl="8">
              <OrganizerOrderBrowser
                orders={org.orders}
                loading={org.loadingOrders}
                typeFilter={org.typeFilter}
                setTypeFilter={org.setTypeFilter}
                search={org.search}
                setSearch={org.setSearch}
                onReload={org.loadOrders}
                draftItemIds={org.draftItemIds}
                onAddLine={org.addDraftLine}
              />
            </Col>
            <Col lg="5" xl="4">
              <DraftTaskPanel
                lines={org.draftLines}
                baseHours={org.baseHours}
                totalHours={org.totalHours}
                baseOrder={org.baseOrder}
                overCapacity={org.overCapacity}
                onRemove={org.removeDraftLine}
                onToggleExtra={org.toggleDraftLineExtra}
                onClear={org.clearDraft}
                onCreate={async () => {
                  const created = await org.createDraftTask();
                  if (created) setActiveTab("board");
                }}
                creating={org.creating}
                numDesks={org.numDesks}
                desk={org.draftDesk}
                setDesk={org.setDraftDesk}
                scheduledDate={org.draftDate}
                setScheduledDate={org.setDraftDate}
                observations={org.draftObservations}
                setObservations={org.setDraftObservations}
              />
            </Col>
          </Row>
        </TabPane>

        <TabPane tabId="board">
          <Card>
            <CardBody>
              <div className="d-flex justify-content-end mb-2">
                <Button
                  size="sm"
                  color="danger"
                  outline
                  disabled={org.clearingDesks}
                  onClick={() => {
                    if (window.confirm(
                      "Esto quita la mesa y la fecha de TODAS las tareas pendientes (no toca las que ya están en progreso o completadas). " +
                      "Podrás volver a asignarlas desde cero. ¿Continuar?"
                    )) {
                      org.clearAllDesksAction();
                    }
                  }}
                >
                  {org.clearingDesks ? "Limpiando…" : "Limpiar mesas"}
                </Button>
              </div>
              <RedistributeBoard
                tasks={org.tasks}
                numDesks={org.numDesks}
                date={org.boardDate}
                setDate={org.setBoardDate}
                onMove={onMove}
                introText={
                  <>
                    <strong>Tablero de mesas</strong>: las tareas creadas sin mesa aparecen en
                    “Sin asignar”. Arrastra cada producto a la mesa donde se trabajará en la fecha elegida
                    (solo días hábiles). Usa <strong>Limpiar mesas</strong> para liberar todas las asignaciones
                    pendientes y reorganizar desde cero.
                  </>
                }
              />
            </CardBody>
          </Card>
        </TabPane>

        <TabPane tabId="backlog">
          <PendingTasksBacklog
            backlog={org.backlog}
            loading={org.loadingBacklog}
            numDesks={org.numDesks}
            onReload={org.loadBacklog}
            onRescheduled={async () => {
              await Promise.all([org.loadBacklog(), org.loadTasks()]);
            }}
          />
        </TabPane>
      </TabContent>
    </div>
  );
}
