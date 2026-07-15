import { motion } from 'motion/react';

export default function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Introduce your family",
      description: "Tell us about your child's age, temperament, sleep rhythms, and what is hard right now. Leave a voice note or type it out. No detail is too small."
    },
    {
      number: "02",
      title: "Ask anything, anytime",
      description: "When the 6pm meltdown hits or you're awake at 2am, just send a text. It is like reaching out to a trusted coach who already knows your family's whole story."
    },
    {
      number: "03",
      title: "Get help that actually fits",
      description: "No generic checklists. You get clear, practical guidance that builds on last week's discussions, respects your child's personality, and grows as they grow."
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
            Tell us once. We remember for good.
          </h2>
          <p 
            id="how-it-works-sub"
            className="font-sans text-base text-ink/80 leading-relaxed"
          >
            We built Cache so you don't have to repeat yourself. When you have a partner who holds the context, finding help feels less like researching and more like breathing.
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
