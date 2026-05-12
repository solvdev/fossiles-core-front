import React, { useMemo, useState } from "react";

export default function SolvDeskButton({
  systemId,
  apiKey,
  userEmail = "",
  userName = "",
  label = "Soporte",
}) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const src = useMemo(() => {
    const cleanSystemId = String(systemId || "").trim();
    const cleanApiKey = String(apiKey || "").trim();
    if (!cleanSystemId || !cleanApiKey) return "";

    let url = `https://solvdesk.vercel.app/widget/${cleanSystemId}?key=${encodeURIComponent(cleanApiKey)}`;
    if (userEmail) url += `&email=${encodeURIComponent(userEmail)}`;
    if (userName) url += `&name=${encodeURIComponent(userName)}`;
    return url;
  }, [systemId, apiKey, userEmail, userName]);

  if (!systemId || !apiKey) {
    return null;
  }

  return (
    <>
      <style>
        {`
          @keyframes solvdesk-spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      <button
        onClick={() => {
          setHasOpened(true);
          setLoaded(false);
          setOpen(true);
        }}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          background: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: "999px",
          padding: "12px 20px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          opacity: open ? 0 : 1,
          pointerEvents: open ? "none" : "auto",
        }}
        aria-label="Abrir soporte"
      >
        💬 {label}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
          }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            style={{
              width: "380px",
              height: "580px",
              margin: "24px",
              borderRadius: "16px",
              overflow: "hidden",
              background: "#fff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Soporte"
          >
            {!loaded && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#fff",
                  color: "#111827",
                  fontSize: "14px",
                  fontWeight: 600,
                  zIndex: 1,
                  gap: "10px",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    border: "2px solid rgba(17, 24, 39, 0.2)",
                    borderTopColor: "rgba(59, 130, 246, 0.9)",
                    animation: "solvdesk-spin 700ms linear infinite",
                    flex: "0 0 auto",
                  }}
                />
                Cargando soporte…
              </div>
            )}

            {hasOpened && (
              <iframe
                src={src}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  visibility: open ? "visible" : "hidden",
                }}
                title="Soporte"
                loading="eager"
                onLoad={() => setLoaded(true)}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

