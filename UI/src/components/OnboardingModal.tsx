import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PrimaryCTA } from './PrimaryCTA';
import { SparkleIcon } from './SparkleIcon';
import { X, Moon, Calendar, User } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, birthDate: string) => void;
}

import React, { useState, useEffect } from 'react';

export function OnboardingModal({ isOpen, onClose, onSubmit }: OnboardingModalProps) {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && birthDate) {
      onSubmit(name, birthDate);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{
            backgroundColor: 'rgba(13, 11, 36, 0.85)',
            backdropFilter: 'blur(12px)',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-[32px] max-w-xl w-full relative max-h-[85vh] overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(26, 22, 64, 0.95), rgba(37, 31, 92, 0.9))',
              border: '1px solid rgba(169, 152, 255, 0.3)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 1px rgba(169, 152, 255, 0.5) inset',
            }}
          >
            <div className="p-10 overflow-y-auto max-h-[calc(85vh-4rem)] flex-1">
            <SparkleIcon className="absolute top-6 left-6 text-[#F4E0A7]" size={18} delay={0} />
            <SparkleIcon className="absolute top-6 right-20 text-[#A998FF]" size={16} delay={0.5} />
            <SparkleIcon className="absolute bottom-6 left-12 text-[#A998FF]" size={14} delay={1} />
            <SparkleIcon className="absolute bottom-6 right-6 text-[#F4E0A7]" size={20} delay={0.7} />
            
            {/* Glow effect */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#A998FF] rounded-full filter blur-[100px]" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#F4E0A7] rounded-full filter blur-[100px]" />
            </div>

            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-[#B8B5D1] hover:text-[#E8E6F5] transition-colors p-2 rounded-xl hover:bg-[rgba(169,152,255,0.1)] z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative">
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 relative"
                style={{
                  background: 'linear-gradient(135deg, rgba(169, 152, 255, 0.3), rgba(244, 224, 167, 0.25))',
                  boxShadow: '0 0 24px rgba(169, 152, 255, 0.4)',
                }}
              >
                <Moon className="w-8 h-8 text-[#F4E0A7]" />
              </div>

              <h2 className="text-[#F4E0A7] mb-3">
                <span className="font-tech">Amnis</span> приветствует вас
              </h2>
              <p className="text-[#B8B5D1] mb-8 leading-relaxed font-accent" style={{ fontSize: '17px', fontStyle: 'italic' }}>
                Для персонализированного толкования снов мне нужно узнать о вас немного больше. 
                Эти данные помогут глубже понять психологию вашего подсознания.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="name" className="block text-[#E8E6F5] mb-3 flex items-center gap-2">
                    <User className="w-4 h-4 text-[#A998FF]" />
                    <span>Ваше имя</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-12 px-5 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 placeholder-[rgba(184,181,209,0.5)] backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                    placeholder="Введите ваше имя"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="birthDate" className="block text-[#E8E6F5] mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#A998FF]" />
                    <span>Дата рождения</span>
                  </label>
                  <input
                    type="date"
                    id="birthDate"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full h-12 px-5 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                    required
                  />
                </div>

                <PrimaryCTA className="w-full mt-8">
                  Начать путешествие
                </PrimaryCTA>
              </form>

              <p className="text-[#B8B5D1] text-xs text-center mt-6 opacity-70">
                Ваши данные используются только для персонализации толкования
              </p>
            </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}