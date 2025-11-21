import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface SparkleIconProps {
  className?: string;
  size?: number;
  delay?: number;
}

export function SparkleIcon({ className = '', size = 16, delay = 0 }: SparkleIconProps) {
  return (
    <motion.div
      className={`inline-block will-change-transform ${className}`}
      animate={{
        opacity: [0.4, 1, 0.4],
        scale: [0.8, 1, 0.8],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: delay,
      }}
    >
      <Sparkles className={`w-${size} h-${size}`} style={{ width: size, height: size }} />
    </motion.div>
  );
}

const sparklesData = [
  { top: '10%', left: '15%', size: 20, delay: 0, duration: 3 },
  { top: '20%', right: '20%', size: 16, delay: 0.5, duration: 2.5 },
  { top: '60%', left: '10%', size: 18, delay: 1, duration: 2.8 },
  { top: '70%', right: '15%', size: 14, delay: 1.5, duration: 3.2 },
  { top: '40%', left: '25%', size: 12, delay: 0.8, duration: 2.6 },
  { top: '50%', right: '30%', size: 15, delay: 1.2, duration: 2.9 },
];

export function FloatingSparkles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {sparklesData.map((sparkle, index) => (
        <motion.div
          key={index}
          className="absolute text-[#F4E0A7] will-change-transform"
          style={{
            top: sparkle.top,
            left: sparkle.left,
            right: sparkle.right,
          }}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            scale: [0.8, 1.2, 0.8],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: sparkle.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: sparkle.delay,
          }}
        >
          <Sparkles style={{ width: sparkle.size, height: sparkle.size }} />
        </motion.div>
      ))}
    </div>
  );
}
