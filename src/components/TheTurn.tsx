import { motion } from 'motion/react';

export default function TheTurn() {
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.18
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 1.0,
        ease: [0.25, 0.1, 0.25, 1.0]
      }
    }
  };

  return (
    <section 
      id="the-turn-section"
      className="py-24 md:py-32 px-6 bg-cream border-b border-ink/10 relative overflow-hidden"
    >
      {/* Soft background visual details */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-terracotta/5 rounded-full blur-3xl pointer-events-none animate-pulse" />
      
      <div className="max-w-3xl mx-auto text-center relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-120px" }}
          className="flex flex-col items-center"
        >
          {/* Section Marker */}
          <motion.span 
            variants={itemVariants}
            className="text-[10px] uppercase tracking-widest font-bold text-terracotta mb-6"
          >
            The Invisible Weight
          </motion.span>
          
          {/* Heading */}
          <motion.h2 
            id="the-turn-heading"
            variants={itemVariants}
            className="font-serif text-3xl sm:text-4xl md:text-[44px] leading-[1.15] font-medium tracking-tight text-ink mb-8 max-w-2xl italic"
          >
            The hardest part of parenting is being the only memory.
          </motion.h2>
          
          {/* Body Narrative */}
          <div className="space-y-6 text-base sm:text-lg text-ink/85 font-sans leading-relaxed text-left sm:text-center max-w-xl">
            <motion.p variants={itemVariants}>
              You hold every detail. The exact frequency of their cries. The transition routine that took three painful weeks to establish. The specific, whispered words that de-escalate a bedtime meltdown.
            </motion.p>
            <motion.p variants={itemVariants}>
              You carry this entire mental library alone. The exhausting part isn't just the physical work of parenting — it is the quiet cognitive load of having to be the sole keeper of your child's history.
            </motion.p>
            <motion.p 
              variants={itemVariants}
              className="font-serif italic text-xl text-ink font-medium pt-2"
            >
              We believe you shouldn't have to carry that archive by yourself. Someone should remember with you.
            </motion.p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
