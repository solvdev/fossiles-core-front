import React from "react";
import { Badge } from "reactstrap";
import PendingTasksBacklog from "./PendingTasksBacklog";
import UnfinishedTasks from "./UnfinishedTasks";

/**
 * Atrasadas: todo lo que quedó de días anteriores en un solo lugar.
 *  - Empezadas y sin terminar: siguen en su mesa y arrastran al día siguiente.
 *  - Pendientes que no se hicieron: se reprograman a un día con cupo.
 */
export default function LateTasksPanel({ late, numDesks, onChanged }) {
  const { backlog, loadingBacklog, loadBacklog, unfinished, loadingUnfinished, loadUnfinished } = late;
  const total = backlog.length + unfinished.length;
  return (
    <div>
      <p className="text-muted" style={{ fontSize: 13 }}>
        {total === 0
          ? "No hay tareas atrasadas."
          : <>Hay <strong>{total}</strong> {total === 1 ? "tarea atrasada" : "tareas atrasadas"} de días anteriores.</>}
      </p>
      <h6 className="mt-3">
        Empezadas y sin terminar
        {unfinished.length > 0 && <Badge color="danger" className="ml-2">{unfinished.length}</Badge>}
      </h6>
      <UnfinishedTasks unfinished={unfinished} loading={loadingUnfinished} onReload={loadUnfinished} />
      <h6 className="mt-4">
        Pendientes sin hacer
        {backlog.length > 0 && <Badge color="danger" className="ml-2">{backlog.length}</Badge>}
      </h6>
      <PendingTasksBacklog
        backlog={backlog}
        loading={loadingBacklog}
        numDesks={numDesks}
        onReload={loadBacklog}
        onRescheduled={onChanged}
      />
    </div>
  );
}
