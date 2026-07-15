export interface Tarefa {
  id: string;
  token: string;
  tarefa: string;
  data: string; // YYYY-MM-DD
  horario: string; // HH:MM
  recorrencia: string;
  status: "Pendente" | "Realizada";
  notificado?: boolean;
  telefoneDestinatario?: string; // Celular do destinatário opcional
  compartilhadoCom?: string[]; // Tokens de quem compartilha
  criadorNome?: string; // Nome de quem criou a tarefa
  tokenCriador?: string; // Token de quem criou a tarefa
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
  bloquearCompartilhamento?: boolean; // Bloqueio pelo administrador
  compartilhamentosAceitos?: string[]; // Chaves aceitas de compartilhamento
}
