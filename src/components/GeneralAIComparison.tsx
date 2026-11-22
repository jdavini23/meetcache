import { motion } from 'motion/react';

export default function GeneralAIComparison() {
  return (
    <section
      id="general-ai-comparison-section"
      className="bg-cream px-6 py-16 md:py-24 border-b border-ink/10"
      aria-labelledby="general-ai-comparison-heading"
    >
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="mx-auto max-w-3xl text-center"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-sage">
            Why Cache
          </span>
          <h2
            id="general-ai-comparison-heading"
            className="mt-5 font-serif text-3xl font-medium tracking-tight text-ink sm:text-4xl"
          >
            You shouldn't have to build your own parenting system inside a blank chat.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-ink/75 sm:text-base">
            Every new chat starts from zero. You retype their age, the bedtime routine, the thing that helped last Tuesday. Cache keeps the routines, temperament, patterns, and past attempts you save, so each question picks up where the last one left off.
          </p>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-ink/75 sm:text-base">
            General AI assistants are built to help with everything. Cache is built to remember your child.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
