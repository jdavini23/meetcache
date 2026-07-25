export interface ChildProfile {
  id: string;
  user_id: string;
  nickname: string;
  birth_month: number;
  birth_year: number;
  pronouns: string | null;
  routines: string;
  challenges: string;
  parent_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  child_profile_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'parent' | 'assistant';
  content: string;
  created_at: string;
  client_request_id?: string | null;
  response_status?: 'pending' | 'failed' | 'completed' | null;
  processing_started_at?: string | null;
}
