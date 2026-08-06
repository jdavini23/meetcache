import { useState } from 'react';
import type { RefObject } from 'react';
import { ChevronDown, Loader2, Pencil, Trash2 } from 'lucide-react';
import { formatChildAge } from '../../lib/childAge';
import type { ChildMemory, ChildProfile, MemorySuggestion, MemoryType, UsedMemory } from '../../lib/types';
import { CharacterCount } from './FormFeedback';

const memoryTypeLabels: Record<MemoryType, string> = {
  helps: 'What helps',
  trigger: 'Triggers',
  worsens: 'What makes it harder',
  parent_preference: 'How you prefer guidance',
  recurring_situation: 'Recurring situations',
  routine: 'Routines',
  school_context: 'School and care',
  sensory_context: 'Sensory context',
};

function profileUpdatedLabel(updatedAt: string) {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return 'Last updated recently';

  const daysSinceUpdate = Math.floor((Date.now() - updated.getTime()) / 86_400_000);
  if (daysSinceUpdate <= 0) return 'Updated today';
  if (daysSinceUpdate === 1) return 'Updated yesterday';
  return `Updated ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(updated)}`;
}

interface ContextPanelProps {
  profile: ChildProfile;
  memories: ChildMemory[];
  memoryLimit: number;
  memoriesLoading: boolean;
  memoriesError: string;
  focusedMemoryId: string | null;
  memoryTargetRef: RefObject<HTMLDivElement | null>;
  instance: 'desktop' | 'mobile';
  onEdit: () => void;
  onUpdateMemory: (memoryId: string, content: string) => Promise<string | null>;
  onDeleteMemory: (memoryId: string) => Promise<string | null>;
  onRetryMemories: () => void;
  editButtonRef?: RefObject<HTMLButtonElement | null>;
}

interface MemoryManagerProps {
  memories: ChildMemory[];
  limit: number;
  loading: boolean;
  error: string;
  focusedMemoryId: string | null;
  targetRef: RefObject<HTMLDivElement | null>;
  instance: 'desktop' | 'mobile';
  onUpdate: (memoryId: string, content: string) => Promise<string | null>;
  onDelete: (memoryId: string) => Promise<string | null>;
  onRetry: () => void;
}

interface MemorySuggestionCardProps {
  suggestions: MemorySuggestion[];
  memoryCount: number;
  memoryLimit: number;
  onResolve: (suggestion: MemorySuggestion, action: 'accept' | 'reject', content?: string) => Promise<string | null>;
  onManage: () => void;
}

interface MemoryUseDisclosureProps {
  memories: UsedMemory[];
  onManage: (memoryId: string) => void;
  onOpened: () => void;
}

function MemoryManager({ memories, limit, loading, error, focusedMemoryId, targetRef, instance, onUpdate, onDelete, onRetry }: MemoryManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const grouped = memories.reduce<Partial<Record<MemoryType, ChildMemory[]>>>((result, memory) => {
    (result[memory.memory_type] ??= []).push(memory);
    return result;
  }, {});

  const beginEditing = (memory: ChildMemory) => {
    setDeletingId(null);
    setEditingId(memory.id);
    setDraft(memory.content);
    setActionError('');
  };

  const saveMemory = async (memoryId: string) => {
    if (!draft.trim()) return;
    setSaving(true);
    setActionError('');
    const nextError = await onUpdate(memoryId, draft);
    setSaving(false);
    if (nextError) {
      setActionError(nextError);
      return;
    }
    setEditingId(null);
  };

  const removeMemory = async (memoryId: string) => {
    setSaving(true);
    setActionError('');
    const nextError = await onDelete(memoryId);
    setSaving(false);
    if (nextError) {
      setActionError(nextError);
      return;
    }
    setDeletingId(null);
  };

  return <section className="mt-7 border-t border-ink/10 pt-6" aria-labelledby={`${instance}-memory-manager-title`}>
    <div className="flex items-start justify-between gap-3">
      <div><h3 id={`${instance}-memory-manager-title`} className="font-serif text-xl">What Cache remembers</h3><p className="mt-1 text-xs leading-relaxed text-ink/55">Only details you chose to save.</p></div>
      <span className="shrink-0 rounded-full bg-sage/10 px-2 py-1 text-[11px] font-semibold text-sage">{memories.length} of {limit}</span>
    </div>
    {loading && <p className="mt-4 flex items-center gap-2 text-xs text-ink/60" role="status"><Loader2 className="size-3.5 animate-spin" />Loading memories…</p>}
    {!loading && error && <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-3 text-xs text-red-800" role="alert"><p>{error}</p><button type="button" onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">Try again</button></div>}
    {!loading && !error && memories.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-sage/25 bg-sage/5 p-3 text-xs leading-relaxed text-ink/60">Nothing extra saved yet. Cache will suggest useful details after conversations, and nothing is saved without your approval.</p>}
    {!loading && !error && memories.length > 0 && <div className="mt-5 space-y-5">
      {(Object.keys(memoryTypeLabels) as MemoryType[]).map((type) => {
        const items = grouped[type];
        if (!items?.length) return null;
        return <section key={type}>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-sage">{memoryTypeLabels[type]}</h4>
          <div className="space-y-2">
            {items.map((memory) => <div
              key={memory.id}
              id={`${instance}-memory-${memory.id}`}
              data-memory-id={memory.id}
              data-memory-instance={instance}
              ref={focusedMemoryId === memory.id ? targetRef : undefined}
              tabIndex={-1}
              className={`rounded-xl border p-3 outline-none transition focus:ring-2 focus:ring-terracotta ${focusedMemoryId === memory.id ? 'border-terracotta/40 bg-terracotta/5' : 'border-ink/10 bg-white/70'}`}
            >
              {editingId === memory.id ? <>
                <label className="sr-only" htmlFor={`${instance}-memory-edit-${memory.id}`}>Edit saved memory</label>
                <textarea id={`${instance}-memory-edit-${memory.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={280} className="app-input min-h-24 resize-y" autoFocus />
                <CharacterCount current={draft.length} maximum={280} />
                {actionError && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{actionError}</p>}
                <div className="mt-2 flex gap-2"><button type="button" disabled={saving || !draft.trim()} onClick={() => void saveMemory(memory.id)} className="memory-suggestion-save">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={saving} onClick={() => { setEditingId(null); setActionError(''); }} className="memory-suggestion-secondary">Cancel</button></div>
              </> : deletingId === memory.id ? <>
                <p className="text-xs font-semibold text-red-800">Remove this memory?</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/65">Cache will not use it again. Past replies may still show that it was used.</p>
                {actionError && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{actionError}</p>}
                <div className="mt-3 flex gap-2"><button type="button" disabled={saving} onClick={() => void removeMemory(memory.id)} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Removing…' : 'Remove'}</button><button type="button" disabled={saving} onClick={() => { setDeletingId(null); setActionError(''); }} className="memory-suggestion-secondary">Cancel</button></div>
              </> : <>
                <p className="text-sm leading-relaxed text-ink/75">{memory.content}</p>
                <div className="mt-2 flex gap-3"><button type="button" onClick={() => beginEditing(memory)} className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:text-ink"><Pencil className="size-3" />Edit</button><button type="button" onClick={() => { setEditingId(null); setDeletingId(memory.id); setActionError(''); }} className="inline-flex items-center gap-1 text-xs font-semibold text-ink/55 hover:text-red-800"><Trash2 className="size-3" />Remove</button></div>
              </>}
            </div>)}
          </div>
        </section>;
      })}
    </div>}
    {memories.length >= limit && <p className="mt-4 rounded-xl bg-terracotta/5 p-3 text-xs leading-relaxed text-ink/65">Cache can remember up to {limit} details. Remove one before saving another.</p>}
  </section>;
}

export function ContextPanel({ profile, memories, memoryLimit, memoriesLoading, memoriesError, focusedMemoryId, memoryTargetRef, instance, onEdit, onUpdateMemory, onDeleteMemory, onRetryMemories, editButtonRef }: ContextPanelProps) {
  return <>
    <p className="app-eyebrow">Saved context</p>
    <div className="mt-2 flex items-start justify-between gap-3">
      <div><h2 className="font-serif text-2xl">{profile.nickname}</h2><p className="mt-0.5 text-sm text-ink/65">{formatChildAge(profile.birth_month, profile.birth_year)}{profile.pronouns ? ` · ${profile.pronouns}` : ''}</p></div>
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
    <MemoryManager memories={memories} limit={memoryLimit} loading={memoriesLoading} error={memoriesError} focusedMemoryId={focusedMemoryId} targetRef={memoryTargetRef} instance={instance} onUpdate={onUpdateMemory} onDelete={onDeleteMemory} onRetry={onRetryMemories} />
  </>;
}

export function MemorySuggestionCard({ suggestions, memoryCount, memoryLimit, onResolve, onManage }: MemorySuggestionCardProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!suggestions.length) return null;
  const atLimit = memoryCount >= memoryLimit;

  const resolve = async (suggestion: MemorySuggestion, action: 'accept' | 'reject', content?: string) => {
    setResolvingId(suggestion.id);
    setError('');
    const nextError = await onResolve(suggestion, action, content);
    setResolvingId(null);
    if (nextError) {
      setError(nextError);
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
          <div className="mt-2 flex gap-2"><button type="button" onClick={() => void resolve(suggestion, 'accept', draft)} disabled={atLimit || resolvingId === suggestion.id || !draft.trim()} className="memory-suggestion-save">{resolvingId === suggestion.id ? 'Saving…' : 'Save memory'}</button><button type="button" onClick={() => setEditingId(null)} className="memory-suggestion-secondary">Cancel</button></div>
        </> : <>
          <p className="text-sm leading-relaxed text-ink">{suggestion.suggested_content}</p>
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={atLimit || resolvingId === suggestion.id} onClick={() => void resolve(suggestion, 'accept')} className="memory-suggestion-save">{resolvingId === suggestion.id ? 'Saving…' : 'Save'}</button><button type="button" onClick={() => { setDraft(suggestion.suggested_content); setEditingId(suggestion.id); setError(''); }} className="memory-suggestion-secondary">Edit</button><button type="button" disabled={resolvingId === suggestion.id} onClick={() => void resolve(suggestion, 'reject')} className="memory-suggestion-secondary">Dismiss</button></div>
        </>}
      </div>)}
    </div>
    {atLimit && <p className="mt-3 text-xs leading-relaxed text-ink/65">Cache is remembering {memoryLimit} details. <button type="button" onClick={onManage} className="font-semibold text-sage underline underline-offset-2">Manage saved memories</button> before saving another.</p>}
    {error && <div className="mt-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-xs text-red-800" role="alert"><p>{error}</p><p className="mt-1">Your suggestion is still here, so you can try again.</p></div>}
  </section>;
}

export function MemoryUseDisclosure({ memories, onManage, onOpened }: MemoryUseDisclosureProps) {
  if (!memories.length) return null;
  return <details className="group mt-2 max-w-xl text-xs text-ink/60" onToggle={(event) => { if (event.currentTarget.open) onOpened(); }}>
    <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition hover:bg-sage/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
      <span>Using saved context</span><ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden="true" />
    </summary>
    <ul className="mt-1.5 space-y-1.5 rounded-xl border border-sage/15 bg-sage/5 px-3 py-2.5" aria-label="Saved context used for this reply">
      {memories.map((memory, index) => <li key={`${memory.memory_id ?? 'deleted'}-${index}`} className="flex items-start justify-between gap-3 leading-relaxed"><span>{memory.content}</span>{memory.memory_id && <button type="button" onClick={() => {
        const memoryId = memory.memory_id!;
        onManage(memoryId);
        window.setTimeout(() => {
          const desktop = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
          document.getElementById(`${desktop ? 'desktop' : 'mobile'}-memory-${memoryId}`)?.querySelector('button')?.focus();
        }, 50);
      }} className="shrink-0 font-semibold text-sage underline underline-offset-2">Manage</button>}</li>)}
    </ul>
  </details>;
}
