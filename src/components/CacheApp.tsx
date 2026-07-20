import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, LogOut, Pencil, Send, ShieldCheck } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ChildProfile, Conversation, Message } from '../lib/types';

type AppState = 'loading' | 'signed-out' | 'onboarding' | 'ready' | 'error';

const currentYear = new Date().getFullYear();

function ageLabel(profile: ChildProfile) {
  const months = Math.max(0, (currentYear - profile.birth_year) * 12 + (new Date().getMonth() + 1 - profile.birth_month));
  if (months < 24) return `${months} months old`;
  return `${Math.floor(months / 12)} years old`;
}

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
        <label className="text-sm font-medium text-ink">Birth year<select value={birthYear} onChange={(event) => setBirthYear(event.target.value)} className="app-input mt-2" required><option value="">Choose year</option>{Array.from({ length: 8 }, (_, index) => currentYear - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      </div>
      <label className="text-sm font-medium text-ink block">What are their usual routines?<textarea value={routines} onChange={(event) => setRoutines(event.target.value)} className="app-input mt-2 min-h-24" placeholder="Sleep, meals, preschool, transitions…" maxLength={1200} required /></label>
      <label className="text-sm font-medium text-ink block">What feels challenging right now?<textarea value={challenges} onChange={(event) => setChallenges(event.target.value)} className="app-input mt-2 min-h-24" placeholder="Bedtime, big feelings, separation…" maxLength={1200} required /></label>
      <label className="text-sm font-medium text-ink block">Anything else Cache should know? <span className="text-ink/50">(optional)</span><textarea value={parentNotes} onChange={(event) => setParentNotes(event.target.value)} className="app-input mt-2 min-h-24" placeholder="What you have tried, temperament, family context…" maxLength={2000} /></label>
      {error && <p role="alert" className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="size-4" />{error}</p>}
      <div className="flex flex-wrap gap-3"><button disabled={saving} className="app-button">{saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{initialProfile ? 'Save profile' : 'Start with Cache'}</button>{onCancel && <button type="button" onClick={onCancel} className="px-5 py-3 font-semibold text-sm text-ink/70 hover:text-ink">Cancel</button>}</div>
    </form>
  );
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

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !session || sending) return;
    setSending(true); setNotice('');
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ message: content }) });
      const body = await response.json() as { message?: Message; error?: string };
      if (!response.ok || !body.message) throw new Error(body.error);
      setMessages((current) => [...current, { id: `pending-${Date.now()}`, conversation_id: conversation?.id ?? '', user_id: session.user.id, role: 'parent', content, created_at: new Date().toISOString() }, body.message!]);
      setDraft('');
    } catch {
      setNotice('Cache could not respond just now. Your message is still here—please try again.');
    } finally { setSending(false); }
  };

  if (appState === 'loading') return <main className="app-shell grid place-items-center"><Loader2 className="size-6 animate-spin text-terracotta" /></main>;
  if (appState === 'signed-out') return <main className="app-shell"><section className="app-card max-w-lg mx-auto mt-12 md:mt-24"><p className="app-eyebrow">Cache for parents</p><h1 className="font-serif text-4xl mt-3">Guidance that begins with the context.</h1><p className="mt-4 text-ink/70 leading-relaxed">Sign in with an email link to build your child’s profile and talk things through without starting over.</p><form onSubmit={requestMagicLink} className="mt-8 flex flex-col sm:flex-row gap-3"><label className="sr-only" htmlFor="app-email">Email address</label><input id="app-email" className="app-input flex-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /><button className="app-button">Send sign-in link <ArrowRight className="size-4" /></button></form>{notice && <p role="status" className="mt-4 text-sm text-sage font-medium">{notice}</p>}<a href="/" className="inline-block mt-7 text-sm underline text-ink/60 hover:text-ink">Back to Cache</a></section></main>;
  if (appState === 'onboarding') return <main className="app-shell"><section className="app-card max-w-2xl mx-auto my-8 md:my-16"><p className="app-eyebrow">A little context</p><h1 className="font-serif text-4xl mt-3">Tell Cache about your child.</h1><p className="mt-3 mb-8 text-ink/70">This helps Cache offer practical, relevant ideas from your very first conversation.</p><ProfileForm onSave={completeProfile} /></section></main>;
  if (appState === 'error') return <main className="app-shell"><section className="app-card max-w-lg mx-auto mt-20"><AlertCircle className="size-7 text-terracotta" /><h1 className="font-serif text-3xl mt-4">Something needs another try.</h1><p className="mt-3 text-ink/70">{notice}</p><button className="app-button mt-6" onClick={() => session && void loadAccount(session)}>Reload Cache</button></section></main>;

  return <main className="app-shell"><header className="max-w-5xl mx-auto flex items-center justify-between py-6 px-6"><a href="/" className="font-serif text-2xl font-semibold">Cache<span className="text-terracotta">.</span></a><button onClick={() => void supabase.auth.signOut()} className="flex items-center gap-2 text-sm font-medium text-ink/65 hover:text-ink"><LogOut className="size-4" />Sign out</button></header><div className="max-w-5xl mx-auto px-6 pb-10 grid lg:grid-cols-[280px_1fr] gap-6"><aside className="app-card h-fit"><p className="app-eyebrow">Your context</p><h2 className="font-serif text-2xl mt-2">{profile?.nickname}</h2><p className="mt-1 text-sm text-ink/65">{profile && ageLabel(profile)}{profile?.pronouns ? ` · ${profile.pronouns}` : ''}</p><div className="mt-6 space-y-4 text-sm"><p><span className="font-semibold block mb-1">Routines</span><span className="text-ink/70">{profile?.routines}</span></p><p><span className="font-semibold block mb-1">Right now</span><span className="text-ink/70">{profile?.challenges}</span></p></div><button onClick={() => setEditing(true)} className="mt-6 flex items-center gap-2 text-sm font-semibold text-sage hover:text-ink"><Pencil className="size-4" />Edit context</button></aside><section className="app-card flex flex-col min-h-[600px]"><div className="border-b border-ink/10 pb-5"><p className="app-eyebrow">A calm place to think it through</p><h1 className="font-serif text-3xl mt-2">How can Cache help today?</h1><p className="mt-2 text-sm text-ink/65 flex gap-2"><ShieldCheck className="size-4 shrink-0 text-sage" />Cache offers general parenting guidance, not medical, mental-health, or emergency care.</p></div><div className="flex-1 py-6 space-y-5" aria-live="polite">{messages.length === 0 && <p className="text-ink/65 leading-relaxed">Try sharing what happened, what you have already tried, and what you would like to feel easier.</p>}{messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'parent' ? 'ml-auto bg-ink text-cream' : 'bg-sage/10 text-ink'}`}><span className="block text-[10px] uppercase tracking-widest opacity-60 mb-1">{message.role === 'parent' ? 'You' : 'Cache'}</span>{message.content}</div>)}{sending && <div className="bg-sage/10 rounded-2xl px-4 py-3 w-fit text-sm flex gap-2"><Loader2 className="size-4 animate-spin" />Cache is thinking</div>}</div>{notice && <p role="alert" className="mb-3 text-sm text-red-700">{notice}</p>}<form onSubmit={sendMessage} className="flex gap-3 border-t border-ink/10 pt-5"><label className="sr-only" htmlFor="chat-message">Message Cache</label><textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} className="app-input min-h-12 max-h-32 flex-1" placeholder="What is on your mind?" maxLength={4000} required /><button disabled={sending} className="app-button self-end"><Send className="size-4" /><span className="sr-only sm:not-sr-only">Send</span></button></form></section></div>{editing && profile && <div className="fixed inset-0 bg-ink/35 z-20 p-4 overflow-y-auto"><section className="app-card max-w-2xl mx-auto my-8"><h2 className="font-serif text-3xl mb-6">Update {profile.nickname}'s context</h2><ProfileForm initialProfile={profile} onSave={(saved) => { setProfile(saved); setEditing(false); }} onCancel={() => setEditing(false)} /></section></div>}</main>;
}
