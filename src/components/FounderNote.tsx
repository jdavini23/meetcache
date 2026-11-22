import { motion } from 'motion/react';

export default function FounderNote() {
  return (
    <section
      id="founder-note-section"
      className="px-6 py-16 md:py-24 bg-cream border-b border-ink/10"
    >
      <motion.p
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1.0] }}
        className="mx-auto max-w-2xl text-center font-sans text-base leading-relaxed text-ink/80"
      >
        I'm Joe, a Dad of one, with another on the way. Every time I asked an AI for parenting help, I had to start over and explain who my Daughter is and what we'd already tried. It got tiresome. I built Cache so what we learn about our kids doesn't get lost between conversations.
      </motion.p>
    </section>
  );
}
