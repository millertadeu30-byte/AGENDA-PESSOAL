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
  MessageSquare
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
  onSnapshot
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
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Phone numbers & SMS configurations state
  const [userPhoneInput, setUserPhoneInput] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [editRecipientPhone, setEditRecipientPhone] = useState("");
  const [callmebotApiKey, setCallmebotApiKey] = useState(() => {
    return safeStorage.getItem("taskControlProCallmebotKey") || "";
  });
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

  // Envia alertas via WhatsApp/SMS de forma automática em segundo plano usando CallMeBot (opção 100% gratuita)
  const sendSmsOrWhatsappAlert = async (task: Tarefa) => {
    const mainPhone = clientData?.telefone || "";
    const extraPhone = task.telefoneDestinatario || "";
    const formattedDate = formatDateString(task.data);
    const messageText = `🔔 *Alerta de Compromisso!* \n\nEstá na hora de: *${task.tarefa}* \nHorário: *${task.horario}* em *${formattedDate}*.\n\n_Enviado por Agenda Pessoal_`;

    console.log("[Alerts] Disparando avisos de WhatsApp para:", { mainPhone, extraPhone });

    if (callmebotApiKey.trim()) {
      const encodedMsg = encodeURIComponent(messageText);
      
      // Envia para o celular principal do usuário
      if (mainPhone) {
        try {
          const cleanPhone = mainPhone.replace(/\D/g, "");
          const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodedMsg}&apikey=${callmebotApiKey.trim()}`;
          // Usamos 'no-cors' para disparar a requisição sem ser bloqueado pela política de CORS do navegador
          fetch(url, { mode: "no-cors" });
          console.log("[CallMeBot] Alerta enviado para o celular principal:", cleanPhone);
        } catch (err) {
          console.error("Erro CallMeBot principal:", err);
        }
      }

      // Envia para o celular destinatário extra configurado na tarefa
      if (extraPhone) {
        try {
          const cleanPhone = extraPhone.replace(/\D/g, "");
          const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodedMsg}&apikey=${callmebotApiKey.trim()}`;
          fetch(url, { mode: "no-cors" });
          console.log("[CallMeBot] Alerta enviado para o celular extra:", cleanPhone);
        } catch (err) {
          console.error("Erro CallMeBot extra:", err);
        }
      }
    }
  };

  // Retorna o link direto do WhatsApp Web/App com a mensagem pronta (100% gratuito e ilimitado)
  const getWhatsappLink = (phone: string, task: Tarefa) => {
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length >= 10 && !cleanPhone.startsWith("55")) {
      cleanPhone = `55${cleanPhone}`;
    }
    const message = `🔔 *Lembrete de Compromisso:* \n\n"${task.tarefa}" \nHorário: *${task.horario || ""}* em *${formatDateString(task.data)}*.`;
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
  };

  // Salva o número de telefone principal do usuário no Firestore
  const handleSaveUserPhone = async () => {
    if (!token) return;
    setGlobalLoading(true);
    try {
      const clientRef = doc(db, "clientes", token);
      await updateDoc(clientRef, { telefone: userPhoneInput.trim() });
      showToast("Número de celular gravado com sucesso! 📱");
    } catch (err: any) {
      showToast("Erro ao gravar celular: " + err.message, true);
    } finally {
      setGlobalLoading(false);
    }
  };

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
        telefone: data.telefone || ""
      }));
    }, (error) => {
      console.error("Erro na escuta da conta:", error);
    });

    return () => unsubscribe();
  }, [token]);

  // Sincroniza o input do telefone principal quando os dados do cliente carregam
  useEffect(() => {
    if (clientData?.telefone) {
      setUserPhoneInput(clientData.telefone);
    }
  }, [clientData?.telefone]);

  // 2. Sincronização em Tempo Real das Tarefas (Firestore collection query listener)
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

      // Salva em localStorage para carregamento instantâneo no próximo boot
      safeStorage.setItem("taskControlProTasksBackup", JSON.stringify(pendentes));
    }, (error) => {
      console.error("Erro ao sincronizar tarefas:", error);
    });

    return () => unsubscribe();
  }, [token]);

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

          // 2.5 Notificação automática via WhatsApp/SMS se CallMeBot estiver configurado
          sendSmsOrWhatsappAlert(t);

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
        telefoneDestinatario: recipientPhone.trim()
      };

      await setDoc(doc(db, "tarefas", taskId), newTask);
      
      setTaskName("");
      setRecipientPhone("");
      resetDateTimeInputs();
      setTaskRecurrence("Nenhuma");
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
        
        if (task.recorrencia === "1 Semana") currentDatetime.setDate(currentDatetime.getDate() + 7);
        else if (task.recorrencia === "15 Dias") currentDatetime.setDate(currentDatetime.getDate() + 15);
        else if (task.recorrencia === "Mensal") currentDatetime.setMonth(currentDatetime.getMonth() + 1);
        else if (task.recorrencia === "Anual") currentDatetime.setFullYear(currentDatetime.getFullYear() + 1);

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
    setEditRecipientPhone(t.telefoneDestinatario || "");
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
        telefoneDestinatario: editRecipientPhone.trim()
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
    const list = currentTab === "pendentes" ? (clientData?.pendentes || []) : (clientData?.historico || []);
    if (!searchQuery.trim()) return list;

    const queryLower = searchQuery.toLowerCase();
    return list.filter(t => t.tarefa.toLowerCase().includes(queryLower));
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
              </div>
            </div>

            {/* DEDICATED NOTIFICATIONS SETUP AND TEST BOX - WHATSAPP & SMS SETUP */}
            <div className="bg-slate-900/30 border border-slate-800/60 p-4 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-slate-200">Alertas de Celular (WhatsApp / SMS)</span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setIsGuideOpen(!isGuideOpen)}
                    className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer bg-emerald-500/10 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                  >
                    {isGuideOpen ? "Fechar Instruções" : "Como Funciona? 📲"}
                  </button>
                </div>
              </div>

              {/* Main Phone Input Field */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2 items-end">
                  <div className="flex-grow w-full space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Seu Número de Celular (com DDD)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Ex: 11999999999"
                        value={userPhoneInput}
                        onChange={(e) => setUserPhoneInput(e.target.value)}
                        className="w-full bg-slate-950/60 border border-slate-800 p-2.5 pl-9 text-slate-200 text-xs rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                      <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>
                  <button
                    onClick={handleSaveUserPhone}
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    Gravar Celular
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 items-end pt-2 border-t border-slate-800/40">
                  <div className="flex-grow w-full space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Chave API CallMeBot (Opcional - para disparos automáticos)
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="Insira sua Chave API do CallMeBot"
                        value={callmebotApiKey}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCallmebotApiKey(val);
                          safeStorage.setItem("taskControlProCallmebotKey", val);
                        }}
                        className="w-full bg-slate-950/60 border border-slate-800 p-2.5 pl-9 text-slate-200 text-xs rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      />
                      <Key className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>
                </div>
              </div>

              {isGuideOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="bg-slate-950/40 border border-slate-800/40 rounded-xl p-3 text-xs text-slate-300 space-y-2.5"
                >
                  <p className="text-slate-400 leading-relaxed">
                    Você pode receber alertas de vencimento diretamente em qualquer celular de forma simples e gratuita de duas formas:
                  </p>
                  <div className="space-y-2 pl-2">
                    <div className="flex items-start gap-2">
                      <span className="bg-slate-800 text-slate-300 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                      <div>
                        <strong className="text-slate-200">Envio Manual Direct-WhatsApp (Ilimitado e 100% Grátis):</strong> Cada compromisso terá um botão de WhatsApp dedicado. Ao vencer, o app emite o BIP sonoro e você pode clicar no botão para abrir o WhatsApp Web/App com a mensagem de lembrete prontinha preenchida para enviar a você mesmo ou ao destinatário!
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-slate-800 text-slate-300 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                      <div>
                        <strong className="text-slate-200">Envio Automático em Segundo Plano (WhatsApp Automatizado):</strong> Para que as notificações cheguem sozinhas sem precisar clicar em nada, basta usar a ferramenta gratuita <strong className="text-emerald-400">CallMeBot</strong>.
                        <br />
                        <span className="text-slate-400 block mt-1">
                          Como obter sua chave grátis em 15 segundos:
                          <ol className="list-decimal pl-4 mt-0.5 space-y-0.5">
                            <li>Adicione o número <strong className="text-slate-300">+34 644 10 55 53</strong> no seu WhatsApp.</li>
                            <li>Envie a mensagem: <code className="bg-slate-950 text-emerald-400 px-1 py-0.5 rounded font-mono">I allow callmebot to send me messages</code></li>
                            <li>O robô enviará sua chave API de volta. Insira-a no campo acima para habilitar disparos silenciosos automáticos.</li>
                          </ol>
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
            
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
                          value={taskRecurrence}
                          onChange={(e) => setTaskRecurrence(e.target.value as any)}
                          className="w-full bg-slate-950/60 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        >
                          <option value="Nenhuma">Não repetir</option>
                          <option value="1 Semana">Semanal</option>
                          <option value="15 Dias">A cada 15 dias</option>
                          <option value="Mensal">Mensal</option>
                          <option value="Anual">Anual</option>
                        </select>
                      </div>
                    </div>

                    {/* Campo opcional de celular para outra pessoa receber aviso */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Enviar aviso também para outro celular? (Opcional - com DDD)</label>
                      <div className="relative flex items-center">
                        <input
                          id="input-task-recipient-phone"
                          type="text"
                          placeholder="Ex: 11988888888"
                          value={recipientPhone}
                          onChange={(e) => setRecipientPhone(e.target.value)}
                          className="w-full bg-slate-950/60 border border-slate-800 p-3 pl-10 text-slate-100 text-sm placeholder-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                        <Phone className="w-4 h-4 text-slate-500 absolute left-3.5" />
                      </div>
                    </div>

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
                            {t.telefoneDestinatario && (
                              <span className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-[10px] px-2 py-1 rounded-lg text-emerald-300">
                                <Phone className="w-3 h-3 text-emerald-400" />
                                Para: {t.telefoneDestinatario}
                              </span>
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
                            {/* WhatsApp Direct principal */}
                            {clientData?.telefone && (
                              <a
                                href={getWhatsappLink(clientData.telefone, t)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-9 h-9 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600 hover:text-white flex items-center justify-center rounded-xl transition-all"
                                title="Enviar lembrete WhatsApp ao seu celular"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </a>
                            )}

                            {/* WhatsApp Direct extra */}
                            {t.telefoneDestinatario && (
                              <a
                                href={getWhatsappLink(t.telefoneDestinatario, t)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-9 h-9 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600 hover:text-white flex items-center justify-center rounded-xl transition-all"
                                title={`Enviar lembrete WhatsApp para ${t.telefoneDestinatario}`}
                              >
                                <Phone className="w-4 h-4" />
                              </a>
                            )}

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
                          <>
                            <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider mr-2">
                              Concluída
                            </span>
                            <button
                              onClick={() => setDeletingTaskId(t.id)}
                              className="w-9 h-9 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white flex items-center justify-center rounded-xl transition-all cursor-pointer"
                              title="Excluir Definitivamente"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
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
                    value={editRecurrence}
                    onChange={(e) => setEditRecurrence(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 p-3 text-slate-200 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="Nenhuma">Não repetir</option>
                    <option value="1 Semana">Semanal</option>
                    <option value="15 Dias">A cada 15 dias</option>
                    <option value="Mensal">Mensal</option>
                    <option value="Anual">Anual</option>
                  </select>
                </div>

                {/* Campo opcional de celular para outra pessoa na edição */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Enviar aviso também para outro celular? (Opcional - com DDD)</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      placeholder="Ex: 11988888888"
                      value={editRecipientPhone}
                      onChange={(e) => setEditRecipientPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 p-3 pl-10 text-slate-100 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5" />
                  </div>
                </div>

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
