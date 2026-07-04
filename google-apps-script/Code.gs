/**
 * ====================================================================
 *                 TASKCONTROL PRO - GOOGLE APPS SCRIPT BACKEND
 * ====================================================================
 * 
 * Este arquivo (Code.gs) contém toda a lógica do servidor para rodar o
 * aplicativo como um Web App do Google Apps Script. Ele simula o banco de
 * dados JSON usando um arquivo JSON simples armazenado de forma segura e
 * ilimitada no seu Google Drive (chamado "task_control_pro_db.json").
 * 
 * COMO PUBLICAR:
 * 1. Crie um novo projeto no Google Apps Script (script.google.com).
 * 2. Cole este código no arquivo "Código.gs".
 * 3. Crie um arquivo HTML chamado "Index" (sem o .html) e cole o conteúdo
 *    do arquivo "Index.html" gerado.
 * 4. Clique em "Implantar" > "Nova implantação".
 * 5. Tipo: "Aplicativo da Web".
 * 6. Executar como: "Eu" (sua conta).
 * 7. Quem pode acessar: "Qualquer um" (ou "Qualquer pessoa").
 * 8. Clique em "Implantar" e autorize as permissões de acesso ao Drive.
 */

// Retorna a página Index.html para o navegador
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Agenda Pessoal - TaskControl Pro")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Nome do arquivo de banco de dados no Google Drive
const DB_FILE_NAME = "task_control_pro_db.json";

// Função para buscar ou criar o arquivo de banco de dados no Google Drive
function getDatabaseFile() {
  const files = DriveApp.getFilesByName(DB_FILE_NAME);
  if (files.hasNext()) {
    return files.next();
  }
  
  // Banco de dados inicial com dados de demonstração
  const initialDB = {
    clientes: [
      {
        token: "USR_DEMO",
        nome: "Demonstração",
        email: "demo@taskcontrol.pro",
        senha: "demo",
        vencimento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 10 dias restantes
        status: "Ativo"
      }
    ],
    tarefas: [
      {
        id: "TAR_1",
        token: "USR_DEMO",
        tarefa: "Reunião de Alinhamento Semanal",
        data: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        horario: "09:00",
        recorrencia: "1 Semana",
        status: "Pendente"
      },
      {
        id: "TAR_2",
        token: "USR_DEMO",
        tarefa: "Pagar assinatura do servidor",
        data: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // Em atraso!
        horario: "15:30",
        recorrencia: "Nenhuma",
        status: "Pendente"
      }
    ],
    historico: [
      {
        id: "TAR_HIST_1",
        token: "USR_DEMO",
        tarefa: "Criar conta no TaskControl Pro",
        data: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        horario: "14:22",
        recorrencia: "Nenhuma",
        status: "Realizada"
      }
    ]
  };
  
  return DriveApp.createFile(DB_FILE_NAME, JSON.stringify(initialDB, null, 2), "application/json");
}

// Lê o banco de dados do arquivo JSON no Drive
function readDB() {
  try {
    const file = getDatabaseFile();
    const content = file.getBlob().getDataAsString();
    return JSON.parse(content);
  } catch (e) {
    Logger.log("Erro ao ler banco de dados: " + e.toString());
    return { clientes: [], tarefas: [], historico: [] };
  }
}

// Salva o banco de dados no arquivo JSON no Drive
function writeDB(data) {
  try {
    const file = getDatabaseFile();
    file.setContent(JSON.stringify(data, null, 2));
  } catch (e) {
    Logger.log("Erro ao salvar banco de dados: " + e.toString());
    throw new Error("Erro ao persistir dados no Google Drive: " + e.toString());
  }
}

// Verifica a situação do cliente (validade, inadimplência, etc.)
function verificarCliente(token, db) {
  const cliente = db.clientes.find(c => c.token === token);
  if (!cliente) {
    return { status: "Bloqueado", nome: "", aviso: false, diasRestantes: 0 };
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const statusAtual = cliente.status;
  let statusAtualizado = statusAtual;
  let avisoVencimento = false;
  let diasRestantes = 0;

  if (statusAtual.toLowerCase() === "pago" || statusAtual.toLowerCase() === "vitalício") {
    return { status: "Pago", nome: cliente.nome, aviso: false, diasRestantes: 0 };
  }

  if (cliente.vencimento) {
    // Adiciona o sufixo de hora de forma segura
    const dataVencimento = new Date(cliente.vencimento + "T23:59:59");
    if (!isNaN(dataVencimento.getTime())) {
      const diffTime = dataVencimento.getTime() - hoje.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        statusAtualizado = "Inadimplente";
      } else if (diffDays <= 5) {
        avisoVencimento = true;
        diasRestantes = diffDays;
      }
    }
  }

  if (statusAtual !== statusAtualizado) {
    cliente.status = statusAtualizado;
    writeDB(db);
  }

  return {
    status: statusAtualizado,
    nome: cliente.nome,
    aviso: avisoVencimento,
    diasRestantes: diasRestantes
  };
}

// Retorna os dados completos do cliente e suas tarefas
function obterDadosCliente(token) {
  const db = readDB();
  const checkStatus = verificarCliente(token, db);
  
  if (checkStatus.status === "Inadimplente" || checkStatus.status === "Bloqueado") {
    return { expired: true, status: checkStatus.status };
  }

  const pendentes = db.tarefas.filter(t => t.token === token && t.status === "Pendente");
  const historico = db.historico.filter(t => t.token === token);

  return {
    pendentes,
    historico,
    aviso: checkStatus.aviso,
    diasRestantes: checkStatus.diasRestantes,
    nome: checkStatus.nome,
    status: checkStatus.status
  };
}

// ====================================================================
//                     FUNÇÕES DE RPC EXPOSTAS (API)
// ====================================================================

// Registro de usuário
function api_auth_register(body) {
  const nome = body.nome;
  const email = body.email;
  const senha = body.senha;
  
  if (!nome || !email || !senha) {
    return { erro: "Preencha todos os campos!" };
  }

  const db = readDB();
  const emailExistente = db.clientes.some(c => c.email.toLowerCase() === email.toLowerCase());
  if (emailExistente) {
    return { erro: "Este E-mail já está cadastrado. Vá na opção Entrar." };
  }

  const token = "USR_" + Date.now();
  const hoje = new Date();
  hoje.setDate(hoje.getDate() + 30); // 30 dias grátis de demonstração
  const vencimento = hoje.toISOString().split("T")[0];

  const novoCliente = {
    token: token,
    nome: nome,
    email: email.toLowerCase(),
    senha: senha,
    vencimento: vencimento,
    status: "Ativo"
  };

  db.clientes.push(novoCliente);
  writeDB(db);

  return { sucesso: true, token: token, nome: nome };
}

// Login de usuário
function api_auth_login(body) {
  const email = body.email;
  const senha = body.senha;
  
  if (!email || !senha) {
    return { erro: "Preencha e-mail e senha!" };
  }

  // Bypass de administrador
  if (email.toLowerCase() === "admin@taskcontrol.pro" && senha === "admin123") {
    return { sucesso: true, token: "ADMIN_TOKEN_998877", nome: "Administrador" };
  }

  const db = readDB();
  const cliente = db.clientes.find(c => c.email.toLowerCase() === email.toLowerCase() && c.senha === senha);
  if (!cliente) {
    return { erro: "E-mail ou senha incorretos!" };
  }

  return { sucesso: true, token: cliente.token, nome: cliente.nome };
}

// Buscar todos os clientes (Painel Admin)
function api_admin_clients_get(adminToken) {
  if (adminToken !== "ADMIN_TOKEN_998877") {
    return { erro: "Acesso negado!" };
  }
  
  const db = readDB();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const clientsWithInfo = db.clientes.map(c => {
    let diasRestantes = 0;
    let statusCalculado = c.status;
    if (c.status.toLowerCase() !== "pago" && c.status.toLowerCase() !== "vitalício" && c.vencimento) {
      const dataVencimento = new Date(c.vencimento + "T23:59:59");
      if (!isNaN(dataVencimento.getTime())) {
        const diffTime = dataVencimento.getTime() - hoje.getTime();
        diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diasRestantes < 0) {
          statusCalculado = "Inadimplente";
        }
      }
    }
    return {
      token: c.token,
      nome: c.nome,
      email: c.email,
      vencimento: c.vencimento,
      status: statusCalculado,
      diasRestantes: diasRestantes
    };
  });
  
  return { clientes: clientsWithInfo };
}

// Atualizar dados de cliente (Painel Admin)
function api_admin_clients_update(body) {
  const adminToken = body.adminToken;
  const clientToken = body.clientToken;
  const status = body.status;
  const vencimento = body.vencimento;
  
  if (adminToken !== "ADMIN_TOKEN_998877") {
    return { erro: "Acesso negado!" };
  }
  
  const db = readDB();
  const client = db.clientes.find(c => c.token === clientToken);
  if (!client) {
    return { erro: "Cliente não encontrado!" };
  }
  
  if (status) client.status = status;
  if (vencimento) client.vencimento = vencimento;
  
  writeDB(db);
  return { sucesso: true };
}

// Deletar cliente (Painel Admin)
function api_admin_clients_delete(adminToken, clientToken) {
  if (adminToken !== "ADMIN_TOKEN_998877") {
    return { erro: "Acesso negado!" };
  }
  
  const db = readDB();
  const index = db.clientes.findIndex(c => c.token === clientToken);
  if (index !== -1) {
    db.clientes.splice(index, 1);
    // Limpa também as tarefas e histórico do cliente deletado
    db.tarefas = db.tarefas.filter(t => t.token !== clientToken);
    db.historico = db.historico.filter(t => t.token !== clientToken);
    writeDB(db);
    return { sucesso: true };
  } else {
    return { erro: "Cliente não encontrado!" };
  }
}

// Buscar dados completos de um cliente específico
function api_client_get(token) {
  if (token === "ADMIN_TOKEN_998877") {
    return { isAdmin: true, nome: "Administrador" };
  }
  return obterDadosCliente(token);
}

// Criar nova tarefa
function api_tasks_create(body) {
  const token = body.token;
  const tarefa = body.tarefa;
  const data = body.data;
  const horario = body.horario;
  const recorrencia = body.recorrencia;
  
  if (!token || !tarefa || !data) {
    return { erro: "Dados insuficientes para criar a tarefa." };
  }

  const db = readDB();
  const checkStatus = verificarCliente(token, db);
  if (checkStatus.status === "Inadimplente" || checkStatus.status === "Bloqueado") {
    return { expired: true };
  }

  const novaTarefa = {
    id: "TAR_" + Date.now(),
    token: token,
    tarefa: tarefa,
    data: data,
    horario: horario || "12:00",
    recorrencia: recorrencia || "Nenhuma",
    status: "Pendente"
  };

  db.tarefas.push(novaTarefa);
  writeDB(db);

  return obterDadosCliente(token);
}

// Concluir uma tarefa
function api_tasks_conclude(body) {
  const token = body.token;
  const idTarefa = body.idTarefa;
  
  if (!token || !idTarefa) {
    return { erro: "Dados insuficientes para concluir a tarefa." };
  }

  const db = readDB();
  const checkStatus = verificarCliente(token, db);
  if (checkStatus.status === "Inadimplente" || checkStatus.status === "Bloqueado") {
    return { expired: true };
  }

  const taskIndex = db.tarefas.findIndex(t => t.id === idTarefa && t.token === token);
  if (taskIndex !== -1) {
    const task = db.tarefas[taskIndex];
    const rec = task.recorrencia;

    if (rec && rec !== "Nenhuma") {
      // Calcula a próxima data de recorrência
      const novaData = new Date(task.data + "T" + (task.horario || "12:00"));
      if (rec === "1 Semana") novaData.setDate(novaData.getDate() + 7);
      else if (rec === "15 Dias") novaData.setDate(novaData.getDate() + 15);
      else if (rec === "Mensal") novaData.setMonth(novaData.getMonth() + 1);
      else if (rec === "Anual") novaData.setFullYear(novaData.getFullYear() + 1);

      task.data = novaData.toISOString().split("T")[0];
    } else {
      // Envia para o histórico e remove das tarefas ativas
      task.status = "Realizada";
      db.historico.push(task);
      db.tarefas.splice(taskIndex, 1);
    }
    writeDB(db);
  }

  return obterDadosCliente(token);
}

// Editar dados de uma tarefa
function api_tasks_update(body) {
  const token = body.token;
  const idTarefa = body.idTarefa;
  const tarefa = body.tarefa;
  const data = body.data;
  const horario = body.horario;
  const recorrencia = body.recorrencia;
  
  if (!token || !idTarefa || !tarefa || !data) {
    return { erro: "Dados insuficientes para editar a tarefa." };
  }

  const db = readDB();
  const checkStatus = verificarCliente(token, db);
  if (checkStatus.status === "Inadimplente" || checkStatus.status === "Bloqueado") {
    return { expired: true };
  }

  const task = db.tarefas.find(t => t.id === idTarefa && t.token === token);
  if (task) {
    task.tarefa = tarefa;
    task.data = data;
    task.horario = horario || "12:00";
    task.recorrencia = recorrencia || "Nenhuma";
    writeDB(db);
  }

  return obterDadosCliente(token);
}

// Excluir tarefa do painel ativo ou histórico
function api_tasks_delete(body) {
  const token = body.token;
  const idTarefa = body.idTarefa;
  
  if (!token || !idTarefa) {
    return { erro: "Dados insuficientes para excluir a tarefa." };
  }

  const db = readDB();
  const checkStatus = verificarCliente(token, db);
  if (checkStatus.status === "Inadimplente" || checkStatus.status === "Bloqueado") {
    return { expired: true };
  }

  // Verifica tarefas ativas primeiro
  const activeIndex = db.tarefas.findIndex(t => t.id === idTarefa && t.token === token);
  if (activeIndex !== -1) {
    db.tarefas.splice(activeIndex, 1);
  } else {
    // Caso contrário, busca e remove do histórico
    const histIndex = db.historico.findIndex(t => t.id === idTarefa && t.token === token);
    if (histIndex !== -1) {
      db.historico.splice(histIndex, 1);
    }
  }
  
  writeDB(db);
  return obterDadosCliente(token);
}
