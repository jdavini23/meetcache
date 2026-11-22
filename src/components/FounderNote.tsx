import { motion } from 'motion/react';

export default function FounderNote() {
  return (
    <section
      id="founder-note-section"
      className="border-b border-ink/10 bg-cream px-6 py-16 md:py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-ink/10 bg-white px-6 py-10 shadow-[0_15px_40px_-18px_rgba(43,38,34,0.16)] sm:px-12 sm:py-14"
      >
        <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-sage/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-terracotta/10 blur-3xl" />

        <p
          aria-hidden="true"
          className="relative font-serif text-7xl leading-none text-terracotta sm:text-8xl"
        >
          “
        </p>
        <blockquote className="relative -mt-6 sm:-mt-8">
          <p className="font-serif text-lg font-medium italic leading-relaxed tracking-tight text-ink sm:text-xl md:text-2xl md:leading-snug">
            I'm Joe, a Dad of one, with another on the way. Every time I asked an AI for parenting help, I had to start over and explain who my Daughter is and what we'd already tried. It got tiresome. I built Cache so what we learn about our kids doesn't get lost between conversations.
          </p>
        </blockquote>
        <div aria-hidden="true" className="relative mt-8 h-px w-12 bg-terracotta/50" />
      </motion.div>
    </section>
  );
}
