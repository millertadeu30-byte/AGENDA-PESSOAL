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
  Lock,
  Calendar,
  Clock,
  Key,
  Bell,
  CheckSquare,
  Mic,
  Volume2,
  VolumeX,
  Sparkles,
  Minimize2,
  Maximize2,
  Phone,
  MessageSquare,
  Users,
  Unlock
} from "lucide-react";
import { Tarefa, ClientData } from "./types";
import AdminPanel from "./components/AdminPanel";
import { db, getMessagingInstance } from "./firebase";
import { getToken } from "firebase/messaging";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs
} from "firebase/firestore";

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
  
  // Login input state
  const [loginPasscode, setLoginPasscode] = useState("");
  const [showSalesBlock, setShowSalesBlock] = useState(false);
  const [avisoState, setAvisoState] = useState<"visible" | "minimized" | "hidden">("visible");
  const [headerMinimized, setHeaderMinimized] = useState<boolean>(() => {
    const saved = safeStorage.getItem("taskControlProHeaderMinimized");
    if (saved !== null) {
      return saved === "true";
    }
    if (typeof window !== "undefined") {
      return window.innerWidth < 640;
    }
    return false;
  });

  const toggleHeaderMinimized = () => {
    const newVal = !headerMinimized;
    setHeaderMinimized(newVal);
    safeStorage.setItem("taskControlProHeaderMinimized", String(newVal));
  };

  // WhatsApp Configuração Dinâmica
  const [whatsappNumber, setWhatsappNumber] = useState("5531988888888");
  const [whatsappDisplay, setWhatsappDisplay] = useState("(31) 98888-8888");

  // Carrega configuração dinâmica do WhatsApp para contato de vendas
  useEffect(() => {
    const configRef = doc(db, "config", "whatsapp");
    const unsubscribe = onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.number) setWhatsappNumber(data.number);
        if (data.display) setWhatsappDisplay(data.display);
      }
    }, (error) => {
      console.warn("[WhatsApp] Erro ao obter config:", error);
    });
    return () => unsubscribe();
  }, []);

  // UI and Client states
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [currentTab, setCurrentTab] = useState<"pendentes" | "historico">("pendentes");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  // Task sharing states
  const [ownedTasks, setOwnedTasks] = useState<Tarefa[]>([]);
  const [sharedTasksList, setSharedTasksList] = useState<Tarefa[]>([]);
  const [allClients, setAllClients] = useState<{ token: string; nome: string; bloquearCompartilhamento?: boolean; grupo1?: string; grupo2?: string }[]>([]);
  const [taskSharedWith, setTaskSharedWith] = useState<string[]>([]);
  const [editSharedWith, setEditSharedWith] = useState<string[]>([]);

  // New task inputs
  const [taskName, setTaskName] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [taskTime, setTaskTime] = useState("");
  const [taskRecurrence, setTaskRecurrence] = useState<string>("Nenhuma");

  // Edit task modal inputs
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<string>("Nenhuma");

  // Toast notifications state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);
  const toastTimeoutRef = useRef<any>(null);

  // Referência para controlar o momento da última digitação/teclado do usuário
  const lastKeyPressRef = useRef<number>(0);

  const showToast = (msg: string, isError = false) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    setToastIsError(isError);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Voice Recognition & Sound Beep (Bip) System
  const [isListeningAdd, setIsListeningAdd] = useState(false);
  const [isListeningEdit, setIsListeningEdit] = useState(false);

  const [beepEnabled, setBeepEnabled] = useState(() => {
    return safeStorage.getItem("taskControlProBeepEnabled") !== "false";
  });

  const playBeep = (type: "start" | "stop" | "overdue" | "click") => {
    if (!beepEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      if (type === "start") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } else if (type === "stop") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } else if (type === "click") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      } else if (type === "overdue") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        osc.start();
        
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.setValueAtTime(0, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime + 0.18);
        gain.gain.setValueAtTime(0, audioCtx.currentTime + 0.3);
        
        osc.stop(audioCtx.currentTime + 0.35);
      }
    } catch (e) {
      console.warn("AudioContext beep failed:", e);
    }
  };

  const toggleBeep = () => {
    const newVal = !beepEnabled;
    setBeepEnabled(newVal);
    safeStorage.setItem("taskControlProBeepEnabled", String(newVal));
    showToast(newVal ? "Avisos sonoros ativos!" : "Avisos sonoros mudos.");
    if (newVal) {
      setTimeout(() => playBeep("click"), 100);
    }
  };



  const startSpeechRecognitionAdd = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Navegador não suporta comando de voz.", true);
      return;
    }
    
    try {
      // Solicita permissão explicitamente via getUserMedia para forçar o pop-up de permissão nativo do Android/APK
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Para as faixas imediatamente para liberar o dispositivo para o SpeechRecognition
          stream.getTracks().forEach(track => track.stop());
        } catch (err) {
          console.warn("Permissão de áudio negada via getUserMedia:", err);
          showToast("Por favor, dê permissão ao microfone nas configurações do app no celular.", true);
          return;
        }
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = false;
      
      recognition.onstart = () => {
        setIsListeningAdd(true);
        playBeep("start");
      };
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setTaskName(prev => prev ? `${prev} ${transcript}` : transcript);
          showToast(`Voz capturada: "${transcript}"`);
        }
      };
      
      recognition.onerror = () => {
        showToast("Erro ao reconhecer voz.", true);
        setIsListeningAdd(false);
      };
      
      recognition.onend = () => {
        setIsListeningAdd(false);
        playBeep("stop");
      };
      
      recognition.start();
    } catch (e: any) {
      showToast("Erro ao iniciar microfone: " + e.message, true);
      setIsListeningAdd(false);
    }
  };

  const startSpeechRecognitionEdit = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Navegador não suporta comando de voz.", true);
      return;
    }
    
    try {
      // Solicita permissão explicitamente via getUserMedia para forçar o pop-up de permissão nativo do Android/APK
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Para as faixas imediatamente para liberar o dispositivo para o SpeechRecognition
          stream.getTracks().forEach(track => track.stop());
        } catch (err) {
          console.warn("Permissão de áudio negada via getUserMedia:", err);
          showToast("Por favor, dê permissão ao microfone nas configurações do app no celular.", true);
          return;
        }
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = false;
      
      recognition.onstart = () => {
        setIsListeningEdit(true);
        playBeep("start");
      };
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setEditName(prev => prev ? `${prev} ${transcript}` : transcript);
          showToast(`Voz capturada: "${transcript}"`);
        }
      };
      
      recognition.onerror = () => {
        showToast("Erro ao reconhecer voz.", true);
        setIsListeningEdit(false);
      };
      
      recognition.onend = () => {
        setIsListeningEdit(false);
        playBeep("stop");
      };
      
      recognition.start();
    } catch (e: any) {
      showToast("Erro ao iniciar microfone: " + e.message, true);
      setIsListeningEdit(false);
    }
  };

  // Helper para resetar campos de data e hora para o padrão atual
  const resetDateTimeInputs = () => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    setTaskDate(`${ano}-${mes}-${dia}`);
    const horas = String(hoje.getHours()).padStart(2, "0");
    const minutos = String(hoje.getMinutes()).padStart(2, "0");
    setTaskTime(`${horas}:${minutos}`);
  };

  useEffect(() => {
    resetDateTimeInputs();
  }, []);

  // Monitora o uso do teclado no documento para pausar bips/checagens de overdue se o usuário estiver digitando
  useEffect(() => {
    const handleKeyDown = () => {
      lastKeyPressRef.current = Date.now();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 1. Sincronização em Tempo Real do Status da Conta (Firestore doc listener)
  useEffect(() => {
    if (!token) return;

    if (token === "8619") {
      setClientData({
        pendentes: [],
        historico: [],
        aviso: false,
        diasRestantes: 9999,
        nome: "Administrador",
        status: "Vitalício",
        isAdmin: true
      });
      return;
    }

    const docRef = doc(db, "clientes", token);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (!docSnap.exists()) {
        // Conta foi excluída ou chave revogada pelo administrador
        showToast("Sua chave de acesso foi revogada ou excluída.", true);
        handleLogout();
        return;
      }

      const data = docSnap.data();
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      let statusCalculado = data.status || "Ativo";
      let diasRestantes = 0;
      let avisoVencimento = false;

      if (statusCalculado !== "Pago" && statusCalculado !== "Vitalício" && data.vencimento) {
        const dataVencimento = new Date(data.vencimento + "T23:59:59");
        if (!isNaN(dataVencimento.getTime())) {
          const diffTime = dataVencimento.getTime() - hoje.getTime();
          diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diasRestantes < 0) {
            statusCalculado = "Inadimplente";
          } else if (diasRestantes <= 5) {
            avisoVencimento = true;
          }
        }
      }

      setNomeUsuario(data.nome || "Usuário");
      safeStorage.setItem("taskControlProUserName", data.nome || "Usuário");

      setClientData(prev => ({
        pendentes: prev?.pendentes || [],
        historico: prev?.historico || [],
        nome: data.nome || "Usuário",
        status: statusCalculado,
        vencimento: data.vencimento || "",
        diasRestantes,
        aviso: avisoVencimento,
        isAdmin: false,
        fcmToken: data.fcmToken || "",
        telefone: data.telefone || "",
        bloquearCompartilhamento: data.bloquearCompartilhamento || false,
        compartilhamentosAceitos: data.compartilhamentosAceitos || [],
        grupo1: data.grupo1 || "",
        grupo2: data.grupo2 || ""
      }));
    }, (error) => {
      console.error("Erro na escuta da conta:", error);
    });

    return () => unsubscribe();
  }, [token]);

  // Effect to load list of clients for sharing dropdown
  useEffect(() => {
    if (!token || token === "8619") return;
    
    const fetchAllClients = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "clientes"));
        const list: { token: string; nome: string; bloquearCompartilhamento?: boolean; grupo1?: string; grupo2?: string }[] = [];
        querySnapshot.forEach((docSnap) => {
          if (docSnap.id !== "8619" && docSnap.id !== token) {
            const data = docSnap.data();
            list.push({
              token: docSnap.id,
              nome: data.nome || "Sem Nome",
              bloquearCompartilhamento: !!data.bloquearCompartilhamento,
              grupo1: data.grupo1 || "",
              grupo2: data.grupo2 || ""
            });
          }
        });
        setAllClients(list);
      } catch (err) {
        console.error("Erro ao carregar lista de usuários para compartilhamento:", err);
      }
    };
    
    fetchAllClients();
  }, [token]);

  // 2. Sincronização em Tempo Real das Tarefas Próprias
  useEffect(() => {
    if (!token || token === "8619") return;

    // Carregamento inicial do cache local para resposta visual instantânea (Zero Delay)
    const localTasksRaw = safeStorage.getItem("taskControlProTasksBackup");
    if (localTasksRaw) {
      try {
        const localTasks = JSON.parse(localTasksRaw);
        setClientData(prev => {
          if (!prev) return null;
          return {
            ...prev,
            pendentes: localTasks,
            historico: prev.historico || []
          };
        });
      } catch (_) {}
    }

    const q = query(collection(db, "tarefas"), where("token", "==", token));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const list: Tarefa[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Tarefa);
      });
      setOwnedTasks(list);
    }, (error) => {
      console.error("Erro ao sincronizar tarefas próprias:", error);
    });

    return () => unsubscribe();
  }, [token]);

  // 2.2 Sincronização em Tempo Real das Tarefas Compartilhadas com o Usuário
  useEffect(() => {
    if (!token || token === "8619") return;

    const q = query(collection(db, "tarefas"), where("compartilhadoCom", "array-contains", token));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const list: Tarefa[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Tarefa);
      });
      setSharedTasksList(list);
    }, (error) => {
      console.error("Erro ao sincronizar tarefas compartilhadas:", error);
    });

    return () => unsubscribe();
  }, [token]);

  // 2.3 Combinar e processar tarefas próprias e compartilhadas
  useEffect(() => {
    if (!token || token === "8619") return;

    const allTasksMap = new Map<string, Tarefa>();
    ownedTasks.forEach(t => allTasksMap.set(t.id, t));
    sharedTasksList.forEach(t => allTasksMap.set(t.id, t));

    const list = Array.from(allTasksMap.values());

    // Separar pendentes e históricos
    const pendentes = list.filter(t => t.status === "Pendente");
    const historico = list.filter(t => t.status === "Realizada");

    // Ordenar pendentes por data e horário crescentes (antigas/vencidas no topo)
    pendentes.sort((a, b) => {
      const datetimeA = new Date(`${a.data}T${a.horario || "12:00"}`).getTime();
      const datetimeB = new Date(`${b.data}T${b.horario || "12:00"}`).getTime();
      return datetimeA - datetimeB;
    });

    // Ordenar o histórico de forma decrescente para exibir os mais recentes no topo
    historico.sort((a, b) => {
      const datetimeA = new Date(`${a.data}T${a.horario || "12:00"}`).getTime();
      const datetimeB = new Date(`${b.data}T${b.horario || "12:00"}`).getTime();
      return datetimeB - datetimeA;
    });

    setClientData(prev => {
      if (!prev) {
        return {
          nome: "Usuário",
          status: "Ativo",
          vencimento: "",
          diasRestantes: 0,
          aviso: false,
          pendentes,
          historico
        };
      }
      return {
        ...prev,
        pendentes,
        historico
      };
    });

    safeStorage.setItem("taskControlProTasksBackup", JSON.stringify(pendentes));
  }, [ownedTasks, sharedTasksList, token]);

  // 3. Sistema de Notificações 100% Client-Side e Registro do Service Worker
  useEffect(() => {
    if (!token || token === "8619" || !clientData) return;

    // Garante que o Service Worker está registrado
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" })
        .then(() => console.log("[Service Worker] Registrado com sucesso."))
        .catch(err => console.error("[Service Worker] Erro ao registrar:", err));
    }

    // Solicita permissão para notificações se ainda estiver em default
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [token, clientData?.nome]);

  // 3.5 Sincronização automática do badge (bolinha/contador) do ícone do PWA com as pendências
  useEffect(() => {
    if ("setAppBadge" in navigator) {
      const count = (token && token !== "8619" && clientData?.pendentes) ? clientData.pendentes.length : 0;
      if (count > 0) {
        (navigator as any).setAppBadge(count).catch((err: any) => {
          console.warn("[Badge] Erro ao definir badge do ícone:", err);
        });
      } else {
        (navigator as any).clearAppBadge().catch((err: any) => {
          console.warn("[Badge] Erro ao limpar badge do ícone:", err);
        });
      }
    }
  }, [token, clientData?.pendentes?.length]);

  // 3.6 Sincronização automática do contador de acessos do cliente (uma vez por sessão de navegação)
  useEffect(() => {
    if (!token || token === "8619") return;
    
    const sessionKey = `taskControlProAccessIncremented_${token}`;
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, "true");
      
      const docRef = doc(db, "clientes", token);
      getDoc(docRef).then((docSnap) => {
        if (docSnap.exists()) {
          const currentAcessos = docSnap.data().acessos || 0;
          updateDoc(docRef, { acessos: currentAcessos + 1 }).catch((err) => {
            console.warn("[Acessos] Erro ao incrementar acessos no banco:", err);
          });
        }
      }).catch((err) => {
        console.warn("[Acessos] Erro ao obter cliente para incrementar acessos:", err);
      });
    }
  }, [token]);

  // Loop de verificação periódica de tarefas vencidas (releitura a cada 40 segundos com controle de digitação)
  useEffect(() => {
    if (!token || token === "8619" || !clientData || !clientData.pendentes) return;

    const checkOverdueTasks = async () => {
      // Se o usuário estiver teclando/digitando nos últimos 5 segundos, pula a checagem para não interromper com bips/alertas
      if (Date.now() - lastKeyPressRef.current < 5000) {
        console.log("[Loop 40s] Digitação detectada recentemente. Checagem postergada.");
        return;
      }

      const agora = Date.now();
      const pendentes = clientData.pendentes;

      for (const t of pendentes) {
        if (t.notificado) continue;

        // Formata data e hora para comparar
        const dataTarefa = new Date(`${t.data}T${t.horario || "12:00"}`);
        
        if (dataTarefa.getTime() <= agora) {
          // 1. Notificação nativa do Navegador (Se a janela estiver aberta/visível)
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("Compromisso Vencido!", {
                body: `Está na hora de: ${t.tarefa} (${t.horario || ""})`,
                icon: "/icon.png",
                tag: t.id,
                requireInteraction: true
              });
            } catch (err) {
              console.warn("Erro ao instanciar Notification padrão, tentando Service Worker:", err);
            }
          }

          // 2. Notificação via Service Worker (Melhor suporte para segundo plano/celular)
          if ("serviceWorker" in navigator && "Notification" in window && Notification.permission === "granted") {
            navigator.serviceWorker.ready.then((registration) => {
              registration.showNotification("Compromisso Vencido!", {
                body: `Está na hora de: ${t.tarefa} (${t.horario || ""})`,
                icon: "/icon.png",
                tag: t.id,
                requireInteraction: true,
                vibrate: [300, 100, 300]
              } as any);
            }).catch(err => console.warn("Erro ao enviar notificação via SW:", err));
          }

          // 3. Emite um som discreto de aviso (Bip)
          playBeep("overdue");

          // 4. Marca como notificado no Firestore para persistência global imediata
          try {
            const taskRef = doc(db, "tarefas", t.id);
            await updateDoc(taskRef, { notificado: true });
            console.log(`[Push Local] Tarefa ${t.id} marcada como notificada.`);
          } catch (err) {
            console.error("Erro ao atualizar status de notificação no Firestore:", err);
          }
        }
      }
    };

    // Executa uma checagem imediata ao mudar a lista de pendentes
    checkOverdueTasks();

    // Loop de releitura a cada 40 segundos conforme solicitação do usuário
    const intervalId = setInterval(checkOverdueTasks, 40000);

    return () => clearInterval(intervalId);
  }, [token, clientData?.pendentes]);

  // LOGIN POR CHAVE DE ACESSO
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = loginPasscode.trim();
    if (!cleanPass) {
      return showToast("Digite sua chave de acesso!", true);
    }

    setGlobalLoading(true);
    try {
      if (cleanPass === "8619") {
        // Administrador
        safeStorage.setItem("taskControlProToken", "8619");
        safeStorage.setItem("taskControlProUserName", "Administrador");
        setToken("8619");
        setNomeUsuario("Administrador");
        showToast("Acesso administrativo liberado!");
      } else {
        // Cliente comum - busca no Firestore
        const docRef = doc(db, "clientes", cleanPass);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);

          let statusCalculado = data.status || "Ativo";
          let diasRestantes = 0;

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

          // Se a chave existe, permitimos o login para que as regras de exibição mostrem a tela de bloqueio apropriada
          safeStorage.setItem("taskControlProToken", cleanPass);
          safeStorage.setItem("taskControlProUserName", data.nome || "Usuário");
          setToken(cleanPass);
          setNomeUsuario(data.nome || "Usuário");
          setShowSalesBlock(false);
          setAvisoState("visible");

          if (statusCalculado === "Inadimplente") {
            showToast(`Acesso restrito! Seu período de teste expirou.`, true);
          } else {
            showToast(`Olá, ${data.nome || "Usuário"}! Bem-vindo.`);
          }
        } else {
          setShowSalesBlock(true);
          showToast("Chave de acesso inválida ou não encontrada!", true);
        }
      }
    } catch (err: any) {
      showToast("Erro de conexão ao validar chave: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  // LOGOUT
  const handleLogout = () => {
    safeStorage.removeItem("taskControlProToken");
    safeStorage.removeItem("taskControlProUserName");
    safeStorage.removeItem("taskControlProTasksBackup");
    setToken("");
    setNomeUsuario("");
    setClientData(null);
    setLoginPasscode("");
    setShowSalesBlock(false);
    setAvisoState("visible");
    showToast("Sessão finalizada!");
  };

  // CRIAR TAREFA
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim() || !taskDate) {
      return showToast("Preencha o nome e a data da tarefa!", true);
    }

    if (clientData?.status === "Inadimplente") {
      return showToast("Chave expirada. Não é possível adicionar tarefas.", true);
    }

    setGlobalLoading(true);
    try {
      const taskId = "TAR_" + Date.now();
      const newTask: Tarefa = {
        id: taskId,
        token,
        tarefa: taskName.trim(),
        data: taskDate,
        horario: taskTime || "12:00",
        recorrencia: taskRecurrence,
        status: "Pendente",
        notificado: false,
        compartilhadoCom: taskSharedWith,
        criadorNome: clientData?.nome || "Outro Usuário",
        tokenCriador: token
      };

      await setDoc(doc(db, "tarefas", taskId), newTask);
      
      setTaskName("");
      resetDateTimeInputs();
      setTaskRecurrence("Nenhuma");
      setTaskSharedWith([]);
      setIsFormOpen(false);
      showToast("Tarefa agendada com sucesso!");
      playBeep("click");
    } catch (err: any) {
      showToast("Erro ao criar tarefa: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  // CONCLUIR TAREFA OU AVANÇAR RECORRÊNCIA
  const handleConcludeTask = async (idTarefa: string) => {
    const task = clientData?.pendentes.find(t => t.id === idTarefa);
    if (!task) return;

    setGlobalLoading(true);
    try {
      const taskRef = doc(db, "tarefas", idTarefa);

      if (task.recorrencia && task.recorrencia !== "Nenhuma") {
        const currentDatetime = new Date(`${task.data}T${task.horario || "12:00"}`);
        
        const cleanRec = task.recorrencia.trim().toLowerCase();
        if (cleanRec === "1 semana") {
          currentDatetime.setDate(currentDatetime.getDate() + 7);
        } else if (cleanRec === "15 dias") {
          currentDatetime.setDate(currentDatetime.getDate() + 15);
        } else if (cleanRec === "mensal") {
          currentDatetime.setMonth(currentDatetime.getMonth() + 1);
        } else if (cleanRec === "anual") {
          currentDatetime.setFullYear(currentDatetime.getFullYear() + 1);
        } else {
          // Extrai número de dias do padrão personalizado como "X Dias" ou "A cada X dias" ou apenas número
          const match = cleanRec.match(/(\d+)/);
          if (match) {
            const days = parseInt(match[1], 10);
            if (!isNaN(days) && days > 0) {
              currentDatetime.setDate(currentDatetime.getDate() + days);
            } else {
              currentDatetime.setDate(currentDatetime.getDate() + 1);
            }
          } else {
            currentDatetime.setDate(currentDatetime.getDate() + 1);
          }
        }

        const ano = currentDatetime.getFullYear();
        const mes = String(currentDatetime.getMonth() + 1).padStart(2, "0");
        const dia = String(currentDatetime.getDate()).padStart(2, "0");
        const novaDataStr = `${ano}-${mes}-${dia}`;
        
        await updateDoc(taskRef, {
          data: novaDataStr,
          notificado: false // Permite que seja notificado novamente no novo prazo
        });
        showToast("Tarefa recorrente avançada para o próximo prazo!");
        playBeep("click");
      } else {
        await updateDoc(taskRef, {
          status: "Realizada"
        });
        showToast("Tarefa concluída!");
        playBeep("click");
      }
    } catch (err: any) {
      showToast("Erro ao concluir tarefa: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  // EXCLUIR TAREFA (PENDENTE OU HISTÓRICO)
  const handleDeleteTask = async (idTarefa: string) => {
    setGlobalLoading(true);
    try {
      await deleteDoc(doc(db, "tarefas", idTarefa));
      showToast("Tarefa excluída com sucesso!");
    } catch (err: any) {
      showToast("Erro ao excluir: " + err.message, true);
    } finally {
      setGlobalLoading(false);
      setDeletingTaskId(null);
    }
  };

  // EDITAR TAREFA
  const openEditModal = (t: Tarefa) => {
    setEditId(t.id);
    setEditName(t.tarefa);
    setEditDate(t.data);
    setEditTime(t.horario);
    setEditRecurrence(t.recorrencia);
    setEditSharedWith(t.compartilhadoCom || []);
    setEditModalOpen(true);
  };

  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editDate) {
      return showToast("O nome e a data são obrigatórios para editar!", true);
    }

    setGlobalLoading(true);
    setEditModalOpen(false);
    try {
      const taskRef = doc(db, "tarefas", editId);
      await updateDoc(taskRef, {
        tarefa: editName.trim(),
        data: editDate,
        horario: editTime || "12:00",
        recorrencia: editRecurrence,
        notificado: false, // Reseta notificação ao alterar prazo
        compartilhadoCom: editSharedWith,
        criadorNome: clientData?.nome || "Outro Usuário",
        tokenCriador: token
      });
      showToast("Tarefa atualizada!");
    } catch (err: any) {
      showToast("Erro ao editar: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

  // FILTROS DE LISTA
  const getFilteredList = () => {
    let list = currentTab === "pendentes" ? (clientData?.pendentes || []) : (clientData?.historico || []);
    
    // Filtro de compartilhamento de tarefas (só exibe tarefas de criadores que aceitamos ou se for nossa própria tarefa)
    if (!clientData?.isAdmin) {
      list = list.filter(t => {
        if (t.token === token) return true; // Nossa própria tarefa
        // Tarefa compartilhada por outro usuário
        return clientData?.compartilhamentosAceitos?.includes(t.token) ?? false;
      });
    }
    
    let filtered = list;
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      filtered = list.filter(t => {
        const name = (t.tarefa || "").toLowerCase();
        const rawDate = (t.data || "").toLowerCase();
        const formattedDate = formatDateString(t.data).toLowerCase();
        const time = (t.horario || "").toLowerCase();
        const recurrence = (t.recorrencia || "").toLowerCase();
        
        return name.includes(queryLower) ||
               rawDate.includes(queryLower) ||
               formattedDate.includes(queryLower) ||
               time.includes(queryLower) ||
               recurrence.includes(queryLower);
      });
    }

    // Sempre ordena as tarefas pendentes para que as que vencem primeiro apareçam no topo
    if (currentTab === "pendentes") {
      filtered = [...filtered].sort((a, b) => {
        const datetimeA = new Date(`${a.data}T${a.horario || "12:00"}`).getTime();
        const datetimeB = new Date(`${b.data}T${b.horario || "12:00"}`).getTime();
        return datetimeA - datetimeB;
      });
    }

    return filtered;
  };

  const isTaskOverdue = (t: Tarefa) => {
    if (t.status === "Realizada") return false;
    const taskDatetime = new Date(`${t.data}T${t.horario || "12:00"}`).getTime();
    return taskDatetime <= Date.now();
  };

  const formatDateString = (dt: string) => {
    if (!dt) return "";
    const parts = dt.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dt;
  };

  // Find all unique users who shared tasks with me
  const incomingSharersMap = new Map<string, string>();
  sharedTasksList.forEach(t => {
    if (t.token && t.token !== token) {
      incomingSharersMap.set(t.token, t.criadorNome || "Outro Usuário");
    }
  });
  const incomingSharers = Array.from(incomingSharersMap.entries()).map(([tok, name]) => ({
    token: tok,
    nome: name
  }));

  // Contagem de tarefas vencidas (atrasadas)
  const overdueCount = clientData?.pendentes ? clientData.pendentes.filter(t => isTaskOverdue(t)).length : 0;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      
      {/* GLOBAL BACKGROUND GLOWS */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* TOAST ALERT BANNER */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            id="toast-notification-banner"
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-md border ${
              toastIsError
                ? "bg-rose-950/80 border-rose-500/40 text-rose-200"
                : "bg-slate-900/90 border-slate-800/85 text-slate-100"
            }`}
          >
            {toastIsError ? <AlertTriangle className="w-4.5 h-4.5 text-rose-400" /> : <Bell className="w-4.5 h-4.5 text-indigo-400 animate-pulse" />}
            <span className="text-xs font-semibold tracking-wide uppercase font-mono">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL SCREEN SPINNER LOADING INDICATOR */}
      <AnimatePresence>
        {globalLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center pointer-events-all"
          >
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* APP HEADER */}
      <header className="border-b border-slate-900/80 bg-slate-950/40 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-indigo-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent tracking-tight font-sans">
              Agenda Pessoal
            </h1>
            
            {/* DISPLAY DE TAREFAS VENCIDAS (FOTO 1 - RED Badge) */}
            <AnimatePresence>
              {overdueCount > 0 && !clientData?.isAdmin && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  className="bg-rose-500 text-white text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.5)] flex items-center justify-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                  {overdueCount} {overdueCount === 1 ? "atrasada" : "atrasadas"}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3">
            {token && (
              <>
                <span className="bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs font-semibold tracking-wide font-mono text-slate-300">
                  Olá, <span className="text-indigo-300 font-bold">{nomeUsuario}</span>
                </span>
                
                {/* Logout Button (on Desktop) */}
                <button
                  onClick={handleLogout}
                  className="p-2 border border-slate-800/80 hover:border-rose-500/30 bg-slate-900/40 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer"
                  title="Sair da Conta"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* CORE WRAPPER CONTENT */}
      <main className="flex-grow max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 relative">
        {!token ? (
          /* REDESIGNED passcode-only LOGIN CONTAINER (DO ZERO NOVAMENTE) */
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md mx-auto my-12"
          >
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-100 font-sans tracking-tight">
                Acesse sua Agenda
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Insira sua chave de acesso pessoal e segura.
              </p>
            </div>

            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 p-6 sm:p-8 rounded-3xl shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Chave de Acesso (Senha)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={loginPasscode}
                      onChange={(e) => setLoginPasscode(e.target.value)}
                      placeholder="Digite sua chave de acesso"
                      className="w-full bg-slate-950/65 border border-slate-800 p-3.5 pr-10 text-slate-100 text-sm placeholder-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono tracking-widest font-bold text-center"
                    />
                    <Key className="w-4 h-4 text-slate-500 absolute right-3.5 top-4" />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 text-xs uppercase tracking-widest transition-all mt-2 rounded-xl shadow-lg shadow-indigo-600/15 cursor-pointer"
                >
                  ACESSAR AGENDA
                </button>
              </form>

              {showSalesBlock && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-6 pt-5 border-t border-slate-800/60 flex flex-col gap-3"
                >
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
                    <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1">
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                      <span>Adquirir Acesso à Agenda</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed mb-3">
                      Sua chave está incorreta ou não foi encontrada? Adquira seu <strong className="text-emerald-400 font-extrabold text-sm">Acesso Vitalício</strong> por apenas <strong className="text-emerald-400 font-extrabold text-sm">R$ 4,99 (Taxa única)</strong>!
                    </p>
                    <a
                      href={`https://wa.me/${whatsappNumber}?text=Ol%C3%A1%21+Não+consegui+acessar+com+a+minha+chave.+Gostaria+de+adquirir+ou+liberar+o+Acesso+Vital%C3%ADcio+da+minha+Agenda+Pessoal+por+R%24+4%2C99.`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
                    >
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                      Adquirir pelo WhatsApp {whatsappDisplay}
                    </a>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : clientData?.isAdmin ? (
          /* ADMINISTRATIVE MANAGER VIEW */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-slate-900/30 border border-slate-800/60 p-6 sm:p-8 rounded-3xl shadow-xl"
          >
            <AdminPanel
              token={token}
              handleLogout={handleLogout}
              showToast={showToast}
              setGlobalLoading={setGlobalLoading}
            />
          </motion.div>
        ) : clientData && clientData.status === "Inadimplente" ? (
          /* EXPIRED USER BLOCKING VIEW */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg mx-auto bg-slate-900/50 backdrop-blur-md border border-rose-500/20 p-6 sm:p-8 rounded-3xl shadow-2xl text-center relative overflow-hidden"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
              <AlertTriangle className="w-8 h-8 text-rose-400" />
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-slate-100 font-sans tracking-tight mb-2">
              Seu Período de Teste Expirou!
            </h2>
            
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto mb-6">
              Para continuar agendando e organizando seus compromissos diários de forma simples e rápida, ative sua licença definitiva. É uma taxa única e vitalícia!
            </p>

            {/* BENEFÍCIOS CARD */}
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-4 text-left space-y-3 mb-6 max-w-sm mx-auto">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 font-mono">
                O que você recebe no Plano Vitalício:
              </h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>Acesso definitivo sem mensalidades ou taxas futuras</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>Sincronização na nuvem em tempo real (Firestore)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>Configuração de recorrências (diário, semanal, mensal)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>Alerta de avisos sonoros e lembretes integrados</span>
                </li>
              </ul>
            </div>

            {/* PREÇO EM DESTAQUE */}
            <div className="mb-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Pagamento Único</p>
              <p className="text-3xl font-black text-emerald-400 mt-1">R$ 4,99</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Sem assinaturas, sem cobranças adicionais</p>
            </div>

            {/* ACTION BUTTONS */}
            <div className="space-y-3 max-w-sm mx-auto">
              <a
                href={`https://wa.me/${whatsappNumber}?text=Ol%C3%A1%21+Meu+per%C3%ADodo+de+teste+expirou+e+gostaria+de+adquirir+o+Acesso+Vital%C3%ADcio+da+minha+Agenda+Pessoal+por+R%24+4%2C99.+Chave%3A+${token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                <span className="w-2 h-2 bg-white rounded-full animate-ping" />
                Liberar pelo WhatsApp {whatsappDisplay}
              </a>

              <button
                onClick={handleLogout}
                className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 font-semibold py-2 px-4 text-xs rounded-xl transition-all cursor-pointer"
              >
                Sair / Trocar Chave
              </button>
            </div>
          </motion.div>
        ) : (
          /* STANDARD USER VIEW */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            
            {/* PAINEL DE CONTROLE E STATUS (Painelzinho em cima) */}
            <div className="flex items-center justify-between gap-3 bg-slate-900/40 border border-slate-800/80 p-2.5 px-4 rounded-xl shadow-md">
              <div className="flex items-center gap-3.5 text-xs text-slate-400 font-mono flex-wrap min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Key className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span className="truncate max-w-[100px] text-slate-300 font-bold" title={token}>
                    {token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : token}
                  </span>
                </span>
                <span className="text-slate-800 select-none hidden xs:inline">|</span>
                <span className="flex items-center gap-1.5 min-w-0">
                  {clientData && (clientData.status === "Vitalício" || clientData.status === "Pago") ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span className="text-emerald-400 font-bold">Vitalício</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                      <span className="text-sky-300 font-bold">Teste ({clientData?.diasRestantes ?? 0}d)</span>
                    </>
                  )}
                </span>
                <span className="text-slate-800 select-none hidden xs:inline">|</span>
                <button
                  type="button"
                  onClick={toggleBeep}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                  title="Alternar aviso sonoro"
                >
                  {beepEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 animate-pulse" />
                      <span className="text-emerald-400 font-bold">Som</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span className="text-slate-500 font-bold">Mudo</span>
                    </>
                  )}
                </button>
                <span className="text-slate-800 select-none hidden xs:inline">|</span>
                <span className="flex items-center gap-1.5 text-slate-400 select-none">
                  <ListCheck className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span>Agendadas: <strong className="text-indigo-300 font-bold">{clientData?.pendentes?.length ?? 0}</strong></span>
                </span>
              </div>
            </div>

            {/* CHECKBOXES DE ACEITAÇÃO DE COMPARTILHAMENTO (Ticar de quem aceito) */}
            {incomingSharers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-900/35 border border-slate-800/80 p-3.5 px-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>Aceitar tarefas compartilhadas de:</span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {incomingSharers.map((sharer) => {
                    const isAccepted = clientData?.compartilhamentosAceitos?.includes(sharer.token);
                    return (
                      <button
                        key={sharer.token}
                        onClick={async () => {
                          if (!clientData) return;
                          const currentAceitos = clientData.compartilhamentosAceitos || [];
                          let nextAceitos: string[];
                          if (isAccepted) {
                            nextAceitos = currentAceitos.filter(id => id !== sharer.token);
                          } else {
                            nextAceitos = [...currentAceitos, sharer.token];
                          }
                          try {
                            await updateDoc(doc(db, "clientes", token), {
                              compartilhamentosAceitos: nextAceitos
                            });
                            showToast(isAccepted ? "Compartilhamento ocultado! 👁️‍" : "Tarefas de " + sharer.nome + " adicionadas à sua agenda! 👥");
                          } catch (err) {
                            console.error("Erro ao atualizar aceitação de compartilhamento:", err);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border flex items-center gap-2 cursor-pointer ${
                          isAccepted
                            ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/20"
                            : "bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={!!isAccepted}
                          readOnly
                          className="w-3.5 h-3.5 rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer pointer-events-none bg-slate-950"
                        />
                        <span>{sharer.nome}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}


            
            {/* ALERT BOX EXPIRE ADVISORY WARNING */}
            <AnimatePresence>
              {clientData && clientData.aviso && avisoState !== "hidden" && (
                avisoState === "minimized" ? (
                  <motion.div
                    key="minimized-alert"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-indigo-950/20 border border-indigo-500/20 p-2 px-3.5 rounded-xl flex items-center justify-between gap-3 text-xs text-indigo-300 font-mono shadow-md shadow-indigo-950/25"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-indigo-400 animate-pulse" />
                      <span>Seu teste termina em <strong className="text-indigo-200">{clientData.diasRestantes} dia(s)</strong> (Vence em {formatDateString(clientData.vencimento)})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setAvisoState("visible")}
                        className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-100 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                        title="Expandir aviso completo"
                      >
                        <Maximize2 className="w-3.5 h-3.5" /> Ver Detalhes
                      </button>
                      <button
                        onClick={() => setAvisoState("hidden")}
                        className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                        title="Ocultar aviso"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="expanded-alert"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-indigo-950/25 border border-indigo-500/40 p-4 sm:p-5 rounded-2xl relative overflow-hidden shadow-xl"
                  >
                    {/* Absolute control buttons inside full panel */}
                    <div className="absolute top-4 right-4 flex items-center gap-1.5">
                      <button
                        onClick={() => setAvisoState("minimized")}
                        className="p-1.5 bg-slate-900/40 hover:bg-indigo-500/10 border border-slate-800 hover:border-indigo-500/20 rounded-xl text-indigo-400 hover:text-indigo-200 transition-all cursor-pointer"
                        title="Diminuir aviso"
                      >
                        <Minimize2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setAvisoState("hidden")}
                        className="p-1.5 bg-slate-900/40 hover:bg-indigo-500/10 border border-slate-800 hover:border-indigo-500/20 rounded-xl text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                        title="Sumir / Ocultar aviso"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pr-14 md:pr-16">
                      <div className="flex items-start gap-3.5">
                        <AlertTriangle className="w-6 h-6 text-indigo-400 mt-1 flex-shrink-0 animate-bounce" />
                        <div>
                          <h4 className="text-sm font-extrabold uppercase tracking-wider text-indigo-300 font-sans">
                            Período de Teste Quase Expirando!
                          </h4>
                          <p className="text-xs text-indigo-100/90 mt-1.5 leading-relaxed max-w-2xl">
                            Sua chave de acesso temporária expirará em <strong className="text-indigo-300 text-sm">{clientData.diasRestantes} dia(s)</strong> (Vence em {formatDateString(clientData.vencimento)}).
                            Adquira seu <strong className="text-emerald-400">Acesso Vitalício Permanente por apenas R$ 4,99 (Taxa Única)</strong> para <strong className="text-indigo-300">evitar o bloqueio da sua agenda</strong> e continuar organizando suas tarefas perfeitamente, sem correr o risco de ter a conta suspensa ou ter que começar tudo de novo!
                          </p>
                        </div>
                      </div>
                      
                      <a
                        href={`https://wa.me/${whatsappNumber}?text=Ol%C3%A1%21+Meu+per%C3%ADodo+de+teste+est%C3%A1+acabando+e+gostaria+de+adquirir+o+Acesso+Vital%C3%ADcio+da+minha+Agenda+Pessoal+por+R%24+4%2C99.+Chave%3A+${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 inline-flex items-center justify-center gap-2 w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider py-3 px-5 rounded-xl transition-all shadow-md shadow-emerald-950/30 cursor-pointer"
                      >
                        Ativar Vitalício no WhatsApp
                      </a>
                    </div>
                  </motion.div>
                )
              )}
            </AnimatePresence>

            {/* EXPANDABLE ADD TAREFA BOX COLLAPSIBLE DESIGN */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg shadow-black/10">
              <button
                id="btn-toggle-add-task"
                onClick={() => {
                  if (!isFormOpen) {
                    resetDateTimeInputs();
                  }
                  setIsFormOpen(!isFormOpen);
                }}
                className="w-full px-5 py-4 flex items-center justify-between text-slate-300 hover:text-slate-100 font-bold uppercase tracking-wider text-xs bg-slate-950/20 hover:bg-slate-950/40 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-indigo-400" />
                  {isFormOpen ? "Fechar Painel" : "Adicionar Nova Tarefa"}
                </span>
                <Plus className={`w-4 h-4 transition-transform duration-300 ${isFormOpen ? "rotate-45 text-rose-400" : "text-indigo-400"}`} />
              </button>

              <AnimatePresence>
                {isFormOpen && (
                  <motion.form
                    id="form-add-task-container"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleAddTask}
                    className="p-5 border-t border-slate-900/80 space-y-4"
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">O que precisa fazer?</label>
                      <div className="relative flex items-center">
                        <input
                          id="input-task-name"
                          type="text"
                          required
                          autoComplete="off"
                          placeholder="Ex: Pagar mensalidade do servidor..."
                          value={taskName}
                          onChange={(e) => setTaskName(e.target.value)}
                          className="w-full bg-slate-950/60 border border-slate-800 p-3 pr-12 text-slate-100 text-sm placeholder-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                        <button
                          type="button"
                          onClick={startSpeechRecognitionAdd}
                          className={`absolute right-3 p-1.5 rounded-lg transition-all cursor-pointer ${
                            isListeningAdd
                              ? "text-rose-400 bg-rose-500/10 animate-pulse animate-blink-red"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                          }`}
                          title={isListeningAdd ? "Ouvindo... Clique para parar" : "Gravar com voz (Microfone)"}
                        >
                          <Mic className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Para quando? (Data)</label>
                        <input
                          id="input-task-date"
                          type="date"
                          required
                          value={taskDate}
                          onChange={(e) => setTaskDate(e.target.value)}
                          className="w-full bg-slate-950/60 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Qual horário?</label>
                        {(() => {
                          const [taskHour, taskMin] = (taskTime || "12:00").split(":");
                          return (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={taskHour || "12"}
                                onChange={(e) => setTaskTime(`${e.target.value}:${taskMin || "00"}`)}
                                className="w-1/2 bg-slate-950/60 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center cursor-pointer"
                              >
                                {Array.from({ length: 24 }).map((_, i) => {
                                  const val = String(i).padStart(2, "0");
                                  return <option key={val} value={val} className="bg-slate-950 text-slate-200">{val} h</option>;
                                })}
                              </select>
                              <span className="text-slate-400 font-bold">:</span>
                              <select
                                value={taskMin || "00"}
                                onChange={(e) => setTaskTime(`${taskHour || "12"}:${e.target.value}`)}
                                className="w-1/2 bg-slate-950/60 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center cursor-pointer"
                              >
                                {Array.from({ length: 60 }).map((_, i) => {
                                  const val = String(i).padStart(2, "0");
                                  return <option key={val} value={val} className="bg-slate-950 text-slate-200">{val} m</option>;
                                })}
                              </select>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Repetir (Recorrência)</label>
                        <select
                          id="select-task-recurrence"
                          value={["Nenhuma", "1 Semana", "15 Dias", "Mensal", "Anual"].includes(taskRecurrence) ? taskRecurrence : "Personalizado"}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "Personalizado") {
                              setTaskRecurrence("30 Dias");
                            } else {
                              setTaskRecurrence(val);
                            }
                          }}
                          className="w-full bg-slate-950/60 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                        >
                          <option value="Nenhuma">Não repetir</option>
                          <option value="1 Semana">Semanal</option>
                          <option value="15 Dias">A cada 15 dias</option>
                          <option value="Mensal">Mensal</option>
                          <option value="Anual">Anual</option>
                          <option value="Personalizado">A cada X dias (Personalizado)...</option>
                        </select>
                        
                        {!["Nenhuma", "1 Semana", "15 Dias", "Mensal", "Anual"].includes(taskRecurrence) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="flex gap-2 items-center mt-1 bg-slate-950/30 p-2.5 border border-slate-800/40 rounded-xl"
                          >
                            <span className="text-xs text-slate-400 whitespace-nowrap">A cada</span>
                            <input
                              type="number"
                              min="1"
                              placeholder="Ex: 5"
                              value={parseInt(taskRecurrence.match(/\d+/)?.[0] || "30", 10)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val > 0) {
                                  setTaskRecurrence(`${val} Dias`);
                                } else {
                                  setTaskRecurrence("1 Dias");
                                }
                              }}
                              className="w-20 bg-slate-950 border border-slate-800 p-1.5 text-slate-200 text-xs rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-center font-bold font-mono"
                            />
                            <span className="text-xs text-slate-400">dia(s)</span>
                          </motion.div>
                        )}
                      </div>
                    </div>

                    {/* SELEÇÃO DE COMPARTILHAMENTO DE TAREFA */}
                    {(() => {
                      const sharedWithUs = allClients.filter(cli => {
                        const gMe1 = clientData?.grupo1?.trim();
                        const gMe2 = clientData?.grupo2?.trim();
                        const gMe3 = clientData?.grupo3?.trim();
                        const gMe4 = clientData?.grupo4?.trim();
                        const gCli1 = cli.grupo1?.trim();
                        const gCli2 = cli.grupo2?.trim();
                        const gCli3 = cli.grupo3?.trim();
                        const gCli4 = cli.grupo4?.trim();

                        if (!gMe1 && !gMe2 && !gMe3 && !gMe4) return false;
                        if (!gCli1 && !gCli2 && !gCli3 && !gCli4) return false;

                        const myGroups = [gMe1, gMe2, gMe3, gMe4].filter(Boolean);
                        const cliGroups = [gCli1, gCli2, gCli3, gCli4].filter(Boolean);

                        return myGroups.some(g => cliGroups.includes(g));
                      });

                      if (sharedWithUs.length === 0) return null;

                      return (
                        <div className="flex flex-col gap-1.5 pt-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Compartilhar com (Grupo comum):</label>
                          <div className="flex flex-wrap gap-2">
                            {sharedWithUs.map((cli) => {
                              const isSelected = taskSharedWith.includes(cli.token);
                              return (
                                <button
                                  key={cli.token}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setTaskSharedWith(prev => prev.filter(t => t !== cli.token));
                                    } else {
                                      setTaskSharedWith(prev => [...prev, cli.token]);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 cursor-pointer ${
                                    isSelected
                                      ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/20"
                                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-500 hover:text-slate-300"
                                  }`}
                                >
                                  <span>{cli.nome}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <button
                      id="btn-add-task-submit"
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 text-xs uppercase tracking-widest rounded-xl transition-all mt-2 shadow-lg shadow-indigo-600/15 cursor-pointer"
                    >
                      GRAVAR COMPROMISSO
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
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  currentTab === "pendentes"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <ListCheck className="w-4 h-4" />
                Pendentes
              </button>

              <button
                id="btn-tab-historico"
                onClick={() => setCurrentTab("historico")}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  currentTab === "historico"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <History className="w-4 h-4" />
                Concluídos
              </button>
            </div>

            {/* REAL-TIME SEARCH BOX */}
            <div className="relative">
              <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
              <input
                id="input-task-search"
                type="text"
                placeholder="BUSCAR TAREFAS POR TERMO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1E293B]/60 border border-slate-700/85 py-3.5 pl-11 pr-4 text-slate-100 text-xs font-mono tracking-wider outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl"
              />
            </div>

            {/* TASKS LIST */}
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
                          ? "bg-rose-950/20 border-rose-500/35 text-rose-100 shadow-[0_4px_16px_rgba(239,68,68,0.08)] animate-blink-red"
                          : "bg-slate-900/50 border-slate-800/80 hover:border-slate-700/80 hover:bg-slate-900/80 shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
                      }`}
                    >
                      <div className="flex items-start gap-4 flex-grow min-w-0">
                        {/* Status Checkbox Button */}
                        <div className="mt-1 flex-shrink-0">
                          {currentTab === "pendentes" ? (
                            <button
                              onClick={() => handleConcludeTask(t.id)}
                              className="w-6 h-6 rounded-lg border-2 border-slate-600 hover:border-emerald-500 bg-slate-950/40 hover:bg-emerald-500/10 flex items-center justify-center transition-all cursor-pointer group/chk"
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

                        {/* Task Title & Meta */}
                        <div className="space-y-2.5 flex-grow min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className={`text-base sm:text-lg font-semibold tracking-wide text-slate-100 break-all ${t.status === "Realizada" ? "line-through opacity-50 text-slate-400" : ""}`}>
                              {t.tarefa}
                            </span>
                            {t.recorrencia && t.recorrencia !== "Nenhuma" && (
                              <span
                                className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold px-2.5 py-0.5 rounded-full select-none"
                                title={`Repete: ${t.recorrencia}`}
                              >
                                🔁 {t.recorrencia}
                              </span>
                            )}
                            {overdue && (
                              <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 select-none">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                                </span>
                                Atrasada
                              </span>
                            )}
                          </div>

                          {/* Date and Time Indicators */}
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono flex-wrap">
                            <span className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800/40 px-2.5 py-1 rounded-lg">
                              <Calendar className="w-3.5 h-3.5 text-blue-400" />
                              {formatDateString(t.data)}
                            </span>
                            <span className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800/40 px-2.5 py-1 rounded-lg">
                              <Clock className="w-3.5 h-3.5 text-purple-400" />
                              {t.horario || "--:--"}
                            </span>

                            {/* Indicadores de Compartilhamento discretos e elegantes */}
                            {t.token !== token ? (
                              <span className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-lg font-sans">
                                <Users className="w-3.5 h-3.5 text-indigo-400" />
                                De: <strong className="text-indigo-200">{t.criadorNome || "Outro Usuário"}</strong>
                              </span>
                            ) : (
                              t.compartilhadoCom && t.compartilhadoCom.length > 0 && (() => {
                                const sharedNames = t.compartilhadoCom
                                  .map(tok => allClients.find(c => c.token === tok)?.nome)
                                  .filter(Boolean)
                                  .join(", ");
                                if (!sharedNames) return null;
                                return (
                                  <span className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800/40 text-slate-400 px-2.5 py-1 rounded-lg font-sans" title={`Compartilhado com: ${sharedNames}`}>
                                    <Users className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Compartilhado com: <strong className="text-slate-300">{sharedNames}</strong></span>
                                  </span>
                                );
                              })()
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Overdue Pulse Dot (Bolinha Vermelha Piscando) */}
                      {overdue && (
                        <div className="flex items-center justify-center md:mx-auto select-none pointer-events-none" title="Tarefa Atrasada">
                          <span className="relative flex h-3.5 w-3.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80"></span>
                            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-600 shadow-[0_0_12px_#f43f5e,0_0_3px_#f43f5e]"></span>
                          </span>
                        </div>
                      )}

                      {/* Action Buttons */}
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
                            {t.token === token ? (
                              <>
                                <button
                                  onClick={() => openEditModal(t)}
                                  className="inline-flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-xl border border-slate-700/60 transition-all cursor-pointer"
                                >
                                  Editar
                                </button>

                                <button
                                  onClick={() => setDeletingTaskId(t.id)}
                                  className="w-9 h-9 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white flex items-center justify-center rounded-xl transition-all cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider px-2 font-mono">
                                Apenas Leitura
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider mr-2">
                              Concluída
                            </span>
                            {t.token === token && (
                              <button
                                onClick={() => setDeletingTaskId(t.id)}
                                className="w-9 h-9 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white flex items-center justify-center rounded-xl transition-all cursor-pointer"
                                title="Excluir Definitivamente"
                              >
                                <Trash className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-sm text-slate-400 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800/80">
                  Nenhum compromisso agendado ou encontrado.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-950 bg-slate-950/60 py-6 text-center text-xs text-slate-500 font-mono mt-auto">
        TaskControl Pro v5.0 // Sincronização em Tempo Real Firestore
      </footer>

      {/* EDIT TAREFA MODAL */}
      <AnimatePresence>
        {editModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-3xl shadow-2xl relative overflow-hidden"
            >
              <button
                onClick={() => setEditModalOpen(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-100 p-1 hover:bg-slate-800 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-slate-800">
                <Edit className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-slate-100 font-sans">
                  Editar Compromisso
                </h3>
              </div>

              <form onSubmit={handleConfirmEdit} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">O que precisa fazer?</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 p-3 pr-12 text-slate-100 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={startSpeechRecognitionEdit}
                      className={`absolute right-3 p-1.5 rounded-lg transition-all cursor-pointer ${
                        isListeningEdit
                          ? "text-rose-400 bg-rose-500/10 animate-pulse animate-blink-red"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                      }`}
                      title={isListeningEdit ? "Ouvindo... Clique para parar" : "Gravar com voz (Microfone)"}
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Data</label>
                    <input
                      type="date"
                      required
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Horário</label>
                    {(() => {
                      const [editHour, editMin] = (editTime || "12:00").split(":");
                      return (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={editHour || "12"}
                            onChange={(e) => setEditTime(`${e.target.value}:${editMin || "00"}`)}
                            className="w-1/2 bg-slate-950 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-center cursor-pointer"
                          >
                            {Array.from({ length: 24 }).map((_, i) => {
                              const val = String(i).padStart(2, "0");
                              return <option key={val} value={val} className="bg-slate-950 text-slate-200">{val} h</option>;
                            })}
                          </select>
                          <span className="text-slate-400 font-bold">:</span>
                          <select
                            value={editMin || "00"}
                            onChange={(e) => setEditTime(`${editHour || "12"}:${e.target.value}`)}
                            className="w-1/2 bg-slate-950 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-center cursor-pointer"
                          >
                            {Array.from({ length: 60 }).map((_, i) => {
                              const val = String(i).padStart(2, "0");
                              return <option key={val} value={val} className="bg-slate-950 text-slate-200">{val} m</option>;
                            })}
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                 <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Repetir (Recorrência)</label>
                  <select
                    value={["Nenhuma", "1 Semana", "15 Dias", "Mensal", "Anual"].includes(editRecurrence) ? editRecurrence : "Personalizado"}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "Personalizado") {
                        setEditRecurrence("30 Dias");
                      } else {
                        setEditRecurrence(val);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                  >
                    <option value="Nenhuma">Não repetir</option>
                    <option value="1 Semana">Semanal</option>
                    <option value="15 Dias">A cada 15 dias</option>
                    <option value="Mensal">Mensal</option>
                    <option value="Anual">Anual</option>
                    <option value="Personalizado">A cada X dias (Personalizado)...</option>
                  </select>
                  
                  {!["Nenhuma", "1 Semana", "15 Dias", "Mensal", "Anual"].includes(editRecurrence) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="flex gap-2 items-center mt-1 bg-slate-950/30 p-2.5 border border-slate-800/40 rounded-xl"
                    >
                      <span className="text-xs text-slate-400 whitespace-nowrap">A cada</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="Ex: 5"
                        value={parseInt(editRecurrence.match(/\d+/)?.[0] || "30", 10)}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val > 0) {
                            setEditRecurrence(`${val} Dias`);
                          } else {
                            setEditRecurrence("1 Dias");
                          }
                        }}
                        className="w-20 bg-slate-950 border border-slate-800 p-1.5 text-slate-200 text-xs rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-center font-bold font-mono"
                      />
                      <span className="text-xs text-slate-400">dia(s)</span>
                    </motion.div>
                  )}
                </div>

                {/* EDIT COMPARTILHAMENTO */}
                {(() => {
                  const sharedWithUs = allClients.filter(cli => {
                    const gMe1 = clientData?.grupo1?.trim();
                    const gMe2 = clientData?.grupo2?.trim();
                    const gMe3 = clientData?.grupo3?.trim();
                    const gMe4 = clientData?.grupo4?.trim();
                    const gCli1 = cli.grupo1?.trim();
                    const gCli2 = cli.grupo2?.trim();
                    const gCli3 = cli.grupo3?.trim();
                    const gCli4 = cli.grupo4?.trim();

                    if (!gMe1 && !gMe2 && !gMe3 && !gMe4) return false;
                    if (!gCli1 && !gCli2 && !gCli3 && !gCli4) return false;

                    const myGroups = [gMe1, gMe2, gMe3, gMe4].filter(Boolean);
                    const cliGroups = [gCli1, gCli2, gCli3, gCli4].filter(Boolean);

                    return myGroups.some(g => cliGroups.includes(g));
                  });

                  if (sharedWithUs.length === 0) return null;

                  return (
                    <div className="flex flex-col gap-1.5 pt-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Compartilhar com (Grupo comum):</label>
                      <div className="flex flex-wrap gap-2">
                        {sharedWithUs.map((cli) => {
                          const isSelected = editSharedWith.includes(cli.token);
                          return (
                            <button
                              key={cli.token}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setEditSharedWith(prev => prev.filter(t => t !== cli.token));
                                } else {
                                  setEditSharedWith(prev => [...prev, cli.token]);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 cursor-pointer ${
                                isSelected
                                  ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/20"
                                  : "bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              <span>{cli.nome}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all shadow-lg shadow-indigo-600/15 cursor-pointer"
                  >
                    Salvar Alterações
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
