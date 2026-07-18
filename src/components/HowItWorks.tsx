import { motion } from 'motion/react';

export default function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Share the context",
      description: "Tell Cache about your child's age, temperament, routines, current challenges, and anything you want it to remember."
    },
    {
      number: "02",
      title: "Ask when something comes up",
      description: "Type or leave a voice note whenever you want help thinking through a routine, behavior, or difficult moment."
    },
    {
      number: "03",
      title: "Get a practical next step",
      description: "Cache uses your child's history and previous conversations to offer guidance that fits the situation."
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
      className="py-20 md:py-28 px-6 bg-cream relative border-b border-ink/10"
    >
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="text-center max-w-2xl mx-auto mb-16 md:mb-20"
        >
          <h2 
            id="how-it-works-heading"
            className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-ink mb-6 italic"
          >
            Share the context once. Build on it over time.
          </h2>
          <p 
            id="how-it-works-sub"
            className="font-sans text-base text-ink/80 leading-relaxed"
          >
            Cache keeps the details that matter close, so each new conversation can begin where the last one left off.
          </p>
        </motion.div>

        {/* Steps Grid */}
        <motion.div 
          id="how-it-works-steps-grid"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid md:grid-cols-3 gap-10 md:gap-8"
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
