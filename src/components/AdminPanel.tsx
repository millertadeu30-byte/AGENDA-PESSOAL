import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
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
  ArrowRight
} from "lucide-react";

interface AdminPanelProps {
  token: string;
  handleLogout: () => void;
  showToast: (msg: string, isError?: boolean) => void;
  setGlobalLoading: (loading: boolean) => void;
}

interface AdminClient {
  token: string;
  nome: string;
  email: string;
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

  useEffect(() => {
    fetchClients();
  }, [refreshTrigger]);

  const fetchClients = async () => {
    setGlobalLoading(true);
    try {
      const res = await fetch(`/api/admin/clients/${token}`);
      if (!res.ok) throw new Error("Acesso negado ou erro no servidor");
      const data = await res.json();
      setClients(data.clientes || []);
    } catch (err: any) {
      showToast(err.message || "Erro ao carregar clientes", true);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleUpdateStatus = async (clientToken: string, status: string, extendDays = 0) => {
    setGlobalLoading(true);
    try {
      let vencimento: string | undefined = undefined;
      
      if (extendDays > 0) {
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + extendDays);
        vencimento = newDate.toISOString().split("T")[0];
      }

      const res = await fetch("/api/admin/clients/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminToken: token,
          clientToken,
          status,
          vencimento
        })
      });

      if (!res.ok) throw new Error("Erro ao atualizar cliente");
      showToast(extendDays > 0 ? "Acesso estendido por mais 30 dias!" : `Status atualizado para: ${status}!`);
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      showToast(err.message || "Falha na atualização", true);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDeleteClient = async (clientToken: string) => {
    setGlobalLoading(true);
    try {
      const res = await fetch(`/api/admin/clients/${token}/${clientToken}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Erro ao excluir cliente");
      showToast("Cliente removido definitivamente!");
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      showToast(err.message || "Falha ao excluir", true);
    } finally {
      setGlobalLoading(false);
      setDeletingClientToken(null);
    }
  };

  // Metrics calculations
  const totalUsers = clients.length;
  const vitalicioUsers = clients.filter(c => c.status === "Vitalício" || c.status === "Pago").length;
  const activeTrials = clients.filter(c => c.status === "Ativo" && c.diasRestantes >= 0).length;
  const expiredUsers = clients.filter(c => c.status === "Inadimplente" || (c.status === "Ativo" && c.diasRestantes < 0)).length;

  // Filter clients list
  const filteredClients = clients.filter(c => 
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Admin Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-rose-500/10 text-rose-400 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 border border-rose-500/20 rounded-full flex items-center gap-1.5 animate-pulse">
              <ShieldCheck className="w-3.5 h-3.5" /> Painel de Controle Admin
            </span>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-rose-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent tracking-tight font-sans">
            Gerenciador TaskControl
          </h1>
        </div>

        <button
          onClick={handleLogout}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:border-rose-500/30 hover:bg-slate-900/80 text-rose-400 hover:text-rose-300 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Sair do Console
        </button>
      </div>

      {/* Metrics Bento-Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Usuários</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="text-3xl font-bold text-slate-100">{totalUsers}</span>
        </div>

        {/* Metric 2 */}
        <div className="bg-emerald-950/10 border border-emerald-500/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Acesso Vitalício</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-3xl font-bold text-emerald-300">{vitalicioUsers}</span>
        </div>

        {/* Metric 3 */}
        <div className="bg-sky-950/10 border border-sky-500/10 p-4 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">Testando Grátis</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <span className="text-3xl font-bold text-sky-300">{activeTrials}</span>
        </div>

        {/* Metric 4 */}
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
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1E293B]/60 border border-slate-700/85 py-2.5 pl-11 pr-4 text-slate-100 text-xs font-sans tracking-wide outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 rounded-xl"
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
                    ? "bg-emerald-950/10 border-emerald-500/20 shadow-[0_4px_16px_rgba(16,185,129,0.03)]"
                    : isBlocked
                    ? "bg-rose-950/15 border-rose-500/20 shadow-[0_4px_16px_rgba(244,63,94,0.03)]"
                    : "bg-slate-900/40 border-slate-800/80"
                }`}
              >
                {/* Client Info */}
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-base font-semibold text-slate-100">{c.nome}</span>
                    <span className="text-xs text-slate-400 font-mono">({c.email})</span>
                    
                    {/* Status badges */}
                    {isPayer ? (
                      <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full">
                        ⭐ Vitalício (Pago)
                      </span>
                    ) : isBlocked ? (
                      <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full animate-pulse">
                        ⚠️ Bloqueado / Expirado
                      </span>
                    ) : (
                      <span className="bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full">
                        ⏳ Período de Teste
                      </span>
                    )}
                  </div>

                  {/* Expiration and time metrics */}
                  <div className="flex items-center gap-4 mt-2 text-xs font-mono text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      Validade: {c.vencimento ? c.vencimento.split("-").reverse().join("/") : "Sem prazo"}
                    </span>
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
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-600/10"
                        title="Liberar acesso vitalício permanente para o usuário"
                      >
                        <Unlock className="w-3.5 h-3.5" /> Liberar Acesso (R$ 14,99)
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
                      title="Excluir Conta Permanentemente"
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
            Nenhum cliente cadastrado ou encontrado na busca.
          </div>
        )}
      </div>
    </div>
  );
}
