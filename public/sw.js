self.addEventListener("push", (event) => {
  let data = { title: "Alerta - TaskControl Pro", body: "Você tem uma tarefa vencendo agora!" };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "Alerta - TaskControl Pro", body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    vibrate: [300, 100, 300],
    tag: data.tag || "task-alert",
    renotify: true,
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.tag || "1"
    },
    actions: [
      { action: "explore", title: "Abrir TaskControl" },
      { action: "close", title: "Fechar" }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action !== "close") {
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow("/");
        }
      })
    );
  }
});
