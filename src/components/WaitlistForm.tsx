import { useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import * as Sentry from '@sentry/react';
import { supabase } from '../lib/supabase';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

// Reads campaign tags from the landing URL so each signup can be attributed.
export function readUtmParams(search: string) {
  const params = new URLSearchParams(search);
  const utm: Partial<Record<typeof UTM_KEYS[number], string>> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim().slice(0, 100);
    if (value) utm[key] = value;
  }
  return utm;
}

// Keeps only the referring origin and path; query strings can carry personal data.
export function sanitizeReferrer(referrer: string) {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return `${url.origin}${url.pathname}`.slice(0, 2048);
  } catch {
    return null;
  }
}

interface WaitlistFormProps {
  idPrefix: string;
  isDarkTheme?: boolean;
  heading?: string | null;
  buttonLabel?: string;
  supportingCopy?: string;
}

export default function WaitlistForm({
  idPrefix,
  isDarkTheme = false,
  heading,
  buttonLabel = 'Get early access',
  supportingCopy = "Share only your email. We'll use it for early access and the occasional question about what to build."
}: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'duplicate' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Early-interest survey state
  const [useCaseSurveyStatus, setUseCaseSurveyStatus] = useState<'idle' | 'submitting' | 'done'>('idle');

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    
    if (!cleanEmail) return;

    if (!validateEmail(cleanEmail)) {
      setStatus('error');
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    // Bots fill every field. Show them the normal success path without saving anything.
    if (honeypot) {
      setSubmittedEmail(cleanEmail);
      setUseCaseSurveyStatus('done');
      setStatus('success');
      return;
    }

    setIsSubmitting(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      const { error } = await supabase
        .from('waitlist')
        .insert({
          email: cleanEmail.toLowerCase(),
          source: idPrefix,
          referrer: sanitizeReferrer(document.referrer),
          ...readUtmParams(window.location.search)
        });

      if (error) {
        if (error.code === '23505') {
          setStatus('duplicate');
          setSubmittedEmail(cleanEmail);
        } else {
          console.error('Database insertion error:', error);
          Sentry.captureException(new Error(`Waitlist insert failed: ${error.code ?? 'unknown'}`), {
            tags: { event: 'waitlist_insert_failed', code: error.code ?? 'unknown' }
          });
          setStatus('error');
          setErrorMessage('Something went wrong. Please try again.');
        }
      } else {
        setStatus('success');
        setSubmittedEmail(cleanEmail);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      Sentry.captureException(err, { tags: { event: 'waitlist_insert_failed' } });
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveUseCaseFallback = (useCase: string) => {
    try {
      localStorage.setItem(`cache_waitlist_use_case_signal:${submittedEmail.toLowerCase()}`, useCase);
    } catch (err) {
      console.warn('Local use-case survey fallback skipped:', err);
    }
  };

  const handleUseCaseSelect = async (useCase: string) => {
    setUseCaseSurveyStatus('submitting');

    try {
      const { error } = await supabase
        .from('waitlist_use_case_submissions')
        .insert({
          email: submittedEmail.toLowerCase(),
          use_case_signal: useCase
        });

      if (error) {
        saveUseCaseFallback(useCase);
        console.warn('Database use_case_signal update skipped:', error.message);
      }
    } catch (err) {
      saveUseCaseFallback(useCase);
      console.warn('Unexpected use-case survey error skipped:', err);
    } finally {
      setUseCaseSurveyStatus('done');
    }
  };

  const useCases = [
    { value: 'sleep_bedtime', label: 'Sleep and bedtime' },
    { value: 'behavior_emotions', label: 'Behavior and big emotions' },
    { value: 'routines_transitions', label: 'Routines and transitions' },
    { value: 'something_else', label: 'Something else' }
  ];
  const resolvedHeading = heading === undefined
    ? (isDarkTheme ? null : 'Save your spot')
    : heading;

  return (
    <div className="w-full max-w-md mx-auto" id={`${idPrefix}-form-container`}>
      <AnimatePresence mode="wait">
        {status === 'idle' || status === 'error' ? (
          <motion.div
            key="signup-step"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className={`w-full ${isDarkTheme ? '' : 'bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-8 border border-ink/10 shadow-[0_10px_30px_-15px_rgba(43,38,34,0.1)]'}`}
          >
            {resolvedHeading && (
              <label
                htmlFor={`${idPrefix}-email-input`}
                className={`block text-[10px] uppercase tracking-widest font-bold mb-2 sm:mb-4 text-left ${isDarkTheme ? 'text-cream/60' : 'text-ink/50'}`}
              >
                {resolvedHeading}
              </label>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
              {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label htmlFor={`${idPrefix}-company-input`}>Company</label>
                <input
                  id={`${idPrefix}-company-input`}
                  name="company"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>
              <div className="relative flex-1">
                <input
                  id={`${idPrefix}-email-input`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={isSubmitting}
                  className={`w-full px-4 py-3 rounded-xl border font-sans text-[15px] transition-all duration-200 outline-none
                    ${isDarkTheme 
                      ? 'bg-cream/10 border-cream/15 text-cream placeholder-cream/40 focus:ring-2 focus:ring-terracotta focus:border-transparent' 
                      : 'bg-cream border-transparent text-ink placeholder-ink/40 focus:ring-2 focus:ring-terracotta focus:border-transparent'
                    }`}
                  required
                />
              </div>
              <button
                id={`${idPrefix}-submit-button`}
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 shadow-sm active:scale-[0.98] bg-terracotta text-white hover:opacity-90 disabled:opacity-50 shrink-0"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving your spot…</span>
                  </>
                ) : (
                  <>
                    <span>{buttonLabel}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {status === 'error' && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 mt-3 text-sm text-red-600 font-medium"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </motion.div>
            )}

            <p className={`mt-3 sm:mt-4 text-[11px] sm:text-xs leading-relaxed tracking-wide text-center sm:text-left
              ${isDarkTheme ? 'text-cream/60' : 'text-ink/60'}`}
            >
              {supportingCopy}
            </p>
          </motion.div>
        ) : (status === 'success' || status === 'duplicate') && useCaseSurveyStatus !== 'done' ? (
          <motion.div
            key="survey-step"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className={`p-8 rounded-[32px] border text-left shadow-[0_10px_30px_-15px_rgba(43,38,34,0.1)]
              ${isDarkTheme 
                ? 'bg-ink/95 border-cream/10' 
                : 'bg-white border-ink/10'
              }`}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="p-1 rounded-full bg-sage/10 text-sage shrink-0 mt-0.5">
                <Check className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-serif text-lg font-bold tracking-tight">
                  {status === 'duplicate' ? "We have you down." : "You're on the list."}
                </h4>
                <p className={`text-sm mt-1 leading-relaxed
                  ${isDarkTheme ? 'text-cream/80' : 'text-ink/80'}`}
                >
                  {status === 'duplicate' 
                    ? "You're already on the list. We'll reach out soon." 
                    : "We'll be in touch when spots open, and sometimes to ask for your feedback."}
                </p>
              </div>
            </div>

            <div className={`h-[1px] my-4 ${isDarkTheme ? 'bg-cream/10' : 'bg-ink/10'}`} />

            <div>
              <p className="text-xs uppercase tracking-widest font-bold text-terracotta mb-2">
                A question while you wait
              </p>
              <h5 className="font-serif text-[17px] font-bold leading-snug mb-4">
                What would you want Cache's help with first?
              </h5>
              
              <div className="grid grid-cols-2 gap-2">
                {useCases.map((useCase) => (
                  <button
                    key={useCase.value}
                    onClick={() => handleUseCaseSelect(useCase.value)}
                    disabled={useCaseSurveyStatus === 'submitting'}
                    className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-center cursor-pointer transition-all duration-200 active:scale-[0.97]
                      ${isDarkTheme
                        ? 'bg-cream/5 border-cream/10 text-cream/90 hover:bg-cream/10 hover:border-cream/20'
                        : 'bg-cream border-transparent text-ink/90 hover:bg-cream/70'
                      }`}
                  >
                    {useCase.label}
                  </button>
                ))}
              </div>
              
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setUseCaseSurveyStatus('done')}
                  className={`text-xs underline cursor-pointer transition-colors duration-200
                    ${isDarkTheme ? 'text-cream/40 hover:text-cream/70' : 'text-ink/40 hover:text-ink/70'}`}
                >
                  Skip question
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="thanks-step"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className={`p-8 rounded-[32px] border text-center flex flex-col items-center justify-center min-h-[160px] shadow-[0_10px_30px_-15px_rgba(43,38,34,0.1)]
              ${isDarkTheme 
                ? 'bg-ink/95 border-cream/10' 
                : 'bg-white border-ink/10'
              }`}
          >
            <div className="h-10 w-10 rounded-full bg-sage/10 text-sage flex items-center justify-center mb-3">
              <Check className="h-5 w-5" />
            </div>
            <h4 className={`font-serif text-lg font-bold mb-1 ${isDarkTheme ? 'text-cream' : 'text-ink'}`}>
              Thanks, that helps.
            </h4>
            <p className={`text-xs max-w-xs leading-relaxed
              ${isDarkTheme ? 'text-cream/70' : 'text-ink/70'}`}
            >
              Your answer helps us decide what to build first.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
