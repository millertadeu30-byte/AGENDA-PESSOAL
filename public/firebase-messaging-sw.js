// Importa os scripts do Firebase SDK v10 (versão compat para simplificar no Service Worker)
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// Inicializa o Firebase no Service Worker com as credenciais do seu projeto
firebase.initializeApp({
  apiKey: "AIzaSyBJUFeUUCwfVLnSI_lX7gRNIGJwgbsJ3wg",
  authDomain: "graphite-victor-gwjkk.firebaseapp.com",
  projectId: "graphite-victor-gwjkk",
  storageBucket: "graphite-victor-gwjkk.firebasestorage.app",
  messagingSenderId: "316238992744",
  appId: "1:316238992744:web:0a4a7e42b94f0c586c72dd"
});

const messaging = firebase.messaging();

// Captura mensagens recebidas quando a tela está apagada ou o app em segundo plano
messaging.onBackgroundMessage((payload) => {
  console.log("[Service Worker] Mensagem em segundo plano recebida:", payload);
  
  const notificationTitle = payload.notification?.title || "Compromisso Vencido!";
  const notificationOptions = {
    body: payload.notification?.body || "Sua tarefa venceu!",
    icon: payload.notification?.icon || "/icon.png",
    vibrate: [500, 150, 500, 150, 500, 150, 500, 150, 500],
    tag: payload.notification?.tag || "fcm-alert",
    renotify: true,
    requireInteraction: true,
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
