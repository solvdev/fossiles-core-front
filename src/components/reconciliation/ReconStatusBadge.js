import React from "react";
import { Badge } from "reactstrap";
import { STATUS_META } from "utils/reconciliationHelper";

/** El estado siempre lleva icono y texto: no depende solo del color. */
const ReconStatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || { label: status || "—", color: "secondary", icon: "" };
  return (
    <Badge color={meta.color} pill>
      <span aria-hidden="true">{meta.icon}</span> {meta.label}
    </Badge>
  );
};

export default ReconStatusBadge;
