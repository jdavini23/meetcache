import { motion } from 'motion/react';

export default function CalmPlant() {
  return (
    <div className="relative w-36 h-36 flex items-center justify-center select-none pointer-events-none">
      {/* Glow behind the plant */}
      <div className="absolute w-20 h-20 bg-sage/10 rounded-full blur-xl animate-pulse" />

      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Pot / Ground Line */}
        <motion.path
          d="M20 85C35 85 65 85 80 85"
          stroke="#2b2622"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.2 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />

        {/* Stem - grows upwards and gently sways */}
        <motion.path
          d="M50 85C48 65 44 45 50 25"
          stroke="#6d7d63"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ 
            pathLength: 1,
            d: [
              "M50 85C48 65 44 45 50 25",
              "M50 85C51 64 47 46 52 25",
              "M50 85C46 66 42 44 48 25",
              "M50 85C48 65 44 45 50 25"
            ]
          }}
          transition={{
            pathLength: { duration: 2, ease: 'easeInOut' },
            d: {
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut'
            }
          }}
        />

        {/* Left Leaf - sprouts and sways/pulses */}
        <motion.g
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.2, duration: 1, ease: 'easeOut' }}
        >
          <motion.path
            d="M48 60C38 58 30 48 35 40C43 42 47 50 48 60Z"
            fill="#6d7d63"
            fillOpacity="0.85"
            stroke="#6d7d63"
            strokeWidth="1"
            animate={{
              scale: [1, 1.05, 0.98, 1],
              rotate: [0, -3, 2, 0],
            }}
            transition={{
              duration: 7,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 0.5
            }}
            style={{ transformOrigin: '48px 60px' }}
          />
        </motion.g>

        {/* Right Leaf - terracotta warm sprout */}
        <motion.g
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.5, duration: 1, ease: 'easeOut' }}
        >
          <motion.path
            d="M50 45C60 43 68 33 63 25C55 27 51 35 50 45Z"
            fill="#c9603f"
            fillOpacity="0.85"
            stroke="#c9603f"
            strokeWidth="1"
            animate={{
              scale: [1, 0.96, 1.04, 1],
              rotate: [0, 4, -2, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 1.2
            }}
            style={{ transformOrigin: '50px 45px' }}
          />
        </motion.g>

        {/* Tiny top leaf buds */}
        <motion.circle
          cx="50"
          cy="25"
          r="2.5"
          fill="#c9603f"
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{
            scale: { repeat: Infinity, duration: 4, ease: 'easeInOut' },
            default: { delay: 1.8, duration: 0.5 }
          }}
        />
      </svg>
    </div>
  );
}
