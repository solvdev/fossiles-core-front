import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Row, Col, Card, CardBody, Nav, NavItem, NavLink, TabContent, TabPane, Badge, Button,
} from "reactstrap";
import classnames from "classnames";
import { formatDateGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showSuccess } from "utils/notificationHelper";
import useTaskOrganizer from "./organizer/useTaskOrganizer";
import OrganizerOrderBrowser from "./organizer/OrganizerOrderBrowser";
import DraftTaskPanel from "./organizer/DraftTaskPanel";
import DayQueuePanel from "./organizer/DayQueuePanel";
import PendingTasksBacklog from "./organizer/PendingTasksBacklog";
import UnfinishedTasks from "./organizer/UnfinishedTasks";
import RedistributeBoard from "./components/RedistributeBoard";
import useMoveTaskItem from "./hooks/useMoveTaskItem";

/**
 * Redistribución y atrasos. La generación de tareas es automática en el Centro
 * de Producción (inicio del día + al abrir el centro).
 */
export default function TaskOrganizer() {
  const [activeTab, setActiveTab] = useState("organize");
  const navigate = useNavigate();
  const org = useTaskOrganizer();
  const onMove = useMoveTaskItem(org.setTasks);

  const unassignedCount = org.tasks.filter(
    (t) => t.status === "PENDING" && t.desk == null
  ).length;

  /**
   * Salta al tablero en la fecha de una tarea ya existente. Sin esto, una tarea
   * programada para otro día no aparece en el tablero de hoy y parece que "no deja
   * asignar". Solo navega: no reasigna nada, porque la mesa la elige el sistema.
   */
  const jumpToAssignment = (assignment) => {
    const targetDate = assignment?.scheduledDate || getTodayYmdGuatemala();
    org.setBoardDate(targetDate);
    setActiveTab("board");
    org.loadTasks();
    showSuccess(
      assignment?.desk != null
        ? `Tarea ${assignment.taskCode || ""} está en Mesa ${assignment.desk} el ${formatDateGt(targetDate)}.`
        : `Mostrando el tablero del ${formatDateGt(targetDate)}.`
    );
  };

  return (
    <div className="content">
      <Row className="mb-2">
        <Col className="d-flex align-items-center justify-content-between">
          <div>
            <h4 className="mb-0">Redistribuir mesas</h4>
            <small className="text-muted">
              Las tareas se generan solas en el Centro. Aquí solo se mueven o se retoman atrasos.
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
        <NavItem>
          <NavLink
            role="button"
            className={classnames({ active: activeTab === "unfinished" })}
            onClick={() => { setActiveTab("unfinished"); org.loadUnfinished(); }}
          >
            4 · No terminadas
            {org.unfinished.length > 0 && (
              <Badge color="danger" className="ml-1">{org.unfinished.length}</Badge>
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
                onJumpToAssignment={jumpToAssignment}
                colaDelDia={org.colaDelDia}
                onAlternarEnCola={org.alternarEnCola}
                page={org.page}
                totalElements={org.totalElements}
                totalPages={org.totalPages}
                onPageChange={org.setPage}
              />
            </Col>
            <Col lg="5" xl="4">
              <DayQueuePanel
                marcadas={org.colaDelDia}
                onQuitar={org.quitarDeCola}
                onLimpiar={org.limpiarCola}
                onDistribuido={async () => {
                  await Promise.all([org.loadTasks(), org.loadOrders()]);
                }}
              />
              <div className="mb-3" />
              <DraftTaskPanel
                lines={org.draftLines}
                baseHours={org.baseHours}
                totalHours={org.totalHours}
                baseOrder={org.baseOrder}
                overCapacity={org.overCapacity}
                overIdeal={org.overIdeal}
                onRemove={org.removeDraftLine}
                onClear={org.clearDraft}
                onCreate={async () => {
                  const created = await org.createDraftTask();
                  if (created) setActiveTab("board");
                }}
                creating={org.creating}
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
              <RedistributeBoard
                tasks={org.tasks}
                numDesks={org.numDesks}
                date={org.boardDate}
                setDate={org.setBoardDate}
                onMove={onMove}
                introText={
                  <>
                    <strong>Tablero de mesas</strong>: arrastra para mover líneas entre mesas
                    del día del filtro. El Centro ya asigna mesa al generar.
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

        <TabPane tabId="unfinished">
          <UnfinishedTasks
            unfinished={org.unfinished}
            loading={org.loadingUnfinished}
            onReload={org.loadUnfinished}
          />
        </TabPane>
      </TabContent>
    </div>
  );
}
