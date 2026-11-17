import React, { useEffect, useState } from "react";
import {
  fetchBackVersion,
  formatVersion,
  getCachedBackVersion,
  getFrontCommit,
  getFrontVersion,
} from "services/versionService";

function tooltipFor(frontCommit, back) {
  const parts = [];
  if (frontCommit && frontCommit !== "unknown") parts.push(`Front ${frontCommit}`);
  if (back) {
    const backBits = [back.commit, back.buildTime].filter(Boolean);
    if (backBits.length > 0) parts.push(`Back ${backBits.join(" · ")}`);
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function VersionFooter() {
  const frontVersion = getFrontVersion();
  const frontCommit = getFrontCommit();
  const [back, setBack] = useState(() => getCachedBackVersion() || null);

  useEffect(() => {
    let cancelled = false;
    fetchBackVersion().then((data) => {
      if (!cancelled) setBack(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const text = [`Fossiles ERP · Front ${formatVersion(frontVersion)}`];
  if (back && back.version) text.push(`Back ${formatVersion(back.version)}`);

  return (
    <div
      className="text-muted text-center small px-3 pb-3"
      style={{ fontSize: "11px", lineHeight: 1.4, marginTop: "-4px" }}
      title={tooltipFor(frontCommit, back)}
    >
      {text.join(" · ")}
    </div>
  );
}

export default VersionFooter;
