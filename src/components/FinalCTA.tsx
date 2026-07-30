import { motion } from 'motion/react';
import WaitlistForm from './WaitlistForm';

export default function FinalCTA() {
  return (
    <section 
      id="final-cta-section"
      className="py-16 md:py-24 px-6 bg-cream"
    >
      <div className="max-w-4xl mx-auto">
        <motion.div 
          id="final-cta-card"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="bg-ink text-cream p-10 md:p-16 rounded-[32px] text-center relative overflow-hidden shadow-xl"
        >
          {/* Subtle design element */}
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-terracotta/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-sage/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
            <h2 
              id="final-cta-heading"
              className="font-serif text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight mb-4 leading-tight"
            >
              Be among the first parents to try Cache<span className="text-terracotta">.</span>
            </h2>
            
            {/* Paragraph */}
            <p 
              id="final-cta-paragraph"
              className="font-sans text-sm sm:text-base text-cream/80 max-w-lg mb-10 leading-relaxed"
            >
              Join the waitlist now. We'll invite parents as spots open and ask what would make Cache most useful for everyday family life.
            </p>

            {/* Email form container */}
            <div 
              id="final-cta-form-container"
              className="w-full max-w-md"
            >
              <WaitlistForm
                idPrefix="cta"
                isDarkTheme={true}
                buttonLabel="Get early access"
                supportingCopy="Email only. We'll use it for early-access invitations and occasional research messages."
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
