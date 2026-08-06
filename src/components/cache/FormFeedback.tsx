import { AlertCircle } from 'lucide-react';

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <span id={id} className="context-field-error" role="alert"><AlertCircle className="size-3.5 shrink-0" />{message}</span>;
}

export function CharacterCount({ current, maximum }: { current: number; maximum: number }) {
  return <span className="context-character-count" aria-live="polite">{current} / {maximum}</span>;
}
