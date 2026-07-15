import { HelpCircle, RefreshCw, Layers } from 'lucide-react';
import { motion } from 'motion/react';

export default function Problem() {
  const cards = [
    {
      id: "problem-card-1",
      icon: <RefreshCw className="h-5 w-5 text-terracotta" />,
      title: "'How old is your child?' — again",
      description: "You describe the 6pm meltdowns and the sleep schedule on the fridge. You close the tab. The next night, you start over from zero. Standard tools live in a single moment, forgetting the child you already explained."
    },
    {
      id: "problem-card-2",
      icon: <HelpCircle className="h-5 w-5 text-terracotta" />,
      title: "Advice for a child who doesn't exist",
      description: "Generic parenting tip lists are built for an average, theoretical child. But your child gets overstimulated by clothing tags, or only falls asleep when the room is ice cold. Standard advice ignores the details."
    },
    {
      id: "problem-card-3",
      icon: <Layers className="h-5 w-5 text-terracotta" />,
      title: "No context carries over",
      description: "What finally worked for last month's separation struggles disappears into the void. Because there is no continuity, every new developmental phase feels like a fresh crisis where you have to re-teach the history."
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
            You've explained your kid a hundred times.
          </h2>
          <p 
            id="problem-intro"
            className="font-sans text-base text-ink/80 leading-relaxed"
          >
            Every time you look for help, you end up re-typing your child's entire history. You describe their temperament, their triggers, and their sleep struggles to search boxes that treat you like a stranger every single time. You are forced to summarize the kid you love into a sterile text field, over and over, just to get advice built for an average child you don't have.
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
