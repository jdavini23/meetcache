import { Loader2 } from 'lucide-react';

interface AccountPanelProps {
  exporting: boolean;
  deleting: boolean;
  deleteConfirmation: string;
  onExport: () => void;
  onDeleteConfirmationChange: (value: string) => void;
  onDelete: () => void;
}

export default function AccountPanel({ exporting, deleting, deleteConfirmation, onExport, onDeleteConfirmationChange, onDelete }: AccountPanelProps) {
  return <>
    <p className="app-eyebrow">Your account</p>
    <h2 className="mt-2 font-serif text-2xl">Data and privacy</h2>
    <p className="mt-3 text-sm leading-relaxed text-ink/70">Download your saved context and chat history, or permanently delete your Cache account and application data.</p>
    <button type="button" onClick={onExport} disabled={exporting || deleting} className="app-button mt-6">{exporting ? <Loader2 className="size-4 animate-spin" /> : null}{exporting ? 'Preparing download…' : 'Download my data'}</button>
    <div className="mt-8 border-t border-red-700/20 pt-6">
      <h3 className="font-serif text-xl text-red-800">Delete account</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">This immediately removes your Cache account, saved child context, and conversation history. Provider backups follow their normal retention lifecycle.</p>
      <label className="mt-4 block text-sm font-medium text-ink" htmlFor="delete-confirmation">Type DELETE to confirm<input id="delete-confirmation" className="app-input mt-2" value={deleteConfirmation} onChange={(event) => onDeleteConfirmationChange(event.target.value)} autoComplete="off" /></label>
      <button type="button" onClick={onDelete} disabled={deleting || deleteConfirmation !== 'DELETE'} className="mt-4 rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">{deleting ? 'Deleting account…' : 'Delete my account and data'}</button>
    </div>
  </>;
}
