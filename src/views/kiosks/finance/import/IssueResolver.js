import React, { useState } from "react";
import { Button, Input } from "reactstrap";
import { fmtMoney } from "utils/financeFormat";
import { IGNORE, parseResolutionValue } from "./importModel";
import { showWarning } from "utils/notificationHelper";
import "./ImportWizard.css";

/** Resolución inline de una celda bloqueada: aceptar sugerencia, escribir otro valor o ignorar la celda. */
function IssueResolver({ issue, resolution, onResolve, onClear }) {
  const [text, setText] = useState("");
  const hasSuggestion = issue.suggestion !== null && issue.suggestion !== undefined;

  if (resolution !== undefined) {
    return (
      <div className="kiw-resolve">
        <span className="kiw-sev kiw-sev-OK">
          <span aria-hidden="true">✓</span>
          {resolution === IGNORE ? "Celda ignorada" : `Corregida a ${fmtMoney(resolution)}`}
        </span>
        <Button color="link" size="sm" onClick={onClear} aria-label="Cambiar resolución">
          Cambiar
        </Button>
      </div>
    );
  }

  const apply = () => {
    const parsed = parseResolutionValue(text);
    if (!parsed.valid) {
      showWarning("Escribe un monto válido entre 0 y 999,999.99.");
      return;
    }
    onResolve(parsed.value);
    setText("");
  };

  return (
    <div className="kiw-resolve">
      {hasSuggestion && (
        <Button color="success" size="sm" onClick={() => onResolve(issue.suggestion)}>
          Aceptar {fmtMoney(issue.suggestion)}
        </Button>
      )}
      <Input
        type="text"
        inputMode="decimal"
        bsSize="sm"
        placeholder="Otro valor"
        aria-label={`Otro valor para la celda ${issue.cell || ""}`}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9.,Qq\s-]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
      />
      <Button color="info" size="sm" outline disabled={!text.trim()} onClick={apply}>
        Aplicar
      </Button>
      <Button color="secondary" size="sm" outline onClick={() => onResolve(IGNORE)}>
        Ignorar celda
      </Button>
    </div>
  );
}

export default IssueResolver;
