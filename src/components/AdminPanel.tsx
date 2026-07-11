import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  Unlock,
  Calendar,
  Trash,
  Search,
  LogOut,
  RefreshCw,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Plus,
  Key,
  X,
  Copy,
  Check,
  Bell,
  ExternalLink
} from "lucide-react";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch
} from "firebase/firestore";

interface AdminPanelProps {
  token: string;
  handleLogout: () => void;
  showToast: (msg: string, isError?: boolean) => void;
  setGlobalLoading: (loading: boolean) => void;
}

interface AdminClient {
  token: string;
  nome: string;
  vencimento: string;
  status: string;
  diasRestantes: number;
}

export default function AdminPanel({
  token,
  handleLogout,
  showToast,
  setGlobalLoading
}: AdminPanelProps) {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [search, setSearch] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deletingClientToken, setDeletingClientToken] = useState<string | null>(null);

  // Form states for creating a new account
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newChave, setNewChave] = useState("");
  const [newStatus, setNewStatus] = useState("Ativo");
  const [newVencimento, setNewVencimento] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30); // 30 dias de teste por padrão
    return d.toISOString().split("T")[0];
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isScriptOpen, setIsScriptOpen] = useState(false);

  // Configuração de Vendas WhatsApp
  const [newWhatsappNumber, setNewWhatsappNumber] = useState("");
  const [newWhatsappDisplay, setNewWhatsappDisplay] = useState("");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  // FCM Config States
  const [fcmVapidKey, setFcmVapidKey] = useState("");
  const [fcmServerKey, setFcmServerKey] = useState("");
  const [savingFcm, setSavingFcm] = useState(false);

  // Busca configurações salvas
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const configSnap = await getDoc(doc(db, "config", "whatsapp"));
        if (configSnap.exists()) {
          const data = configSnap.data();
          if (data.number) setNewWhatsappNumber(data.number);
          if (data.display) setNewWhatsappDisplay(data.display);
        } else {
          setNewWhatsappNumber("5531988888888");
          setNewWhatsappDisplay("(31) 98888-8888");
        }

        const fcmSnap = await getDoc(doc(db, "config", "fcm"));
        if (fcmSnap.exists()) {
          const data = fcmSnap.data();
          if (data.vapidKey) setFcmVapidKey(data.vapidKey);
          if (data.serverKey) setFcmServerKey(data.serverKey);
        }
      } catch (err: any) {
        console.warn("Erro ao obter configurações:", err);
      }
    };
    fetchConfigs();
  }, []);

  const saveFcmConfig = async () => {
    setSavingFcm(true);
    try {
      await setDoc(doc(db, "config", "fcm"), {
        vapidKey: fcmVapidKey.trim(),
        serverKey: fcmServerKey.trim(),
        updatedAt: new Date().toISOString()
      });
      showToast("Configuração do Firebase FCM salva com sucesso!");
    } catch (err: any) {
      showToast("Erro ao salvar configuração FCM: " + err.message, true);
    } finally {
      setSavingFcm(false);
    }
  };

  const saveWhatsappConfig = async () => {
    if (!newWhatsappNumber.trim()) {
      return showToast("Por favor, digite o número do WhatsApp.", true);
    }
    if (!newWhatsappDisplay.trim()) {
      return showToast("Por favor, digite a exibição visual do WhatsApp.", true);
    }
    setSavingWhatsapp(true);
    try {
      await setDoc(doc(db, "config", "whatsapp"), {
        number: newWhatsappNumber.trim(),
        display: newWhatsappDisplay.trim(),
        updatedAt: new Date().toISOString()
      });
      showToast("Configuração do WhatsApp salva com sucesso!");
    } catch (err: any) {
      showToast("Erro ao salvar configuração: " + err.message, true);
    } finally {
      setSavingWhatsapp(false);
    }
  };

  // Auto generate a random 4-digit key
  const handleGenerateKeySuggestion = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000).toString();
    setNewChave(randomNum);
  };

  useEffect(() => {
    if (isNewKeyModalOpen && !newChave) {
      handleGenerateKeySuggestion();
    }
  }, [isNewKeyModalOpen]);

  useEffect(() => {
    fetchClients();
  }, [refreshTrigger]);

  const fetchClients = async () => {
    setGlobalLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "clientes"));
      const list: AdminClient[] = [];
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (docSnap.id === "8619") return; // Ignora o próprio admin da contagem de clientes comuns

        let diasRestantes = 0;
        let statusCalculado = data.status || "Ativo";

        if (statusCalculado !== "Pago" && statusCalculado !== "Vitalício" && data.vencimento) {
          const dataVencimento = new Date(data.vencimento + "T23:59:59");
          if (!isNaN(dataVencimento.getTime())) {
            const diffTime = dataVencimento.getTime() - hoje.getTime();
            diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diasRestantes < 0) {
              statusCalculado = "Inadimplente";
            }
          }
        }

        list.push({
          token: docSnap.id,
          nome: data.nome || "Usuário sem nome",
          vencimento: data.vencimento || "",
          status: statusCalculado,
          diasRestantes
        });
      });

      // Ordenar por nome
      list.sort((a, b) => a.nome.localeCompare(b.nome));
      setClients(list);
    } catch (err: any) {
      showToast("Erro ao conectar ao Firestore: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNome.trim()) return showToast("Por favor, digite o nome do usuário.", true);
    if (!newChave.trim()) return showToast("Por favor, informe a chave de acesso.", true);

    setGlobalLoading(true);
    try {
      const cleanKey = newChave.trim();
      const clientDocRef = doc(db, "clientes", cleanKey);
      
      await setDoc(clientDocRef, {
        nome: newNome.trim(),
        vencimento: newVencimento,
        status: newStatus,
        createdAt: Date.now()
      });

      showToast(`Chave "${cleanKey}" para ${newNome} criada com sucesso!`);
      setIsNewKeyModalOpen(false);
      
      // Reset form
      setNewNome("");
      setNewChave("");
      setNewStatus("Ativo");
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setNewVencimento(d.toISOString().split("T")[0]);

      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      showToast("Erro ao salvar no Firestore: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleUpdateStatus = async (clientToken: string, status: string, extendDays = 0) => {
    setGlobalLoading(true);
    try {
      const clientDocRef = doc(db, "clientes", clientToken);
      const updateData: any = { status };

      if (extendDays > 0) {
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + extendDays);
        updateData.vencimento = newDate.toISOString().split("T")[0];
      }

      await setDoc(clientDocRef, updateData, { merge: true });
      showToast(extendDays > 0 ? "Acesso estendido por mais 30 dias!" : `Status atualizado para: ${status}!`);
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      showToast("Falha na atualização: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleUpdateVencimento = async (clientToken: string, newVencimento: string) => {
    if (!newVencimento) return;
    setGlobalLoading(true);
    try {
      const clientDocRef = doc(db, "clientes", clientToken);
      await setDoc(clientDocRef, { vencimento: newVencimento }, { merge: true });
      showToast("Vencimento atualizado com sucesso!");
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      showToast("Erro ao atualizar vencimento: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDeleteClient = async (clientToken: string) => {
    setGlobalLoading(true);
    try {
      // 1. Deleta o documento do cliente do Firestore
      await deleteDoc(doc(db, "clientes", clientToken));

      // 2. Deleta todas as tarefas associadas a esse cliente via lote (Batch)
      const q = query(collection(db, "tarefas"), where("token", "==", clientToken));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const batch = writeBatch(db);
        querySnapshot.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }

      showToast("Conta e tarefas associadas removidas definitivamente!");
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      showToast("Falha ao excluir: " + err.message, true);
    } finally {
      setGlobalLoading(false);
      setDeletingClientToken(null);
    }
  };

  const copyToClipboard = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(txt);
    showToast("Chave copiada para a área de transferência!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Metricas
  const totalUsers = clients.length;
  const vitalicioUsers = clients.filter(c => c.status === "Vitalício" || c.status === "Pago").length;
  const activeTrials = clients.filter(c => c.status === "Ativo" && c.diasRestantes >= 0).length;
  const expiredUsers = clients.filter(c => c.status === "Inadimplente" || (c.status === "Ativo" && c.diasRestantes < 0)).length;

  const filteredClients = clients.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.token.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Admin Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-rose-500/10 text-rose-400 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 border border-rose-500/20 rounded-full flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> GERENCIAMENTO DE CONTAS
            </span>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight font-sans">
            Painel do Administrador
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsNewKeyModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova Chave de Acesso
          </button>

          <button
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:border-rose-500/30 hover:bg-slate-900/80 text-rose-400 hover:text-rose-300 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>

      {/* Metrics Bento-Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Contas</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="text-3xl font-bold text-slate-100">{totalUsers}</span>
        </div>

        <div className="bg-emerald-950/10 border border-emerald-500/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Vitalício (R$ 4,99)</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-3xl font-bold text-emerald-300">{vitalicioUsers}</span>
        </div>

        <div className="bg-sky-950/10 border border-sky-500/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">Teste Grátis</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <span className="text-3xl font-bold text-sky-300">{activeTrials}</span>
        </div>

        <div className="bg-rose-950/15 border border-rose-500/15 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">Bloqueados/Expirados</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <span className="text-3xl font-bold text-rose-300">{expiredUsers}</span>
        </div>
      </div>

      {/* Configuração de Vendas WhatsApp */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl space-y-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
              Configuração do WhatsApp de Contato
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Defina o número e a exibição visual do WhatsApp para os botões de contato e liberação de acesso (exibidos quando o período de teste do usuário expira).
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Número (Apenas números + DDD)
            </label>
            <input
              type="text"
              placeholder="Ex: 5531988888888"
              value={newWhatsappNumber}
              onChange={(e) => setNewWhatsappNumber(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-[#1E293B]/60 border border-slate-700/85 py-2 px-3 text-slate-100 text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 rounded-xl"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Exibição Visual (Texto do Botão)
            </label>
            <input
              type="text"
              placeholder="Ex: (31) 98888-8888"
              value={newWhatsappDisplay}
              onChange={(e) => setNewWhatsappDisplay(e.target.value)}
              className="w-full bg-[#1E293B]/60 border border-slate-700/85 py-2 px-3 text-slate-100 text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 rounded-xl"
            />
          </div>

          <button
            onClick={saveWhatsappConfig}
            disabled={savingWhatsapp}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-bold py-2 px-4 text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-950/30 cursor-pointer h-9 flex items-center justify-center gap-1.5"
          >
            {savingWhatsapp ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Salvar Configurações
              </>
            )}
          </button>
        </div>
      </div>

      {/* Configuração de Notificações em Segundo Plano (FCM & Google Apps Script) */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl space-y-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
              Configuração do Firebase Cloud Messaging (FCM)
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Insira as chaves do FCM do seu projeto Firebase para habilitar notificações quando o celular estiver em repouso (tela apagada) e o app fechado.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              FCM VAPID Public Key (Chave Pública Web Push)
            </label>
            <input
              type="text"
              placeholder="Chave VAPID pública gerada no Firebase Console..."
              value={fcmVapidKey}
              onChange={(e) => setFcmVapidKey(e.target.value)}
              className="w-full bg-[#1E293B]/60 border border-slate-700/85 py-2 px-3 text-slate-100 text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              FCM Legacy Server Key (Chave do Servidor)
            </label>
            <input
              type="password"
              placeholder="Chave do Servidor (Legacy) obtida no Firebase Console..."
              value={fcmServerKey}
              onChange={(e) => setFcmServerKey(e.target.value)}
              className="w-full bg-[#1E293B]/60 border border-slate-700/85 py-2 px-3 text-slate-100 text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={saveFcmConfig}
            disabled={savingFcm}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold py-2 px-6 text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-950/30 cursor-pointer h-9 flex items-center justify-center gap-1.5"
          >
            {savingFcm ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Salvar Chaves FCM
              </>
            )}
          </button>
        </div>

        <div className="border-t border-slate-800/80 pt-4 mt-2">
          <button
            onClick={() => setIsScriptOpen(!isScriptOpen)}
            className="flex items-center justify-between w-full py-1.5 text-slate-300 hover:text-slate-100 text-xs font-semibold cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Como configurar Alertas 24h gratuitos em Segundo Plano (Google Apps Script)
            </span>
            <span className="text-slate-500 text-lg font-mono">{isScriptOpen ? "−" : "+"}</span>
          </button>

          {isScriptOpen && (
            <div className="mt-3 bg-slate-950/50 rounded-xl p-4 text-xs text-slate-300 space-y-3 font-sans border border-slate-800/40">
              <p>
                Como celulares congelam as abas do navegador em repouso, a única forma de garantir que as notificações cheguem instantaneamente é através de um acionador (CRON) que roda na nuvem do Google de forma 100% gratuita!
              </p>
              <div className="space-y-1.5 pl-4 list-decimal text-slate-400">
                <div>1. Acesse o <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline inline-flex items-center gap-0.5">Google Apps Script <ExternalLink className="w-3 h-3" /></a> e crie um novo projeto.</div>
                <div>2. Crie um arquivo chamado <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded font-mono">CronNotifications.gs</code>.</div>
                <div>3. Copie o código pronto abaixo e cole nele.</div>
                <div>4. Configure a variável <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded font-mono">FCM_SERVER_KEY</code> com a Chave do Servidor salva acima.</div>
                <div>5. No Apps Script, vá em <strong>Acionadores</strong> (ícone de relógio) &gt; <strong>+ Adicionar acionador</strong>. Escolha a função <code className="font-mono text-indigo-300">verificarTarefasVencidas</code>, selecione <strong>"Baseado no tempo"</strong>, <strong>"Temporizador de minutos"</strong> e defina <strong>"A cada minuto"</strong>. Salve e autorize!</div>
              </div>

              <div className="relative mt-4 bg-slate-900 rounded-lg p-3 border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">CronNotifications.gs</span>
                  <button
                    onClick={() => {
                      const code = `/**
 * ====================================================================
 *       NOTIFICAÇÕES EM SEGUNDO PLANO (CRON) - GOOGLE APPS SCRIPT
 * ====================================================================
 */
const FIREBASE_PROJECT_ID = "graphite-victor-gwjkk";
const DATABASE_ID = "ai-studio-agendapessoal-fc3bdaa2-d330-424a-8601-205709bcd648";
const FIREBASE_API_KEY = "AIzaSyBJUFeUUCwfVLnSI_lX7gRNIGJwgbsJ3wg";
const FCM_SERVER_KEY = "${fcmServerKey || "SUA_CHAVE_FCM_SERVER_KEY_AQUI"}"; 

function verificarTarefasVencidas() {
  Logger.log("Iniciando verificação de tarefas vencidas...");
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
    if (response.getResponseCode() !== 200) return;
    
    const results = JSON.parse(response.getContentText());
    if (!results || results.length === 0 || !results[0].document) return;
    
    const agora = new Date();
    const fcmTokensCache = {};

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      if (!item.document) continue;
      
      const doc = item.document;
      const fields = doc.fields;
      const docName = doc.name;
      const taskId = docName.substring(docName.lastIndexOf("/") + 1);
      
      const tarefaNome = fields.tarefa ? fields.tarefa.stringValue : "Compromisso";
      const dataTarefaStr = fields.data ? fields.data.stringValue : "";
      const horarioTarefaStr = fields.horario ? fields.horario.stringValue : "12:00";
      const userToken = fields.token ? fields.token.stringValue : "";
      const notificado = fields.notificado ? fields.notificado.booleanValue : false;
      
      if (notificado === true || !dataTarefaStr || !userToken) continue;
      
      const dataTarefa = new Date(dataTarefaStr + "T" + horarioTarefaStr);
      if (dataTarefa.getTime() <= agora.getTime()) {
        let fcmToken = fcmTokensCache[userToken];
        if (fcmToken === undefined) {
          fcmToken = obterFcmTokenDoCliente(userToken);
          fcmTokensCache[userToken] = fcmToken;
        }
        
        if (fcmToken) {
          const fcmSucesso = enviarNotificacaoFCM(fcmToken, "Compromisso Vencido!", "Está na hora de: " + tarefaNome + " (" + horarioTarefaStr + ")");
          if (fcmSucesso) marcarComoNotificadoNoFirestore(taskId);
        } else {
          marcarComoNotificadoNoFirestore(taskId);
        }
      }
    }
  } catch (err) {
    Logger.log(err.toString());
  }
}

function obterFcmTokenDoCliente(clientToken) {
  const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/" + DATABASE_ID + "/documents/clientes/" + clientToken + "?key=" + FIREBASE_API_KEY;
  try {
    const response = UrlFetchApp.fetch(url, { "method": "get", "muteHttpExceptions": true });
    if (response.getResponseCode() === 200) {
      const clientDoc = JSON.parse(response.getContentText());
      if (clientDoc && clientDoc.fields && clientDoc.fields.fcmToken) {
        return clientDoc.fields.fcmToken.stringValue;
      }
    }
  } catch (e) {}
  return null;
}

function enviarNotificacaoFCM(targetToken, titulo, corpo) {
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
    "headers": { "Authorization": "key=" + FCM_SERVER_KEY },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    return response.getResponseCode() === 200;
  } catch (e) {
    return false;
  }
}

function marcarComoNotificadoNoFirestore(taskId) {
  const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/" + DATABASE_ID + "/documents/tarefas/" + taskId + "?updateMask.fieldPaths=notificado&key=" + FIREBASE_API_KEY;
  const updatePayload = { "fields": { "notificado": { "booleanValue": true } } };
  try {
    UrlFetchApp.fetch(url, {
      "method": "patch",
      "contentType": "application/json",
      "payload": JSON.stringify(updatePayload),
      "muteHttpExceptions": true
    });
  } catch (e) {}
}`;
                      navigator.clipboard.writeText(code);
                      setCopiedScript(true);
                      setTimeout(() => setCopiedScript(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 font-mono transition-all text-[10px] cursor-pointer border border-slate-700/50"
                  >
                    {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedScript ? "Copiado!" : "Copiar Código"}
                  </button>
                </div>
                <pre className="text-[10px] font-mono text-slate-400 overflow-x-auto max-h-48 p-1.5 bg-slate-950 rounded scrollbar-thin select-all">
{`const FIREBASE_PROJECT_ID = "graphite-victor-gwjkk";
const DATABASE_ID = "ai-studio-agendapessoal-fc3bdaa2-d330-424a-8601-205709bcd648";
const FIREBASE_API_KEY = "AIzaSyBJUFeUUCwfVLnSI_lX7gRNIGJwgbsJ3wg";
const FCM_SERVER_KEY = "${fcmServerKey || "SUA_CHAVE_FCM_SERVER_KEY_AQUI"}"; 

function verificarTarefasVencidas() {
  ... (Clique em copiar código acima para obter o script completo)
}`}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Area */}
      <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou chave de acesso..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1E293B]/60 border border-slate-700/85 py-2.5 pl-11 pr-4 text-slate-100 text-xs font-sans tracking-wide outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl"
          />
        </div>

        <button
          onClick={() => setRefreshTrigger(prev => prev + 1)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar Lista
        </button>
      </div>

      {/* Clients List Cards */}
      <div className="space-y-4">
        {filteredClients.length > 0 ? (
          filteredClients.map((c) => {
            const isPayer = c.status === "Vitalício" || c.status === "Pago";
            const isBlocked = c.status === "Inadimplente" || (!isPayer && c.diasRestantes < 0);

            return (
              <motion.div
                key={c.token}
                className={`p-5 rounded-2xl border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isPayer
                    ? "bg-emerald-950/10 border-emerald-500/20"
                    : isBlocked
                    ? "bg-rose-950/15 border-rose-500/20"
                    : "bg-slate-900/40 border-slate-800/80"
                }`}
              >
                {/* Client Info */}
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-base font-semibold text-slate-100">{c.nome}</span>
                    
                    {/* Copyable Access Key */}
                    <button
                      onClick={() => copyToClipboard(c.token)}
                      className="inline-flex items-center gap-1.5 bg-slate-950 px-2 py-1 border border-slate-800 hover:border-indigo-500 hover:bg-slate-900 rounded-lg text-[10px] font-mono text-indigo-300 transition-all cursor-pointer"
                      title="Clique para copiar a chave de acesso"
                    >
                      <Key className="w-3 h-3 text-indigo-400" />
                      Chave: <span className="font-bold text-slate-200">{c.token}</span>
                      {copiedKey === c.token ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-60" />}
                    </button>

                    {/* Status badges */}
                    {isPayer ? (
                      <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full">
                        ⭐ Vitalício (R$ 4,99)
                      </span>
                    ) : isBlocked ? (
                      <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full animate-pulse">
                        ⚠️ Bloqueado / Expirado
                      </span>
                    ) : (
                      <span className="bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full">
                        ⏳ Teste Grátis
                      </span>
                    )}
                  </div>

                  {/* Expiration and time metrics */}
                  <div className="flex items-center gap-4 mt-2 text-xs font-mono text-slate-400 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800/80 px-2.5 py-1 rounded-xl">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-slate-400 text-[11px]">Vencimento:</span>
                      <input
                        type="date"
                        value={c.vencimento || ""}
                        onChange={(e) => handleUpdateVencimento(c.token, e.target.value)}
                        className="bg-transparent border-none text-indigo-300 font-bold outline-none cursor-pointer focus:text-indigo-200"
                        title="Clique para alterar a data de vencimento manualmente"
                      />
                    </div>
                    {!isPayer && (
                      <span className={`font-semibold ${isBlocked ? "text-rose-400" : "text-sky-300"}`}>
                        {isBlocked
                          ? `Expirou há ${Math.abs(c.diasRestantes)} dia(s)`
                          : `${c.diasRestantes} dia(s) restante(s)`
                        }
                      </span>
                    )}
                  </div>
                </div>

                {/* Administration Actions */}
                <div className="flex items-center gap-2.5 flex-wrap self-end lg:self-center">
                  {!isPayer && (
                    <>
                      {/* Action 1: Activate/Release Vitalício */}
                      <button
                        onClick={() => handleUpdateStatus(c.token, "Vitalício")}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg"
                        title="Liberar acesso vitalício permanente para o usuário"
                      >
                        <Unlock className="w-3.5 h-3.5" /> Liberar Vitalício
                      </button>

                      {/* Action 2: Extend +30 Days Trial */}
                      <button
                        onClick={() => handleUpdateStatus(c.token, "Ativo", 30)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                        title="Adicionar mais 30 dias de período grátis"
                      >
                        Dar +30 Dias Grátis
                      </button>
                    </>
                  )}

                  {isPayer && (
                    <button
                      onClick={() => handleUpdateStatus(c.token, "Ativo", 30)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                      title="Voltar cliente para período de teste (remover vitalício)"
                    >
                      Reverter para Teste
                    </button>
                  )}

                  {/* Action 3: Delete client */}
                  {deletingClientToken === c.token ? (
                    <div className="flex items-center gap-1.5 bg-slate-950/40 p-1 border border-slate-800 rounded-xl">
                      <span className="text-rose-400 text-[9px] font-bold uppercase tracking-wider px-1.5 animate-pulse">Excluir Conta?</span>
                      <button
                        onClick={() => handleDeleteClient(c.token)}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                      >
                        Sim
                      </button>
                      <button
                        onClick={() => setDeletingClientToken(null)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingClientToken(c.token)}
                      className="w-9 h-9 border border-rose-500/25 text-rose-400 hover:bg-rose-600 hover:text-white flex items-center justify-center rounded-xl transition-all cursor-pointer"
                      title="Excluir Conta e todas as suas tarefas permanentemente"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="py-12 text-center text-sm text-slate-400 bg-slate-900/20 rounded-2xl border border-dashed border-slate-800/80">
            Nenhuma conta cadastrada ou encontrada na busca.
          </div>
        )}
      </div>

      {/* CREATE ACCOUNT / KEY MODAL */}
      <AnimatePresence>
        {isNewKeyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-3xl shadow-2xl relative overflow-hidden"
            >
              <button
                onClick={() => setIsNewKeyModalOpen(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-100 p-1 hover:bg-slate-800 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-slate-800">
                <Key className="w-5 h-5 text-indigo-400 animate-bounce" />
                <h3 className="text-lg font-bold text-slate-100 font-sans">
                  Criar Nova Chave de Acesso
                </h3>
              </div>

              <form onSubmit={handleCreateClient} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Nome do Usuário
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva"
                    value={newNome}
                    onChange={(e) => setNewNome(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 px-4 py-2.5 text-slate-100 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>Chave de Acesso (Senha)</span>
                    <button
                      type="button"
                      onClick={handleGenerateKeySuggestion}
                      className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold tracking-wide uppercase transition-all"
                    >
                      Sugerir Chave Aleatória
                    </button>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 5821"
                    value={newChave}
                    onChange={(e) => setNewChave(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 px-4 py-2.5 text-slate-100 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono tracking-widest font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Status Inicial
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 px-3 py-2.5 text-slate-200 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-sans"
                    >
                      <option value="Ativo">Teste Grátis</option>
                      <option value="Vitalício">Vitalício (R$ 4,99)</option>
                      <option value="Inadimplente">Bloqueado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Vencimento
                    </label>
                    <input
                      type="date"
                      required
                      value={newVencimento}
                      onChange={(e) => setNewVencimento(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 px-3 py-2.5 text-slate-200 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all shadow-lg"
                  >
                    <Plus className="w-4 h-4" /> Criar Chave de Acesso
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
