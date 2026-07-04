import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ListCheck,
  History,
  Plus,
  X,
  Search,
  LogOut,
  AlertTriangle,
  Check,
  Trash,
  Edit,
  Loader2,
  Gift,
  CheckSquare,
  Lock,
  PhoneCall,
  Calendar,
  Clock,
  Mic,
  MicOff,
  Bell,
  VolumeX
} from "lucide-react";
import { Tarefa, ClientData } from "./types";
import AdminPanel from "./components/AdminPanel";

// Utilitário seguro para armazenamento (safeStorage) que evita falhas em iframes do Google Apps Script
const safeStorage = {
  getItem: (key: string): string => {
    try {
      return localStorage.getItem(key) || "";
    } catch (e) {
      console.warn("[Storage] localStorage is not available, using memory fallback.", e);
      return (window as any).__storageFallback?.[key] || "";
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("[Storage] localStorage set failed, saving to memory fallback.", e);
      if (!(window as any).__storageFallback) {
        (window as any).__storageFallback = {};
      }
      (window as any).__storageFallback[key] = value;
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("[Storage] localStorage remove failed, removing from memory fallback.", e);
      if ((window as any).__storageFallback) {
        delete (window as any).__storageFallback[key];
      }
    }
  }
};

export default function App() {
  // Authentication & session state
  const [token, setToken] = useState<string>(() => safeStorage.getItem("taskControlProToken") || "");
  const [nomeUsuario, setNomeUsuario] = useState<string>(() => safeStorage.getItem("taskControlProUserName") || "");
  const [authTab, setAuthTab] = useState<"login" | "register">("login");

  // Authentication inputs
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [regNome, setRegNome] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");

  // UI state
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [currentTab, setCurrentTab] = useState<"pendentes" | "historico">("pendentes");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  // New task inputs
  const [taskName, setTaskName] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [taskTime, setTaskTime] = useState("");
  const [taskRecurrence, setTaskRecurrence] = useState<"Nenhuma" | "1 Semana" | "15 Dias" | "Mensal" | "Anual">("Nenhuma");

  // Edit task modal inputs
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<"Nenhuma" | "1 Semana" | "15 Dias" | "Mensal" | "Anual">("Nenhuma");

  // Alarms/Expired task reminder states
  const [activeAlarmTask, setActiveAlarmTask] = useState<Tarefa | null>(null);
  const [dismissedAlarms, setDismissedAlarms] = useState<string[]>([]);
  const alarmIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const startAlarmSound = () => {
    if (alarmIntervalRef.current) return;

    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
    } catch (e) {
      console.warn("Failed to initialize AudioContext safely:", e);
      return;
    }

    const playChime = () => {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch((e) => console.log("Failed to resume context:", e));
      }

      try {
        const now = ctx.currentTime;
        
        // G5 (783.99 Hz) - Gentle and pleasant high-pitched note
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(783.99, now);
        gain1.gain.setValueAtTime(0.0, now);
        gain1.gain.linearRampToValueAtTime(0.1, now + 0.04);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // B5 (987.77 Hz) - Harmonizing note after 150ms delay
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(987.77, now + 0.15);
        gain2.gain.setValueAtTime(0.0, now + 0.15);
        gain2.gain.linearRampToValueAtTime(0.1, now + 0.19);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.55);
      } catch (err) {
        console.error("Erro ao gerar bip:", err);
      }
    };

    try {
      playChime();
    } catch (e) {
      console.log("Audio play error:", e);
    }
    alarmIntervalRef.current = setInterval(playChime, 1800);
  };

  const stopAlarmSound = () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  };

  // Periodic checker to alarm when a task reaches its deadline
  useEffect(() => {
    if (!token || !clientData || clientData.isAdmin) return;

    const checkOverdueTasks = () => {
      // Find any task that is overdue AND not yet dismissed
      const overdueTask = clientData.pendentes.find((t) => {
        return isTaskOverdue(t) && !dismissedAlarms.includes(t.id);
      });

      if (overdueTask && !activeAlarmTask) {
        setActiveAlarmTask(overdueTask);
        startAlarmSound();
      }
    };

    checkOverdueTasks();
    const interval = setInterval(checkOverdueTasks, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [token, clientData, dismissedAlarms, activeAlarmTask]);

  // Clean up alarm sound on unmount or activeAlarmTask clears
  useEffect(() => {
    if (!activeAlarmTask) {
      stopAlarmSound();
    }
    return () => stopAlarmSound();
  }, [activeAlarmTask]);

  const handleDismissAlarm = () => {
    if (activeAlarmTask) {
      setDismissedAlarms((prev) => [...prev, activeAlarmTask.id]);
      setActiveAlarmTask(null);
      showToast("⏰ Alarme silenciado com sucesso!");
    }
  };

  // Voice recognition states & functions
  const [isListening, setIsListening] = useState(false);
  const [isListeningEdit, setIsListeningEdit] = useState(false);

  const startSpeechRecognition = (isEdit = false) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Reconhecimento de voz não suportado neste navegador. Use o Google Chrome.", true);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (isEdit) {
        setIsListeningEdit(true);
      } else {
        setIsListening(true);
      }
      showToast("🎙️ Ouvindo... Fale a tarefa agora!");
    };

    recognition.onerror = (event: any) => {
      console.error("Erro no reconhecimento de voz:", event.error);
      if (event.error === "not-allowed") {
        showToast("🎙️ Permissão de microfone negada. Abra o app em uma NOVA ABA para poder falar!", true);
      } else {
        showToast(`Erro de áudio: ${event.error}`, true);
      }
      if (isEdit) {
        setIsListeningEdit(false);
      } else {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (isEdit) {
        setIsListeningEdit(false);
      } else {
        setIsListening(false);
      }
    };

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      if (isEdit) {
        setEditName(text);
      } else {
        setTaskName(text);
      }
      showToast("✨ Transcrito com sucesso!");
    };

    try {
      recognition.start();
    } catch (e) {
      console.error(e);
    }
  };

  // Feedback states
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-init inputs date/time
  useEffect(() => {
    resetDateTimeInputs();
  }, []);

  const resetDateTimeInputs = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    setTaskDate(`${y}-${m}-${d}`);
    setTaskTime(`${hh}:${mm}`);
  };

  // Toast notifier helper
  const showToast = (message: string, isError = false) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, isError });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Load client data on login or on mount
  useEffect(() => {
    if (token) {
      fetchClientData();
    }
  }, [token]);

  // Sincroniza e atualiza o backup local das tarefas do cliente sempre que houver mudanças
  useEffect(() => {
    if (clientData && clientData.pendentes) {
      safeStorage.setItem("taskControlProTasksBackup", JSON.stringify(clientData.pendentes));
    }
  }, [clientData]);

  // Synchronize client data automatically in background (every 30 seconds)
  useEffect(() => {
    if (!token || editModalOpen) return;

    const interval = setInterval(() => {
      // Background silent sync
      fetch(`/api/client/${token}`)
        .then((res) => res.json())
        .then((data: ClientData) => {
          if (data && !data.expired && (data as any).status !== "Bloqueado") {
            setClientData(data);
          }
        })
        .catch((err) => console.error("Silent sync error:", err));
    }, 30000);

    return () => clearInterval(interval);
  }, [token, editModalOpen]);

  // Fetch client tasks and subscription status (com Auto-Healing resiliente)
  const fetchClientData = async () => {
    setGlobalLoading(true);
    try {
      const res = await fetch(`/api/client/${token}`);
      if (!res.ok) throw new Error("Erro ao carregar dados do servidor");
      const data = (await res.json()) as ClientData;
      
      // Se o token sumiu do servidor (porque o contêiner reiniciou) ou expirou
      if (data && (data.expired || (data as any).status === "Bloqueado")) {
        const savedEmail = safeStorage.getItem("taskControlProEmail");
        const savedPass = safeStorage.getItem("taskControlProPassword");
        const savedNome = safeStorage.getItem("taskControlProUserName");

        if (savedEmail && savedPass) {
          console.log("[Auto-Healing] Sessão perdida no servidor. Tentando restaurar conta...");
          let registerSuccess = false;
          let newToken = "";

          // 1. Tenta re-cadastrar o usuário se o banco foi limpo no servidor
          if (savedNome) {
            try {
              const regRes = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nome: savedNome, email: savedEmail, senha: savedPass }),
              });
              const regData = await regRes.json();
              if (regRes.ok && regData.token) {
                registerSuccess = true;
                newToken = regData.token;
                console.log("[Auto-Healing] Conta recriada com sucesso no servidor!");
              }
            } catch (e) {
              console.error("[Auto-Healing] Erro no registro de recuperação:", e);
            }
          }

          // 2. Se falhar o registro (ex: e-mail já existe), tenta login automático
          if (!registerSuccess) {
            try {
              const loginRes = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: savedEmail, senha: savedPass }),
              });
              const loginData = await loginRes.json();
              if (loginRes.ok && loginData.token) {
                newToken = loginData.token;
                console.log("[Auto-Healing] Login restaurado com sucesso!");
              }
            } catch (e) {
              console.error("[Auto-Healing] Erro no login de recuperação:", e);
            }
          }

          // 3. Se obtivemos um token novo/atualizado, salva e recupera as tarefas do backup local
          if (newToken) {
            safeStorage.setItem("taskControlProToken", newToken);
            setToken(newToken);

            const localTasksRaw = safeStorage.getItem("taskControlProTasksBackup");
            if (localTasksRaw && registerSuccess) {
              try {
                const localTasks = JSON.parse(localTasksRaw);
                console.log("[Auto-Healing] Restaurando tarefas de backup no servidor...");
                for (const t of localTasks) {
                  await fetch("/api/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      token: newToken,
                      tarefa: t.tarefa,
                      data: t.data,
                      horario: t.horario,
                      recorrencia: t.recorrencia
                    })
                  });
                }
              } catch (e) {
                console.error("[Auto-Healing] Falha ao enviar tarefas de backup:", e);
              }
            }

            // Busca os dados atualizados finais do novo token
            const freshRes = await fetch(`/api/client/${newToken}`);
            if (freshRes.ok) {
              const freshData = await freshRes.json();
              setClientData(freshData);
              setGlobalLoading(false);
              return;
            }
          }
        }
      }

      setClientData(data);
      if (data.nome) {
        setNomeUsuario(data.nome);
        safeStorage.setItem("taskControlProUserName", data.nome);
      }
    } catch (err: any) {
      showToast("Erro de conexão com o servidor. Exibindo dados locais offline.", true);
      const localTasksRaw = safeStorage.getItem("taskControlProTasksBackup");
      if (localTasksRaw) {
        try {
          const localTasks = JSON.parse(localTasksRaw);
          setClientData({
            pendentes: localTasks,
            historico: [],
            aviso: false,
            diasRestantes: 30,
            nome: nomeUsuario || "Usuário",
            status: "Ativo"
          });
        } catch (_) {}
      }
    } finally {
      setGlobalLoading(false);
    }
  };

  // Execute Authentication - Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPass) {
      return showToast("Preencha e-mail e senha!", true);
    }
    if (!loginEmail.includes("@")) {
      return showToast("Digite um e-mail válido!", true);
    }

    setGlobalLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, senha: loginPass }),
      });
      const data = await res.json();
      if (!res.ok || data.erro) {
        showToast(data.erro || "Falha no login", true);
      } else {
        safeStorage.setItem("taskControlProToken", data.token);
        safeStorage.setItem("taskControlProUserName", data.nome);
        safeStorage.setItem("taskControlProEmail", loginEmail.toLowerCase());
        safeStorage.setItem("taskControlProPassword", loginPass);
        setToken(data.token);
        setNomeUsuario(data.nome);
        showToast(`Bem-vindo de volta, ${data.nome}!`);
      }
    } catch (err) {
      showToast("Erro ao conectar com o servidor.", true);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Execute Authentication - Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regNome || !regEmail || !regPass) {
      return showToast("Preencha todos os campos!", true);
    }
    if (!regEmail.includes("@")) {
      return showToast("O sistema só aceita e-mails válidos!", true);
    }

    setGlobalLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: regNome, email: regEmail, senha: regPass }),
      });
      const data = await res.json();
      if (!res.ok || data.erro) {
        showToast(data.erro || "Falha no registro", true);
      } else {
        alert(
          "🎉 Conta criada com sucesso!\n\nVocê tem 30 DIAS DE TESTE TOTALMENTE GRÁTIS.\nApós essa data, o aplicativo custará R$ 14,99 VITALÍCIO."
        );
        safeStorage.setItem("taskControlProToken", data.token);
        safeStorage.setItem("taskControlProUserName", data.nome);
        safeStorage.setItem("taskControlProEmail", regEmail.toLowerCase());
        safeStorage.setItem("taskControlProPassword", regPass);
        setToken(data.token);
        setNomeUsuario(data.nome);
        showToast("Sua conta foi criada!");
      }
    } catch (err) {
      showToast("Erro ao conectar com o servidor.", true);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Execute Logout
  const handleLogout = () => {
    safeStorage.removeItem("taskControlProToken");
    safeStorage.removeItem("taskControlProUserName");
    safeStorage.removeItem("taskControlProEmail");
    safeStorage.removeItem("taskControlProPassword");
    safeStorage.removeItem("taskControlProTasksBackup");
    setToken("");
    setNomeUsuario("");
    setClientData(null);
    showToast("Sessão finalizada!");
  };

  // Add a task
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName || !taskDate) {
      return showToast("Preencha a tarefa e a data!", true);
    }

    setGlobalLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          tarefa: taskName,
          data: taskDate,
          horario: taskTime,
          recorrencia: taskRecurrence,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.erro) {
        showToast(data.erro || "Erro ao salvar tarefa", true);
      } else {
        setClientData(data);
        setTaskName("");
        resetDateTimeInputs();
        setTaskRecurrence("Nenhuma");
        setIsFormOpen(false);
        showToast("Tarefa guardada!");
      }
    } catch (err) {
      showToast("Erro de conexão.", true);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Mark task as Done
  const handleConcludeTask = async (idTarefa: string) => {
    setGlobalLoading(true);
    try {
      const res = await fetch("/api/tasks/conclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, idTarefa }),
      });
      const data = await res.json();
      if (!res.ok || data.erro) {
        showToast(data.erro || "Erro ao concluir tarefa", true);
      } else {
        setClientData(data);
        showToast("Tarefa concluída!");
      }
    } catch (err) {
      showToast("Erro de conexão.", true);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Delete task
  const handleDeleteTask = async (idTarefa: string) => {
    setGlobalLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, idTarefa }),
      });
      const data = await res.json();
      if (!res.ok || data.erro) {
        showToast(data.erro || "Erro ao excluir tarefa", true);
      } else {
        setClientData(data);
        showToast("Tarefa excluída com sucesso!", true);
      }
    } catch (err) {
      showToast("Erro de conexão.", true);
    } finally {
      setGlobalLoading(false);
      setDeletingTaskId(null);
    }
  };

  // Open Edit Modal
  const openEditModal = (t: Tarefa) => {
    setEditId(t.id);
    setEditName(t.tarefa);
    setEditDate(t.data);
    setEditTime(t.horario);
    setEditRecurrence(t.recorrencia);
    setEditModalOpen(true);
  };

  // Confirm and save edit
  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName || !editDate) {
      return showToast("O nome da tarefa e a data são obrigatórios!", true);
    }

    setGlobalLoading(true);
    setEditModalOpen(false);
    try {
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          idTarefa: editId,
          tarefa: editName,
          data: editDate,
          horario: editTime,
          recorrencia: editRecurrence,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.erro) {
        showToast(data.erro || "Erro ao editar tarefa", true);
      } else {
        setClientData(data);
        showToast("Tarefa editada com sucesso!");
      }
    } catch (err) {
      showToast("Erro de conexão.", true);
    } finally {
      setGlobalLoading(false);
    }
  };

  // Format date helper from YYYY-MM-DD to DD/MM/YYYY
  const formatDateString = (dateStr: string) => {
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Check if a task is overdue
  const isTaskOverdue = (task: Tarefa) => {
    if (task.status === "Realizada") return false;
    const now = new Date();
    const taskDateTime = new Date(`${task.data}T${task.horario || "12:00"}`);
    return taskDateTime < now;
  };

  // Filter and sort active task list
  const getFilteredList = () => {
    if (!clientData) return [];
    const list = currentTab === "pendentes" ? clientData.pendentes : clientData.historico;

    // Filter by search query
    const filtered = list.filter((t) =>
      t.tarefa.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort: Pending = Chronological (closest deadline first), History = Reverse chronological (most recent completed first)
    if (currentTab === "pendentes") {
      return filtered.sort((a, b) => {
        const dtA = new Date(`${a.data}T${a.horario || "00:00"}`).getTime();
        const dtB = new Date(`${b.data}T${b.horario || "00:00"}`).getTime();
        return dtA - dtB;
      });
    } else {
      return filtered.sort((a, b) => {
        const dtA = new Date(`${a.data}T${a.horario || "00:00"}`).getTime();
        const dtB = new Date(`${b.data}T${b.horario || "00:00"}`).getTime();
        return dtB - dtA;
      });
    }
  };

  // If user is locked/expired
  const isUserBlocked = !clientData?.isAdmin && (clientData?.expired || clientData?.status === "Inadimplente");

  return (
    <div id="taskcontrol-app-root" className="min-h-screen bg-[#0B0F19] text-slate-100 font-sans p-4 sm:p-6 md:p-8 flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* GLOBAL NOTIFICATION TOAST */}
      <AnimatePresence>
        {toast && (
          <motion.div
            id="app-toast-alert"
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 min-w-[280px] sm:min-w-[320px] text-center border border-slate-700/60 bg-slate-900/90 text-slate-100 font-sans text-sm p-3.5 rounded-xl shadow-xl backdrop-blur-md ${
              toast.isError ? "border-rose-500/50 bg-rose-950/90 text-rose-200" : "border-indigo-500/30 bg-slate-900/95 text-slate-100"
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL SYNC LOADER */}
      <AnimatePresence>
        {globalLoading && (
          <motion.div
            id="global-sync-indicator"
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#1E293B]/90 text-slate-200 border border-slate-700/60 font-mono text-[10px] uppercase tracking-widest py-2 px-4 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-md"
          >
            <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
            SYNC: ACTIVE
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container Wrapper */}
      <main className="w-full max-w-4xl mx-auto flex-grow flex flex-col justify-center">

        {/* 1. AUTHENTICATION SCREEN */}
        {!token && (
          <motion.div
            id="auth-screen-container"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md mx-auto my-12"
          >
            <div className="text-center mb-6">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-tight text-center font-sans">
                Agenda Pessoal
              </h1>
            </div>

            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 p-6 sm:p-8 rounded-2xl shadow-xl">
              <div className="flex bg-slate-950/60 p-1 border border-slate-800/60 rounded-xl mb-6">
                <button
                  id="auth-tab-login"
                  onClick={() => setAuthTab("login")}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${
                    authTab === "login"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  Entrar
                </button>
                <button
                  id="auth-tab-register"
                  onClick={() => setAuthTab("register")}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-all rounded-lg ${
                    authTab === "register"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  Criar Conta
                </button>
              </div>

              {/* Login Form */}
              {authTab === "login" && (
                <form id="form-login-element" onSubmit={handleLogin} className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">E-mail</label>
                    <input
                      id="input-login-email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Senha</label>
                    <input
                      id="input-login-password"
                      type="password"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      placeholder="Sua senha"
                      className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <button
                    id="btn-login-submit"
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 text-xs uppercase tracking-widest transition-all mt-4 rounded-xl shadow-lg shadow-indigo-600/15"
                  >
                    ACESSAR SISTEMA
                  </button>
                  <p className="text-center text-[10px] font-mono uppercase text-slate-500 mt-4">
                    Suporte: millertadeu30@gmail.com
                  </p>
                </form>
              )}

              {/* Register Form */}
              {authTab === "register" && (
                <form id="form-register-element" onSubmit={handleRegister} className="space-y-4">
                  <div className="flex items-center gap-2 justify-center bg-indigo-500/10 text-indigo-300 text-[11px] py-2.5 px-3 font-semibold rounded-xl border border-indigo-500/20 mb-2">
                    <Gift className="w-4 h-4 text-indigo-400 animate-pulse" />
                    <span>TESTE: 30 DIAS TOTALMENTE GRÁTIS</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nome</label>
                    <input
                      id="input-register-nome"
                      type="text"
                      value={regNome}
                      onChange={(e) => setRegNome(e.target.value)}
                      placeholder="Seu primeiro nome"
                      className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">E-mail de Cadastro</label>
                    <input
                      id="input-register-email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="Digite seu melhor e-mail"
                      className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nova Senha</label>
                    <input
                      id="input-register-password"
                      type="password"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      placeholder="Crie uma senha forte"
                      className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <button
                    id="btn-register-submit"
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 text-xs uppercase tracking-widest transition-all mt-4 rounded-xl shadow-lg shadow-indigo-600/15"
                  >
                    CRIAR MINHA CONTA
                  </button>
                </form>
              )}
            </div>

            {/* Default demonstration users box */}
            <div className="bg-slate-900/40 border border-slate-800/80 p-4 text-center mt-6 rounded-xl">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Conta de Demonstração:</span>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs mt-2 font-mono text-slate-300">
                <span>E-mail: <strong className="text-indigo-300">demo@taskcontrol.pro</strong></span>
                <span>Senha: <strong className="text-indigo-300">demo</strong></span>
              </div>
            </div>
          </motion.div>
        )}

        {/* 2. EXPIRED / BLOCKED TRIAL ACCESS SCREEN */}
        {token && isUserBlocked && (
          <motion.div
            id="blocked-trial-screen"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg mx-auto text-center py-12 px-6 bg-slate-900/60 backdrop-blur-md border border-rose-500/20 rounded-2xl shadow-xl my-6 text-slate-100"
          >
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-full flex items-center justify-center shadow-none">
                <AlertTriangle className="w-8 h-8" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-slate-100">Acesso Restrito</h2>
            
            <p className="text-slate-300 mt-4 text-sm leading-relaxed font-sans">
              Seu período de teste de 30 dias expirou ou a assinatura está inadimplente.
            </p>
            <p className="text-slate-200 mt-3 font-semibold text-base uppercase tracking-wider bg-slate-950/45 py-2.5 px-4 rounded-xl border border-slate-800">
              Taxa Vitalícia única: <span className="text-rose-400 font-bold">R$ 14,99</span>
            </p>

            <div className="mt-8 flex flex-col items-center gap-4">
              <a
                href="https://wa.me/5517982129547"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-[#25D366]/15 transition-all text-sm uppercase tracking-widest border border-emerald-500/20"
              >
                <PhoneCall className="w-4 h-4" />
                Liberar no WhatsApp
              </a>

              <button
                onClick={handleLogout}
                className="mt-4 text-[10px] font-bold font-mono uppercase tracking-widest text-slate-400 hover:text-rose-400 border border-slate-800 py-2.5 px-5 rounded-xl hover:border-rose-500/20 transition-all"
              >
                Sair da Conta
              </button>
            </div>
          </motion.div>
        )}

        {/* 2.5 LOADING SCREEN FOR REGISTERED / LOGGED IN SESSION */}
        {token && !isUserBlocked && !clientData && (
          <motion.div
            id="loading-app-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-md mx-auto text-center py-16 px-6 bg-slate-900/40 border border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-6"
          >
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <div className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-200">
                Sincronizando Agenda
              </h3>
              <p className="text-xs text-slate-400 font-sans max-w-xs mx-auto">
                Carregando suas tarefas e status de assinatura de forma segura...
              </p>
            </div>
          </motion.div>
        )}

        {/* 3. CORE APPLICATION SCREEN */}
        {token && !isUserBlocked && clientData && (
          <motion.div
            id="main-app-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {clientData.isAdmin ? (
              <AdminPanel
                token={token}
                handleLogout={handleLogout}
                showToast={showToast}
                setGlobalLoading={setGlobalLoading}
              />
            ) : (
              <>
                {/* Header section */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-tight font-sans">
                  Agenda Pessoal
                </h1>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 opacity-60 font-mono">System Console v4.2 // Active Session</p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 bg-slate-900/50 border border-slate-800 p-2.5 px-4 rounded-xl">
                <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest font-mono">
                  Olá, {clientData.nome || nomeUsuario}
                </span>
              </div>
            </div>

            {/* WARNING COUNTDOWN TRIAL BANNER */}
            {clientData.aviso && (
              <motion.div
                id="trial-warning-banner"
                animate={{ scale: [1, 1.01, 1] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                className="bg-amber-500/10 text-amber-200 font-sans text-xs uppercase tracking-wide p-4 border border-amber-500/20 rounded-xl flex items-center gap-3 shadow-lg shadow-amber-500/5"
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                <span className="text-left font-semibold">
                  CONTA EM TESTE: restam {clientData.diasRestantes} {clientData.diasRestantes === 1 ? "dia" : "dias"}. Efetue o pagamento de R$ 14,99 para acesso vitalício.
                </span>
              </motion.div>
            )}

            {/* EXPANDABLE NEW TASK TRIGGER & FORM */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl">
              <button
                id="btn-toggle-new-task-form"
                onClick={() => setIsFormOpen(!isFormOpen)}
                className={`w-full flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest py-3 px-4 border rounded-xl transition-all ${
                  isFormOpen
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                    : "border-slate-800 text-slate-200 bg-slate-950/40 hover:bg-slate-800"
                }`}
              >
                {isFormOpen ? (
                  <>
                    <X className="w-3.5 h-3.5" />
                    Fechar Formulário
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Nova Tarefa
                  </>
                )}
              </button>

              <AnimatePresence>
                {isFormOpen && (
                  <motion.form
                    id="form-add-task-element"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleAddTask}
                    className="overflow-hidden mt-4 space-y-4 pt-4 border-t border-slate-800"
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        O que precisa ser feito?
                      </label>
                      <div className="relative flex items-center">
                        <input
                          id="input-task-name"
                          type="text"
                          value={taskName}
                          onChange={(e) => setTaskName(e.target.value)}
                          placeholder="Ex: Pagar conta de energia, Comprar mantimentos..."
                          className="w-full bg-slate-950/65 border border-slate-800 p-3 pr-12 text-slate-100 text-sm placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => startSpeechRecognition(false)}
                          className={`absolute right-3 p-1.5 rounded-lg transition-all ${
                            isListening
                              ? "bg-rose-500 text-white animate-pulse scale-105 shadow-md shadow-rose-500/20"
                              : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                          }`}
                          title="Falar tarefa (Comando de Voz)"
                        >
                          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Prazo Final
                        </label>
                        <input
                          id="input-task-date"
                          type="date"
                          value={taskDate}
                          onChange={(e) => setTaskDate(e.target.value)}
                          className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm font-mono placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Horário
                        </label>
                        <input
                          id="input-task-time"
                          type="time"
                          value={taskTime}
                          onChange={(e) => setTaskTime(e.target.value)}
                          className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm font-mono placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Recorrência
                        </label>
                        <select
                          id="select-task-recurrence"
                          value={taskRecurrence}
                          onChange={(e) => setTaskRecurrence(e.target.value as any)}
                          className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                        >
                          <option value="Nenhuma">Nenhuma</option>
                          <option value="1 Semana">A cada 7 dias</option>
                          <option value="15 Dias">A cada 15 dias</option>
                          <option value="Mensal">Mensal</option>
                          <option value="Anual">Anual</option>
                        </select>
                      </div>
                    </div>

                    <button
                      id="btn-add-task-submit"
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 text-xs uppercase tracking-widest rounded-xl transition-all mt-2 shadow-lg shadow-indigo-600/15"
                    >
                      GRAVAR TAREFA
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* TAB CONTAINER CHANGER */}
            <div className="flex gap-2 bg-slate-950/40 p-1 border border-slate-800/60 rounded-2xl">
              <button
                id="btn-tab-pendentes"
                onClick={() => setCurrentTab("pendentes")}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  currentTab === "pendentes"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 border-indigo-500"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <ListCheck className="w-4 h-4" />
                Tarefas Pendentes
              </button>

              <button
                id="btn-tab-historico"
                onClick={() => setCurrentTab("historico")}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                  currentTab === "historico"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 border-indigo-500"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <History className="w-4 h-4" />
                Histórico
              </button>
            </div>

            {/* REAL-TIME SEARCH BOX */}
            <div className="relative">
              <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
              <input
                id="input-task-search"
                type="text"
                placeholder="BUSCAR POR TERMO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1E293B]/60 border border-slate-700/85 py-3.5 pl-11 pr-4 text-slate-100 text-xs font-mono tracking-wider outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl"
              />
            </div>

            {/* TASKS SPACIOUS LIST CARDS CONTAINER - MAKE TASKS LARGER & EYE-FRIENDLY */}
            <div className="space-y-4">
              {getFilteredList().length > 0 ? (
                getFilteredList().map((t) => {
                  const overdue = isTaskOverdue(t);
                  return (
                    <motion.div
                      key={t.id}
                      id={`task-row-${t.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`relative p-5 sm:p-6 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        overdue
                          ? "bg-rose-950/20 border-rose-500/35 text-rose-100 shadow-[0_4px_16px_rgba(239,68,68,0.08)] animate-pulse"
                          : "bg-slate-900/50 border-slate-800/80 hover:border-slate-700/80 hover:bg-slate-900/80 shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
                      }`}
                    >
                      <div className="flex items-start gap-4 flex-1">
                        {/* Status Checkbox Button */}
                        <div className="mt-1 flex-shrink-0">
                          {currentTab === "pendentes" ? (
                            <button
                              onClick={() => handleConcludeTask(t.id)}
                              className="w-6 h-6 rounded-lg border-2 border-slate-600 hover:border-emerald-500 bg-slate-950/40 hover:bg-emerald-500/10 flex items-center justify-center transition-all cursor-pointer group/chk scale-100 hover:scale-105"
                              title="Marcar como Concluída"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400 opacity-0 group-hover/chk:opacity-100 transition-all transform scale-75 group-hover/chk:scale-100" />
                            </button>
                          ) : (
                            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                              <Check className="w-4 h-4" />
                            </div>
                          )}
                        </div>

                        {/* Task Title & Meta (Large, clear typography) */}
                        <div className="space-y-2.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className={`text-base sm:text-lg md:text-xl font-semibold tracking-wide text-slate-100 break-words ${t.status === "Realizada" ? "line-through opacity-50 text-slate-400" : ""}`}>
                              {t.tarefa}
                            </span>
                            {t.recorrencia && t.recorrencia !== "Nenhuma" && (
                              <span
                                onClick={() => showToast(`⏳ Recorrência Ativa: ${t.recorrencia}`)}
                                className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold px-2.5 py-0.5 rounded-full cursor-pointer select-none"
                                title={`Repete: ${t.recorrencia}`}
                              >
                                🔁 {t.recorrencia}
                              </span>
                            )}
                            {overdue && (
                              <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                ⚠️ Atrasada
                              </span>
                            )}
                          </div>

                          {/* Target Date and Time Indicators */}
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                            <span className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800/40 px-2.5 py-1 rounded-lg">
                              <Calendar className="w-3.5 h-3.5 text-blue-400" />
                              {formatDateString(t.data)}
                            </span>
                            <span className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800/40 px-2.5 py-1 rounded-lg">
                              <Clock className="w-3.5 h-3.5 text-purple-400" />
                              {t.horario || "--:--"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right-aligned responsive Actions */}
                      <div className="flex items-center gap-2.5 self-end md:self-center">
                        {deletingTaskId === t.id ? (
                          <div className="flex items-center gap-2 bg-slate-950/40 p-1.5 border border-slate-800/80 rounded-xl">
                            <span className="text-rose-400 text-[10px] font-bold uppercase tracking-widest px-2 animate-pulse">Excluir?</span>
                            <button
                              onClick={() => handleDeleteTask(t.id)}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setDeletingTaskId(null)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                            >
                              Não
                            </button>
                          </div>
                        ) : currentTab === "pendentes" ? (
                          <>
                            {/* Edit Button */}
                            <button
                              onClick={() => openEditModal(t)}
                              className="inline-flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-700/60 transition-all cursor-pointer"
                              title="Editar"
                            >
                              Editar
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => setDeletingTaskId(t.id)}
                              className="w-9 h-9 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white flex items-center justify-center rounded-xl transition-all cursor-pointer"
                              title="Excluir"
                            >
                              <Trash className="w-4.5 h-4.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider mr-2">
                              Concluída
                            </span>
                            <button
                              onClick={() => setDeletingTaskId(t.id)}
                              className="w-9 h-9 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white flex items-center justify-center rounded-xl transition-all cursor-pointer"
                              title="Excluir Definitivamente"
                            >
                              <Trash className="w-4.5 h-4.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-sm text-slate-400 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800/80">
                  Nenhuma tarefa encontrada.
                </div>
              )}
            </div>
              </>
            )}
          </motion.div>
        )}
      </main>

      {/* FOOTER METADATA (NO AI-SLOP PLOYMENT OR TELEMENTARY LOGS) */}
      <footer className="w-full text-center text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-12 py-4 border-t border-slate-800/60">
        Agenda Pessoal &copy; 2026 // ADM_7729 // SECURE_SOCKET_TLS_1.3
      </footer>

      {/* 4. EDIT TASK MODAL BACKDROP & DIALOG */}
      <AnimatePresence>
        {editModalOpen && (
          <div id="modal-task-edit-backdrop" className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div
              id="modal-task-edit-dialog"
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-6 text-slate-100"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                <h3 className="font-sans font-bold text-lg text-slate-100">Editar Tarefa</h3>
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="w-7 h-7 text-slate-400 hover:text-slate-100 hover:bg-slate-800 flex items-center justify-center rounded-lg transition-all border border-slate-800/80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form id="form-edit-task-submit" onSubmit={handleConfirmEdit} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    O que precisa ser feito?
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="input-edit-task-name"
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nome da tarefa..."
                      className="w-full bg-slate-950/65 border border-slate-800 p-3 pr-12 text-slate-100 text-sm placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => startSpeechRecognition(true)}
                      className={`absolute right-3 p-1.5 rounded-lg transition-all ${
                        isListeningEdit
                          ? "bg-rose-500 text-white animate-pulse scale-105 shadow-md shadow-rose-500/20"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                      }`}
                      title="Falar tarefa (Comando de Voz)"
                    >
                      {isListeningEdit ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Novo Prazo Final
                    </label>
                    <input
                      id="input-edit-task-date"
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm font-mono placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Novo Horário
                    </label>
                    <input
                      id="input-edit-task-time"
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm font-mono placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Recorrência
                  </label>
                  <select
                    id="select-edit-task-recurrence"
                    value={editRecurrence}
                    onChange={(e) => setEditRecurrence(e.target.value as any)}
                    className="w-full bg-slate-950/65 border border-slate-800 p-3 text-slate-100 text-sm placeholder-slate-500 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                  >
                    <option value="Nenhuma">Nenhuma</option>
                    <option value="1 Semana">A cada 7 dias</option>
                    <option value="15 Dias">A cada 15 dias</option>
                    <option value="Mensal">Mensal</option>
                    <option value="Anual">Anual</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    id="btn-confirm-edit-submit"
                    type="submit"
                    className="flex-grow bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-600/15 transition-all"
                  >
                    Salvar Alterações
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    className="px-5 py-3 border border-slate-800 font-bold text-xs uppercase tracking-widest text-slate-300 hover:bg-slate-800/60 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* REAL-TIME OVERDUE ALARM POPUP MODAL */}
        {activeAlarmTask && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-[#111827] border border-rose-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-rose-500/10 text-center relative overflow-hidden"
            >
              {/* Background glowing lights for alarm effect */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-rose-500/10 blur-3xl pointer-events-none rounded-full" />

              {/* Ringer Alarm animated Bell Icon */}
              <div className="flex justify-center mb-6">
                <motion.div
                  animate={{ 
                    rotate: [0, -12, 12, -12, 12, -8, 8, -4, 4, 0],
                    scale: [1, 1.05, 1.05, 1, 1]
                  }}
                  transition={{ 
                    repeat: Infinity, 
                    duration: 1.5,
                    repeatDelay: 0.2
                  }}
                  className="w-16 h-16 bg-rose-500/10 border border-rose-500/35 rounded-2xl flex items-center justify-center text-rose-400"
                >
                  <Bell className="w-8 h-8 animate-pulse" />
                </motion.div>
              </div>

              {/* Alarm headers */}
              <span className="bg-rose-500/10 text-rose-400 text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1 border border-rose-500/20 rounded-full inline-flex items-center gap-1.5 mb-4 animate-pulse">
                ⏰ Horário de Vencimento Alcançado!
              </span>

              <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight font-sans mb-3">
                Aviso de Prazo Expirado
              </h2>

              {/* Task name box */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 mb-6 text-left space-y-2">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Tarefa</span>
                <p className="text-slate-100 font-medium text-sm sm:text-base break-words">
                  {activeAlarmTask.tarefa}
                </p>
                <div className="flex items-center gap-3 pt-2 text-xs font-mono text-slate-400 border-t border-slate-800/60">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    {formatDateString(activeAlarmTask.data)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                    {activeAlarmTask.horario || "--:--"}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleDismissAlarm}
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3.5 px-4 rounded-xl text-xs uppercase tracking-widest shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <VolumeX className="w-4 h-4" />
                  Silenciar Bip e Fechar
                </button>
                <p className="text-[10px] text-slate-500 font-medium">
                  Nota: A tarefa continuará listada como pendente e atrasada.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
