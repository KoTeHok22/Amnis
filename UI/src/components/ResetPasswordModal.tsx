import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PrimaryCTA } from './PrimaryCTA';
import { SparkleIcon } from './SparkleIcon';
import { X, Phone, Lock, Eye, EyeOff, Check } from 'lucide-react';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
}

type Step = 'phone' | 'code' | 'newPassword' | 'success';

export function ResetPasswordModal({ isOpen, onClose, onReset }: ResetPasswordModalProps) {
  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState(['', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [countryCode, setCountryCode] = useState('ru');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setStep('phone');
      setPhoneNumber('');
      setCode(['', '', '', '']);
      setNewPassword('');
      setConfirmPassword('');
      setIsCodeValid(false);
      setCountryCode('ru');
    }
  }, [isOpen]);

  const detectCountryFromPhone = (phone: string) => {
    if (phone.startsWith('+1') || phone.startsWith('1')) {
      return 'us';
    } else if (phone.startsWith('+44') || phone.startsWith('44')) {
      return 'gb';
    } else if (phone.startsWith('+33') || phone.startsWith('33')) {
      return 'fr';
    } else if (phone.startsWith('+49') || phone.startsWith('49')) {
      return 'de';
    } else if (phone.startsWith('+81') || phone.startsWith('81')) {
      return 'jp';
    } else if (phone.startsWith('+86') || phone.startsWith('86')) {
      return 'cn';
    } else if (phone.startsWith('+91') || phone.startsWith('91')) {
      return 'in';
    } else if (phone.startsWith('+55') || phone.startsWith('55')) {
      return 'br';
    } else if (phone.startsWith('+7')) {
      return 'ru';
    } else {
      return 'ru';
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhoneNumber(value);
    if (value.length > 2) {
      setCountryCode(detectCountryFromPhone(value));
    }
  };

  // Get flag emoji based on country code
  const getFlagEmoji = (countryCode: string) => {
    switch (countryCode.toLowerCase()) {
      case 'ru': return '🇷🇺';
      case 'us': return '🇺🇸';
      case 'gb': return '🇬🇧';
      case 'fr': return '🇫🇷';
      case 'de': return '🇩🇪';
      case 'jp': return '🇯🇵';
      case 'cn': return '🇨🇳';
      case 'in': return '🇮🇳';
      case 'br': return '🇧🇷';
      case 'es': return '🇪🇸';
      case 'it': return '🇮🇹';
      case 'ca': return '🇨🇦';
      case 'au': return '🇦🇺';
      default: return '🌍';
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (/^\d*$/.test(value) || value === '') {
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

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate phone number
    if (phoneNumber.length < 10) {
      alert('Пожалуйста, введите действительный номер телефона');
      return;
    }
    // Move to code step
    setStep('code');
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCodeValid) {
      // Move to new password step
      setStep('newPassword');
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password length
    if (newPassword.length < 6) {
      alert('Пароль должен содержать минимум 6 символов');
      return;
    }

    // Check password complexity
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumbers = /\d/.test(newPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      alert('Пароль должен содержать хотя бы одну заглавную букву, одну строчную букву и одну цифру');
      return;
    }

    // Validate if passwords match
    if (newPassword !== confirmPassword) {
      alert('Пароли не совпадают');
      return;
    }

    // Move to success step
    setStep('success');
    setTimeout(() => {
      onReset();
      onClose();
    }, 1500);
  };

  const handleResendCode = () => {
    // In a real app, this would resend the code
    setCode(['', '', '', '']);
    inputRefs.current[0]?.focus();
    setIsCodeValid(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative bg-[#1A1640] rounded-3xl p-6 sm:p-8 w-full max-w-lg max-h-[85vh] overflow-y-auto"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-[#B8B5D1] hover:text-[#E8E6F5] transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex justify-center mb-6 sm:mb-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-[rgba(169,152,255,0.3)] to-[rgba(244,224,167,0.25)] shadow-[0_0_24px_rgba(169,152,255,0.4)]">
                <Phone className="w-8 h-8 text-[#F4E0A7]" />
              </div>
            </div>

            {step === 'phone' && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <h2 className="text-[#F4E0A7] mb-3 text-center font-mystical">
                  Восстановление пароля
                </h2>
                <p className="text-[#B8B5D1] mb-8 leading-relaxed text-center text-sm sm:text-base font-accent" style={{ fontStyle: 'italic' }}>
                  Введите ваш номер телефона, чтобы получить код для восстановления доступа
                </p>

                <form onSubmit={handlePhoneSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="reset-phone" className="block text-[#E8E6F5] mb-3 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[#A998FF]" />
                      <span>Номер телефона</span>
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        id="reset-phone"
                        value={phoneNumber}
                        onChange={handlePhoneChange}
                        className="w-full h-12 px-5 pr-4 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 placeholder-[rgba(184,181,209,0.5)] backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                        placeholder="+7 (999) 123-45-67"
                        required
                      />
                    </div>
                  </div>

                  <PrimaryCTA className="w-full mt-6">
                    Отправить код
                  </PrimaryCTA>
                </form>
              </motion.div>
            )}

            {step === 'code' && (
              <motion.div
                key="code"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <h2 className="text-[#F4E0A7] mb-3 text-center font-mystical">
                  Подтверждение телефона
                </h2>
                <p className="text-[#B8B5D1] mb-8 leading-relaxed text-center text-sm sm:text-base font-accent" style={{ fontStyle: 'italic' }}>
                  Введите код, отправленный на {phoneNumber}
                </p>

                <form onSubmit={handleCodeSubmit} className="space-y-6">
                  <div className="flex justify-center gap-3 mb-6">
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
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ 
                          scale: 1, 
                          opacity: 1,
                          borderColor: isCodeValid 
                            ? 'rgba(34, 197, 94, 0.6)' 
                            : digit 
                            ? 'rgba(169, 152, 255, 0.6)' 
                            : 'rgba(169, 152, 255, 0.25)'
                        }}
                        transition={{ 
                          delay: index * 0.1,
                          duration: 0.3,
                          type: 'spring',
                          stiffness: 260,
                          damping: 20
                        }}
                        className={`w-14 h-14 sm:w-16 sm:h-16 text-center rounded-2xl bg-[rgba(13,11,36,0.6)] text-[#E8E6F5] border-2 outline-none transition-all backdrop-blur-sm ${
                          isCodeValid 
                            ? 'bg-[rgba(34,197,94,0.1)] shadow-[0_0_20px_rgba(34,197,94,0.3)]' 
                            : ''
                        }`}
                      />
                    ))}
                  </div>

                  {isCodeValid && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ 
                        type: 'spring',
                        stiffness: 260,
                        damping: 20
                      }}
                      className="flex items-center justify-center gap-2 text-green-400 mb-4"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        <Check className="w-5 h-5" />
                      </motion.div>
                      <span className="text-sm">Код подтвержден</span>
                    </motion.div>
                  )}

                  <p className="text-[#B8B5D1] text-xs text-center opacity-70">
                    Не получили код?{' '}
                    <button 
                      type="button"
                      onClick={handleResendCode}
                      className="text-[#A998FF] hover:text-[#F4E0A7] transition-colors"
                    >
                      Отправить повторно
                    </button>
                  </p>

                  <PrimaryCTA 
                    className="w-full mt-6" 
                    disabled={!isCodeValid}
                  >
                    Продолжить
                  </PrimaryCTA>
                </form>
              </motion.div>
            )}

            {step === 'newPassword' && (
              <motion.div
                key="newPassword"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <h2 className="text-[#F4E0A7] mb-3 text-center font-mystical">
                  Новый пароль
                </h2>
                <p className="text-[#B8B5D1] mb-8 leading-relaxed text-center text-sm sm:text-base font-accent" style={{ fontStyle: 'italic' }}>
                  Придумайте надежный пароль для вашего аккаунта
                </p>

                <form onSubmit={handlePasswordSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="new-password" className="block text-[#E8E6F5] mb-3 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#A998FF]" />
                      <span>Новый пароль</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        id="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full h-12 px-5 pr-14 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 placeholder-[rgba(184,181,209,0.5)] backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                        placeholder="••••••••"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B8B5D1] hover:text-[#E8E6F5] transition-colors p-1"
                      >
                        {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirm-new-password" className="block text-[#E8E6F5] mb-3 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#A998FF]" />
                      <span>Подтверждение пароля</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        id="confirm-new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full h-12 px-5 pr-14 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 placeholder-[rgba(184,181,209,0.5)] backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                        placeholder="••••••••"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B8B5D1] hover:text-[#E8E6F5] transition-colors p-1"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <PrimaryCTA className="w-full mt-6">
                    Сменить пароль
                  </PrimaryCTA>
                </form>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="text-center"
              >
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 mx-auto bg-gradient-to-br from-[rgba(34,197,94,0.3)] to-[rgba(54,211,152,0.25)] shadow-[0_0_24px_rgba(34,197,94,0.4)]">
                  <Check className="w-8 h-8 text-[#34D399]" />
                </div>

                <h2 className="text-[#F4E0A7] mb-3 font-mystical">
                  Пароль изменен!
                </h2>
                <p className="text-[#B8B5D1] text-base sm:text-lg mb-6 leading-relaxed font-accent" style={{ fontStyle: 'italic' }}>
                  Ваш пароль успешно обновлен
                </p>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-[#E8E6F5] font-accent" style={{ fontStyle: 'italic' }}
                >
                  Теперь вы можете войти с новым паролем
                </motion.div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}