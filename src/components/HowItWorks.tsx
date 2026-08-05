import { motion } from 'motion/react';

export default function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Share context once",
      description: "Tell Cache the routines, temperament, current challenges, and other details you want it to remember."
    },
    {
      number: "02",
      title: "Ask when something comes up",
      description: "Send a message when you want help thinking through a routine, behavior, or difficult moment."
    },
    {
      number: "03",
      title: "Build on their history",
      description: "Get a practical next step informed by the context you shared and what you have already tried."
    }
  ];

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
        duration: 0.8,
        ease: [0.25, 0.1, 0.25, 1.0]
      }
    }
  };

  return (
    <section 
      id="how-it-works-section"
      className="py-16 md:py-24 px-6 bg-cream relative border-b border-ink/10"
    >
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="text-center max-w-2xl mx-auto mb-10 md:mb-14"
        >
          <h2 
            id="how-it-works-heading"
            className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-ink mb-6 italic"
          >
            From “what now?” to a next step that fits.
          </h2>
          <p 
            id="how-it-works-sub"
            className="font-sans text-base text-ink/80 leading-relaxed"
          >
            Generic advice starts with an average child. Cache starts with the context you choose to share.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Everyday parenting use cases">
            {['Sleep', 'Big emotions', 'Routines', 'Transitions'].map((useCase) => (
              <span
                key={useCase}
                className="rounded-full border border-terracotta/15 bg-terracotta/5 px-3.5 py-2 text-xs font-semibold text-terracotta"
              >
                {useCase}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Steps Grid */}
        <motion.div 
          id="how-it-works-steps-grid"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid md:grid-cols-3 gap-5 md:gap-8"
        >
          {steps.map((step, idx) => (
            <motion.div 
              key={step.number}
              id={`how-it-works-step-${idx + 1}`}
              variants={itemVariants}
              className="flex flex-col relative bg-white p-8 rounded-[32px] border border-ink/10 shadow-[0_10px_30px_-15px_rgba(43,38,34,0.1)] transition-all duration-300 hover:shadow-[0_15px_35px_-12px_rgba(43,38,34,0.15)]"
            >
              <div className="w-8 h-8 rounded bg-sage text-white flex items-center justify-center text-xs font-bold shrink-0 mb-6 font-mono">
                {step.number}
              </div>
              <h3 className="font-serif text-xl font-bold text-ink mb-4">
                {step.title}
              </h3>
              <p className="font-sans text-sm text-ink/75 leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
