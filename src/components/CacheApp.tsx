import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, ChevronUp, Info, Loader2, LogOut, Pencil, Send, ShieldCheck, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { formatChildAge } from '../lib/childAge';
import type { ChildProfile, Conversation, Message } from '../lib/types';
import ChatMarkdown from './ChatMarkdown';

type AppState = 'loading' | 'signed-out' | 'onboarding' | 'ready' | 'error';

interface FailedChatRequest {
  content: string;
  clientRequestId: string;
}

function ageLabel(profile: ChildProfile) {
  return formatChildAge(profile.birth_month, profile.birth_year);
}

function profileUpdatedLabel(updatedAt: string) {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return 'Last updated recently';

  const daysSinceUpdate = Math.floor((Date.now() - updated.getTime()) / 86_400_000);
  if (daysSinceUpdate <= 0) return 'Updated today';
  if (daysSinceUpdate === 1) return 'Updated yesterday';
  return `Updated ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(updated)}`;
}

const currentYear = new Date().getFullYear();

const starterPrompts = [
  'Help me think through a tough moment.',
  'What can I try when big feelings show up?',
  'How can I make a transition feel easier?',
];

interface ProfileFormProps {
  initialProfile?: ChildProfile;
  onSave: (profile: ChildProfile) => void;
  onCancel?: () => void;
}

function ProfileForm({ initialProfile, onSave, onCancel }: ProfileFormProps) {
  const [nickname, setNickname] = useState(initialProfile?.nickname ?? '');
  const [birthMonth, setBirthMonth] = useState(String(initialProfile?.birth_month ?? ''));
  const [birthYear, setBirthYear] = useState(String(initialProfile?.birth_year ?? ''));
  const [pronouns, setPronouns] = useState(initialProfile?.pronouns ?? '');
  const [routines, setRoutines] = useState(initialProfile?.routines ?? '');
  const [challenges, setChallenges] = useState(initialProfile?.challenges ?? '');
  const [parentNotes, setParentNotes] = useState(initialProfile?.parent_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const month = Number(birthMonth);
    const year = Number(birthYear);
    if (!nickname.trim() || !routines.trim() || !challenges.trim() || month < 1 || month > 12 || year < currentYear - 18 || year > currentYear) {
      setError('Please complete each required field with a valid birth month and year.');
      return;
    }

    setSaving(true);
    setError('');
    const payload = {
      nickname: nickname.trim(), birth_month: month, birth_year: year, pronouns: pronouns.trim() || null,
      routines: routines.trim(), challenges: challenges.trim(), parent_notes: parentNotes.trim() || null,
    };
    const request = initialProfile
      ? supabase.from('child_profiles').update(payload).eq('id', initialProfile.id).select().single()
      : supabase.from('child_profiles').insert(payload).select().single();
    const { data, error: saveError } = await request;
    setSaving(false);
    if (saveError || !data) {
      setError('We could not save this profile. Please try again.');
      return;
    }
    onSave(data as ChildProfile);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm font-medium text-ink">Child's nickname<input value={nickname} onChange={(event) => setNickname(event.target.value)} className="app-input mt-2" placeholder="Milo" maxLength={80} required /></label>
        <label className="text-sm font-medium text-ink">Pronouns <span className="text-ink/50">(optional)</span><input value={pronouns} onChange={(event) => setPronouns(event.target.value)} className="app-input mt-2" placeholder="they/them" maxLength={40} /></label>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm font-medium text-ink">Birth month<select value={birthMonth} onChange={(event) => setBirthMonth(event.target.value)} className="app-input mt-2" required><option value="">Choose month</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index, 1).toLocaleString('en', { month: 'long' })}</option>)}</select></label>
        <label className="text-sm font-medium text-ink">Birth year<select value={birthYear} onChange={(event) => setBirthYear(event.target.value)} className="app-input mt-2" required><option value="">Choose year</option>{Array.from({ length: 19 }, (_, index) => currentYear - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      </div>
      <label className="text-sm font-medium text-ink block">What are their usual routines?<textarea value={routines} onChange={(event) => setRoutines(event.target.value)} className="app-input mt-2 min-h-24" placeholder="Sleep, meals, preschool, transitions…" maxLength={1200} required /></label>
      <label className="text-sm font-medium text-ink block">What feels challenging right now?<textarea value={challenges} onChange={(event) => setChallenges(event.target.value)} className="app-input mt-2 min-h-24" placeholder="Bedtime, big feelings, separation…" maxLength={1200} required /></label>
      <label className="text-sm font-medium text-ink block">Anything else Cache should know? <span className="text-ink/50">(optional)</span><textarea value={parentNotes} onChange={(event) => setParentNotes(event.target.value)} className="app-input mt-2 min-h-24" placeholder="What you have tried, temperament, family context…" maxLength={2000} /></label>
      {error && <p role="alert" className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="size-4" />{error}</p>}
      <div className="flex flex-wrap gap-3"><button disabled={saving} className="app-button">{saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{initialProfile ? 'Save profile' : 'Start with Cache'}</button>{onCancel && <button type="button" onClick={onCancel} className="px-5 py-3 font-semibold text-sm text-ink/70 hover:text-ink">Cancel</button>}</div>
    </form>
  );
}

interface ChatMessageProps {
  message: Message;
}

function ChatMessage({ message }: ChatMessageProps) {
  const isParent = message.role === 'parent';

  return (
    <article
      className={`w-fit max-w-[88%] break-words rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[80%] ${
        isParent
          ? 'ml-auto rounded-br-md bg-ink text-cream shadow-[0_4px_12px_-8px_rgba(43,38,34,0.5)]'
          : 'rounded-bl-md border border-sage/10 bg-sage/10 text-ink'
      }`}
      aria-label={isParent ? 'Your message' : 'Cache response'}
    >
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] opacity-65">
        {isParent ? 'You' : 'Cache'}
      </span>
      {isParent ? message.content : <ChatMarkdown content={message.content} />}
    </article>
  );
}

interface ContextPanelProps {
  profile: ChildProfile;
  onEdit: () => void;
}

function ContextPanel({ profile, onEdit }: ContextPanelProps) {
  return <>
    <p className="app-eyebrow">Your context</p>
    <h2 className="mt-2 font-serif text-2xl">{profile.nickname}</h2>
    <p className="mt-1 text-sm text-ink/65">{ageLabel(profile)}{profile.pronouns ? ` · ${profile.pronouns}` : ''}</p>
    <p className="mt-1.5 text-xs text-ink/50">{profileUpdatedLabel(profile.updated_at)}</p>
    <p className="mt-5 text-sm leading-relaxed text-ink/65">Cache uses this saved profile to tailor its guidance.</p>
    <div className="mt-5 space-y-5 border-t border-ink/10 pt-5 text-sm">
      <section>
        <h3 className="mb-1 font-semibold text-ink">Routines</h3>
        <p className="leading-relaxed text-ink/70">{profile.routines}</p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-ink">Right now</h3>
        <p className="leading-relaxed text-ink/70">{profile.challenges}</p>
      </section>
      {profile.parent_notes && <section>
        <h3 className="mb-1 font-semibold text-ink">Other notes</h3>
        <p className="leading-relaxed text-ink/70">{profile.parent_notes}</p>
      </section>}
    </div>
    <button onClick={onEdit} className="mt-6 flex items-center gap-2 text-sm font-semibold text-sage hover:text-ink"><Pencil className="size-4" />Edit saved context</button>
  </>;
}

export default function CacheApp() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [failedChatRequest, setFailedChatRequest] = useState<FailedChatRequest | null>(null);
  const sendLock = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const contextDrawerRef = useRef<HTMLElement>(null);
  const isNearLatestRef = useRef(true);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  const loadAccount = async (activeSession: Session) => {
    setAppState('loading');
    const { data: profileData, error: profileError } = await supabase.from('child_profiles').select().maybeSingle();
    if (profileError) { setNotice('We could not load your Cache profile. Please refresh and try again.'); setAppState('error'); return; }
    if (!profileData) { setProfile(null); setAppState('onboarding'); return; }
    const savedProfile = profileData as ChildProfile;
    setProfile(savedProfile);
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
    setMessages((messageData ?? []) as Message[]);
    setAppState('ready');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void loadAccount(data.session); else setAppState('signed-out');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) void loadAccount(nextSession); else { setProfile(null); setMessages([]); setAppState('signed-out'); }
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

  useEffect(() => {
    if (!contextOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = contextDrawerRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const focusableElements = (): HTMLElement[] => drawer
      ? Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector))
      : [];
    const focusFirstElement = () => focusableElements()[0]?.focus();
    focusFirstElement();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setContextOpen(false);
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
      previouslyFocused?.focus();
    };
  }, [contextOpen]);

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
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ message: content, clientRequestId }),
      });
      const body = await response.json() as { parentMessage?: Message; message?: Message; error?: string; status?: string };
      if (response.status === 202 && body.status === 'processing') {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        continue;
      }
      if (!response.ok || !body.message || !body.parentMessage) throw new Error(body.error);
      return body;
    }
    throw new Error('Cache is still preparing this response.');
  };

  const sendChatMessage = async (content: string, clientRequestId: string, showOptimisticMessage: boolean) => {
    if (!session || sendLock.current) return;
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
    } catch {
      setFailedChatRequest({ content, clientRequestId });
      setNotice('Cache could not respond just now. Your message is still here—please try again.');
    } finally { sendLock.current = false; setSending(false); }
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !session || sendLock.current) return;
    setDraft('');
    void sendChatMessage(content, crypto.randomUUID(), true);
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
  if (appState === 'onboarding') return <main className="app-shell"><section className="app-card max-w-2xl mx-auto my-8 md:my-16"><p className="app-eyebrow">A little context</p><h1 className="font-serif text-4xl mt-3">Tell Cache about your child.</h1><p className="mt-3 mb-8 text-ink/70">This helps Cache offer practical, relevant ideas from your very first conversation.</p><ProfileForm onSave={completeProfile} /></section></main>;
  if (appState === 'error') return <main className="app-shell"><section className="app-card max-w-lg mx-auto mt-20"><AlertCircle className="size-7 text-terracotta" /><h1 className="font-serif text-3xl mt-4">Something needs another try.</h1><p className="mt-3 text-ink/70">{notice}</p><button className="app-button mt-6" onClick={() => session && void loadAccount(session)}>Reload Cache</button></section></main>;

  return (
    <main className="app-shell flex h-dvh min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between px-6 py-6">
        <a href="/" className="font-serif text-2xl font-semibold">Cache<span className="text-terracotta">.</span></a>
        <button onClick={() => void supabase.auth.signOut()} className="flex items-center gap-2 text-sm font-medium text-ink/65 hover:text-ink"><LogOut className="size-4" />Sign out</button>
      </header>
      <div className="mx-auto grid w-full min-h-0 max-w-5xl flex-1 gap-6 px-4 pb-4 sm:px-6 lg:grid-cols-[280px_1fr] lg:grid-rows-[minmax(0,1fr)] lg:pb-6">
        {profile && <aside className="app-card hidden h-fit max-h-full overflow-y-auto lg:block"><ContextPanel profile={profile} onEdit={() => setEditing(true)} /></aside>}
        <section className="app-card flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-ink/10 pb-5">
            {hasMessages ? <>
              <p className="app-eyebrow">A calm place to think it through</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="font-serif text-2xl">Chatting about {profile?.nickname}</h1>
                {profile && <span className="text-sm text-ink/60">{ageLabel(profile)}</span>}
              </div>
              <details className="mt-2 text-xs text-ink/60">
                <summary className="flex w-fit cursor-pointer items-center gap-1.5 font-medium hover:text-ink"><Info className="size-3.5" />Guidance details</summary>
                <p className="mt-2 max-w-xl leading-relaxed">Cache offers general parenting guidance, not medical, mental-health, or emergency care.</p>
              </details>
            </> : <>
              <p className="app-eyebrow">A calm place to think it through</p>
              <h1 className="mt-2 font-serif text-3xl">How can Cache help today?</h1>
              <p className="mt-2 flex gap-2 text-sm text-ink/65"><ShieldCheck className="size-4 shrink-0 text-sage" />Cache offers general parenting guidance, not medical, mental-health, or emergency care.</p>
            </>}
            {profile && <button type="button" onClick={() => setContextOpen(true)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-ink/10 bg-cream px-3 py-2.5 text-left lg:hidden">
              <span><span className="block text-sm font-semibold text-ink">{profile.nickname} · {ageLabel(profile)}</span><span className="block text-xs text-ink/60">View saved context</span></span>
              <ChevronUp className="size-4 text-sage" />
            </button>}
          </div>
          <div ref={messagesListRef} onScroll={updateMessageScrollPosition} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-5 pr-1 sm:space-y-4 sm:py-6" aria-live="polite">
            {!hasMessages && <div className="max-w-xl py-3 sm:py-7">
              <p className="text-ink/70 leading-relaxed">Share what happened, what you have already tried, and what you would like to feel easier. You do not have to find the perfect words.</p>
              <div className="mt-7">
                <p className="text-sm font-medium text-ink">Not sure where to start?</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {starterPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => useStarterPrompt(prompt)} className="rounded-xl border border-ink/10 bg-cream px-3 py-3 text-left text-sm leading-snug text-ink/75 transition hover:border-sage/50 hover:bg-sage/10 hover:text-ink">{prompt}</button>)}
                </div>
              </div>
            </div>}
            {messages.map((message) => <div key={message.id}><ChatMessage message={message} /></div>)}
            {sending && <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border border-sage/10 bg-sage/10 px-4 py-3 text-sm"><Loader2 className="size-4 animate-spin" />Cache is thinking</div>}
            <div ref={messagesEndRef} />
          </div>
          {hasUnreadMessages && <button type="button" onClick={scrollToLatestMessage} className="mx-auto mb-3 w-fit rounded-full bg-sage px-3 py-1.5 text-xs font-semibold text-white shadow-sm">Jump to latest</button>}
          {notice && <div className="mb-3 flex items-center justify-between gap-3 text-sm text-red-700" role="alert"><span>{notice}</span>{failedChatRequest && <button type="button" onClick={() => void sendChatMessage(failedChatRequest.content, failedChatRequest.clientRequestId, false)} className="font-semibold underline underline-offset-2">Try again</button>}</div>}
          <form onSubmit={sendMessage} className="flex shrink-0 gap-3 border-t border-ink/10 bg-white pt-5">
            <label className="sr-only" htmlFor="chat-message">Message Cache</label>
            <textarea ref={messageInputRef} id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} className="app-input min-h-12 max-h-32 flex-1" placeholder="What is on your mind?" maxLength={4000} required />
            <button disabled={sending} className="app-button self-end"><Send className="size-4" /><span className="sr-only sm:not-sr-only">Send</span></button>
          </form>
        </section>
      </div>
      {contextOpen && profile && <div className="fixed inset-0 z-30 lg:hidden">
        <button type="button" onClick={() => setContextOpen(false)} className="absolute inset-0 bg-ink/35" aria-label="Close saved context" />
        <section ref={contextDrawerRef} className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[28px] bg-cream p-6 pb-8 shadow-[0_-12px_32px_-12px_rgba(43,38,34,0.28)]" role="dialog" aria-modal="true" aria-label={`${profile.nickname}'s saved context`}>
          <button type="button" onClick={() => setContextOpen(false)} className="absolute right-5 top-5 rounded-lg p-2 text-ink/60 hover:bg-ink/5 hover:text-ink" aria-label="Close saved context"><X className="size-5" /></button>
          <div className="pr-10"><ContextPanel profile={profile} onEdit={() => { setContextOpen(false); setEditing(true); }} /></div>
        </section>
      </div>}
      {editing && profile && <div className="fixed inset-0 z-20 overflow-y-auto bg-ink/35 p-4"><section className="app-card mx-auto my-8 max-w-2xl"><h2 className="mb-6 font-serif text-3xl">Update {profile.nickname}'s context</h2><ProfileForm initialProfile={profile} onSave={(saved) => { setProfile(saved); setEditing(false); }} onCancel={() => setEditing(false)} /></section></div>}
    </main>
  );
}
