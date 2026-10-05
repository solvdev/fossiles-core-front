import React from "react";
import { Progress } from "reactstrap";
import "./ImportWizard.css";

export const STEPS = ["Archivos", "Kioscos", "Validación", "Confirmar"];

/** Cabecera del asistente: barra de progreso + pasos navegables hacia atrás. */
function StepHeader({ current, canGoTo, onGoTo, finished }) {
  const value = finished ? 100 : (current / (STEPS.length - 1)) * 100;
  return (
    <nav className="kiw-steps" aria-label="Pasos de importación">
      <Progress value={value} color="info" aria-label="Progreso de la importación" />
      <ol className="kiw-steplist">
        {STEPS.map((label, i) => {
          const done = finished || i < current;
          const isCurrent = !finished && i === current;
          const reachable = !finished && canGoTo(i) && i !== current;
          return (
            <li key={label} style={{ display: "contents" }}>
              <button
                type="button"
                className={`kiw-step ${isCurrent ? "is-current" : ""} ${done ? "is-done" : ""}`}
                disabled={!reachable && !isCurrent}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => reachable && onGoTo(i)}
              >
                <span className="kiw-step-num" aria-hidden="true">
                  {done ? "✓" : i + 1}
                </span>
                <span>
                  {label}
                  <span className="sr-only">{done ? " (completado)" : isCurrent ? " (paso actual)" : ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default StepHeader;
