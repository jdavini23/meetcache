import { useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface WaitlistFormProps {
  idPrefix: string;
  isDarkTheme?: boolean;
}

export default function WaitlistForm({ idPrefix, isDarkTheme = false }: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'duplicate' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Pricing survey state
  const [pricingSurveyStatus, setPricingSurveyStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);

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

    setIsSubmitting(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      const referrer = typeof document !== 'undefined' ? (document.referrer || null) : null;
      
      const { error } = await supabase
        .from('waitlist')
        .insert({
          email: cleanEmail.toLowerCase(),
          source: 'landing',
          referrer: referrer
        });

      if (error) {
        if (error.code === '23505') {
          setStatus('duplicate');
          setSubmittedEmail(cleanEmail);
        } else {
          console.error('Database insertion error:', error);
          setStatus('error');
          setErrorMessage('Something went wrong — please try again.');
        }
      } else {
        setStatus('success');
        setSubmittedEmail(cleanEmail);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setStatus('error');
      setErrorMessage('Something went wrong — please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePriceSelect = async (price: string) => {
    setSelectedPrice(price);
    setPricingSurveyStatus('submitting');

    try {
      // Save choice locally as a fallback immediately
      localStorage.setItem(`price_signal_${submittedEmail.toLowerCase()}`, price);

      // Try saving choice by updating that email's row with the price_signal in the DB
      const { error } = await supabase
        .from('waitlist')
        .update({ price_signal: price })
        .eq('email', submittedEmail.toLowerCase());

      if (error) {
        // If the database does not have the column price_signal yet, we avoid throwing console.error
        // as the signup is already counts and is saved locally.
        console.warn('Database price_signal update skipped:', error.message);
      }
    } catch (err) {
      console.warn('Unexpected price survey error skipped:', err);
    } finally {
      setPricingSurveyStatus('done');
    }
  };

  const priceTiers = [
    { value: '$9', label: '$9 / mo' },
    { value: '$19', label: '$19 / mo' },
    { value: '$29', label: '$29 / mo' },
    { value: 'not_sure', label: 'Not sure yet' }
  ];

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
            className={`w-full ${isDarkTheme ? '' : 'bg-white rounded-[32px] p-8 border border-ink/10 shadow-[0_10px_30px_-15px_rgba(43,38,34,0.1)]'}`}
          >
            {!isDarkTheme && (
              <label className="block text-[10px] uppercase tracking-widest font-bold text-ink/50 mb-4 text-left">
                Get early access
              </label>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
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
                    <span>Save my spot</span>
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
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </motion.div>
            )}

            <p className={`mt-4 text-xs tracking-wide text-center sm:text-left
              ${isDarkTheme ? 'text-cream/60' : 'text-ink/60'}`}
            >
              Free to join. No spam — one note when your spot opens.
            </p>
          </motion.div>
        ) : (status === 'success' || status === 'duplicate') && pricingSurveyStatus !== 'done' ? (
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
                  {status === 'duplicate' ? "We have you down." : "You are on the list."}
                </h4>
                <p className={`text-sm mt-1 leading-relaxed
                  ${isDarkTheme ? 'text-cream/80' : 'text-ink/80'}`}
                >
                  {status === 'duplicate' 
                    ? "You are already on our list. We will reach out soon." 
                    : "We will send you a short note the moment a spot opens."}
                </p>
              </div>
            </div>

            <div className={`h-[1px] my-4 ${isDarkTheme ? 'bg-cream/10' : 'bg-ink/10'}`} />

            <div>
              <p className="text-xs uppercase tracking-widest font-bold text-terracotta mb-2">
                A question while you wait
              </p>
              <h5 className="font-serif text-[17px] font-bold leading-snug mb-4">
                Would you pay for a coach that remembers?
              </h5>
              
              <div className="grid grid-cols-2 gap-2">
                {priceTiers.map((tier) => (
                  <button
                    key={tier.value}
                    onClick={() => handlePriceSelect(tier.value)}
                    disabled={pricingSurveyStatus === 'submitting'}
                    className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-center cursor-pointer transition-all duration-200 active:scale-[0.97]
                      ${isDarkTheme
                        ? 'bg-cream/5 border-cream/10 text-cream/90 hover:bg-cream/10 hover:border-cream/20'
                        : 'bg-cream border-transparent text-ink/90 hover:bg-cream/70'
                      }`}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
              
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setPricingSurveyStatus('done')}
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
            <h4 className="font-serif text-lg font-bold mb-1 text-ink">
              Thank you.
            </h4>
            <p className={`text-xs max-w-xs leading-relaxed
              ${isDarkTheme ? 'text-cream/70' : 'text-ink/70'}`}
            >
              Your voice helps us build something real for parents.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
