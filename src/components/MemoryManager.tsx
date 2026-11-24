import { useState } from 'react';
import type { RefObject } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import type { ChildMemory, MemoryType } from '../lib/types';

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

const MEMORY_CONTENT_MAX = 280;

export interface MemoryManagerProps {
  memories: ChildMemory[];
  limit: number;
  loading: boolean;
  error: string;
  instance: 'desktop' | 'mobile';
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onUpdate: (memoryId: string, content: string) => Promise<string | null>;
  onDelete: (memoryId: string) => Promise<string | null>;
  onRetry: () => void;
}

// Lists the parent-approved memories Cache may reuse, with edit and remove controls.
export default function MemoryManager({ memories, limit, loading, error, instance, headingRef, onUpdate, onDelete, onRetry }: MemoryManagerProps) {
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

  const beginRemoving = (memoryId: string) => {
    setEditingId(null);
    setDeletingId(memoryId);
    setActionError('');
  };

  const cancel = () => {
    setEditingId(null);
    setDeletingId(null);
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

  const titleId = `${instance}-memory-manager-title`;

  return <section className="mt-7 border-t border-ink/10 pt-6" aria-labelledby={titleId}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 ref={headingRef} id={titleId} tabIndex={-1} className="font-serif text-xl outline-none focus-visible:ring-2 focus-visible:ring-terracotta">What Cache remembers</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink/55">Only details you chose to save.</p>
      </div>
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
          <ul className="space-y-2">
            {items.map((memory) => <li key={memory.id} className="rounded-xl border border-ink/10 bg-white/70 p-3">
              {editingId === memory.id ? <>
                <label className="sr-only" htmlFor={`${instance}-memory-edit-${memory.id}`}>Edit saved memory</label>
                <textarea id={`${instance}-memory-edit-${memory.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={MEMORY_CONTENT_MAX} className="app-input min-h-24 resize-y" autoFocus />
                <span className="context-character-count" aria-live="polite">{draft.length} / {MEMORY_CONTENT_MAX}</span>
                {actionError && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{actionError}</p>}
                <div className="mt-2 flex gap-2"><button type="button" disabled={saving || !draft.trim()} onClick={() => void saveMemory(memory.id)} className="memory-suggestion-save">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={saving} onClick={cancel} className="memory-suggestion-secondary">Cancel</button></div>
              </> : deletingId === memory.id ? <>
                <p className="text-xs font-semibold text-red-800">Remove this memory?</p>
                <p className="mt-1 text-sm leading-relaxed text-ink/75">{memory.content}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/65">Cache will not use it again. Past replies may still show that it was used.</p>
                {actionError && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{actionError}</p>}
                <div className="mt-3 flex gap-2"><button type="button" disabled={saving} onClick={() => void removeMemory(memory.id)} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Removing…' : 'Remove'}</button><button type="button" disabled={saving} onClick={cancel} className="memory-suggestion-secondary">Cancel</button></div>
              </> : <>
                <p className="text-sm leading-relaxed text-ink/75">{memory.content}</p>
                <div className="mt-2 flex gap-3">
                  <button type="button" onClick={() => beginEditing(memory)} className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:text-ink" aria-label={`Edit memory: ${memory.content}`}><Pencil className="size-3" />Edit</button>
                  <button type="button" onClick={() => beginRemoving(memory.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-ink/55 hover:text-red-800" aria-label={`Remove memory: ${memory.content}`}><Trash2 className="size-3" />Remove</button>
                </div>
              </>}
            </li>)}
          </ul>
        </section>;
      })}
    </div>}
    {!loading && memories.length >= limit && <p className="mt-4 rounded-xl bg-terracotta/5 p-3 text-xs leading-relaxed text-ink/65">Cache can remember up to {limit} details. Remove one before saving another.</p>}
  </section>;
}
