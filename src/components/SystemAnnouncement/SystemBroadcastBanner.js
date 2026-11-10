import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchActiveAnnouncement,
  subscribeToAnnouncements,
  pingServer,
  getAnnouncementDeadline,
} from "services/systemAnnouncementService";

// Función para emitir sonido suave de alerta usando Web Audio API
const playAlertBeep = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    // Ignorar si el navegador bloquea audio antes de interacción
  }
};

// Sonido de "sistema en línea": tres notas ascendentes, distinto al beep de alerta
const playOnlineChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();

    [523.25, 659.25, 783.99].forEach((frequency, index) => { // C5, E5, G5
      const start = ctx.currentTime + index * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.4);
      if (index === 2) osc.onended = () => ctx.close();
    });
  } catch (e) {
    // Ignorar si el navegador bloquea audio antes de interacción
  }
};

// Fases del banner:
//   COUNTDOWN   → cuenta regresiva hacia el reinicio
//   RESTARTING  → el servidor se está reiniciando; se queda hasta que el back nuevo conteste
//   BACK_ONLINE → el back ya arrancó (bootId distinto); se oculta solo a los pocos segundos
const RESTART_PING_MS = 4000;
const BACK_ONLINE_VISIBLE_MS = 8000;
// Aviso manual sin reinicio real: si el back sigue igual (mismo arranque) tras este tiempo, se quita
const RESTART_GIVE_UP_MS = 4 * 60 * 1000;

const secondsLeft = (deadline) =>
  deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;

export default function SystemBroadcastBanner() {
  const [announcement, setAnnouncement] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [phase, setPhaseState] = useState(null);

  // Refs para que los callbacks de SSE / intervalos lean el estado actual
  const phaseRef = useRef(null);
  const announcementRef = useRef(null);
  const lastAnnounceIdRef = useRef(null);
  const bootIdRef = useRef(null);
  const restartingSinceRef = useRef(null);
  const sawServerDownRef = useRef(false);

  const setPhase = useCallback((next) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const clearBanner = useCallback(() => {
    announcementRef.current = null;
    lastAnnounceIdRef.current = null;
    restartingSinceRef.current = null;
    setAnnouncement(null);
    setDeadline(null);
    setPhase(null);
  }, [setPhase]);

  const startRestarting = useCallback(() => {
    if (phaseRef.current === "RESTARTING" || phaseRef.current === "BACK_ONLINE") return;
    restartingSinceRef.current = Date.now();
    sawServerDownRef.current = false;
    setRemainingSeconds(0);
    setPhase("RESTARTING");
  }, [setPhase]);

  // Un bootId distinto al conocido = el servidor se reinició
  const noteBootId = useCallback(
    (bootId) => {
      if (!bootId) return;
      const known = bootIdRef.current;
      bootIdRef.current = bootId;
      if (known && known !== bootId) {
        const current = phaseRef.current;
        if (current === "RESTARTING" || current === "COUNTDOWN") {
          announcementRef.current = null;
          setAnnouncement(null);
          setDeadline(null);
          setPhase("BACK_ONLINE");
        }
      }
    },
    [setPhase]
  );

  const applyAnnouncement = useCallback(
    (active) => {
      if (!active) return;
      noteBootId(active.bootId);
      const nextDeadline = getAnnouncementDeadline(active);
      if (!active.isActive || secondsLeft(nextDeadline) <= 0) return;
      // Ya reiniciando o recién actualizado: un aviso viejo no vuelve a abrir la cuenta regresiva
      if (phaseRef.current === "RESTARTING" || phaseRef.current === "BACK_ONLINE") {
        if (lastAnnounceIdRef.current === active.id) return;
      }

      announcementRef.current = active;
      setAnnouncement(active);
      setDeadline(nextDeadline);
      setRemainingSeconds(secondsLeft(nextDeadline));
      setPhase("COUNTDOWN");
      if (lastAnnounceIdRef.current !== active.id) {
        lastAnnounceIdRef.current = active.id;
        playAlertBeep();
      }
    },
    [noteBootId, setPhase]
  );

  // Consulta de respaldo: un error de red NO quita el banner (el servidor puede estar reiniciando)
  const checkActiveAnnouncement = useCallback(async () => {
    try {
      const active = await fetchActiveAnnouncement();
      if (active) {
        applyAnnouncement(active);
      } else if (phaseRef.current === "COUNTDOWN") {
        clearBanner();
      }
    } catch (e) {
      // Back sin contestar: se mantiene lo que se esté mostrando
    }
  }, [applyAnnouncement, clearBanner]);

  useEffect(() => {
    checkActiveAnnouncement();

    // 1. Suscripción en tiempo real vía Server-Sent Events (SSE)
    const unsubscribe = subscribeToAnnouncements(
      (newAnnounce) => applyAnnouncement(newAnnounce),
      () => {
        // Al descartar alerta (si ya está actualizado, se deja terminar el aviso verde)
        if (phaseRef.current !== "BACK_ONLINE") clearBanner();
      },
      undefined,
      {
        onInit: (data) => noteBootId(data && data.bootId),
        onRestarting: () => startRestarting(),
      }
    );

    // 2. Polling de respaldo ligero cada 45 segundos (evita saturar la red)
    const pollInterval = setInterval(() => {
      checkActiveAnnouncement();
    }, 45000);

    // 3. Revisión inmediata cuando el usuario vuelve a la pestaña o ventana
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkActiveAnnouncement();
      }
    };
    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkActiveAnnouncement, applyAnnouncement, clearBanner, noteBootId, startRestarting]);

  // Cuenta regresiva: se calcula contra la hora de vencimiento, así no se atrasa en pestañas
  // de fondo ni salta cuando llega un polling.
  useEffect(() => {
    if (phase !== "COUNTDOWN" || !deadline) return undefined;
    const tick = () => {
      const left = secondsLeft(deadline);
      setRemainingSeconds(left);
      if (left <= 0) {
        const current = announcementRef.current;
        if (current && current.targetAction === "RESTART") {
          startRestarting();
        } else {
          clearBanner();
        }
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [phase, deadline, startRestarting, clearBanner]);

  // Reiniciando: consulta /ping hasta que conteste un arranque nuevo
  useEffect(() => {
    if (phase !== "RESTARTING") return undefined;
    let cancelled = false;
    const check = async () => {
      const res = await pingServer();
      if (cancelled) return;
      if (!res) {
        sawServerDownRef.current = true;
        return;
      }
      if (res.bootId && bootIdRef.current && res.bootId !== bootIdRef.current) {
        noteBootId(res.bootId);
        return;
      }
      if (!bootIdRef.current && res.bootId) {
        bootIdRef.current = res.bootId;
      }
      // Volvió después de estar caído (sin bootId conocido para comparar)
      if (sawServerDownRef.current) {
        setPhase("BACK_ONLINE");
        return;
      }
      // Aviso manual sin reinicio real: el back sigue arriba con el mismo arranque
      if (restartingSinceRef.current && Date.now() - restartingSinceRef.current > RESTART_GIVE_UP_MS) {
        clearBanner();
      }
    };
    const interval = setInterval(check, RESTART_PING_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase, noteBootId, setPhase, clearBanner]);

  // Actualizado: suena una vez y el aviso verde se quita solo
  useEffect(() => {
    if (phase !== "BACK_ONLINE") return undefined;
    playOnlineChime();
    const timeout = setTimeout(() => clearBanner(), BACK_ONLINE_VISIBLE_MS);
    return () => clearTimeout(timeout);
  }, [phase, clearBanner]);

  if (!phase) {
    return null;
  }

  const formatCountdown = (secs) => {
    if (secs <= 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isUrgent = phase === "COUNTDOWN" && remainingSeconds <= 60;
  const type = (announcement && announcement.announcementType) || "RESTART_WARNING";

  const getBannerColor = () => {
    if (phase === "RESTARTING") return "#2d3436"; // Gris oscuro reiniciando
    if (phase === "BACK_ONLINE") return "#00a86b"; // Verde actualizado
    if (isUrgent) return "#d63031"; // Rojo intenso
    switch (type) {
      case "MAINTENANCE":
        return "#e67e22"; // Naranja mantenimiento
      case "URGENT":
        return "#c0392b"; // Rojo oscuro
      case "INFO":
        return "#2980b9"; // Azul informativo
      case "RESTART_WARNING":
      default:
        return "#e17055"; // Coral reinicio
    }
  };

  const getBannerIcon = () => {
    if (phase === "RESTARTING") return "nc-refresh-69";
    if (phase === "BACK_ONLINE") return "nc-check-2";
    switch (type) {
      case "MAINTENANCE":
        return "nc-settings";
      case "URGENT":
        return "nc-alert-circle-i";
      case "INFO":
        return "nc-chat-33";
      case "RESTART_WARNING":
      default:
        return "nc-bell-55";
    }
  };

  let bannerTitle;
  let bannerMessage;
  if (phase === "RESTARTING") {
    bannerTitle = "Reiniciando el sistema";
    bannerMessage = "Espere un momento sin cerrar la página. Este aviso se quita solo cuando el sistema vuelva.";
  } else if (phase === "BACK_ONLINE") {
    bannerTitle = "Sistema actualizado";
    bannerMessage = "Ya puede seguir trabajando. Si algo se ve raro, recargue la página.";
  } else {
    bannerTitle = announcement.title || "AVISO DEL SISTEMA";
    bannerMessage = announcement.message || "Por favor guarde todos sus cambios antes del reinicio.";
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        backgroundColor: getBannerColor(),
        color: "#ffffff",
        boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
        borderBottom: "2px solid rgba(255,255,255,0.4)",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px",
        animation: isUrgent ? "pulse-banner 1.5s infinite" : "none",
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <style>{`
        @keyframes pulse-banner {
          0% { background-color: #d63031; }
          50% { background-color: #e84118; }
          100% { background-color: #d63031; }
        }
        @keyframes spin-banner {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .countdown-badge-live {
          background: #ffffff;
          color: #d63031;
          font-weight: 800;
          font-size: 18px;
          padding: 4px 14px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 1px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }
      `}</style>

      {/* Lado izquierdo: Icono y Mensaje */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: "260px" }}>
        <i
          className={`nc-icon ${getBannerIcon()}`}
          style={{
            fontSize: "24px",
            color: "#fff",
            animation: phase === "RESTARTING" ? "spin-banner 1.2s linear infinite" : "none",
          }}
        />
        <div>
          <div style={{ fontWeight: 800, fontSize: "15px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {bannerTitle}
          </div>
          <div style={{ fontSize: "13px", opacity: 0.95, lineHeight: 1.3 }}>{bannerMessage}</div>
        </div>
      </div>

      {/* Lado derecho: Cuenta Regresiva / estado */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {phase === "COUNTDOWN" && (
          <div className="countdown-badge-live">
            <i className="nc-icon nc-time-alarm" style={{ fontSize: "16px" }} />
            <span>{formatCountdown(remainingSeconds)}</span>
          </div>
        )}
        {phase === "RESTARTING" && (
          <div className="countdown-badge-live" style={{ backgroundColor: "#636e72", color: "#fff" }}>
            <span>Reinicio en curso...</span>
          </div>
        )}
        {phase === "BACK_ONLINE" && (
          <button
            type="button"
            className="countdown-badge-live"
            style={{ color: "#00a86b", border: "none", cursor: "pointer", fontSize: "14px" }}
            onClick={() => window.location.reload()}
          >
            <i className="nc-icon nc-refresh-69" />
            <span>Recargar página</span>
          </button>
        )}
      </div>
    </div>
  );
}
