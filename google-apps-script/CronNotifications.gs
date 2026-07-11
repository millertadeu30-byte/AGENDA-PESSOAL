/**
 * ====================================================================
 *       NOTIFICAÇÕES EM SEGUNDO PLANO (CRON) - GOOGLE APPS SCRIPT
 * ====================================================================
 * 
 * Este script resolve o problema do celular em repouso/tela apagada.
 * Ele roda 100% na nuvem do Google de forma gratuita a cada 1 minuto, 
 * verifica tarefas vencidas no Firestore e envia notificações Push via FCM
 * mesmo com o celular desligado, em repouso ou com o navegador fechado!
 * 
 * COMO INSTALAR E CONFIGURAR:
 * --------------------------------------------------------------------
 * 1. Acesse o console do Google Apps Script (https://script.google.com).
 * 2. Crie um novo projeto ou use o mesmo projeto do seu Web App.
 * 3. Crie um novo arquivo de script chamado "CronNotifications" e cole este código.
 * 4. Configure as variáveis abaixo (FIREBASE_PROJECT_ID, DATABASE_ID, API_KEY, FCM_SERVER_KEY).
 * 5. Clique em salvar.
 * 6. No menu lateral esquerdo, clique no ícone de relógio ("Acionadores" ou "Triggers").
 * 7. Clique em "+ Adicionar acionador" no canto inferior direito.
 * 8. Configurações do acionador:
 *    - Escolha a função: "verificarTarefasVencidas"
 *    - Selecione a fonte do evento: "Baseado no tempo"
 *    - Selecione o tipo de acionador: "Temporizador de minutos"
 *    - Selecione o intervalo: "A cada minuto"
 * 9. Clique em Salvar e autorize o script se solicitado.
 */

// --------------------------------------------------------------------
//                        CONFIGURAÇÕES DO PROJETO
// --------------------------------------------------------------------
const FIREBASE_PROJECT_ID = "graphite-victor-gwjkk";
const DATABASE_ID = "ai-studio-agendapessoal-fc3bdaa2-d330-424a-8601-205709bcd648";
const FIREBASE_API_KEY = "AIzaSyBJUFeUUCwfVLnSI_lX7gRNIGJwgbsJ3wg";

// Chave do servidor do FCM (Legacy Server Key) obtida em:
// Configurações do Projeto no Firebase Console > Cloud Messaging > Chave do Servidor (Legacy)
const FCM_SERVER_KEY = "SUA_CHAVE_FCM_SERVER_KEY_AQUI"; 

function verificarTarefasVencidas() {
  Logger.log("Iniciando verificação de tarefas vencidas...");
  
  // 1. Buscar todas as tarefas que estão pendentes e não foram notificadas
  const queryUrl = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/" + DATABASE_ID + "/documents:runQuery?key=" + FIREBASE_API_KEY;
  
  const queryPayload = {
    "structuredQuery": {
      "from": [{ "collectionId": "tarefas" }],
      "where": {
        "compositeFilter": {
          "op": "AND",
          "filters": [
            {
              "fieldFilter": {
                "field": { "fieldPath": "status" },
                "op": "EQUAL",
                "value": { "stringValue": "Pendente" }
              }
            }
          ]
        }
      }
    }
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(queryPayload),
    "muteHttpExceptions": true
  };
  
  try {
    const response = UrlFetchApp.fetch(queryUrl, options);
    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      Logger.log("Erro ao buscar tarefas do Firestore. Código HTTP: " + responseCode + " - Detalhes: " + response.getContentText());
      return;
    }
    
    const results = JSON.parse(response.getContentText());
    if (!results || results.length === 0 || !results[0].document) {
      Logger.log("Nenhuma tarefa pendente encontrada.");
      return;
    }
    
    // Obter data/hora atual em UTC e ajustar para o fuso horário correto (ex: GMT-3 / América/Sao_Paulo)
    const agora = new Date();
    Logger.log("Data/Hora atual local do script: " + agora.toString());
    
    // Lista de tokens de clientes armazenada em cache nesta execução para evitar leituras repetidas do Firestore
    const fcmTokensCache = {};

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      if (!item.document) continue;
      
      const doc = item.document;
      const fields = doc.fields;
      
      // Extrair ID do documento do Firestore
      const docName = doc.name; // formato: projects/{project}/databases/{database}/documents/tarefas/{id}
      const taskId = docName.substring(docName.lastIndexOf("/") + 1);
      
      // Extrair propriedades
      const tarefaNome = fields.tarefa ? fields.tarefa.stringValue : "Compromisso";
      const dataTarefaStr = fields.data ? fields.data.stringValue : ""; // ex: "2026-07-11"
      const horarioTarefaStr = fields.horario ? fields.horario.stringValue : "12:00"; // ex: "09:30"
      const userToken = fields.token ? fields.token.stringValue : "";
      const notificado = fields.notificado ? fields.notificado.booleanValue : false;
      
      // Se já foi notificado, ignora
      if (notificado === true) continue;
      
      if (!dataTarefaStr || !userToken) continue;
      
      // Criar objeto Date para a tarefa
      const dataTarefa = new Date(dataTarefaStr + "T" + horarioTarefaStr);
      
      // Se a data/hora da tarefa for menor ou igual ao momento atual (vencida)
      if (dataTarefa.getTime() <= agora.getTime()) {
        Logger.log("Tarefa vencida encontrada: '" + tarefaNome + "' marcada para " + dataTarefaStr + " às " + horarioTarefaStr);
        
        // Obter o token de FCM do cliente associado
        let fcmToken = fcmTokensCache[userToken];
        
        if (fcmToken === undefined) {
          fcmToken = obterFcmTokenDoCliente(userToken);
          fcmTokensCache[userToken] = fcmToken;
        }
        
        if (fcmToken) {
          // Enviar notificação via FCM
          const fcmSucesso = enviarNotificacaoFCM(fcmToken, "Compromisso Vencido!", "Está na hora de: " + tarefaNome + " (" + horarioTarefaStr + ")");
          
          if (fcmSucesso) {
            // Atualizar o documento no Firestore marcando notificado como true
            marcarComoNotificadoNoFirestore(taskId, fields);
          }
        } else {
          Logger.log("Aviso: Cliente '" + userToken + "' não possui token FCM registrado ou não foi encontrado.");
          // Mesmo sem token, podemos marcar como notificado se desejado, ou deixar para quando registrar
          // Para evitar loop infinito em contas inativas, marcamos como notificado:
          marcarComoNotificadoNoFirestore(taskId, fields);
        }
      }
    }
    
  } catch (err) {
    Logger.log("Falha crítica no loop de verificação: " + err.toString());
  }
}

/**
 * Obtém o token FCM do cliente do Firestore
 */
function obterFcmTokenDoCliente(clientToken) {
  const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/" + DATABASE_ID + "/documents/clientes/" + clientToken + "?key=" + FIREBASE_API_KEY;
  
  const options = {
    "method": "get",
    "muteHttpExceptions": true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      const clientDoc = JSON.parse(response.getContentText());
      if (clientDoc && clientDoc.fields && clientDoc.fields.fcmToken) {
        return clientDoc.fields.fcmToken.stringValue;
      }
    }
  } catch (err) {
    Logger.log("Erro ao buscar token do cliente " + clientToken + ": " + err.toString());
  }
  return null;
}

/**
 * Envia push notification usando a API do Firebase Cloud Messaging (FCM)
 */
function enviarNotificacaoFCM(targetToken, titulo, corpo) {
  if (FCM_SERVER_KEY === "SUA_CHAVE_FCM_SERVER_KEY_AQUI") {
    Logger.log("Erro: FCM_SERVER_KEY não foi configurada no script.");
    return false;
  }
  
  const url = "https://fcm.googleapis.com/fcm/send";
  const payload = {
    "to": targetToken,
    "priority": "high",
    "time_to_live": 0,
    "notification": {
      "title": titulo,
      "body": corpo,
      "icon": "/icon.png",
      "sound": "default",
      "android_channel_id": "alarms",
      "click_action": "/"
    },
    "data": {
      "title": titulo,
      "body": corpo,
      "click_action": "/"
    }
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "Authorization": "key=" + FCM_SERVER_KEY
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    if (responseCode === 200) {
      Logger.log("Notificação enviada com sucesso para o token do dispositivo.");
      return true;
    } else {
      Logger.log("FCM retornou erro HTTP: " + responseCode + " - " + response.getContentText());
      return false;
    }
  } catch (err) {
    Logger.log("Erro de rede ao enviar notificação FCM: " + err.toString());
    return false;
  }
}

/**
 * Atualiza o status 'notificado' para true no Firestore
 */
function marcarComoNotificadoNoFirestore(taskId, existingFields) {
  const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/" + DATABASE_ID + "/documents/tarefas/" + taskId + "?updateMask.fieldPaths=notificado&key=" + FIREBASE_API_KEY;
  
  // Clona e atualiza o campo notificado
  const updatePayload = {
    "fields": {
      "notificado": { "booleanValue": true }
    }
  };
  
  const options = {
    "method": "patch",
    "contentType": "application/json",
    "payload": JSON.stringify(updatePayload),
    "muteHttpExceptions": true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      Logger.log("Tarefa " + taskId + " marcada com sucesso como 'notificado: true' no Firestore.");
    } else {
      Logger.log("Falha ao marcar tarefa como notificada. Status HTTP: " + response.getResponseCode() + " - " + response.getContentText());
    }
  } catch (err) {
    Logger.log("Erro ao atualizar campo notificado da tarefa: " + err.toString());
  }
}
