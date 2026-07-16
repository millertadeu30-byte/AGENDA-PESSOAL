import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  Unlock,
  Lock,
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
  ExternalLink,
  Save
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
  acessos: number;
  bloquearCompartilhamento?: boolean;
  grupo1?: string;
  grupo2?: string;
  grupo3?: string;
  grupo4?: string;
}

export default function AdminPanel({
  token,
  handleLogout,
  showToast,
  setGlobalLoading
}: AdminPanelProps) {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [editedGroups, setEditedGroups] = useState<Record<string, { grupo1: string; grupo2: string; grupo3: string; grupo4: string }>>({});
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
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [tempTokenValue, setTempTokenValue] = useState("");

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
          diasRestantes,
          acessos: data.acessos || 0,
          bloquearCompartilhamento: data.bloquearCompartilhamento || false,
          grupo1: data.grupo1 || "",
          grupo2: data.grupo2 || "",
          grupo3: data.grupo3 || "",
          grupo4: data.grupo4 || ""
        });
      });

      // Ordenar por nome
      list.sort((a, b) => a.nome.localeCompare(b.nome));
      
      const initialGroups: Record<string, { grupo1: string; grupo2: string; grupo3: string; grupo4: string }> = {};
      list.forEach((c) => {
        initialGroups[c.token] = {
          grupo1: c.grupo1 || "",
          grupo2: c.grupo2 || "",
          grupo3: c.grupo3 || "",
          grupo4: c.grupo4 || ""
        };
      });
      setEditedGroups(initialGroups);
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

  const handleResetAcessos = async (clientToken: string) => {
    setGlobalLoading(true);
    try {
      const clientDocRef = doc(db, "clientes", clientToken);
      await setDoc(clientDocRef, { acessos: 0 }, { merge: true });
      showToast("Contador de acessos zerado com sucesso! 🔄");
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      showToast("Erro ao zerar acessos: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleUpdateClientToken = async (oldToken: string, newTokenRaw: string) => {
    const newToken = newTokenRaw.trim();
    if (!newToken) {
      showToast("A chave de acesso não pode ser vazia!", true);
      return;
    }
    if (newToken === oldToken) return;

    setGlobalLoading(true);
    try {
      // 1. Check if the new token already exists
      const targetDocRef = doc(db, "clientes", newToken);
      const targetDocSnap = await getDoc(targetDocRef);
      if (targetDocSnap.exists()) {
        showToast("Esta chave de acesso já está em uso por outro usuário!", true);
        return;
      }

      // 2. Fetch the old client document
      const sourceDocRef = doc(db, "clientes", oldToken);
      const sourceDocSnap = await getDoc(sourceDocRef);
      if (!sourceDocSnap.exists()) {
        showToast("Documento de origem não encontrado!", true);
        return;
      }
      const clientData = sourceDocSnap.data();

      // 3. Create the new client document with identical data
      await setDoc(targetDocRef, clientData);

      // 4. Update all tasks associated with this old token in 'tarefas'
      const qOwned = query(collection(db, "tarefas"), where("token", "==", oldToken));
      const ownedSnap = await getDocs(qOwned);
      const updatePromises: Promise<any>[] = [];
      ownedSnap.forEach((taskDoc) => {
        const ref = doc(db, "tarefas", taskDoc.id);
        const updateObj: any = { token: newToken };
        if (taskDoc.data().tokenCriador === oldToken) {
          updateObj.tokenCriador = newToken;
        }
        updatePromises.push(setDoc(ref, updateObj, { merge: true }));
      });

      const qCreated = query(collection(db, "tarefas"), where("tokenCriador", "==", oldToken));
      const createdSnap = await getDocs(qCreated);
      createdSnap.forEach((taskDoc) => {
        if (taskDoc.data().token !== oldToken) {
          const ref = doc(db, "tarefas", taskDoc.id);
          updatePromises.push(setDoc(ref, { tokenCriador: newToken }, { merge: true }));
        }
      });

      const qShared = query(collection(db, "tarefas"), where("compartilhadoCom", "array-contains", oldToken));
      const sharedSnap = await getDocs(qShared);
      sharedSnap.forEach((taskDoc) => {
        const ref = doc(db, "tarefas", taskDoc.id);
        const currentShared: string[] = taskDoc.data().compartilhadoCom || [];
        const newShared = currentShared.map(t => t === oldToken ? newToken : t);
        updatePromises.push(setDoc(ref, { compartilhadoCom: newShared }, { merge: true }));
      });

      await Promise.all(updatePromises);

      // 5. Delete the old client document
      await deleteDoc(sourceDocRef);

      showToast(`Chave de acesso atualizada de "${oldToken}" para "${newToken}"! 🔑`);
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      showToast("Erro ao alterar chave de acesso: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleUpdateGroupLocal = (clientToken: string, field: "grupo1" | "grupo2" | "grupo3" | "grupo4", value: string) => {
    setEditedGroups(prev => ({
      ...prev,
      [clientToken]: {
        ...prev[clientToken],
        [field]: value
      }
    }));
  };

  const handleSavePanelGroups = async () => {
    setGlobalLoading(true);
    try {
      const savePromises = Object.entries(editedGroups).map(async ([clientToken, groups]) => {
        const clientDocRef = doc(db, "clientes", clientToken);
        const typedGroups = groups as { grupo1?: string; grupo2?: string; grupo3?: string; grupo4?: string };
        await setDoc(clientDocRef, {
          grupo1: (typedGroups.grupo1 || "").trim(),
          grupo2: (typedGroups.grupo2 || "").trim(),
          grupo3: (typedGroups.grupo3 || "").trim(),
          grupo4: (typedGroups.grupo4 || "").trim()
        }, { merge: true });
      });

      await Promise.all(savePromises);
      showToast("Configurações dos grupos salvas com sucesso! 💾👥");
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      showToast("Erro ao salvar grupos: " + err.message, true);
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

        <button
          onClick={handleSavePanelGroups}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-500/15 border border-indigo-500/30"
          title="Salvar todas as configurações de grupos de todos os usuários de uma só vez"
        >
          <Save className="w-3.5 h-3.5" /> Salvar Grupos
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
                    
                    {/* Campos de Grupo de Compartilhamento */}
                    <div className="inline-flex items-center gap-1 bg-slate-950 px-2.5 py-1 border border-slate-800 rounded-lg text-[10px] font-sans text-slate-300">
                      <Users className="w-3.5 h-3.5 text-indigo-400 mr-0.5" />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mr-1">Grupos:</span>
                      <input
                        type="text"
                        placeholder="Nenhum"
                        value={editedGroups[c.token]?.grupo1 || ""}
                        onChange={(e) => handleUpdateGroupLocal(c.token, "grupo1", e.target.value)}
                        className="w-10 bg-slate-900/80 text-center text-slate-100 font-mono font-bold border border-slate-700/60 rounded px-1 py-0.5 text-[10px] uppercase focus:border-indigo-500 focus:outline-none transition-all"
                        title="ID do Grupo 1"
                      />
                      <span className="text-slate-800 font-bold">|</span>
                      <input
                        type="text"
                        placeholder="Nenhum"
                        value={editedGroups[c.token]?.grupo2 || ""}
                        onChange={(e) => handleUpdateGroupLocal(c.token, "grupo2", e.target.value)}
                        className="w-10 bg-slate-900/80 text-center text-slate-100 font-mono font-bold border border-slate-700/60 rounded px-1 py-0.5 text-[10px] uppercase focus:border-indigo-500 focus:outline-none transition-all"
                        title="ID do Grupo 2"
                      />
                      <span className="text-slate-800 font-bold">|</span>
                      <input
                        type="text"
                        placeholder="Nenhum"
                        value={editedGroups[c.token]?.grupo3 || ""}
                        onChange={(e) => handleUpdateGroupLocal(c.token, "grupo3", e.target.value)}
                        className="w-10 bg-slate-900/80 text-center text-slate-100 font-mono font-bold border border-slate-700/60 rounded px-1 py-0.5 text-[10px] uppercase focus:border-indigo-500 focus:outline-none transition-all"
                        title="ID do Grupo 3"
                      />
                      <span className="text-slate-800 font-bold">|</span>
                      <input
                        type="text"
                        placeholder="Nenhum"
                        value={editedGroups[c.token]?.grupo4 || ""}
                        onChange={(e) => handleUpdateGroupLocal(c.token, "grupo4", e.target.value)}
                        className="w-10 bg-slate-900/80 text-center text-slate-100 font-mono font-bold border border-slate-700/60 rounded px-1 py-0.5 text-[10px] uppercase focus:border-indigo-500 focus:outline-none transition-all"
                        title="ID do Grupo 4"
                      />
                    </div>
                    
                     {/* Copyable & Editable Access Key */}
                     {editingToken === c.token ? (
                       <div className="inline-flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 border border-indigo-500 rounded-lg text-[10px] font-mono">
                         <Key className="w-3 h-3 text-indigo-400" />
                         <span className="text-slate-400 font-bold">Chave:</span>
                         <input
                           type="text"
                           value={tempTokenValue}
                           onChange={(e) => setTempTokenValue(e.target.value)}
                           className="w-16 bg-slate-900 text-slate-100 font-mono font-bold border border-slate-700/60 rounded px-1.5 py-0.5 text-[10px] uppercase focus:border-indigo-500 focus:outline-none"
                           autoFocus
                           onKeyDown={(e) => {
                             if (e.key === "Enter") {
                               handleUpdateClientToken(c.token, tempTokenValue);
                               setEditingToken(null);
                             } else if (e.key === "Escape") {
                               setEditingToken(null);
                             }
                           }}
                         />
                         <button
                           onClick={() => {
                             handleUpdateClientToken(c.token, tempTokenValue);
                             setEditingToken(null);
                           }}
                           className="p-0.5 hover:text-emerald-400 text-slate-400 transition-colors cursor-pointer"
                           title="Confirmar alteração de chave"
                         >
                           <Check className="w-3.5 h-3.5 text-emerald-400" />
                         </button>
                         <button
                           onClick={() => setEditingToken(null)}
                           className="p-0.5 hover:text-rose-400 text-slate-400 transition-colors cursor-pointer"
                           title="Cancelar"
                         >
                           <X className="w-3.5 h-3.5 text-rose-400" />
                         </button>
                       </div>
                     ) : (
                       <div className="inline-flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                         <button
                           onClick={() => copyToClipboard(c.token)}
                           className="inline-flex items-center gap-1.5 px-2 py-1 hover:bg-slate-900 text-[10px] font-mono text-indigo-300 transition-all cursor-pointer border-r border-slate-800/60"
                           title="Clique para copiar a chave de acesso"
                         >
                           <Key className="w-3 h-3 text-indigo-400" />
                           Chave: <span className="font-bold text-slate-200">{c.token}</span>
                           {copiedKey === c.token ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-60" />}
                         </button>
                         <button
                           onClick={() => {
                             setEditingToken(c.token);
                             setTempTokenValue(c.token);
                           }}
                           className="px-2 py-1 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 transition-all text-[10px] font-sans font-bold cursor-pointer"
                           title="Clique para editar esta chave de acesso"
                         >
                           Alterar
                         </button>
                       </div>
                     )}

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

                    {/* Contador de Acessos */}
                    <span className="bg-slate-950 px-2.5 py-1 border border-slate-800 rounded-lg text-[10px] font-mono text-indigo-300 flex items-center gap-1.5 transition-all">
                      <span>Acessos: <strong className="text-slate-100 font-bold">{c.acessos || 0}</strong></span>
                      <button
                        onClick={() => handleResetAcessos(c.token)}
                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all flex items-center gap-0.5 cursor-pointer ml-1 border border-rose-500/20"
                        title="Zerar contador de acessos"
                      >
                        Zerar
                      </button>
                    </span>
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
