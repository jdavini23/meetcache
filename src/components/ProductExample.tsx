import { MessageCircle, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export default function ProductExample() {
  return (
    <section
      id="product-example-section"
      className="py-16 md:py-24 px-6 bg-white/35 border-y border-ink/10 relative overflow-hidden"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] bg-terracotta/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-120px' }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="text-center max-w-2xl mx-auto mb-8 sm:mb-12"
        >
          <span className="text-[10px] uppercase tracking-widest font-bold text-terracotta">
            Illustrative example
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-ink mt-5 mb-5 italic">
            See what remembering changes.
          </h2>
          <p className="font-sans text-base text-ink/80 leading-relaxed">
            Ask about what is happening now. Cache can connect it to the useful context you chose to share before.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="bg-white p-5 sm:p-10 rounded-[28px] sm:rounded-[32px] border border-ink/10 shadow-[0_15px_40px_-18px_rgba(43,38,34,0.16)] space-y-5"
          aria-label="Illustrative conversation with Cache"
        >
          <div className="flex flex-wrap gap-2 pb-4 border-b border-ink/10" aria-label="Context Cache remembers in this example">
            {['Maya · age 3', 'Quiet time skipped this week', '20 minutes earlier helped Tuesday'].map((detail) => (
              <span
                key={detail}
                className="rounded-full border border-sage/15 bg-sage/10 px-3 py-1.5 text-[11px] font-medium text-sage"
              >
                {detail}
              </span>
            ))}
          </div>

          <div className="flex items-start gap-3 sm:gap-4 max-w-2xl ml-auto">
            <div className="flex-1 bg-cream rounded-2xl rounded-tr-sm px-5 py-4 border border-ink/5">
              <p className="text-[10px] uppercase tracking-widest font-bold text-ink/45 mb-2">You</p>
              <p className="font-sans text-sm sm:text-base text-ink/85 leading-relaxed">
                Bedtime is taking an hour again. What should we try tonight?
              </p>
            </div>
            <div className="p-2.5 bg-ink text-cream rounded-full shrink-0" aria-hidden="true">
              <MessageCircle className="h-4 w-4" />
            </div>
          </div>

          <div className="flex items-start gap-3 sm:gap-4 max-w-2xl">
            <div className="p-2.5 bg-sage text-white rounded-full shrink-0" aria-hidden="true">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 bg-sage/10 rounded-2xl rounded-tl-sm px-5 py-4 border border-sage/15">
              <p className="text-[10px] uppercase tracking-widest font-bold text-sage mb-2">Cache</p>
              <p className="font-sans text-sm sm:text-base text-ink/85 leading-relaxed">
                Maya has skipped quiet time this week, and moving bedtime 20 minutes earlier helped on Tuesday. Try that same shift tonight before changing the rest of the routine.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
