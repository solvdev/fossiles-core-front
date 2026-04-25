/**
 * Helper para mostrar notificaciones toast en toda la aplicación
 * Requiere que NotificationAlert esté incluido en el layout principal
 */

let notificationAlertRef = null;

export const setNotificationRef = (ref) => {
  notificationAlertRef = ref;
};

export const showNotification = (message, type = "info", icon = "now-ui-icons ui-1_bell-53", autoDismiss = 5) => {
  if (!notificationAlertRef) {
    console.warn("NotificationAlert ref no está configurado. Asegúrate de incluir NotificationAlert en el layout.");
    return;
  }

  const options = {
    place: "tr", // top-right
    message: (
      <div>
        <div>{message}</div>
      </div>
    ),
    type: type, // primary, success, danger, warning, info
    icon: icon,
    autoDismiss: autoDismiss,
  };

  notificationAlertRef.current.notificationAlert(options);
};

export const showSuccess = (message) => {
  showNotification(message, "success", "now-ui-icons ui-1_check", 4);
};

export const showError = (message) => {
  showNotification(message, "danger", "now-ui-icons ui-1_simple-remove", 6);
};

export const showWarning = (message) => {
  showNotification(message, "warning", "now-ui-icons ui-1_bell-53", 5);
};

export const showInfo = (message) => {
  showNotification(message, "info", "now-ui-icons ui-1_bell-53", 4);
};

