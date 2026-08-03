export type ChatRole = 'lojista' | 'motoboy' | 'cliente';

export interface Message {
  _id?: string;
  senderId: string;
  senderName?: string;
  text: string;
  createdAt: string;
  timestamp?: string;
  status?: 'sent' | 'delivered' | 'read';
}

export interface Conversation {
  _id: string;
  otherParticipantId: string;
  otherParticipantName: string;
  otherParticipantRole: ChatRole;
  lastMessage?: { text: string; senderName: string; createdAt: string } | null;
  lastMessageTime?: string;
  unreadCount: number;
  isActive: boolean;
}

export interface ChatTab extends Conversation {
  messages: Message[];
  isLoading: boolean;
  isUserTyping?: boolean;
}
