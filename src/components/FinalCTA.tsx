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
            {/* Heading */}
            <h2 
              id="final-cta-heading"
              className="font-serif text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight mb-4 leading-tight"
            >
              Be first in line<span className="text-terracotta">.</span>
            </h2>
            
            {/* Paragraph */}
            <p 
              id="final-cta-paragraph"
              className="font-sans text-sm sm:text-base text-cream/80 max-w-lg mb-10 leading-relaxed"
            >
              We are a small team of parents building a quiet, honest alternative to the noisy web. We are opening our private beta slowly to make sure we can support every family personally. Save your spot today, and we will send you an invite the moment we have space for you.
            </p>

            {/* Email form container */}
            <div 
              id="final-cta-form-container"
              className="w-full max-w-md"
            >
              <WaitlistForm idPrefix="cta" isDarkTheme={true} />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
