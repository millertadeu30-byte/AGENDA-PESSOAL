import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const resolvedFilename = typeof __filename !== "undefined"
  ? __filename
  : (typeof import.meta !== "undefined" && import.meta.url ? fileURLToPath(import.meta.url) : "");

const resolvedDirname = typeof __dirname !== "undefined"
  ? __dirname
  : (resolvedFilename ? path.dirname(resolvedFilename) : process.cwd());

// On Vercel, the file system is read-only except for /tmp.
// We use /tmp/database.json on Vercel to allow seamless writes,
// and the frontend's Auto-Healing will recover tasks from local storage in case of serverless recycled database states.
const DB_FILE = process.env.VERCEL
  ? "/tmp/database.json"
  : path.join(resolvedDirname, "database.json");

// Structure of our persistent database
interface Cliente {
  token: string;
  nome: string;
  email: string;
  senha: string;
  vencimento: string; // YYYY-MM-DD
  status: string; // "Ativo" | "Pago" | "Vitalício" | "Inadimplente"
}

interface Tarefa {
  id: string;
  token: string;
  tarefa: string;
  data: string; // YYYY-MM-DD
  horario: string; // HH:MM
  recorrencia: "Nenhuma" | "1 Semana" | "15 Dias" | "Mensal" | "Anual";
  status: "Pendente" | "Realizada";
}

interface Database {
  clientes: Cliente[];
  tarefas: Tarefa[];
  historico: Tarefa[];
}

// Global in-memory cache to guarantee 100% uptime even if the underlying disk becomes read-only or crashes.
let inMemoryDBCache: Database | null = null;

// Ensure database file exists
function readDB(): Database {
  if (inMemoryDBCache) {
    return inMemoryDBCache;
  }

  const initialDB: Database = {
    clientes: [
      {
        token: "USR_DEMO",
        nome: "Demonstração",
        email: "demo@taskcontrol.pro",
        senha: "demo",
        vencimento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 10 days left
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
        data: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // Overdue!
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

  if (!fs.existsSync(DB_FILE)) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2), "utf-8");
    } catch (e) {
      console.warn("[Database] Failed to write initial DB file, using memory storage.", e);
    }
    inMemoryDBCache = initialDB;
    return initialDB;
  }

  try {
    const content = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(content) as Database;
    inMemoryDBCache = parsed;
    return parsed;
  } catch (e) {
    console.error("[Database] Error reading database JSON, recreating...", e);
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2), "utf-8");
    } catch (writeErr) {
      console.warn("[Database] Failed to rewrite broken DB file.", writeErr);
    }
    inMemoryDBCache = initialDB;
    return initialDB;
  }
}

function writeDB(data: Database) {
  inMemoryDBCache = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.warn("[Database] Failed to write to DB_FILE, continuing with in-memory fallback.", e);
  }
}

// Verification function (mirrors GAS "verificarCliente")
function verificarCliente(token: string, db: Database): { status: string; nome: string; aviso: boolean; diasRestantes: number } {
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

// Get full client task data
function obterDadosCliente(token: string) {
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

// Initialize Express App at Module Level to be Vercel Serverless ready!
const app = express();
app.use(express.json());

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Registration Route
app.post("/api/auth/register", (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: "Preencha todos os campos!" });
  }

  const db = readDB();
  const emailExistente = db.clientes.some(c => c.email.toLowerCase() === email.toLowerCase());
  if (emailExistente) {
    return res.status(400).json({ erro: "Este E-mail já está cadastrado. Vá na opção Entrar." });
  }

  const token = "USR_" + Date.now();
  const hoje = new Date();
  hoje.setDate(hoje.getDate() + 30); // 30 dias grátis
  const vencimento = hoje.toISOString().split("T")[0];

  const novoCliente: Cliente = {
    token,
    nome,
    email: email.toLowerCase(),
    senha,
    vencimento,
    status: "Ativo"
  };

  db.clientes.push(novoCliente);
  writeDB(db);

  res.json({ sucesso: true, token, nome });
});

// Login Route
app.post("/api/auth/login", (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: "Preencha e-mail e senha!" });
  }

  // Bypass de administrador para controle fácil do app
  if (email.toLowerCase() === "admin@taskcontrol.pro" && senha === "admin123") {
    return res.json({ sucesso: true, token: "ADMIN_TOKEN_998877", nome: "Administrador" });
  }

  const db = readDB();
  const cliente = db.clientes.find(c => c.email.toLowerCase() === email.toLowerCase() && c.senha === senha);
  if (!cliente) {
    return res.status(400).json({ erro: "E-mail ou senha incorretos!" });
  }

  res.json({ sucesso: true, token: cliente.token, nome: cliente.nome });
});

// Admin routes for managing clients
app.get("/api/admin/clients/:adminToken", (req, res) => {
  const { adminToken } = req.params;
  if (adminToken !== "ADMIN_TOKEN_998877") {
    return res.status(403).json({ erro: "Acesso negado!" });
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
      ...c,
      diasRestantes,
      status: statusCalculado
    };
  });
  res.json({ clientes: clientsWithInfo });
});

app.post("/api/admin/clients/update", (req, res) => {
  const { adminToken, clientToken, status, vencimento } = req.body;
  if (adminToken !== "ADMIN_TOKEN_998877") {
    return res.status(403).json({ erro: "Acesso negado!" });
  }
  const db = readDB();
  const client = db.clientes.find(c => c.token === clientToken);
  if (!client) {
    return res.status(404).json({ erro: "Cliente não encontrado!" });
  }
  if (status) client.status = status;
  if (vencimento) client.vencimento = vencimento;
  writeDB(db);
  res.json({ sucesso: true });
});

app.delete("/api/admin/clients/:adminToken/:clientToken", (req, res) => {
  const { adminToken, clientToken } = req.params;
  if (adminToken !== "ADMIN_TOKEN_998877") {
    return res.status(403).json({ erro: "Acesso negado!" });
  }
  const db = readDB();
  const index = db.clientes.findIndex(c => c.token === clientToken);
  if (index !== -1) {
    db.clientes.splice(index, 1);
    // Clean up their tasks & history too
    db.tarefas = db.tarefas.filter(t => t.token !== clientToken);
    db.historico = db.historico.filter(t => t.token !== clientToken);
    writeDB(db);
    res.json({ sucesso: true });
  } else {
    res.status(404).json({ erro: "Cliente não encontrado!" });
  }
});

// Get Client Data
app.get("/api/client/:token", (req, res) => {
  const { token } = req.params;
  if (token === "ADMIN_TOKEN_998877") {
    return res.json({ isAdmin: true, nome: "Administrador" });
  }
  const dados = obterDadosCliente(token);
  res.json(dados);
});

// Save New Task
app.post("/api/tasks", (req, res) => {
  const { token, tarefa, data, horario, recorrencia } = req.body;
  if (!token || !tarefa || !data) {
    return res.status(400).json({ erro: "Dados insuficientes para criar a tarefa." });
  }

  const db = readDB();
  const checkStatus = verificarCliente(token, db);
  if (checkStatus.status === "Inadimplente" || checkStatus.status === "Bloqueado") {
    return res.status(403).json({ expired: true });
  }

  const novaTarefa: Tarefa = {
    id: "TAR_" + Date.now(),
    token,
    tarefa,
    data,
    horario: horario || "12:00",
    recorrencia: recorrencia || "Nenhuma",
    status: "Pendente"
  };

  db.tarefas.push(novaTarefa);
  writeDB(db);

  res.json(obterDadosCliente(token));
});

// Conclude Task
app.post("/api/tasks/conclude", (req, res) => {
  const { token, idTarefa } = req.body;
  if (!token || !idTarefa) {
    return res.status(400).json({ erro: "Dados insuficientes para concluir a tarefa." });
  }

  const db = readDB();
  const checkStatus = verificarCliente(token, db);
  if (checkStatus.status === "Inadimplente" || checkStatus.status === "Bloqueado") {
    return res.status(403).json({ expired: true });
  }

  const taskIndex = db.tarefas.findIndex(t => t.id === idTarefa && t.token === token);
  if (taskIndex !== -1) {
    const task = db.tarefas[taskIndex];
    const rec = task.recorrencia;

    if (rec && rec !== "Nenhuma") {
      // Calculate recurrent date
      const novaData = new Date(task.data + "T" + (task.horario || "12:00"));
      if (rec === "1 Semana") novaData.setDate(novaData.getDate() + 7);
      else if (rec === "15 Dias") novaData.setDate(novaData.getDate() + 15);
      else if (rec === "Mensal") novaData.setMonth(novaData.getMonth() + 1);
      else if (rec === "Anual") novaData.setFullYear(novaData.getFullYear() + 1);

      // Update task date instead of moving to history
      task.data = novaData.toISOString().split("T")[0];
    } else {
      // Move to history
      task.status = "Realizada";
      db.historico.push(task);
      db.tarefas.splice(taskIndex, 1);
    }
    writeDB(db);
  }

  res.json(obterDadosCliente(token));
});

// Edit Task
app.put("/api/tasks", (req, res) => {
  const { token, idTarefa, tarefa, data, horario, recorrencia } = req.body;
  if (!token || !idTarefa || !tarefa || !data) {
    return res.status(400).json({ erro: "Dados insuficientes para editar a tarefa." });
  }

  const db = readDB();
  const checkStatus = verificarCliente(token, db);
  if (checkStatus.status === "Inadimplente" || checkStatus.status === "Bloqueado") {
    return res.status(403).json({ expired: true });
  }

  const task = db.tarefas.find(t => t.id === idTarefa && t.token === token);
  if (task) {
    task.tarefa = tarefa;
    task.data = data;
    task.horario = horario || "12:00";
    task.recorrencia = recorrencia || "Nenhuma";
    writeDB(db);
  }

  res.json(obterDadosCliente(token));
});

// Delete Task
app.delete("/api/tasks", (req, res) => {
  const { token, idTarefa } = req.body;
  if (!token || !idTarefa) {
    return res.status(400).json({ erro: "Dados insuficientes para excluir a tarefa." });
  }

  const db = readDB();
  const checkStatus = verificarCliente(token, db);
  if (checkStatus.status === "Inadimplente" || checkStatus.status === "Bloqueado") {
    return res.status(403).json({ expired: true });
  }

  // Check active tasks
  const activeIndex = db.tarefas.findIndex(t => t.id === idTarefa && t.token === token);
  if (activeIndex !== -1) {
    db.tarefas.splice(activeIndex, 1);
  } else {
    // Check history
    const histIndex = db.historico.findIndex(t => t.id === idTarefa && t.token === token);
    if (histIndex !== -1) {
      db.historico.splice(histIndex, 1);
    }
  }
  writeDB(db);

  res.json(obterDadosCliente(token));
});

// ----------------------------------------------------
// VITE DEVELOPMENT MIDDLEWARE OR STATIC SERVER
// ----------------------------------------------------
async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Only start standard port listener when NOT in a serverless environment like Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[TaskControl Pro] Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
