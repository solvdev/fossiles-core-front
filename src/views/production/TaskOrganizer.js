import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Row, Col, Card, CardBody, Nav, NavItem, NavLink, TabContent, TabPane, Badge, Button,
} from "reactstrap";
import classnames from "classnames";
import useTaskOrganizer from "./organizer/useTaskOrganizer";
import PendingTasksBacklog from "./organizer/PendingTasksBacklog";
import RedistributeBoard from "./components/RedistributeBoard";
import useMoveTaskItem from "./hooks/useMoveTaskItem";

/**
 * Redistribución y atrasos. La generación de tareas es automática en el Centro
 * de Producción (inicio del día + al abrir el centro).
 */
export default function TaskOrganizer() {
  const [activeTab, setActiveTab] = useState("board");
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
            className={classnames({ active: activeTab === "board" })}
            onClick={() => { setActiveTab("board"); org.loadTasks(); }}
          >
            Tablero de mesas
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
            Pendientes
            {org.backlog.length > 0 && (
              <Badge color="danger" className="ml-1">{org.backlog.length}</Badge>
            )}
          </NavLink>
        </NavItem>
      </Nav>

      <TabContent activeTab={activeTab}>
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
      </TabContent>
    </div>
  );
}
