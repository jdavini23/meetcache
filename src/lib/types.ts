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
  memory_suggestion_eligible?: boolean;
  used_memories?: UsedMemory[];
}

export type MemoryType = 'trigger' | 'helps' | 'worsens' | 'parent_preference' | 'recurring_situation' | 'routine' | 'school_context' | 'sensory_context';

export interface ChildMemory {
  id: string;
  child_profile_id: string;
  memory_type: MemoryType;
  content: string;
  parent_action: 'accepted' | 'edited';
  created_at: string;
  updated_at: string;
}

export interface MemorySuggestion {
  id: string;
  assistant_message_id: string;
  suggested_type: MemoryType;
  suggested_content: string;
  decision: 'pending' | 'accepted' | 'edited' | 'rejected';
}

export interface UsedMemory {
  memory_id: string | null;
  memory_type: MemoryType;
  content: string;
}
