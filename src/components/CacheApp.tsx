import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { AlertCircle, ArrowRight, ChevronUp, Info, Loader2, LogOut, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { formatChildAge } from '../lib/childAge';
import type { ChildMemory, ChildProfile, Conversation, MemorySuggestion, Message, UsedMemory } from '../lib/types';
import ChatMarkdown from './ChatMarkdown';
import AccountPanel from './cache/AccountPanel';
import { ContextPanel, MemorySuggestionCard, MemoryUseDisclosure } from './cache/MemoryPanels';
import ProfileForm from './cache/ProfileForm';

type AppState = 'loading' | 'signed-out' | 'onboarding' | 'ready' | 'error';

interface FailedChatRequest {
  content: string;
  clientRequestId: string;
}

const starterPrompts = [
  'Help me think through a tough moment.',
  'What can I try when big feelings show up?',
  'How can I make a transition feel easier?',
];

const CHAT_POLL_INTERVAL_MS = 1_000;
const CHAT_ATTEMPT_TIMEOUT_MS = 10_000;
const CHAT_REQUEST_TIMEOUT_MS = 95_000;
const MEMORY_LIMIT = 12;

function isDesktopLayout() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
}

class ChatRequestError extends Error {
  requestId?: string;

  constructor(message: string, requestId?: string) {
    super(message);
    this.name = 'ChatRequestError';
    this.requestId = requestId;
  }
}

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

function useModalFocus(
  isOpen: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
  returnFocusRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const focusableElements = (): HTMLElement[] => dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      : [];
    if (!dialog?.contains(document.activeElement)) {
      (initialFocusRef?.current ?? focusableElements()[0])?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      if (elements.length === 0) return;
      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      (returnFocusRef?.current ?? previouslyFocused)?.focus();
    };
  }, [dialogRef, initialFocusRef, isOpen, onClose, returnFocusRef]);
}

interface ChatMessageProps {
  message: Message;
}

function ChatMessage({ message }: ChatMessageProps) {
  const isParent = message.role === 'parent';

  return (
    <article className={`flex max-w-[92%] gap-2.5 sm:max-w-[82%] ${
        isParent
          ? 'ml-auto flex-row-reverse'
          : 'mr-auto'
      }`} aria-label={isParent ? 'Your message' : 'Cache response'}>
      {!isParent && <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full border border-sage/20 bg-sage/10 text-sage" aria-hidden="true"><Sparkles className="size-3.5" /></span>}
      <div className={`min-w-0 break-words rounded-2xl px-4 py-3 text-sm leading-6 shadow-[0_4px_14px_-11px_rgba(43,38,34,0.42)] ${
        isParent
          ? 'rounded-br-md bg-ink text-cream'
          : 'rounded-bl-md border border-sage/15 bg-sage/10 text-ink'
      }`}>
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">{isParent ? 'You' : 'Cache'}</span>
        {isParent ? message.content : <ChatMarkdown content={message.content} />}
      </div>
    </article>
  );
}

export default function CacheApp() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<ChildMemory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [memoriesError, setMemoriesError] = useState('');
  const [memoryLimit, setMemoryLimit] = useState(MEMORY_LIMIT);
  const [memoryStatus, setMemoryStatus] = useState('');
  const [focusedMemoryId, setFocusedMemoryId] = useState<string | null>(null);
  const [memorySuggestions, setMemorySuggestions] = useState<Record<string, MemorySuggestion[]>>({});
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [failedChatRequest, setFailedChatRequest] = useState<FailedChatRequest | null>(null);
  const sendLock = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const contextDrawerRef = useRef<HTMLElement>(null);
  const desktopMemoryTargetRef = useRef<HTMLDivElement>(null);
  const mobileMemoryTargetRef = useRef<HTMLDivElement>(null);
  const accountDialogRef = useRef<HTMLElement>(null);
  const accountCloseButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const editDialogRef = useRef<HTMLElement>(null);
  const editCloseButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const isNearLatestRef = useRef(true);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  const closeContext = useCallback(() => setContextOpen(false), []);
  const closeAccount = useCallback(() => {
    setAccountOpen(false);
    setDeleteConfirmation('');
  }, []);
  const closeEditing = useCallback(() => setEditing(false), []);

  const setPendingSuggestions = (suggestions: MemorySuggestion[]) => {
    setMemorySuggestions(() => suggestions.reduce<Record<string, MemorySuggestion[]>>((grouped, suggestion) => {
      (grouped[suggestion.assistant_message_id] ??= []).push(suggestion);
      return grouped;
    }, {}));
  };

  const recordProductEvent = (eventName: 'app_session_started' | 'memory_manager_opened' | 'memory_use_disclosure_opened', subjectId: string, accessToken = session?.access_token, clientEventId: string = crypto.randomUUID()) => {
    if (!accessToken) return;
    void fetch('/api/product-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ eventName, subjectId, clientEventId }),
    }).catch(() => {
      // Product measurement never blocks the parent experience.
    });
  };

  const recordAppSession = (profileId: string, accessToken: string) => {
    try {
      const storageKey = 'cache-app-session-event-id';
      const existingId = window.sessionStorage.getItem(storageKey);
      const eventId = existingId ?? crypto.randomUUID();
      if (!existingId) window.sessionStorage.setItem(storageKey, eventId);
      recordProductEvent('app_session_started', profileId, accessToken, eventId);
    } catch {
      recordProductEvent('app_session_started', profileId, accessToken);
    }
  };

  const loadMemories = async (accessToken: string) => {
    setMemoriesLoading(true);
    setMemoriesError('');
    try {
      const response = await fetch('/api/memories', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error('Cache could not load saved memories right now.');
      const body = await response.json() as { memories?: ChildMemory[]; limit?: number };
      setMemories(body.memories ?? []);
      setMemoryLimit(body.limit ?? MEMORY_LIMIT);
    } catch (error) {
      setMemoriesError(error instanceof Error ? error.message : 'Cache could not load saved memories right now.');
    } finally {
      setMemoriesLoading(false);
    }
  };

  const loadMemorySuggestions = async (conversationId: string, accessToken: string) => {
    try {
      const response = await fetch(`/api/memory-suggestions?conversationId=${encodeURIComponent(conversationId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) return;
      const body = await response.json() as { suggestions?: MemorySuggestion[] };
      setPendingSuggestions(body.suggestions ?? []);
    } catch {
      // Suggestions are intentionally non-blocking.
    }
  };

  const loadAccount = async (activeSession: Session) => {
    setAppState('loading');
    const { data: profileData, error: profileError } = await supabase.from('child_profiles').select().maybeSingle();
    if (profileError) { setNotice('We could not load your Cache profile. Please refresh and try again.'); setAppState('error'); return; }
    if (!profileData) { setProfile(null); setAppState('onboarding'); return; }
    const savedProfile = profileData as ChildProfile;
    setProfile(savedProfile);
    void loadMemories(activeSession.access_token);
    recordAppSession(savedProfile.id, activeSession.access_token);
    if (typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches) {
      recordProductEvent('memory_manager_opened', savedProfile.id, activeSession.access_token);
    }
    const { data: conversationData, error: conversationError } = await supabase.from('conversations').select().eq('child_profile_id', savedProfile.id).maybeSingle();
    if (conversationError) { setNotice('We could not load your conversation. Please refresh and try again.'); setAppState('error'); return; }
    let activeConversation = conversationData as Conversation | null;
    if (!activeConversation) {
      const { data: createdConversation, error: createConversationError } = await supabase.from('conversations').insert({ child_profile_id: savedProfile.id }).select().single();
      if (createConversationError || !createdConversation) { setNotice('We could not prepare your conversation. Please refresh and try again.'); setAppState('error'); return; }
      activeConversation = createdConversation as Conversation;
    }
    setConversation(activeConversation);
    const { data: messageData, error: messageError } = await supabase.from('messages').select().eq('conversation_id', activeConversation.id).order('created_at');
    if (messageError) { setNotice('We could not load earlier messages.'); }
    const savedMessages = (messageData ?? []) as Message[];
    const messageIds = new Set(savedMessages.map((savedMessage) => savedMessage.id));
    const { data: memoryUseData } = await supabase.from('memory_message_uses')
      .select('assistant_message_id, child_memory_id, memory_type_snapshot, content_snapshot')
      .eq('user_id', activeSession.user.id)
      .order('created_at');
    const memoryUsesByMessage = ((memoryUseData ?? []) as Array<{
      assistant_message_id: string;
      child_memory_id: string | null;
      memory_type_snapshot: UsedMemory['memory_type'];
      content_snapshot: string;
    }>).reduce<Record<string, UsedMemory[]>>((grouped, use) => {
      if (!messageIds.has(use.assistant_message_id)) return grouped;
      (grouped[use.assistant_message_id] ??= []).push({
        memory_id: use.child_memory_id,
        memory_type: use.memory_type_snapshot,
        content: use.content_snapshot,
      });
      return grouped;
    }, {});
    const messagesWithMemoryUses = savedMessages.map((savedMessage) => ({
      ...savedMessage,
      used_memories: memoryUsesByMessage[savedMessage.id] ?? [],
    }));
    setMessages(messagesWithMemoryUses);
    void loadMemorySuggestions(activeConversation.id, activeSession.access_token);
    const incompleteMessage = [...messagesWithMemoryUses].reverse().find((message) => message.role === 'parent'
      && message.client_request_id
      && (message.response_status === 'pending' || message.response_status === 'failed'));
    if (incompleteMessage?.client_request_id) {
      setFailedChatRequest({ content: incompleteMessage.content, clientRequestId: incompleteMessage.client_request_id });
      setNotice('Cache still has an unfinished response. You can safely try again without sending your message twice.');
    }
    setAppState('ready');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void loadAccount(data.session); else setAppState('signed-out');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) void loadAccount(nextSession); else { setProfile(null); setMessages([]); setMemories([]); setMemorySuggestions({}); setAppState('signed-out'); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isNearLatestRef.current) {
      messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: sending ? 'smooth' : 'auto' });
    } else if (messages.length > 0) {
      setHasUnreadMessages(true);
    }
  }, [messages.length, sending]);

  useModalFocus(contextOpen, contextDrawerRef, closeContext, focusedMemoryId ? mobileMemoryTargetRef : undefined);
  useModalFocus(accountOpen, accountDialogRef, closeAccount, accountCloseButtonRef, accountButtonRef);
  useModalFocus(editing, editDialogRef, closeEditing, editCloseButtonRef, editButtonRef);

  const requestMagicLink = async (event: FormEvent) => {
    event.preventDefault(); setNotice('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/app` } });
    setNotice(error ? 'We could not send that sign-in link. Please check the address and try again.' : 'Check your email for a secure sign-in link.');
  };

  const completeProfile = async (savedProfile: ChildProfile) => {
    setProfile(savedProfile);
    const { data, error } = await supabase.from('conversations').insert({ child_profile_id: savedProfile.id }).select().single();
    if (error || !data) { setNotice('Your profile was saved, but we could not start the conversation. Please refresh and try again.'); setAppState('error'); return; }
    setConversation(data as Conversation); setMessages([]); setAppState('ready');
  };

  const requestChatResponse = async (content: string, clientRequestId: string) => {
    const startedAt = Date.now();
    let lastRequestId: string | undefined;
    while (Date.now() - startedAt < CHAT_REQUEST_TIMEOUT_MS) {
      let response: Response;
      const controller = new AbortController();
      const remainingTime = CHAT_REQUEST_TIMEOUT_MS - (Date.now() - startedAt);
      const abortTimer = window.setTimeout(
        () => controller.abort(),
        Math.min(CHAT_ATTEMPT_TIMEOUT_MS, remainingTime),
      );
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
          body: JSON.stringify({ message: content, clientRequestId }),
          signal: controller.signal,
        });
      } catch {
        await wait(CHAT_POLL_INTERVAL_MS);
        continue;
      } finally {
        window.clearTimeout(abortTimer);
      }

      lastRequestId = response.headers.get('X-Request-ID') ?? undefined;
      const contentType = response.headers.get('content-type') ?? '';
      let body: { parentMessage?: Message; message?: Message; error?: string; status?: string; requestId?: string } = {};
      if (contentType.includes('application/json')) {
        try {
          body = await response.json() as typeof body;
        } catch {
          throw new ChatRequestError('Cache returned an unexpected response. Please try again.', lastRequestId);
        }
      }

      if (response.status === 202 && body.status === 'processing') {
        await wait(CHAT_POLL_INTERVAL_MS);
        continue;
      }
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const readableDelay = Number.isFinite(retryAfter) && retryAfter > 0
          ? ` Please wait about ${retryAfter >= 60 ? `${Math.ceil(retryAfter / 60)} minute${retryAfter >= 120 ? 's' : ''}` : `${retryAfter} seconds`} before trying again.`
          : '';
        throw new ChatRequestError(`${body.error ?? 'Cache needs a short pause.'}${readableDelay}`, lastRequestId);
      }
      if (!response.ok || !body.message || !body.parentMessage) {
        throw new ChatRequestError(body.error ?? 'Cache could not respond right now. Please try again.', lastRequestId);
      }
      return body;
    }
    throw new ChatRequestError('Cache is still preparing this response. Please try again; your message will not be sent twice.', lastRequestId);
  };

  const requestMemorySuggestions = async (assistantMessageId: string) => {
    if (!session) return;
    try {
      const response = await fetch('/api/memory-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ assistantMessageId }),
      });
      if (!response.ok) return;
      const body = await response.json() as { suggestions?: MemorySuggestion[] };
      const suggestions = body.suggestions ?? [];
      if (!suggestions.length) return;
      setMemorySuggestions((current) => ({ ...current, [assistantMessageId]: suggestions }));
    } catch {
      // Suggestions are intentionally non-blocking.
    }
  };

  const resolveMemorySuggestion = async (suggestion: MemorySuggestion, action: 'accept' | 'reject', content?: string): Promise<string | null> => {
    if (!session) return 'Your session has expired. Please sign in again.';
    try {
      const response = await fetch(`/api/memory-suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action, ...(content !== undefined ? { content } : {}) }),
      });
      const body = await response.json() as { memory?: ChildMemory; error?: string; code?: string };
      if (!response.ok) return body.error ?? 'Cache could not save that memory right now.';
      setMemorySuggestions((current) => {
        const remaining = (current[suggestion.assistant_message_id] ?? []).filter((item) => item.id !== suggestion.id);
        return { ...current, [suggestion.assistant_message_id]: remaining };
      });
      if (action === 'accept' && body.memory) {
        setMemories((current) => [body.memory!, ...current.filter((memory) => memory.id !== body.memory!.id)]);
        setMemoryStatus('Saved to What Cache remembers.');
      }
      return null;
    } catch {
      return 'Cache could not save that memory right now.';
    }
  };

  const updateMemory = async (memoryId: string, content: string): Promise<string | null> => {
    if (!session) return 'Your session has expired. Please sign in again.';
    try {
      const response = await fetch(`/api/memories/${memoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ content }),
      });
      const body = await response.json() as { memory?: ChildMemory; error?: string };
      if (!response.ok || !body.memory) return body.error ?? 'Cache could not update that memory right now.';
      setMemories((current) => current.map((memory) => memory.id === memoryId ? body.memory! : memory));
      setMemoryStatus('Saved memory updated.');
      return null;
    } catch {
      return 'Cache could not update that memory right now.';
    }
  };

  const deleteMemory = async (memoryId: string): Promise<string | null> => {
    if (!session) return 'Your session has expired. Please sign in again.';
    try {
      const response = await fetch(`/api/memories/${memoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        return body.error ?? 'Cache could not remove that memory right now.';
      }
      setMemories((current) => current.filter((memory) => memory.id !== memoryId));
      setMessages((current) => current.map((message) => ({
        ...message,
        used_memories: message.used_memories?.map((memory) => memory.memory_id === memoryId ? { ...memory, memory_id: null } : memory),
      })));
      setFocusedMemoryId((current) => current === memoryId ? null : current);
      setMemoryStatus('Saved memory removed. Cache will not use it again.');
      return null;
    } catch {
      return 'Cache could not remove that memory right now.';
    }
  };

  const openMemoryManager = (memoryId?: string) => {
    if (profile) recordProductEvent('memory_manager_opened', profile.id);
    const desktop = isDesktopLayout();
    setFocusedMemoryId(memoryId ?? null);
    if (desktop) {
      if (memoryId) window.setTimeout(() => document.getElementById(`desktop-memory-${memoryId}`)?.focus(), 0);
      return;
    }
    setContextOpen(true);
  };

  const sendChatMessage = async (content: string, clientRequestId: string, showOptimisticMessage: boolean) => {
    if (!session || sendLock.current) return false;
    const pendingMessageId = `pending-${clientRequestId}`;
    sendLock.current = true;
    setSending(true); setNotice(''); setFailedChatRequest(null);
    if (showOptimisticMessage) {
      setMessages((current) => [...current, {
        id: pendingMessageId,
        conversation_id: conversation?.id ?? '',
        user_id: session.user.id,
        role: 'parent',
        content,
        created_at: new Date().toISOString(),
      }]);
    }
    try {
      const body = await requestChatResponse(content, clientRequestId);
      setMessages((current) => {
        const pendingMessageIndex = current.findIndex((message) => message.id === pendingMessageId);
        if (pendingMessageIndex === -1) return [...current, body.parentMessage!, body.message!];
        return [...current.slice(0, pendingMessageIndex), body.parentMessage!, body.message!, ...current.slice(pendingMessageIndex + 1)];
      });
      if (body.message?.memory_suggestion_eligible) void requestMemorySuggestions(body.message.id);
      return true;
    } catch (error) {
      setFailedChatRequest({ content, clientRequestId });
      const requestId = error instanceof ChatRequestError ? error.requestId : undefined;
      setNotice(`${error instanceof Error ? error.message : 'Cache could not respond just now. Your message is still here—please try again.'}${requestId ? `\nReference: ${requestId}` : ''}`);
      return false;
    } finally { sendLock.current = false; setSending(false); }
  };

  const downloadData = async () => {
    if (!session || exporting || deleting) return;
    setExporting(true);
    setNotice('');
    try {
      const response = await fetch('/api/account/export', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (response.status === 404) {
        throw new Error('This Cache server needs to be restarted or redeployed before data downloads are available.');
      }
      if (!response.ok) throw new Error('Cache could not prepare your download right now.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cache-data-export.json';
      link.click();
      URL.revokeObjectURL(url);
      setNotice('Your Cache data download is ready.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Cache could not prepare your download right now.');
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (!session || deleteConfirmation !== 'DELETE' || deleting) return;
    setDeleting(true);
    setNotice('');
    try {
      const response = await fetch('/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
      if (response.status === 404) {
        throw new Error('This Cache server needs to be restarted or redeployed before account deletion is available.');
      }
      if (!response.ok) throw new Error('Cache could not delete your account right now.');
      await supabase.auth.signOut({ scope: 'local' });
      window.location.assign('/');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Cache could not delete your account right now.');
      setDeleting(false);
    }
  };

  const submitDraft = () => {
    const content = draft.trim();
    if (!content || !session || sendLock.current) return;
    setDraft('');
    void sendChatMessage(content, crypto.randomUUID(), true).then((sent) => {
      if (!sent) setDraft((current) => current.trim() ? current : content);
    });
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    submitDraft();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitDraft();
  };

  const useStarterPrompt = (prompt: string) => {
    setDraft(prompt);
    messageInputRef.current?.focus();
  };

  const updateMessageScrollPosition = () => {
    const element = messagesListRef.current;
    if (!element) return;
    isNearLatestRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
    if (isNearLatestRef.current) setHasUnreadMessages(false);
  };

  const scrollToLatestMessage = () => {
    isNearLatestRef.current = true;
    setHasUnreadMessages(false);
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  };

  const hasMessages = messages.length > 0;

  if (appState === 'loading') return <main className="app-shell grid place-items-center"><Loader2 className="size-6 animate-spin text-terracotta" /></main>;
  if (appState === 'signed-out') return <main className="app-shell"><section className="app-card max-w-lg mx-auto mt-12 md:mt-24"><p className="app-eyebrow">Cache for parents</p><h1 className="font-serif text-4xl mt-3">Guidance that begins with the context.</h1><p className="mt-4 text-ink/70 leading-relaxed">Sign in with an email link to build your child’s profile and talk things through without starting over.</p><form onSubmit={requestMagicLink} className="mt-8 flex flex-col sm:flex-row gap-3"><label className="sr-only" htmlFor="app-email">Email address</label><input id="app-email" className="app-input flex-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /><button className="app-button">Send sign-in link <ArrowRight className="size-4" /></button></form>{notice && <p role="status" className="mt-4 text-sm text-sage font-medium">{notice}</p>}<a href="/" className="inline-block mt-7 text-sm underline text-ink/60 hover:text-ink">Back to Cache</a></section></main>;
  if (appState === 'onboarding') return <main className="app-shell min-h-dvh overflow-y-auto px-4 py-6 sm:px-6 sm:py-10"><section className="context-form-workspace mx-auto max-w-3xl"><div className="border-b border-ink/10 px-5 py-6 sm:px-8 sm:py-8"><p className="app-eyebrow">A little context</p><h1 className="mt-3 max-w-xl font-serif text-4xl sm:text-5xl">Tell Cache about your child.</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/70 sm:text-base">This takes just a few minutes and helps Cache offer practical, relevant ideas from your very first conversation.</p></div><div className="px-5 py-6 sm:px-8 sm:py-8"><ProfileForm onSave={completeProfile} /></div></section></main>;
  if (appState === 'error') return <main className="app-shell"><section className="app-card max-w-lg mx-auto mt-20"><AlertCircle className="size-7 text-terracotta" /><h1 className="font-serif text-3xl mt-4">Something needs another try.</h1><p className="mt-3 text-ink/70">{notice}</p><button className="app-button mt-6" onClick={() => session && void loadAccount(session)}>Reload Cache</button></section></main>;

  return (
    <main className="app-shell flex h-dvh min-h-dvh flex-col overflow-hidden">
      {memoryStatus && <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-2xl border border-sage/20 bg-white px-4 py-3 text-sm text-ink shadow-lg" role="status" aria-live="polite"><span className="leading-relaxed">{memoryStatus}</span><button type="button" onClick={() => setMemoryStatus('')} className="mt-0.5 shrink-0 rounded text-ink/50 hover:text-ink" aria-label="Dismiss memory confirmation"><X className="size-4" /></button></div>}
      <header className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-5 py-4 sm:px-6">
        <a href="/" className="font-serif text-2xl font-semibold">Cache<span className="text-terracotta">.</span></a>
        <div className="flex items-center gap-1 sm:gap-2">
          <button ref={accountButtonRef} type="button" onClick={() => setAccountOpen(true)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink/65 transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">Account</button>
          <button onClick={() => void supabase.auth.signOut({ scope: 'local' })} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink/65 transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"><LogOut className="size-4" /><span className="hidden sm:inline">Sign out</span><span className="sr-only sm:hidden">Sign out</span></button>
        </div>
      </header>
      <div className="mx-auto grid w-full min-h-0 max-w-6xl flex-1 gap-4 px-4 pb-4 sm:px-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-5 lg:pb-6">
        {profile && <aside className="hidden min-h-0 overflow-y-auto rounded-[24px] border border-ink/10 bg-white/60 px-5 py-6 lg:block"><ContextPanel profile={profile} memories={memories} memoryLimit={memoryLimit} memoriesLoading={memoriesLoading} memoriesError={memoriesError} focusedMemoryId={focusedMemoryId} memoryTargetRef={desktopMemoryTargetRef} instance="desktop" onEdit={() => setEditing(true)} onUpdateMemory={updateMemory} onDeleteMemory={deleteMemory} onRetryMemories={() => session && void loadMemories(session.access_token)} editButtonRef={editButtonRef} /></aside>}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-[0_12px_32px_-18px_rgba(43,38,34,0.2)]">
          <div className="shrink-0 border-b border-ink/10 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            <p className="app-eyebrow">A calm place to think it through</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-serif text-2xl sm:text-3xl">{hasMessages ? `Chatting about ${profile?.nickname}` : `How can Cache help ${profile?.nickname ?? 'today'}?`}</h1>
              {profile && <span className="text-sm text-ink/60">{formatChildAge(profile.birth_month, profile.birth_year)}</span>}
            </div>
            <details className="mt-2 text-xs text-ink/60">
              <summary className="flex w-fit cursor-pointer items-center gap-1.5 font-medium transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"><Info className="size-3.5" />Guidance details</summary>
              <p className="mt-2 max-w-xl leading-relaxed">Cache offers general parenting guidance, not medical, mental-health, or emergency care. If someone may be in immediate danger, Cache will pause normal coaching and direct you to urgent help.</p>
            </details>
            {profile && <button type="button" onClick={() => openMemoryManager()} className="mt-3 inline-flex items-center gap-2 rounded-full border border-sage/20 bg-sage/10 px-3 py-1.5 text-left text-xs font-semibold text-sage transition hover:bg-sage/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta lg:hidden">
              <span className="size-1.5 rounded-full bg-sage" /><span>Saved context · {profile.nickname}</span><ChevronUp className="size-3.5" />
            </button>}
          </div>
          <div ref={messagesListRef} onScroll={updateMessageScrollPosition} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-7" aria-live="polite">
            {!hasMessages && <div className="max-w-2xl py-2 sm:py-5">
              <p className="max-w-xl text-sm leading-relaxed text-ink/70 sm:text-base">Share what happened, what you have already tried, and what you would like to feel easier. You do not have to find the perfect words.</p>
              <div className="mt-6">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="size-4 text-sage" />A place to begin</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {starterPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => useStarterPrompt(prompt)} className="rounded-2xl border border-ink/10 bg-cream px-3.5 py-3.5 text-left text-sm leading-snug text-ink/75 transition hover:border-sage/40 hover:bg-sage/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">{prompt}</button>)}
                </div>
              </div>
            </div>}
            {messages.map((message) => <div key={message.id}><ChatMessage message={message} />{message.role === 'assistant' && <><MemoryUseDisclosure memories={message.used_memories ?? []} onManage={openMemoryManager} onOpened={() => recordProductEvent('memory_use_disclosure_opened', message.id)} /><MemorySuggestionCard suggestions={memorySuggestions[message.id] ?? []} memoryCount={memories.length} memoryLimit={memoryLimit} onManage={() => openMemoryManager()} onResolve={resolveMemorySuggestion} /></>}</div>)}
            {sending && <div className="flex w-fit items-center gap-2.5 rounded-2xl rounded-bl-md border border-sage/15 bg-sage/10 px-4 py-3 text-sm text-ink" role="status"><span className="grid size-7 place-items-center rounded-full bg-white/70 text-sage" aria-hidden="true"><Sparkles className="size-3.5" /></span><span>Cache is thinking<span className="chat-thinking-dots" aria-hidden="true"><i /><i /><i /></span></span><span className="sr-only">Cache is preparing a response</span></div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="shrink-0 border-t border-ink/10 bg-white px-4 pb-4 pt-3 sm:px-6 sm:pb-5">
            {hasUnreadMessages && <button type="button" onClick={scrollToLatestMessage} className="mx-auto mb-3 flex w-fit items-center gap-1.5 rounded-full bg-sage px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">Jump to latest <ChevronUp className="size-3 rotate-180" /></button>}
            {notice && <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-red-700/15 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert"><span className="whitespace-pre-line">{notice}</span>{failedChatRequest && <button type="button" onClick={() => void sendChatMessage(failedChatRequest.content, failedChatRequest.clientRequestId, false)} className="shrink-0 font-semibold underline underline-offset-2">Try again</button>}</div>}
          <form onSubmit={sendMessage} className="chat-composer flex shrink-0 items-end gap-3 rounded-2xl border border-ink/10 bg-cream p-2 transition focus-within:border-terracotta/40 focus-within:ring-2 focus-within:ring-terracotta/20">
            <label className="sr-only" htmlFor="chat-message">Message Cache</label>
            <div className="min-w-0 flex-1"><textarea ref={messageInputRef} id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} className="min-h-12 max-h-32 w-full resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-ink/45" placeholder="What is on your mind?" maxLength={4000} required aria-describedby="chat-keyboard-help" /><p id="chat-keyboard-help" className="px-2 pb-0.5 text-[11px] text-ink/45">Enter to send <span aria-hidden="true">·</span> Shift+Enter for a new line</p></div>
            <button type="submit" disabled={sending || !draft.trim()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-terracotta text-white transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2" aria-label={sending ? 'Cache is thinking' : 'Send message'}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button>
          </form>
          </div>
        </section>
      </div>
      {contextOpen && profile && <div className="fixed inset-0 z-30 lg:hidden">
        <div onClick={closeContext} className="absolute inset-0 bg-ink/35" aria-hidden="true" />
        <section ref={contextDrawerRef} className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[28px] bg-cream p-6 pb-8 shadow-[0_-12px_32px_-12px_rgba(43,38,34,0.28)]" role="dialog" aria-modal="true" aria-label={`${profile.nickname}'s saved context`}>
          <button type="button" onClick={closeContext} className="absolute right-5 top-5 rounded-lg p-2 text-ink/60 hover:bg-ink/5 hover:text-ink" aria-label="Close saved context"><X className="size-5" /></button>
          <div className="pr-10"><ContextPanel profile={profile} memories={memories} memoryLimit={memoryLimit} memoriesLoading={memoriesLoading} memoriesError={memoriesError} focusedMemoryId={focusedMemoryId} memoryTargetRef={mobileMemoryTargetRef} instance="mobile" onEdit={() => { closeContext(); setEditing(true); }} onUpdateMemory={updateMemory} onDeleteMemory={deleteMemory} onRetryMemories={() => session && void loadMemories(session.access_token)} editButtonRef={editButtonRef} /></div>
        </section>
      </div>}
      {editing && profile && <div className="fixed inset-0 z-40 grid place-items-center bg-ink/35 p-4" role="presentation"><section ref={editDialogRef} className="context-form-workspace flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col" role="dialog" aria-modal="true" aria-labelledby="edit-context-title"><div className="flex shrink-0 items-start justify-between gap-5 border-b border-ink/10 px-5 py-5 sm:px-8 sm:py-6"><div><p className="app-eyebrow">Saved context</p><h2 id="edit-context-title" className="mt-2 font-serif text-3xl">Update {profile.nickname}’s context</h2><p className="mt-2 text-sm leading-relaxed text-ink/65">Keep the details that help Cache support your family up to date.</p></div><button ref={editCloseButtonRef} type="button" onClick={closeEditing} className="rounded-lg p-2 text-ink/60 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta" aria-label="Close context editor"><X className="size-5" /></button></div><div className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8"><ProfileForm initialProfile={profile} onSave={(saved) => { setProfile(saved); closeEditing(); }} onCancel={closeEditing} /></div></section></div>}
      {accountOpen && <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/35 p-4" role="presentation"><section ref={accountDialogRef} className="app-card mx-auto my-8 max-w-xl" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"><div className="flex items-start justify-between gap-4"><div><p className="app-eyebrow">Account settings</p><h2 id="account-dialog-title" className="mt-2 font-serif text-3xl">Your Cache data</h2></div><button ref={accountCloseButtonRef} type="button" onClick={closeAccount} className="rounded-lg p-2 text-ink/60 hover:bg-ink/5 hover:text-ink" aria-label="Close account settings"><X className="size-5" /></button></div><div className="mt-6"><AccountPanel exporting={exporting} deleting={deleting} deleteConfirmation={deleteConfirmation} onExport={() => void downloadData()} onDeleteConfirmationChange={setDeleteConfirmation} onDelete={() => void deleteAccount()} /></div></section></div>}
    </main>
  );
}
