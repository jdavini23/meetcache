import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { AlertCircle, ArrowRight, ChevronDown, ChevronUp, Info, Loader2, Lock, LogOut, Mail, Pencil, Send, Sparkles, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { formatChildAge, isChildAgeSupported } from '../lib/childAge';
import type { ChildMemory, ChildProfile, Conversation, MemorySuggestion, Message, UsedMemory } from '../lib/types';
import ChatMarkdown from './ChatMarkdown';
import { parseServerSentEvents } from '../lib/chatStream';
import MemoryManager from './MemoryManager';
import WaitlistForm from './WaitlistForm';

type AppState = 'loading' | 'signed-out' | 'onboarding' | 'ready' | 'error' | 'deleted';

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

function starterPromptsFor(nickname: string) {
  return [
    `Help me think through a hard moment with ${nickname}.`,
    `What can I try when ${nickname} has big feelings?`,
    `How can I make a transition easier for ${nickname}?`,
  ];
}

// Stored inside parent_notes so chat receives it on the existing parent-notes line.
// A separate column would mean editing the system prompt text.
const ALREADY_TRIED_HEADER = 'Already tried:\n';

function composeParentNotes(alreadyTried: string, parentNotes: string) {
  const tried = alreadyTried.trim();
  const notes = parentNotes.trim();
  if (!tried) return notes || null;
  if (!notes) return `${ALREADY_TRIED_HEADER}${tried}`;
  return `${ALREADY_TRIED_HEADER}${tried}\n\n${notes}`;
}

function splitParentNotes(stored: string | null | undefined) {
  if (!stored?.startsWith(ALREADY_TRIED_HEADER)) return { alreadyTried: '', parentNotes: stored ?? '' };
  const body = stored.slice(ALREADY_TRIED_HEADER.length);
  const dividerAt = body.indexOf('\n\n');
  if (dividerAt === -1) return { alreadyTried: body, parentNotes: '' };
  return { alreadyTried: body.slice(0, dividerAt), parentNotes: body.slice(dividerAt + 2) };
}

const CHAT_POLL_INTERVAL_MS = 1_000;
// How long to wait for the server to start answering. A streamed reply then
// has until CHAT_REQUEST_TIMEOUT_MS to finish.
const CHAT_ATTEMPT_TIMEOUT_MS = 10_000;
const CHAT_REQUEST_TIMEOUT_MS = 95_000;

type ChatResponseBody = { parentMessage?: Message; message?: Message; error?: string; status?: string; requestId?: string };

type ChatStreamOutcome =
  | { type: 'done'; body: ChatResponseBody }
  | { type: 'error'; error: string; requestId?: string }
  | { type: 'incomplete' };

async function readChatStream(stream: ReadableStream<Uint8Array>, onDelta: (text: string) => void): Promise<ChatStreamOutcome> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (done) buffer += decoder.decode() + '\n\n';
      const parsed = parseServerSentEvents(buffer);
      buffer = parsed.rest;
      for (const { event, data } of parsed.events) {
        const payload = (data ?? {}) as { text?: unknown; error?: unknown; requestId?: unknown } & ChatResponseBody;
        if (event === 'delta' && typeof payload.text === 'string') onDelta(payload.text);
        if (event === 'done' && payload.message && payload.parentMessage) return { type: 'done', body: payload };
        if (event === 'error') {
          return {
            type: 'error',
            error: typeof payload.error === 'string' ? payload.error : 'Cache could not respond right now. Please try again.',
            requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
          };
        }
      }
      if (done) return { type: 'incomplete' };
    }
  } finally {
    reader.releaseLock();
  }
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
    (initialFocusRef?.current ?? focusableElements()[0])?.focus();

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

interface ProfileFormProps {
  initialProfile?: ChildProfile;
  onSave: (profile: ChildProfile) => void;
  onCancel?: () => void;
}

type ProfileField = 'nickname' | 'birthDate' | 'routines' | 'challenges';
type ProfileErrors = Partial<Record<ProfileField, string>>;

interface ProfileValues {
  nickname: string;
  birthMonth: string;
  birthYear: string;
  pronouns: string;
  routines: string;
  challenges: string;
  alreadyTried: string;
  parentNotes: string;
}

function validateProfile(values: ProfileValues): ProfileErrors {
  const errors: ProfileErrors = {};
  const month = Number(values.birthMonth);
  const year = Number(values.birthYear);
  if (!values.nickname.trim()) errors.nickname = 'Add the name you use for your child.';
  if (!month || !year || month < 1 || month > 12) errors.birthDate = 'Choose a birth month and year.';
  else if (!isChildAgeSupported(month, year)) {
    const now = new Date();
    const ageMonths = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
    errors.birthDate = ageMonths < 12
      ? 'Cache is built for ages 1 through 6, so it isn’t ready for babies yet. If the birth month and year look wrong, you can fix them here.'
      : 'Cache is built for ages 1 through 6, so it can’t help with this age yet. If the birth month and year look wrong, you can fix them here.';
  }
  if (!values.routines.trim()) errors.routines = 'Share a little about your child’s usual routines.';
  if (!values.challenges.trim()) errors.challenges = 'Share what feels challenging right now.';
  return errors;
}

interface FormSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

function FormSection({ eyebrow, title, description, children }: FormSectionProps) {
  return <section className="context-form-section">
    <p className="app-eyebrow">{eyebrow}</p>
    <h2 className="mt-2 font-serif text-2xl">{title}</h2>
    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/65">{description}</p>
    <div className="mt-5">{children}</div>
  </section>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span id={id} className="context-field-error" role="alert"><AlertCircle className="size-3.5 shrink-0" />{message}</span>;
}

function CharacterCount({ current, maximum }: { current: number; maximum: number }) {
  return <span className="context-character-count" aria-live="polite">{current} / {maximum}</span>;
}

function ProfileForm({ initialProfile, onSave, onCancel }: ProfileFormProps) {
  const storedNotes = splitParentNotes(initialProfile?.parent_notes);
  const [values, setValues] = useState<ProfileValues>({
    nickname: initialProfile?.nickname ?? '', birthMonth: String(initialProfile?.birth_month ?? ''), birthYear: String(initialProfile?.birth_year ?? ''),
    pronouns: initialProfile?.pronouns ?? '', routines: initialProfile?.routines ?? '', challenges: initialProfile?.challenges ?? '',
    alreadyTried: storedNotes.alreadyTried, parentNotes: storedNotes.parentNotes,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [touched, setTouched] = useState<Partial<Record<ProfileField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [optionalDetailsOpen, setOptionalDetailsOpen] = useState(Boolean(initialProfile?.pronouns || storedNotes.parentNotes));
  const nicknameRef = useRef<HTMLInputElement>(null);
  const birthMonthRef = useRef<HTMLSelectElement>(null);
  const routinesRef = useRef<HTMLTextAreaElement>(null);
  const challengesRef = useRef<HTMLTextAreaElement>(null);

  const updateValue = <Field extends keyof ProfileValues>(field: Field, value: ProfileValues[Field]) => {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    setErrors(validateProfile(nextValues));
    setSaveError('');
  };

  const markTouched = (field: ProfileField) => {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors(validateProfile(values));
  };

  const displayedError = (field: ProfileField) => submitted || touched[field] ? errors[field] : undefined;
  const describedBy = (helpId: string, errorId: string, error?: string) => error ? `${helpId} ${errorId}` : helpId;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateProfile(values);
    setSubmitted(true);
    setTouched({ nickname: true, birthDate: true, routines: true, challenges: true });
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0] as ProfileField | undefined;
    if (firstInvalid) {
      const fields = { nickname: nicknameRef, birthDate: birthMonthRef, routines: routinesRef, challenges: challengesRef };
      window.setTimeout(() => fields[firstInvalid]?.current?.focus(), 0);
      return;
    }

    const parentNotes = composeParentNotes(values.alreadyTried, values.parentNotes);
    if (parentNotes && parentNotes.length > 2000) {
      setSaveError('We couldn’t save that. Your answers are still here, so you can try again.');
      return;
    }
    setSaving(true);
    setSaveError('');
    const payload = {
      nickname: values.nickname.trim(), birth_month: Number(values.birthMonth), birth_year: Number(values.birthYear), pronouns: values.pronouns.trim() || null,
      routines: values.routines.trim(), challenges: values.challenges.trim(), parent_notes: parentNotes,
    };
    const request = initialProfile
      ? supabase.from('child_profiles').update(payload).eq('id', initialProfile.id).select().single()
      : supabase.from('child_profiles').insert(payload).select().single();
    const { data, error: saveError } = await request;
    setSaving(false);
    if (saveError || !data) {
      setSaveError('We couldn’t save that. Your answers are still here, so you can try again.');
      return;
    }
    onSave(data as ChildProfile);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {submitted && Object.keys(errors).length > 0 && <div className="context-error-summary" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" /><p>A few things need a look. Check the fields marked below.</p></div>}
      <FormSection eyebrow="The essentials" title="About your child" description="A nickname is fine. Their age helps Cache suggest ideas that fit.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="context-form-label" htmlFor="profile-nickname">Child’s nickname <span aria-hidden="true" className="text-terracotta">*</span><input ref={nicknameRef} id="profile-nickname" value={values.nickname} onChange={(event) => updateValue('nickname', event.target.value)} onBlur={() => markTouched('nickname')} className="app-input mt-2" placeholder="Milo" maxLength={80} required aria-required="true" aria-invalid={Boolean(displayedError('nickname'))} aria-describedby={describedBy('profile-nickname-help', 'profile-nickname-error', displayedError('nickname'))} /><span id="profile-nickname-help" className="context-field-help">Use the name that feels natural at home.</span><FieldError id="profile-nickname-error" message={displayedError('nickname')} /></label>
          <fieldset className="context-form-label" aria-describedby={describedBy('profile-birth-help', 'profile-birth-error', displayedError('birthDate'))}><legend>Birth month and year <span aria-hidden="true" className="text-terracotta">*</span></legend><div className="mt-2 grid grid-cols-2 gap-2"><label className="sr-only" htmlFor="profile-birth-month">Birth month</label><select ref={birthMonthRef} id="profile-birth-month" value={values.birthMonth} onChange={(event) => updateValue('birthMonth', event.target.value)} onBlur={() => markTouched('birthDate')} className="app-input" required aria-required="true" aria-invalid={Boolean(displayedError('birthDate'))}><option value="">Month</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index, 1).toLocaleString('en', { month: 'long' })}</option>)}</select><label className="sr-only" htmlFor="profile-birth-year">Birth year</label><select id="profile-birth-year" value={values.birthYear} onChange={(event) => updateValue('birthYear', event.target.value)} onBlur={() => markTouched('birthDate')} className="app-input" required aria-required="true" aria-invalid={Boolean(displayedError('birthDate'))}><option value="">Year</option>{Array.from({ length: 8 }, (_, index) => currentYear - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></div><span id="profile-birth-help" className="context-field-help">Their age shapes the ideas Cache suggests. Cache is for ages 1 through 6 right now.</span><FieldError id="profile-birth-error" message={displayedError('birthDate')} /></fieldset>
        </div>
      </FormSection>
      <FormSection eyebrow="Your day to day" title="What life looks like right now" description="The more Cache knows about an ordinary day, the better its ideas fit your family.">
        <div className="space-y-5">
          <label className="context-form-label block" htmlFor="profile-routines">What are their usual routines? <span aria-hidden="true" className="text-terracotta">*</span><textarea ref={routinesRef} id="profile-routines" value={values.routines} onChange={(event) => updateValue('routines', event.target.value)} onBlur={() => markTouched('routines')} className="app-input mt-2 min-h-28 resize-y" placeholder="Sleep, meals, preschool, transitions…" maxLength={1200} required aria-required="true" aria-invalid={Boolean(displayedError('routines'))} aria-describedby={describedBy('profile-routines-count', 'profile-routines-error', displayedError('routines'))} /><CharacterCount current={values.routines.length} maximum={1200} /><FieldError id="profile-routines-error" message={displayedError('routines')} /></label>
          <label className="context-form-label block" htmlFor="profile-challenges">What feels challenging right now? <span aria-hidden="true" className="text-terracotta">*</span><textarea ref={challengesRef} id="profile-challenges" value={values.challenges} onChange={(event) => updateValue('challenges', event.target.value)} onBlur={() => markTouched('challenges')} className="app-input mt-2 min-h-28 resize-y" placeholder="Bedtime, big feelings, separation…" maxLength={1200} required aria-required="true" aria-invalid={Boolean(displayedError('challenges'))} aria-describedby={describedBy('profile-challenges-count', 'profile-challenges-error', displayedError('challenges'))} /><CharacterCount current={values.challenges.length} maximum={1200} /><FieldError id="profile-challenges-error" message={displayedError('challenges')} /></label>
          <label className="context-form-label block" htmlFor="profile-tried">What have you already tried?<textarea id="profile-tried" value={values.alreadyTried} onChange={(event) => updateValue('alreadyTried', event.target.value)} className="app-input mt-2 min-h-28 resize-y" placeholder="An earlier bedtime, a sticker chart, a timer…" maxLength={1200} aria-describedby="profile-tried-count" /><CharacterCount current={values.alreadyTried.length} maximum={1200} /></label>
        </div>
      </FormSection>
      <section className="context-optional-details">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOptionalDetailsOpen((open) => !open)} aria-expanded={optionalDetailsOpen} aria-controls="optional-profile-details"><span><span className="block text-sm font-semibold text-ink">Optional details</span><span className="mt-0.5 block text-sm text-ink/60">Anything else you’d like Cache to know.</span></span><ChevronDown className={`size-5 shrink-0 text-sage transition ${optionalDetailsOpen ? 'rotate-180' : ''}`} /></button>
        {optionalDetailsOpen && <div id="optional-profile-details" className="mt-5 space-y-5 border-t border-ink/10 pt-5"><label className="context-form-label block" htmlFor="profile-pronouns">Pronouns <span className="font-normal text-ink/50">(optional)</span><input id="profile-pronouns" value={values.pronouns} onChange={(event) => updateValue('pronouns', event.target.value)} className="app-input mt-2" placeholder="they/them" maxLength={40} /><span className="context-field-help">Only if they are useful for how Cache refers to your child.</span></label><label className="context-form-label block" htmlFor="profile-notes">Anything else Cache should know? <span className="font-normal text-ink/50">(optional)</span><textarea id="profile-notes" value={values.parentNotes} onChange={(event) => updateValue('parentNotes', event.target.value)} className="app-input mt-2 min-h-28 resize-y" placeholder="Temperament, family context, anything else…" maxLength={2000} aria-describedby="profile-notes-count" /><CharacterCount current={values.parentNotes.length} maximum={2000} /></label></div>}
      </section>
      {saveError && <div className="context-error-summary" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{saveError}</span></div>}
      <div className="context-form-actions"><div><button disabled={saving} className="app-button">{saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{saving ? 'Saving context…' : initialProfile ? 'Save context' : 'Start with Cache'}</button>{onCancel && <button type="button" onClick={onCancel} disabled={saving} className="ml-1 rounded-xl px-4 py-3 text-sm font-semibold text-ink/70 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">Cancel</button>}</div><p className="mt-2 text-xs leading-relaxed text-ink/50">You can change any of this later.</p></div>
    </form>
  );
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

interface ContextPanelProps {
  profile: ChildProfile;
  onEdit: () => void;
  editButtonRef?: RefObject<HTMLButtonElement | null>;
  children?: ReactNode;
}

function ContextPanel({ profile, onEdit, editButtonRef, children }: ContextPanelProps) {
  return <>
    <p className="app-eyebrow">Saved context</p>
    <div className="mt-2 flex items-start justify-between gap-3">
      <div><h2 className="font-serif text-2xl">{profile.nickname}</h2><p className="mt-0.5 text-sm text-ink/65">{ageLabel(profile)}{profile.pronouns ? ` · ${profile.pronouns}` : ''}</p></div>
      <span className="mt-1 size-2 shrink-0 rounded-full bg-sage" aria-label="Saved context available" />
    </div>
    <p className="mt-2 text-xs text-ink/50">{profileUpdatedLabel(profile.updated_at)}</p>
    <p className="mt-4 text-sm leading-relaxed text-ink/65">Cache keeps these details in mind as you talk.</p>
    <div className="mt-5 space-y-4 border-t border-ink/10 pt-5 text-sm">
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
    <button ref={editButtonRef} onClick={onEdit} className="mt-6 flex items-center gap-2 rounded-lg px-1 py-2 text-sm font-semibold text-sage transition hover:bg-sage/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"><Pencil className="size-4" />Edit saved context</button>
    {children}
  </>;
}

interface AccountPanelProps {
  exporting: boolean;
  deleting: boolean;
  deleteConfirmation: string;
  onExport: () => void;
  onDeleteConfirmationChange: (value: string) => void;
  onDelete: () => void;
}

function AccountPanel({ exporting, deleting, deleteConfirmation, onExport, onDeleteConfirmationChange, onDelete }: AccountPanelProps) {
  return <>
    <p className="app-eyebrow">Your account</p>
    <h2 className="mt-2 font-serif text-2xl">Data and privacy</h2>
    <p className="mt-3 text-sm leading-relaxed text-ink/70">Download your saved context and chat history, or permanently delete your Cache account and application data.</p>
    <p className="mt-3 text-sm leading-relaxed text-ink/70">Questions? Email <a className="underline underline-offset-2 hover:text-ink" href="mailto:hello@meetcache.com">hello@meetcache.com</a>.</p>
    <button type="button" onClick={onExport} disabled={exporting || deleting} className="app-button mt-6">{exporting ? <Loader2 className="size-4 animate-spin" /> : null}{exporting ? 'Preparing download…' : 'Download my data'}</button>
    <div className="mt-8 border-t border-red-700/20 pt-6">
      <h3 className="font-serif text-xl text-red-800">Delete account</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">This immediately removes your Cache account, saved child context, and conversation history. Provider backups follow their normal retention lifecycle.</p>
      <label className="mt-4 block text-sm font-medium text-ink" htmlFor="delete-confirmation">Type DELETE to confirm<input id="delete-confirmation" className="app-input mt-2" value={deleteConfirmation} onChange={(event) => onDeleteConfirmationChange(event.target.value)} autoComplete="off" /></label>
      <button type="button" onClick={onDelete} disabled={deleting || deleteConfirmation !== 'DELETE'} className="mt-4 rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">{deleting ? 'Deleting account…' : 'Delete my account and data'}</button>
    </div>
  </>;
}

interface MemorySuggestionCardProps {
  suggestions: MemorySuggestion[];
  onResolve: (suggestion: MemorySuggestion, action: 'accept' | 'reject', content?: string) => Promise<SuggestionResolveError | null>;
  onManage: () => void;
}

function MemorySuggestionCard({ suggestions, onResolve, onManage }: MemorySuggestionCardProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [resolveError, setResolveError] = useState<SuggestionResolveError | null>(null);
  if (!suggestions.length) return null;

  const resolve = async (suggestion: MemorySuggestion, action: 'accept' | 'reject', content?: string) => {
    setResolveError(null);
    const nextError = await onResolve(suggestion, action, content);
    if (nextError) {
      setResolveError(nextError);
      return;
    }
    setEditingId(null);
  };

  return <section className="memory-suggestion-card" aria-label="Memory suggestions">
    <p className="text-sm font-semibold text-ink">Want me to remember anything from this?</p>
    <p className="mt-1 text-xs leading-relaxed text-ink/60">You choose what Cache saves. Nothing is added unless you save it.</p>
    <div className="mt-3 space-y-2">
      {suggestions.map((suggestion) => <div key={suggestion.id} className="rounded-xl border border-sage/20 bg-white/70 p-3">
        {editingId === suggestion.id ? <>
          <label className="sr-only" htmlFor={`memory-suggestion-${suggestion.id}`}>Edit memory suggestion</label>
          <textarea id={`memory-suggestion-${suggestion.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={280} className="app-input min-h-20 resize-y" />
          <div className="mt-2 flex gap-2"><button type="button" onClick={() => void resolve(suggestion, 'accept', draft)} disabled={!draft.trim()} className="memory-suggestion-save">Save memory</button><button type="button" onClick={() => setEditingId(null)} className="memory-suggestion-secondary">Cancel</button></div>
        </> : <>
          <p className="text-sm leading-relaxed text-ink">{suggestion.suggested_content}</p>
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void resolve(suggestion, 'accept')} className="memory-suggestion-save">Save</button><button type="button" onClick={() => { setDraft(suggestion.suggested_content); setEditingId(suggestion.id); }} className="memory-suggestion-secondary">Edit</button><button type="button" onClick={() => void resolve(suggestion, 'reject')} className="memory-suggestion-secondary">Dismiss</button></div>
        </>}
      </div>)}
    </div>
    {resolveError && <div className="mt-3 rounded-xl border border-red-700/15 bg-red-50 px-3 py-2.5 text-xs text-red-800" role="alert">
      <p>{resolveError.message}</p>
      {resolveError.limitReached && <button type="button" onClick={onManage} className="mt-1.5 font-semibold underline underline-offset-2">Manage saved memories</button>}
    </div>}
  </section>;
}

function MemoryUseDisclosure({ memories, onOpen }: { memories: UsedMemory[]; onOpen?: () => void }) {
  if (!memories.length) return null;
  return <details className="group mt-2 max-w-xl text-xs text-ink/60" onToggle={(event) => { if (event.currentTarget.open) onOpen?.(); }}>
    <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition hover:bg-sage/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
      <span>Using saved context</span><ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden="true" />
    </summary>
    <ul className="mt-1.5 space-y-1.5 rounded-xl border border-sage/15 bg-sage/5 px-3 py-2.5" aria-label="Saved context used for this reply">
      {memories.map((memory, index) => <li key={`${memory.memory_id ?? 'deleted'}-${index}`} className="leading-relaxed">{memory.content}</li>)}
    </ul>
  </details>;
}

interface SuggestionResolveError {
  message: string;
  limitReached: boolean;
}

const DEFAULT_MEMORY_LIMIT = 12;

// The Supabase "Before User Created" hook rejects emails that are not approved on the waitlist.
export function isInviteOnlyError(error: { status?: number; message?: string }) {
  return error.status === 403 || /invite-only/i.test(error.message ?? '');
}

export default function CacheApp() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memorySuggestions, setMemorySuggestions] = useState<Record<string, MemorySuggestion[]>>({});
  const [memories, setMemories] = useState<ChildMemory[]>([]);
  const [memoryLimit, setMemoryLimit] = useState(DEFAULT_MEMORY_LIMIT);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [memoriesError, setMemoriesError] = useState('');
  const [drawerFocusMemories, setDrawerFocusMemories] = useState(false);
  const desktopMemoryHeadingRef = useRef<HTMLHeadingElement>(null);
  const mobileMemoryHeadingRef = useRef<HTMLHeadingElement>(null);
  // Invite emails link to /app?email=... so the sign-in field is already filled in.
  const [email, setEmail] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('email')?.trim().slice(0, 320) ?? ''; } catch { return ''; }
  });
  const [notice, setNotice] = useState('');
  const [signInResult, setSignInResult] = useState<'idle' | 'sending' | 'sent' | 'invite-only' | 'error'>('idle');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [accountNotice, setAccountNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const accountDeletedRef = useRef(false);
  const [failedChatRequest, setFailedChatRequest] = useState<FailedChatRequest | null>(null);
  const sendLock = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const contextDrawerRef = useRef<HTMLElement>(null);
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
    setAccountNotice(null);
  }, []);
  const closeEditing = useCallback(() => setEditing(false), []);

  const setPendingSuggestions = (suggestions: MemorySuggestion[]) => {
    setMemorySuggestions(() => suggestions.reduce<Record<string, MemorySuggestion[]>>((grouped, suggestion) => {
      (grouped[suggestion.assistant_message_id] ??= []).push(suggestion);
      return grouped;
    }, {}));
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

  // Product measurement is fire-and-forget: it never blocks or breaks the parent experience.
  const recordProductEvent = (eventName: 'app_session_started' | 'memory_manager_opened' | 'memory_use_disclosure_opened', subjectId: string, accessToken = session?.access_token, clientEventId: string = crypto.randomUUID()) => {
    if (!accessToken) return;
    void fetch('/api/product-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ eventName, subjectId, clientEventId }),
    }).catch(() => undefined);
  };

  // One session event per browser tab, even when auth refreshes reload the account.
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
      setMemoryLimit(body.limit ?? DEFAULT_MEMORY_LIMIT);
    } catch {
      setMemoriesError('Cache could not load saved memories right now.');
    } finally {
      setMemoriesLoading(false);
    }
  };

  const readError = async (response: Response, fallback: string) => {
    try {
      const body = await response.json() as { error?: string; code?: string };
      return { message: body.error ?? fallback, code: body.code };
    } catch {
      return { message: fallback, code: undefined };
    }
  };

  const updateMemory = async (memoryId: string, content: string) => {
    if (!session) return 'Please sign in again to update this memory.';
    try {
      const response = await fetch(`/api/memories/${memoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) return (await readError(response, 'Cache could not update that memory right now.')).message;
      const body = await response.json() as { memory: ChildMemory };
      setMemories((current) => current.map((memory) => memory.id === memoryId ? body.memory : memory));
      return null;
    } catch {
      return 'Cache could not update that memory right now.';
    }
  };

  const deleteMemory = async (memoryId: string) => {
    if (!session) return 'Please sign in again to remove this memory.';
    try {
      const response = await fetch(`/api/memories/${memoryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      // A 404 means it is already gone, which is what the parent asked for.
      if (!response.ok && response.status !== 404) return (await readError(response, 'Cache could not remove that memory right now.')).message;
      setMemories((current) => current.filter((memory) => memory.id !== memoryId));
      return null;
    } catch {
      return 'Cache could not remove that memory right now.';
    }
  };

  const openContextDrawer = (focusMemories: boolean) => {
    setDrawerFocusMemories(focusMemories);
    setContextOpen(true);
    if (profile) recordProductEvent('memory_manager_opened', profile.id);
  };

  // The desktop sidebar is always visible; on smaller screens the memories live in the context drawer.
  const openMemoryManager = () => {
    const isDesktop = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
    if (!isDesktop) {
      openContextDrawer(true);
      return;
    }
    if (profile) recordProductEvent('memory_manager_opened', profile.id);
    desktopMemoryHeadingRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    desktopMemoryHeadingRef.current?.focus();
  };

  const loadAccount = async (activeSession: Session) => {
    setAppState('loading');
    const { data: profileData, error: profileError } = await supabase.from('child_profiles').select().maybeSingle();
    if (profileError) { setNotice('We could not load your Cache profile. Please refresh and try again.'); setAppState('error'); return; }
    if (!profileData) { setProfile(null); setAppState('onboarding'); return; }
    const savedProfile = profileData as ChildProfile;
    setProfile(savedProfile);
    recordAppSession(savedProfile.id, activeSession.access_token);
    void loadMemories(activeSession.access_token);
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
      setNotice('Cache didn’t finish replying to your last message. Tap Try again. It won’t be sent twice.');
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
      if (nextSession) void loadAccount(nextSession);
      else {
        setProfile(null); setMessages([]); setMemorySuggestions({}); setMemories([]);
        setAppState(accountDeletedRef.current ? 'deleted' : 'signed-out');
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isNearLatestRef.current) {
      messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: sending && streamingReply === null ? 'smooth' : 'auto' });
    } else if (messages.length > 0) {
      setHasUnreadMessages(true);
    }
  }, [messages.length, sending, streamingReply]);

  useModalFocus(contextOpen, contextDrawerRef, closeContext, drawerFocusMemories ? mobileMemoryHeadingRef : undefined);
  useModalFocus(accountOpen, accountDialogRef, closeAccount, accountCloseButtonRef, accountButtonRef);
  useModalFocus(editing, editDialogRef, closeEditing, editCloseButtonRef, editButtonRef);

  const requestMagicLink = async (event: FormEvent) => {
    event.preventDefault(); setNotice(''); setSignInResult('sending');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/app` } });
    if (!error) setSignInResult('sent');
    else setSignInResult(isInviteOnlyError(error) ? 'invite-only' : 'error');
  };

  const completeProfile = async (savedProfile: ChildProfile) => {
    setProfile(savedProfile);
    const { data, error } = await supabase.from('conversations').insert({ child_profile_id: savedProfile.id }).select().single();
    if (error || !data) { setNotice('Your profile was saved, but we could not start the conversation. Please refresh and try again.'); setAppState('error'); return; }
    setConversation(data as Conversation); setMessages([]); setAppState('ready');
  };

  const requestChatResponse = async (content: string, clientRequestId: string, onDelta: (text: string | null) => void) => {
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
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
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
      if (contentType.includes('text/event-stream') && response.body) {
        const streamTimer = window.setTimeout(
          () => controller.abort(),
          Math.max(0, CHAT_REQUEST_TIMEOUT_MS - (Date.now() - startedAt)),
        );
        let outcome: ChatStreamOutcome = { type: 'incomplete' };
        try {
          outcome = await readChatStream(response.body, onDelta);
        } catch {
          // A dropped connection retries below with the same request ID.
        } finally {
          window.clearTimeout(streamTimer);
        }
        if (outcome.type === 'done') return outcome.body;
        if (outcome.type === 'error') throw new ChatRequestError(outcome.error, outcome.requestId ?? lastRequestId);
        onDelta(null);
        await wait(CHAT_POLL_INTERVAL_MS);
        continue;
      }
      let body: ChatResponseBody = {};
      if (contentType.includes('application/json')) {
        try {
          body = await response.json() as typeof body;
        } catch {
          throw new ChatRequestError('Something went wrong on our end. Your message is still here. Try again.', lastRequestId);
        }
      }

      if (response.status === 202 && body.status === 'processing') {
        await wait(CHAT_POLL_INTERVAL_MS);
        continue;
      }
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const serverMessage = body.error ?? 'Cache needs a short pause.';
        const minutes = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter / 60) : 0;
        const readableDelay = !/tomorrow/i.test(serverMessage) && minutes > 0
          ? ` Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
          : '';
        throw new ChatRequestError(`${serverMessage}${readableDelay}`, lastRequestId);
      }
      if (!response.ok || !body.message || !body.parentMessage) {
        throw new ChatRequestError(body.error ?? 'Cache could not respond right now. Please try again.', lastRequestId);
      }
      return body;
    }
    throw new ChatRequestError('This is taking longer than usual. Tap Try again. Your message won’t be sent twice.', lastRequestId);
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

  const resolveMemorySuggestion = async (suggestion: MemorySuggestion, action: 'accept' | 'reject', content?: string): Promise<SuggestionResolveError | null> => {
    if (!session) return { message: 'Please sign in again to save this memory.', limitReached: false };
    try {
      const response = await fetch(`/api/memory-suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action, ...(content !== undefined ? { content } : {}) }),
      });
      if (!response.ok) {
        // Keep the suggestion so the parent can retry, or make room and save it.
        const { message, code } = await readError(response, 'Cache could not save that memory right now.');
        return { message, limitReached: code === 'memory_limit_reached' };
      }
      setMemorySuggestions((current) => {
        const remaining = (current[suggestion.assistant_message_id] ?? []).filter((item) => item.id !== suggestion.id);
        return { ...current, [suggestion.assistant_message_id]: remaining };
      });
      if (action === 'accept') void loadMemories(session.access_token);
      return null;
    } catch {
      return { message: 'Cache could not save that memory right now.', limitReached: false };
    }
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
      const body = await requestChatResponse(content, clientRequestId, (text) => {
        setStreamingReply((current) => (text === null ? null : (current ?? '') + text));
      });
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
      setNotice(`${error instanceof Error ? error.message : 'Cache could not respond just now. Your message is still here. Please try again.'}${requestId ? `\nIf this keeps happening, email hello@meetcache.com with this code: ${requestId}` : ''}`);
      return false;
    } finally { sendLock.current = false; setSending(false); setStreamingReply(null); }
  };

  const downloadData = async () => {
    if (!session || exporting || deleting) return;
    setExporting(true);
    setAccountNotice(null);
    try {
      const response = await fetch('/api/account/export', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (response.status === 404) {
        throw new Error('Downloads aren’t available right now. Please try again in a little while.');
      }
      if (!response.ok) throw new Error('Cache could not prepare your download right now.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cache-data-export.json';
      link.click();
      URL.revokeObjectURL(url);
      setAccountNotice({ tone: 'success', message: 'Your Cache data download is ready.' });
    } catch (error) {
      setAccountNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Cache could not prepare your download right now.' });
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (!session || deleteConfirmation !== 'DELETE' || deleting) return;
    setDeleting(true);
    setAccountNotice(null);
    try {
      const response = await fetch('/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
      if (response.status === 404) {
        throw new Error('Account deletion isn’t available right now. Please try again in a little while.');
      }
      if (!response.ok) throw new Error('Cache could not delete your account right now.');
      accountDeletedRef.current = true;
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // The account is already deleted. Still show the confirmation screen.
      }
      setAccountOpen(false);
      setDeleting(false);
      setAppState('deleted');
    } catch (error) {
      setAccountNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Cache could not delete your account right now.' });
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
  if (appState === 'signed-out') return (
    <main className="app-shell px-4 pb-12">
      <section className="app-card max-w-lg mx-auto mt-12 md:mt-24">
        <p className="app-eyebrow">Cache for parents</p>
        <h1 className="font-serif text-4xl mt-3">Guidance that begins with the context.</h1>
        <p className="mt-4 text-ink/70 leading-relaxed">Sign in with an email link to build your child’s profile and talk things through without starting over.</p>
        {signInResult === 'invite-only' ? (
          <div role="alert" className="mt-8 rounded-2xl border border-terracotta/25 bg-terracotta/5 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-terracotta/10 text-terracotta" aria-hidden="true"><Lock className="size-5" /></span>
              <div>
                <h2 className="font-serif text-2xl leading-tight">Cache is invite-only for now</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink/75"><span className="font-semibold text-ink">{email.trim()}</span> isn’t approved yet. We’re letting parents in a few at a time from the waitlist.</p>
              </div>
            </div>
            <div className="mt-5">
              <WaitlistForm idPrefix="app-gate" heading={null} buttonLabel="Join the waitlist" initialEmail={email.trim()} supportingCopy="Already on the list? You’re all set. We’ll email you as soon as your spot opens." />
            </div>
            <button type="button" onClick={() => setSignInResult('idle')} className="mt-4 text-sm font-medium text-ink/60 underline underline-offset-2 hover:text-ink">Try a different email</button>
          </div>
        ) : (
          <>
            <form onSubmit={requestMagicLink} className="mt-8 flex flex-col sm:flex-row gap-3"><label className="sr-only" htmlFor="app-email">Email address</label><input id="app-email" className="app-input flex-1" type="email" value={email} onChange={(event) => { setEmail(event.target.value); if (signInResult === 'error') setSignInResult('idle'); }} placeholder="you@example.com" required /><button className="app-button" disabled={signInResult === 'sending'}>{signInResult === 'sending' ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <>Send sign-in link <ArrowRight className="size-4" /></>}</button></form>
            {signInResult === 'sent' && <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-sage/25 bg-sage/10 p-4"><Mail className="mt-0.5 size-5 shrink-0 text-sage" aria-hidden="true" /><div><p className="font-semibold text-ink">Check your email for a secure sign-in link.</p><p className="mt-1 text-sm text-ink/70">It was sent to {email.trim()}. It can take a minute, so check spam too.</p></div></div>}
            {signInResult === 'error' && <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-red-700/15 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><p>We could not send that sign-in link. Please check the address and try again.</p></div>}
          </>
        )}
        <a href="/" className="inline-block mt-7 text-sm underline text-ink/60 hover:text-ink">Back to Cache</a>
      </section>
    </main>
  );
  if (appState === 'onboarding') return <main className="app-shell min-h-dvh overflow-y-auto px-4 py-6 sm:px-6 sm:py-10"><section className="context-form-workspace mx-auto max-w-3xl"><div className="border-b border-ink/10 px-5 py-6 sm:px-8 sm:py-8"><p className="app-eyebrow">Getting started</p><h1 className="mt-3 max-w-xl font-serif text-4xl sm:text-5xl">Tell Cache about your child.</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/70 sm:text-base">This takes a few minutes. What you share here is what Cache uses so you never have to explain your child twice. You can change or delete it any time from Account.</p></div><div className="px-5 py-6 sm:px-8 sm:py-8"><ProfileForm onSave={completeProfile} /><p className="mt-4 text-xs leading-relaxed text-ink/50">General parenting guidance only. For urgent or health concerns, contact a professional or emergency services.</p></div></section></main>;
  if (appState === 'deleted') return <main className="app-shell"><section className="app-card max-w-lg mx-auto mt-20"><h1 className="font-serif text-3xl">Your account is deleted.</h1><a href="/" className="inline-block mt-6 text-sm underline text-ink/60 hover:text-ink">Back to the home page</a></section></main>;
  if (appState === 'error') return <main className="app-shell"><section className="app-card max-w-lg mx-auto mt-20"><AlertCircle className="size-7 text-terracotta" /><h1 className="font-serif text-3xl mt-4">Something needs another try.</h1><p className="mt-3 text-ink/70">{notice}</p><button className="app-button mt-6" onClick={() => session && void loadAccount(session)}>Reload Cache</button></section></main>;

  return (
    <main className="app-shell flex h-dvh min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-5 py-4 sm:px-6">
        <a href="/" className="font-serif text-2xl font-semibold">Cache<span className="text-terracotta">.</span></a>
        <div className="flex items-center gap-1 sm:gap-2">
          <button ref={accountButtonRef} type="button" onClick={() => setAccountOpen(true)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink/65 transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">Account</button>
          <button onClick={() => void supabase.auth.signOut({ scope: 'local' })} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink/65 transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"><LogOut className="size-4" /><span className="hidden sm:inline">Sign out</span><span className="sr-only sm:hidden">Sign out</span></button>
        </div>
      </header>
      <div className="mx-auto grid w-full min-h-0 max-w-6xl flex-1 gap-4 px-4 pb-4 sm:px-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-5 lg:pb-6">
        {profile && <aside className="hidden min-h-0 overflow-y-auto rounded-[24px] border border-ink/10 bg-white/60 px-5 py-6 lg:block"><ContextPanel profile={profile} onEdit={() => setEditing(true)} editButtonRef={editButtonRef}><MemoryManager instance="desktop" headingRef={desktopMemoryHeadingRef} memories={memories} limit={memoryLimit} loading={memoriesLoading} error={memoriesError} onUpdate={updateMemory} onDelete={deleteMemory} onRetry={() => session && void loadMemories(session.access_token)} /></ContextPanel></aside>}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-[0_12px_32px_-18px_rgba(43,38,34,0.2)]">
          <div className="shrink-0 border-b border-ink/10 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            <p className="app-eyebrow">A calm place to think it through</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-serif text-2xl sm:text-3xl">{hasMessages ? `Chatting about ${profile?.nickname}` : `How can Cache help ${profile?.nickname ?? 'today'}?`}</h1>
              {profile && <span className="text-sm text-ink/60">{ageLabel(profile)}</span>}
            </div>
            <details className="mt-2 text-xs text-ink/60">
              <summary className="flex w-fit cursor-pointer items-center gap-1.5 font-medium transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"><Info className="size-3.5" />About this guidance</summary>
              <p className="mt-2 max-w-xl leading-relaxed">Cache is an AI that offers general parenting guidance. It isn’t medical, mental health, or emergency care. If someone may be in danger right now, Cache will pause the chat and point you to urgent help.</p>
            </details>
            {profile && <button type="button" onClick={() => openContextDrawer(false)} className="mt-3 inline-flex items-center gap-2 rounded-full border border-sage/20 bg-sage/10 px-3 py-1.5 text-left text-xs font-semibold text-sage transition hover:bg-sage/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta lg:hidden">
              <span className="size-1.5 rounded-full bg-sage" /><span>Saved context · {profile.nickname}</span><ChevronUp className="size-3.5" />
            </button>}
          </div>
          <div ref={messagesListRef} onScroll={updateMessageScrollPosition} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-7" aria-live="polite">
            {!hasMessages && <div className="max-w-2xl py-2 sm:py-5">
              <p className="max-w-xl text-sm leading-relaxed text-ink/70 sm:text-base">Cache already has what you shared about {profile?.nickname}, so you can start in the middle of things. Say what happened, what you’ve already tried, and what you’d like to feel easier. Rough words are fine.</p>
              <div className="mt-6">
                <p className="text-sm font-semibold text-ink">Ways to start</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {starterPromptsFor(profile?.nickname ?? '').map((prompt) => <button key={prompt} type="button" onClick={() => useStarterPrompt(prompt)} className="rounded-2xl border border-ink/10 bg-cream px-3.5 py-3.5 text-left text-sm leading-snug text-ink/75 transition hover:border-sage/40 hover:bg-sage/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">{prompt}</button>)}
                </div>
              </div>
            </div>}
            {messages.map((message) => <div key={message.id}><ChatMessage message={message} />{message.role === 'assistant' && <><MemoryUseDisclosure memories={message.used_memories ?? []} onOpen={() => recordProductEvent('memory_use_disclosure_opened', message.id)} /><MemorySuggestionCard suggestions={memorySuggestions[message.id] ?? []} onResolve={resolveMemorySuggestion} onManage={openMemoryManager} /></>}</div>)}
            {sending && streamingReply && <div data-testid="streaming-reply"><div aria-hidden="true"><ChatMessage message={{ id: 'streaming-reply', conversation_id: conversation?.id ?? '', user_id: '', role: 'assistant', content: streamingReply, created_at: '' }} /></div><span className="sr-only" role="status">Cache is replying</span></div>}
            {sending && !streamingReply && <div className="flex w-fit items-center gap-2.5 rounded-2xl rounded-bl-md border border-sage/15 bg-sage/10 px-4 py-3 text-sm text-ink" role="status"><span className="grid size-7 place-items-center rounded-full bg-white/70 text-sage" aria-hidden="true"><Sparkles className="size-3.5" /></span><span>Cache is thinking<span className="chat-thinking-dots" aria-hidden="true"><i /><i /><i /></span></span><span className="sr-only">Cache is preparing a response</span></div>}
            <div ref={messagesEndRef} />
          </div>
          <div className="shrink-0 border-t border-ink/10 bg-white px-4 pb-4 pt-3 sm:px-6 sm:pb-5">
            {hasUnreadMessages && <button type="button" onClick={scrollToLatestMessage} className="mx-auto mb-3 flex w-fit items-center gap-1.5 rounded-full bg-sage px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">Jump to latest <ChevronUp className="size-3 rotate-180" /></button>}
            {notice && <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-red-700/15 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert"><span className="whitespace-pre-line">{notice}</span>{failedChatRequest && <button type="button" onClick={() => void sendChatMessage(failedChatRequest.content, failedChatRequest.clientRequestId, false)} className="shrink-0 font-semibold underline underline-offset-2">Try again</button>}</div>}
          <form onSubmit={sendMessage} className="chat-composer flex shrink-0 items-end gap-3 rounded-2xl border border-ink/10 bg-cream p-2 transition focus-within:border-terracotta/40 focus-within:ring-2 focus-within:ring-terracotta/20">
            <label className="sr-only" htmlFor="chat-message">Message Cache</label>
            <div className="min-w-0 flex-1"><textarea ref={messageInputRef} id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} className="min-h-12 max-h-32 w-full resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-ink/45" placeholder={`What’s going on with ${profile?.nickname ?? ''}?`} maxLength={4000} required aria-describedby="chat-keyboard-help" /><p id="chat-keyboard-help" className="px-2 pb-0.5 text-[11px] text-ink/45">Enter to send <span aria-hidden="true">·</span> Shift+Enter for a new line</p></div>
            <button type="submit" disabled={sending || !draft.trim()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-terracotta text-white transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2" aria-label={sending ? 'Cache is thinking' : 'Send message'}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button>
          </form>
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink/45">General parenting guidance only. For urgent or health concerns, contact a professional or emergency services.</p>
          </div>
        </section>
      </div>
      {contextOpen && profile && <div className="fixed inset-0 z-30 lg:hidden">
        <button type="button" onClick={closeContext} className="absolute inset-0 bg-ink/35" aria-label="Close saved context" />
        <section ref={contextDrawerRef} className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[28px] bg-cream p-6 pb-8 shadow-[0_-12px_32px_-12px_rgba(43,38,34,0.28)]" role="dialog" aria-modal="true" aria-label={`${profile.nickname}'s saved context`}>
          <button type="button" onClick={closeContext} className="absolute right-5 top-5 rounded-lg p-2 text-ink/60 hover:bg-ink/5 hover:text-ink" aria-label="Close saved context"><X className="size-5" /></button>
          <div className="pr-10"><ContextPanel profile={profile} onEdit={() => { closeContext(); setEditing(true); }} editButtonRef={editButtonRef}><MemoryManager instance="mobile" headingRef={mobileMemoryHeadingRef} memories={memories} limit={memoryLimit} loading={memoriesLoading} error={memoriesError} onUpdate={updateMemory} onDelete={deleteMemory} onRetry={() => session && void loadMemories(session.access_token)} /></ContextPanel></div>
        </section>
      </div>}
      {editing && profile && <div className="fixed inset-0 z-40 grid place-items-center bg-ink/35 p-4" role="presentation"><section ref={editDialogRef} className="context-form-workspace flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col" role="dialog" aria-modal="true" aria-labelledby="edit-context-title"><div className="flex shrink-0 items-start justify-between gap-5 border-b border-ink/10 px-5 py-5 sm:px-8 sm:py-6"><div><p className="app-eyebrow">Saved context</p><h2 id="edit-context-title" className="mt-2 font-serif text-3xl">Update {profile.nickname}’s context</h2><p className="mt-2 text-sm leading-relaxed text-ink/65">Keep the details that help Cache support your family up to date.</p></div><button ref={editCloseButtonRef} type="button" onClick={closeEditing} className="rounded-lg p-2 text-ink/60 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta" aria-label="Close context editor"><X className="size-5" /></button></div><div className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8"><ProfileForm initialProfile={profile} onSave={(saved) => { setProfile(saved); closeEditing(); }} onCancel={closeEditing} /></div></section></div>}
      {accountOpen && <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/35 p-4" role="presentation"><section ref={accountDialogRef} className="app-card mx-auto my-8 max-w-xl" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"><div className="flex items-start justify-between gap-4"><div><p className="app-eyebrow">Account settings</p><h2 id="account-dialog-title" className="mt-2 font-serif text-3xl">Your Cache data</h2></div><button ref={accountCloseButtonRef} type="button" onClick={closeAccount} className="rounded-lg p-2 text-ink/60 hover:bg-ink/5 hover:text-ink" aria-label="Close account settings"><X className="size-5" /></button></div><div className="mt-6">{accountNotice && <div role={accountNotice.tone === 'error' ? 'alert' : 'status'} className={accountNotice.tone === 'error' ? 'context-error-summary mb-4' : 'mb-4 flex items-start gap-3 rounded-2xl border border-sage/25 bg-sage/10 p-4 text-sm text-ink'}>{accountNotice.tone === 'error' && <AlertCircle className="mt-0.5 size-4 shrink-0" />}<span>{accountNotice.message}</span></div>}<AccountPanel exporting={exporting} deleting={deleting} deleteConfirmation={deleteConfirmation} onExport={() => void downloadData()} onDeleteConfirmationChange={setDeleteConfirmation} onDelete={() => void deleteAccount()} /></div></section></div>}
    </main>
  );
}
