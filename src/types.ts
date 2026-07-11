export interface Tarefa {
  id: string;
  token: string;
  tarefa: string;
  data: string; // YYYY-MM-DD
  horario: string; // HH:MM
  recorrencia: "Nenhuma" | "1 Semana" | "15 Dias" | "Mensal" | "Anual";
  status: "Pendente" | "Realizada";
  notificado?: boolean;
  telefoneDestinatario?: string; // Celular do destinatário opcional
}

export interface ClientData {
  pendentes: Tarefa[];
  historico: Tarefa[];
  aviso: boolean;
  diasRestantes: number;
  nome: string;
  status: string; // "Ativo" | "Pago" | "Vitalício" | "Inadimplente"
  expired?: boolean;
  isAdmin?: boolean;
  fcmToken?: string;
  telefone?: string; // Celular principal do usuário
}
