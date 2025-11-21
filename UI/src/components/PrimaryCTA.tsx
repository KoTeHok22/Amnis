import React from 'react';
import { motion } from 'motion/react';

interface PrimaryCTAProps {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
  size?: 'default' | 'large';
}

export function PrimaryCTA({ children, onClick, icon, className = '', size = 'default' }: PrimaryCTAProps) {
  const sizeClasses = size === 'large' 
    ? 'h-12 sm:h-14 px-8 sm:px-10 text-[14px] sm:text-[15px]' 
    : 'h-10 sm:h-12 px-6 sm:px-8 text-[13px] sm:text-[15px]';
  
  return (
    <motion.button
      onClick={onClick}
      className={`${sizeClasses} rounded-full bg-[#F4E0A7] text-[#0D0B24] flex items-center justify-center gap-2 sm:gap-2.5 transition-all tracking-wider uppercase ${className}`}
      style={{
        boxShadow: '0 4px 24px rgba(244, 224, 167, 0.3), 0 0 1px rgba(244, 224, 167, 0.8) inset',
        fontFamily: 'Bainsley, serif',
        fontWeight: 700,
        letterSpacing: '0.08em',
      }}
      whileHover={{
        scale: 1.02,
        boxShadow: '0 6px 32px rgba(244, 224, 167, 0.45), 0 0 1px rgba(244, 224, 167, 0.8) inset',
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      {icon}
      <span className="whitespace-nowrap font-body">{children}</span>
    </motion.button>
  );
}