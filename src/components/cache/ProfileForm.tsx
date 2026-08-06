import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AlertCircle, ArrowRight, ChevronDown, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isChildAgeSupported } from '../../lib/childAge';
import type { ChildProfile } from '../../lib/types';
import { CharacterCount, FieldError } from './FormFeedback';

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
  parentNotes: string;
}

interface FormSectionProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

const currentYear = new Date().getFullYear();

function validateProfile(values: ProfileValues): ProfileErrors {
  const errors: ProfileErrors = {};
  const month = Number(values.birthMonth);
  const year = Number(values.birthYear);
  if (!values.nickname.trim()) errors.nickname = 'Add the name you use for your child.';
  if (!month || !year) errors.birthDate = 'Choose a birth month and year.';
  else if (month < 1 || month > 12 || !isChildAgeSupported(month, year)) errors.birthDate = 'Cache currently supports children ages 1 through 6. Please check the birth month and year.';
  if (!values.routines.trim()) errors.routines = 'Share a little about your child’s usual routines.';
  if (!values.challenges.trim()) errors.challenges = 'Share what feels challenging right now.';
  return errors;
}

function FormSection({ eyebrow, title, description, children }: FormSectionProps) {
  return <section className="context-form-section">
    <p className="app-eyebrow">{eyebrow}</p>
    <h2 className="mt-2 font-serif text-2xl">{title}</h2>
    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/65">{description}</p>
    <div className="mt-5">{children}</div>
  </section>;
}

export default function ProfileForm({ initialProfile, onSave, onCancel }: ProfileFormProps) {
  const [values, setValues] = useState<ProfileValues>({
    nickname: initialProfile?.nickname ?? '', birthMonth: String(initialProfile?.birth_month ?? ''), birthYear: String(initialProfile?.birth_year ?? ''),
    pronouns: initialProfile?.pronouns ?? '', routines: initialProfile?.routines ?? '', challenges: initialProfile?.challenges ?? '', parentNotes: initialProfile?.parent_notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [touched, setTouched] = useState<Partial<Record<ProfileField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [optionalDetailsOpen, setOptionalDetailsOpen] = useState(Boolean(initialProfile?.pronouns || initialProfile?.parent_notes));
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

    setSaving(true);
    setSaveError('');
    const payload = {
      nickname: values.nickname.trim(), birth_month: Number(values.birthMonth), birth_year: Number(values.birthYear), pronouns: values.pronouns.trim() || null,
      routines: values.routines.trim(), challenges: values.challenges.trim(), parent_notes: values.parentNotes.trim() || null,
    };
    const request = initialProfile
      ? supabase.from('child_profiles').update(payload).eq('id', initialProfile.id).select().single()
      : supabase.from('child_profiles').insert(payload).select().single();
    const { data, error: saveError } = await request;
    setSaving(false);
    if (saveError || !data) {
      setSaveError('We could not save this context. Your answers are still here—please try again.');
      return;
    }
    onSave(data as ChildProfile);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {submitted && Object.keys(errors).length > 0 && <div className="context-error-summary" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">A few details need your attention.</p><p className="mt-0.5">Please review the highlighted fields and try again.</p></div></div>}
      <FormSection eyebrow="The essentials" title="About your child" description="A few basics help Cache keep the guidance relevant from the start.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="context-form-label" htmlFor="profile-nickname">Child’s nickname <span aria-hidden="true" className="text-terracotta">*</span><input ref={nicknameRef} id="profile-nickname" value={values.nickname} onChange={(event) => updateValue('nickname', event.target.value)} onBlur={() => markTouched('nickname')} className="app-input mt-2" placeholder="Milo" maxLength={80} required aria-required="true" aria-invalid={Boolean(displayedError('nickname'))} aria-describedby={describedBy('profile-nickname-help', 'profile-nickname-error', displayedError('nickname'))} /><span id="profile-nickname-help" className="context-field-help">Use the name that feels natural at home.</span><FieldError id="profile-nickname-error" message={displayedError('nickname')} /></label>
          <fieldset className="context-form-label" aria-describedby={describedBy('profile-birth-help', 'profile-birth-error', displayedError('birthDate'))}><legend>Birth month and year <span aria-hidden="true" className="text-terracotta">*</span></legend><div className="mt-2 grid grid-cols-2 gap-2"><label className="sr-only" htmlFor="profile-birth-month">Birth month</label><select ref={birthMonthRef} id="profile-birth-month" value={values.birthMonth} onChange={(event) => updateValue('birthMonth', event.target.value)} onBlur={() => markTouched('birthDate')} className="app-input" required aria-required="true" aria-invalid={Boolean(displayedError('birthDate'))}><option value="">Month</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index, 1).toLocaleString('en', { month: 'long' })}</option>)}</select><label className="sr-only" htmlFor="profile-birth-year">Birth year</label><select id="profile-birth-year" value={values.birthYear} onChange={(event) => updateValue('birthYear', event.target.value)} onBlur={() => markTouched('birthDate')} className="app-input" required aria-required="true" aria-invalid={Boolean(displayedError('birthDate'))}><option value="">Year</option>{Array.from({ length: 8 }, (_, index) => currentYear - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></div><span id="profile-birth-help" className="context-field-help">Cache currently supports ages 1 through 6.</span><FieldError id="profile-birth-error" message={displayedError('birthDate')} /></fieldset>
        </div>
      </FormSection>
      <FormSection eyebrow="Your day to day" title="What life looks like right now" description="A little context helps Cache offer ideas that fit your family, not generic advice.">
        <div className="space-y-5">
          <label className="context-form-label block" htmlFor="profile-routines">What are their usual routines? <span aria-hidden="true" className="text-terracotta">*</span><textarea ref={routinesRef} id="profile-routines" value={values.routines} onChange={(event) => updateValue('routines', event.target.value)} onBlur={() => markTouched('routines')} className="app-input mt-2 min-h-28 resize-y" placeholder="Sleep, meals, preschool, transitions…" maxLength={1200} required aria-required="true" aria-invalid={Boolean(displayedError('routines'))} aria-describedby={describedBy('profile-routines-count', 'profile-routines-error', displayedError('routines'))} /><CharacterCount current={values.routines.length} maximum={1200} /><FieldError id="profile-routines-error" message={displayedError('routines')} /></label>
          <label className="context-form-label block" htmlFor="profile-challenges">What feels challenging right now? <span aria-hidden="true" className="text-terracotta">*</span><textarea ref={challengesRef} id="profile-challenges" value={values.challenges} onChange={(event) => updateValue('challenges', event.target.value)} onBlur={() => markTouched('challenges')} className="app-input mt-2 min-h-28 resize-y" placeholder="Bedtime, big feelings, separation…" maxLength={1200} required aria-required="true" aria-invalid={Boolean(displayedError('challenges'))} aria-describedby={describedBy('profile-challenges-count', 'profile-challenges-error', displayedError('challenges'))} /><CharacterCount current={values.challenges.length} maximum={1200} /><FieldError id="profile-challenges-error" message={displayedError('challenges')} /></label>
        </div>
      </FormSection>
      <section className="context-optional-details">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOptionalDetailsOpen((open) => !open)} aria-expanded={optionalDetailsOpen} aria-controls="optional-profile-details"><span><span className="block text-sm font-semibold text-ink">Optional details</span><span className="mt-0.5 block text-sm text-ink/60">Add the little things that might help Cache understand.</span></span><ChevronDown className={`size-5 shrink-0 text-sage transition ${optionalDetailsOpen ? 'rotate-180' : ''}`} /></button>
        {optionalDetailsOpen && <div id="optional-profile-details" className="mt-5 space-y-5 border-t border-ink/10 pt-5"><label className="context-form-label block" htmlFor="profile-pronouns">Pronouns <span className="font-normal text-ink/50">(optional)</span><input id="profile-pronouns" value={values.pronouns} onChange={(event) => updateValue('pronouns', event.target.value)} className="app-input mt-2" placeholder="they/them" maxLength={40} /><span className="context-field-help">Only if they are useful for how Cache refers to your child.</span></label><label className="context-form-label block" htmlFor="profile-notes">Anything else Cache should know? <span className="font-normal text-ink/50">(optional)</span><textarea id="profile-notes" value={values.parentNotes} onChange={(event) => updateValue('parentNotes', event.target.value)} className="app-input mt-2 min-h-28 resize-y" placeholder="What you have tried, temperament, family context…" maxLength={2000} aria-describedby="profile-notes-count" /><CharacterCount current={values.parentNotes.length} maximum={2000} /></label></div>}
      </section>
      {saveError && <div className="context-error-summary" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{saveError}</span></div>}
      <div className="context-form-actions"><div><button disabled={saving} className="app-button">{saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{saving ? 'Saving context…' : initialProfile ? 'Save context' : 'Start with Cache'}</button>{onCancel && <button type="button" onClick={onCancel} disabled={saving} className="ml-1 rounded-xl px-4 py-3 text-sm font-semibold text-ink/70 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">Cancel</button>}</div><p className="mt-2 text-xs leading-relaxed text-ink/50">You can update this context whenever things change.</p></div>
    </form>
  );
}
