import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function TrustSafety() {
  const controls = [
    {
      icon: <Download className="h-4 w-4" />,
      text: 'Download your saved context and chat history'
    },
    {
      icon: <Trash2 className="h-4 w-4" />,
      text: 'Permanently delete your account and application data'
    }
  ];

  return (
    <section
      id="trust-safety-section"
      className="px-6 py-12 md:py-16 bg-cream border-b border-ink/10"
      aria-labelledby="trust-safety-heading"
    >
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1.0] }}
        className="max-w-5xl mx-auto grid gap-6 md:grid-cols-[1fr_1.35fr] md:items-center rounded-[28px] border border-sage/15 bg-sage/5 p-6 sm:p-8"
      >
        <div>
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-sage/15 bg-white text-sage">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 id="trust-safety-heading" className="font-serif text-2xl sm:text-3xl font-medium text-ink">
            Your context stays in your control.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink/70">
            Cache stores the information you provide so it can offer more relevant guidance.
          </p>
        </div>

        <div>
          <ul className="space-y-3">
            {controls.map((control) => (
              <li key={control.text} className="flex items-center gap-3 text-sm leading-relaxed text-ink/80">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sage">
                  {control.icon}
                </span>
                <span>{control.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-sage/15 pt-4 text-xs leading-relaxed text-ink/60">
            Cache provides general parenting guidance—not medical, mental-health, or emergency care.{' '}
            <a href="/privacy" className="font-semibold text-terracotta underline underline-offset-2 hover:opacity-80">
              Read the privacy details
            </a>
          </p>
        </div>
      </motion.div>
    </section>
  );
}
