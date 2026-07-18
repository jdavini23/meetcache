import { HelpCircle, RefreshCw, Layers } from 'lucide-react';
import { motion } from 'motion/react';

export default function Problem() {
  const cards = [
    {
      id: "problem-card-1",
      icon: <RefreshCw className="h-5 w-5 text-terracotta" />,
      title: "Start every question from scratch",
      description: "Re-explain your child's age, routines, temperament, and current phase every time you need help."
    },
    {
      id: "problem-card-2",
      icon: <HelpCircle className="h-5 w-5 text-terracotta" />,
      title: "Get advice for the average child",
      description: "Generic suggestions miss the sensory needs, preferences, and patterns that matter in your home."
    },
    {
      id: "problem-card-3",
      icon: <Layers className="h-5 w-5 text-terracotta" />,
      title: "Lose track of what worked",
      description: "Useful ideas disappear between conversations, making every new challenge feel disconnected from the last one."
    }
  ];

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.15
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
      id="problem-section"
      className="py-20 md:py-28 px-6 bg-cream border-t border-b border-ink/10 relative"
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 
            id="problem-heading"
            className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-ink mb-6 italic"
          >
            Parenting advice rarely knows your child.
          </h2>
          <p 
            id="problem-intro"
            className="font-sans text-base text-ink/80 leading-relaxed"
          >
            Search results, forums, and general-purpose chatbots can answer a question. But they don't know the history behind it: what changed, what you've tried, or what makes your child different.
          </p>
        </motion.div>

        {/* Cards Grid */}
        <motion.div 
          id="problem-cards-grid"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid md:grid-cols-3 gap-6 md:gap-8"
        >
          {cards.map((card) => (
            <motion.div
              key={card.id}
              id={card.id}
              variants={itemVariants}
              className="bg-white p-8 rounded-[32px] border border-ink/10 shadow-[0_10px_30px_-15px_rgba(43,38,34,0.1)] flex flex-col items-start transition-all duration-300 hover:shadow-[0_15px_35px_-12px_rgba(43,38,34,0.15)]"
            >
              <div className="p-3 bg-cream rounded-xl border border-ink/10 mb-6">
                {card.icon}
              </div>
              <h3 className="font-serif text-[19px] font-bold leading-snug text-ink mb-3.5">
                {card.title}
              </h3>
              <p className="font-sans text-sm text-ink/75 leading-relaxed">
                {card.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
