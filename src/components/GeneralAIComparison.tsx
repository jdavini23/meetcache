import { Bot, MessagesSquare, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export default function GeneralAIComparison() {
  const differences = [
    {
      icon: <Bot className="h-5 w-5" />,
      general: 'General-purpose context',
      cache: 'Child-specific context'
    },
    {
      icon: <MessagesSquare className="h-5 w-5" />,
      general: 'A blank chat to configure',
      cache: 'A guided parenting setup'
    },
    {
      icon: <Sparkles className="h-5 w-5" />,
      general: 'Broad assistance',
      cache: 'Focused everyday parenting support'
    }
  ];

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
            Purpose-built for parenting
          </span>
          <h2
            id="general-ai-comparison-heading"
            className="mt-5 font-serif text-3xl font-medium tracking-tight text-ink sm:text-4xl"
          >
            Why Cache instead of a general AI assistant?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-ink/75 sm:text-base">
            ChatGPT, Claude, and Gemini are powerful general-purpose assistants. Cache is designed
            specifically for parenting continuity—organizing the routines, temperament, patterns,
            and past attempts you choose to share around your child.
          </p>
          <p className="mx-auto mt-3 max-w-xl font-serif text-lg italic leading-relaxed text-ink">
            You should not have to build your own parenting system inside a blank chat.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="mt-10 grid gap-4 md:grid-cols-3"
        >
          {differences.map((difference) => (
            <article
              key={difference.general}
              className="rounded-[24px] border border-ink/10 bg-white p-6 shadow-[0_10px_30px_-18px_rgba(43,38,34,0.14)]"
            >
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-sage/10 text-sage">
                {difference.icon}
              </div>
              <p className="text-xs font-medium leading-relaxed text-ink/50">
                {difference.general}
              </p>
              <div className="my-3 h-px bg-ink/10" />
              <p className="font-serif text-lg font-semibold leading-snug text-ink">
                {difference.cache}
              </p>
            </article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
