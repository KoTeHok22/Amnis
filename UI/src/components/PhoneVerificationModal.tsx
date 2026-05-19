import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PrimaryCTA } from './PrimaryCTA';
import { SparkleIcon } from './SparkleIcon';
import { X, Moon, Check } from 'lucide-react';

interface PhoneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: () => void;
  phoneNumber: string;
  isRegistration: boolean;
}

type Step = 'code' | 'success';

export function PhoneVerificationModal({ 
  isOpen, 
  onClose, 
  onVerify, 
  phoneNumber, 
  isRegistration 
}: PhoneVerificationModalProps) {
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState(['', '', '', '']);
  const [isCodeValid, setIsCodeValid] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('code');
      setCode(['', '', '', '']);
      setIsCodeValid(false);
      // Focus the first input when the modal opens
      setTimeout(() => inputRefs.current[0]?.focus(), 300);
    }
  }, [isOpen]);

  const handleCodeChange = (index: number, value: string) => {
    if (/^\d*$/.test(value) && value.length <= 1) {
      const newCode = [...code];
      newCode[index] = value;
      setCode(newCode);

      // Move to next input if a digit was entered and not the last input
      if (value !== '' && index < 3) {
        inputRefs.current[index + 1]?.focus();
      }

      // Check if code is complete
      const isComplete = newCode.every(digit => digit !== '');
      setIsCodeValid(isComplete && newCode.join('').length === 4);
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && code[index] === '' && index > 0) {
      // Move to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCodeValid) {
      // For now, just complete verification
      // In real app, you would verify with backend
      setStep('success');
      setTimeout(() => {
        onVerify();
      }, 2000); // Increased delay for the animation to be seen
    }
  };

  const handleResendCode = () => {
    // In a real app, this would resend the code
    alert('Код отправлен повторно!');
    setCode(['', '', '', '']);
    inputRefs.current[0]?.focus();
    setIsCodeValid(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-[rgba(13,11,36,0.85)] backdrop-blur-xl"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-[32px] p-8 sm:p-10 max-w-md w-full relative max-h-[85vh] bg-gradient-to-br from-[rgba(26,22,64,0.95)] to-[rgba(37,31,92,0.9)] border border-[rgba(169,152,255,0.3)] backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5),0_0_1px_rgba(169,152,255,0.5)_inset] will-change-transform overflow-hidden"
          >
            <SparkleIcon className="absolute top-6 left-6 text-[#F4E0A7]" size={18} delay={0} />
            <SparkleIcon className="absolute top-6 right-20 text-[#A998FF]" size={16} delay={0.5} />
            <SparkleIcon className="absolute bottom-6 left-12 text-[#A998FF]" size={14} delay={1} />
            <SparkleIcon className="absolute bottom-6 right-6 text-[#F4E0A7]" size={20} delay={0.7} />

            {/* Glow effect */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#A998FF] rounded-full blur-[100px]" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#F4E0A7] rounded-full blur-[100px]" />
            </div>

            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-[#B8B5D1] hover:text-[#E8E6F5] transition-colors p-2 rounded-xl hover:bg-[rgba(169,152,255,0.1)] z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 mx-auto bg-gradient-to-br from-[rgba(169,152,255,0.3)] to-[rgba(244,224,167,0.25)] shadow-[0_0_24px_rgba(169,152,255,0.4)]">
                <Moon className="w-8 h-8 text-[#F4E0A7]" />
              </div>

              {step === 'code' && (
                <motion.div
                  key="code"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <h2 className="text-[#F4E0A7] mb-3 font-mystical">
                    Подтверждение телефона
                  </h2>
                  <p className="text-[#B8B5D1] mb-8 leading-relaxed text-sm sm:text-base font-accent" style={{ fontStyle: 'italic' }}>
                    Введите код, отправленный на номер <br/> <span className="text-[#E8E6F5] font-medium">{phoneNumber}</span>
                  </p>

                  <form onSubmit={handleCodeSubmit} className="space-y-6">
                    <div className="flex justify-center gap-3 sm:gap-4 mb-2">
                      {code.map((digit, index) => (
                        <motion.input
                          key={index}
                          ref={(el) => (inputRefs.current[index] = el)}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleCodeChange(index, e.target.value)}
                          onKeyDown={(e) => handleCodeKeyDown(index, e)}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{
                            delay: index * 0.05,
                            type: 'spring',
                            stiffness: 300,
                            damping: 15
                          }}
                          className={`w-14 h-14 sm:w-16 sm:h-16 text-center text-2xl font-tech rounded-2xl bg-[rgba(13,11,36,0.6)] text-[#E8E6F5] border-2 outline-none transition-all duration-300 backdrop-blur-sm ${
                            isCodeValid
                              ? 'border-green-400/50 bg-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                              : 'border-[rgba(169,152,255,0.25)] focus:border-[#A998FF] focus:shadow-[0_0_20px_rgba(169,152,255,0.4)]'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="h-8">
                      {isCodeValid && (
                        <motion.div
                          initial={{ y: 10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="flex items-center justify-center gap-2 text-green-400"
                        >
                          <Check className="w-5 h-5" />
                          <span className="text-sm">Код верный</span>
                        </motion.div>
                      )}
                    </div>

                    <PrimaryCTA
                      className="w-full"
                      disabled={!isCodeValid}
                    >
                      {isRegistration ? 'Завершить регистрацию' : 'Войти'}
                    </PrimaryCTA>

                    <p className="text-[#B8B5D1] text-xs text-center opacity-70 pt-2">
                      Не получили код?{' '}
                      <button
                        type="button"
                        onClick={handleResendCode}
                        className="text-[#A998FF] hover:text-[#F4E0A7] transition-colors underline"
                      >
                        Отправить повторно
                      </button>
                    </p>
                  </form>
                </motion.div>
              )}

              {step === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 10 }}
                    className="w-20 h-20 rounded-full flex items-center justify-center mb-6 mx-auto bg-gradient-to-br from-[rgba(34,197,94,0.3)] to-[rgba(54,211,152,0.25)] shadow-[0_0_30px_rgba(34,197,94,0.5)]"
                  >
                    <Check className="w-10 h-10 text-[#34D399]" />
                  </motion.div>

                  <h2 className="text-[#F4E0A7] mb-3 font-mystical">
                    {isRegistration ? 'Успешная регистрация!' : 'Успешный вход!'}
                  </h2>
                  <p className="text-[#B8B5D1] text-base sm:text-lg mb-4 leading-relaxed font-accent" style={{ fontStyle: 'italic' }}>
                    Ваш номер {phoneNumber} подтвержден
                  </p>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-[#E8E6F5] font-accent" style={{ fontStyle: 'italic' }}
                  >
                    {isRegistration
                      ? 'Добро пожаловать в Amnis!'
                      : 'Рады видеть вас снова!'}
                  </motion.div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
