import { BrainCircuit, Milestone, Users, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

export default function Difference() {
  const points = [
    {
      id: "diff-point-1",
      icon: <BrainCircuit className="h-5 w-5 text-sage" />,
      title: "It knows your child",
      description: "Cache builds a secure, private memory of your child's unique traits and history. It adapts as they transition from infant sleep schedules to toddler temperaments."
    },
    {
      id: "diff-point-2",
      icon: <Milestone className="h-5 w-5 text-sage" />,
      title: "Continuity over months",
      description: "Everything carries over. If you discussed separation anxiety last month, Cache remembers that context when you ask about preschool prep this week."
    },
    {
      id: "diff-point-3",
      icon: <Users className="h-5 w-5 text-sage" />,
      title: "Your family's secure history",
      description: "Track developmental stages, bedtime routines, and multiple siblings in one private place. Your family's data is fully private, secure, and accessible only to you."
    },
    {
      id: "diff-point-4",
      icon: <ShieldCheck className="h-5 w-5 text-sage" />,
      title: "A relationship, not a search box",
      description: "You don't need a list of forum links or high-stress parenting blogs. You need one calm, coherent voice that understands your child's context and stays in your corner."
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
      id="difference-section"
      className="py-20 md:py-28 px-6 bg-cream border-t border-ink/10"
    >
      <div className="max-w-5xl mx-auto">
        {/* Section Heading */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1.0] }}
          className="text-center max-w-2xl mx-auto mb-16 md:mb-20"
        >
          <h2 
            id="difference-heading"
            className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-ink mb-6 italic"
          >
            Not another chatbot you have to re-teach.
          </h2>
          <p 
            id="difference-sub"
            className="font-sans text-base text-ink/80 leading-relaxed"
          >
            Most tools treat you like a blank slate every time you log in. Cache is different. It is a quiet, continuous thread that stays with your family through every stage.
          </p>
        </motion.div>

        {/* 2x2 Grid */}
        <motion.div 
          id="difference-points-grid"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid sm:grid-cols-2 gap-8 md:gap-12"
        >
          {points.map((point) => (
            <motion.div 
              key={point.id}
              id={point.id}
              variants={itemVariants}
              className="flex gap-5 items-start bg-white p-8 rounded-[32px] border border-ink/10 shadow-[0_10px_30px_-15px_rgba(43,38,34,0.1)] transition-all duration-300 hover:shadow-[0_15px_35px_-12px_rgba(43,38,34,0.15)]"
            >
              <div className="p-3 bg-sage/10 text-sage rounded-xl border border-sage/15 shrink-0">
                {point.icon}
              </div>
              <div className="flex flex-col">
                <h3 className="font-serif text-[19px] font-bold text-ink mb-2">
                  {point.title}
                </h3>
                <p className="font-sans text-sm text-ink/75 leading-relaxed">
                  {point.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
