import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import WaitlistForm from './WaitlistForm';
import CalmPlant from './CalmPlant';

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();

  // Scroll-responsive background shifts for abstract organic shapes
  const yShape1 = useTransform(scrollY, [0, 800], [0, -60]);
  const yShape2 = useTransform(scrollY, [0, 800], [0, 80]);
  const rotateShape = useTransform(scrollY, [0, 800], [0, 25]);

  return (
    <section 
      id="hero-section"
      ref={containerRef}
      className="relative px-6 pt-4 pb-10 sm:pt-10 sm:pb-20 md:pt-16 md:pb-28 flex flex-col items-center text-center overflow-hidden"
    >
      {/* Scroll-responsive natural abstract shapes (sage & terracotta) */}
      <motion.div
        id="bg-organic-shape-1"
        style={{ y: yShape1, rotate: rotateShape }}
        className="absolute top-[15%] left-[5%] md:left-[10%] w-16 h-16 md:w-24 md:h-24 bg-sage/10 rounded-[40%_60%_70%_30%_/_40%_50%_60%_50%] pointer-events-none blur-[1px] hidden sm:block"
        animate={{
          borderRadius: [
            "40% 60% 70% 30% / 40% 50% 60% 50%",
            "60% 40% 50% 50% / 50% 60% 40% 60%",
            "40% 60% 70% 30% / 40% 50% 60% 50%"
          ]
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      <motion.div
        id="bg-organic-shape-2"
        style={{ y: yShape2, rotate: rotateShape }}
        className="absolute top-[40%] right-[5%] md:right-[12%] w-20 h-20 md:w-28 md:h-28 bg-terracotta/10 rounded-[60%_40%_30%_70%_/_50%_30%_70%_50%] pointer-events-none blur-[1px] hidden sm:block"
        animate={{
          borderRadius: [
            "60% 40% 30% 70% / 50% 30% 70% 50%",
            "40% 60% 60% 40% / 60% 50% 50% 60%",
            "60% 40% 30% 70% / 50% 30% 70% 50%"
          ]
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1
        }}
      />

      {/* Visual background subtle glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sage/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-terracotta/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center">
        {/* Soft, Growing/Swaying Plant Illustration */}
        <motion.div
          id="hero-plant"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="h-14 w-20 sm:h-24 sm:w-24 md:h-32 md:w-32 flex items-center justify-center mb-1 sm:mb-2 [&>div]:scale-[0.48] sm:[&>div]:scale-75 md:[&>div]:scale-100"
        >
          <CalmPlant />
        </motion.div>

        {/* Eyebrow Pill */}
        <motion.div
          id="hero-eyebrow"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sage/10 border border-sage/20 text-[10px] sm:text-xs font-medium tracking-wide text-sage uppercase mb-4 sm:mb-7"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sage animate-pulse" />
          <span>For parents of children ages 1–6</span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          id="hero-headline"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="font-serif text-[34px] sm:text-5xl md:text-[64px] leading-[1.08] md:leading-[1.06] font-medium tracking-tight text-ink max-w-4xl"
        >
          Parenting guidance that remembers <span className="text-terracotta italic font-serif">what works</span> for your child.
        </motion.h1>

        {/* Subhead */}
        <motion.p
          id="hero-subhead"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="font-sans text-[15px] sm:text-lg md:text-xl text-ink/80 leading-relaxed max-w-2xl mt-4 sm:mt-6 mb-5 sm:mb-9"
        >
          When bedtime, big emotions, routines, or transitions get hard, Cache uses the context you share and what you have already tried to suggest a practical next step.
        </motion.p>

        {/* Form Container */}
        <motion.div
          id="hero-form-wrapper"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="w-full max-w-md"
        >
          <WaitlistForm
            idPrefix="hero"
            heading="Get early access"
            buttonLabel="Get early access"
            supportingCopy="Join the waitlist. We'll send invitations as spots open and occasional opportunities to help shape Cache."
          />
        </motion.div>
      </div>
    </section>
  );
}
