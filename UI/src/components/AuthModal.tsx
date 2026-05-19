import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PrimaryCTA } from './PrimaryCTA';
import { SparkleIcon } from './SparkleIcon';
import { PhoneVerificationModal } from './PhoneVerificationModal';
import { ResetPasswordModal } from './ResetPasswordModal';
import { X, Moon, Phone, Lock, Eye, EyeOff } from 'lucide-react';
import { registerUser, loginUser } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuth: () => void;
}

type AuthMode = 'login' | 'register' | 'verify';

import React, { useState, useEffect } from 'react';

export function AuthModal({ isOpen, onClose, onAuth }: AuthModalProps) {
  const { login } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [phoneNumber, setPhoneNumber] = useState('');

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
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [countryCode, setCountryCode] = useState('ru'); // Default to Russia

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!isValidPhoneNumber(phoneNumber)) {
        setError('Пожалуйста, введите действительный номер телефона');
        setLoading(false);
        return;
      }

      if (!isValidPassword()) {
        setLoading(false);
        return;
      }

      if (mode === 'register' && password !== confirmPassword) {
        setError('Пароли не совпадают');
        setLoading(false);
        return;
      }

      if (mode === 'register') {
        if (!name.trim()) {
          setError('Пожалуйста, введите ваше имя');
          setLoading(false);
          return;
        }

        if (!birthDate) {
          setError('Пожалуйста, введите вашу дату рождения');
          setLoading(false);
          return;
        }

        if (!isValidDate(birthDate)) {
          setError('Пожалуйста, введите корректную дату рождения (ГГГГ-ММ-ДД)');
          setLoading(false);
          return;
        }

        const registrationResult = await registerUser(phoneNumber, password, name, birthDate);

        // Trigger phone verification modal as a stub for code input during registration
        setShowPhoneVerification(true);
      } else {
        const loginResult = await loginUser(phoneNumber, password);
        login(loginResult.access_token);
        onAuth();
        onClose();
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      setError(err.detail || 'Произошла ошибка при аутентификации');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setPhoneNumber('');
    setName('');
    setBirthDate('');
    setPassword('');
    setConfirmPassword('');
    setCountryCode('ru');
  };

  const isValidPhoneNumber = (phone: string) => {
    // Remove all non-digit characters
    const digitsOnly = phone.replace(/\D/g, '');

    // Check if it has at least 10 digits (minimum for most countries)
    // Russian numbers start with 7, US with 1, etc.
    if (digitsOnly.length < 10) {
      return false;
    }

    // Basic validation based on country codes
    if (phone.startsWith('+1') || phone.startsWith('1')) {
      // US/Canada: 11 digits including country code
      return digitsOnly.length === 11;
    } else if (phone.startsWith('+7') || phone.startsWith('7')) {
      // Russia: 11 digits including country code
      return digitsOnly.length === 11;
    } else if (phone.startsWith('+44') || phone.startsWith('44')) {
      // UK: 11 digits including country code
      return digitsOnly.length === 11;
    } else if (phone.startsWith('+33') || phone.startsWith('33')) {
      // France: 10 digits including country code
      return digitsOnly.length === 10;
    } else if (phone.startsWith('+49') || phone.startsWith('49')) {
      // Germany: 10-11 digits including country code
      return digitsOnly.length >= 10 && digitsOnly.length <= 11;
    } else if (phone.startsWith('+81') || phone.startsWith('81')) {
      // Japan: 10-11 digits including country code
      return digitsOnly.length >= 10 && digitsOnly.length <= 11;
    } else if (phone.startsWith('+86') || phone.startsWith('86')) {
      // China: 11 digits including country code
      return digitsOnly.length === 11;
    } else if (phone.startsWith('+91') || phone.startsWith('91')) {
      // India: 11 digits including country code
      return digitsOnly.length === 11;
    } else if (phone.startsWith('+55') || phone.startsWith('55')) {
      // Brazil: 11-12 digits including country code
      return digitsOnly.length >= 11 && digitsOnly.length <= 12;
    } else {
      // For other countries, assume minimum 10 digits
      return digitsOnly.length >= 10;
    }
  };

  const isValidPassword = () => {
    if (password.length < 6) {
      alert('Пароль должен содержать минимум 6 символов');
      return false;
    }

    if (mode === 'register') {
      // For registration, check password complexity
      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumbers = /\d/.test(password);

      if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
        alert('Пароль должен содержать хотя бы одну заглавную букву, одну строчную букву и одну цифру');
        return false;
      }
    }

    return true;
  };

  const isValidDate = (dateString: string) => {
    // Check if the date is in YYYY-MM-DD format
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(dateString)) {
      return false;
    }

    // Check if it's a valid date
    const date = new Date(dateString);
    const timestamp = date.getTime();

    // Invalid dates like '2023-02-30' will return NaN
    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
      return false;
    }

    // Check if the date from the input matches the actual date
    const [year, month, day] = dateString.split('-').map(Number);
    return date.getFullYear() === year &&
           date.getMonth() + 1 === month &&
           date.getDate() === day;
  };

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

  return (
    <>
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
              className="rounded-[32px] max-w-lg w-full relative bg-gradient-to-br from-[rgba(26,22,64,0.95)] to-[rgba(37,31,92,0.9)] border border-[rgba(169,152,255,0.3)] backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5),0_0_1px_rgba(169,152,255,0.5)_inset] will-change-transform max-h-[85vh] overflow-hidden"
            >
              <div className="p-6 sm:p-8 overflow-y-auto max-h-[calc(85vh-4rem)] flex-1">
            <SparkleIcon className="absolute top-6 left-6 text-[#F4E0A7]" size={18} delay={0} />
            <SparkleIcon className="absolute top-6 right-20 text-[#A998FF]" size={16} delay={0.5} />
            <SparkleIcon className="absolute bottom-6 left-12 text-[#A998FF]" size={14} delay={1} />
            <SparkleIcon className="absolute bottom-6 right-6 text-[#F4E0A7]" size={20} delay={0.7} />

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

              <div className="relative">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto bg-gradient-to-br from-[rgba(169,152,255,0.3)] to-[rgba(244,224,167,0.25)] shadow-[0_0_24px_rgba(169,152,255,0.4)]">
                  <Moon className="w-8 h-8 text-[#F4E0A7]" />
                </div>

                <h2 className="text-[#F4E0A7] mb-3 text-center font-mystical">
                  {mode === 'login' ? (
                    <>Вход в <span className="font-tech">Amnis</span></>
                  ) : (
                    <>Регистрация в <span className="font-tech">Amnis</span></>
                  )}
                </h2>
                <p className="text-[#B8B5D1] mb-5 leading-relaxed text-center text-sm sm:text-base font-accent" style={{ fontStyle: 'italic' }}>
                  {mode === 'login'
                    ? 'Войдите в свой аккаунт, чтобы продолжить путешествие в мир снов'
                    : 'Создайте аккаунт и начните раскрывать послания вашего подсознания'
                  }
                </p>

                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                  <div>
                    <label htmlFor="phone" className="block text-[#E8E6F5] mb-2.5 sm:mb-3 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[#A998FF]" />
                      <span>Номер телефона</span>
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        id="phone"
                        value={phoneNumber}
                        onChange={handlePhoneChange}
                        className="w-full h-12 px-5 pr-4 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 placeholder-[rgba(184,181,209,0.5)] backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                        placeholder="+7 (999) 123-45-67"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-[#E8E6F5] mb-2.5 sm:mb-3 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#A998FF]" />
                      <span>Пароль</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        className="w-full h-12 px-5 pr-14 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 placeholder-[rgba(184,181,209,0.5)] backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                        placeholder="••••••••"
                        required
                        minLength={6}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B8B5D1] hover:text-[#E8E6F5] transition-colors p-1"
                        disabled={loading}
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {mode === 'register' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                      <label htmlFor="name" className="block text-[#E8E6F5] mb-2.5 sm:mb-3 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#A998FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>Имя</span>
                      </label>
                      <div className="relative mb-4">
                        <input
                          type="text"
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full h-12 px-5 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 placeholder-[rgba(184,181,209,0.5)] backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                          placeholder="Ваше имя"
                          required={mode === 'register'}
                          disabled={loading}
                        />
                      </div>

                      <label htmlFor="birthDate" className="block text-[#E8E6F5] mb-2.5 sm:mb-3 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#A998FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>Дата рождения</span>
                      </label>
                      <div className="relative mb-4">
                        <input
                          type="date"
                          id="birthDate"
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                          className="w-full h-12 px-5 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 placeholder-[rgba(184,181,209,0.5)] backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                          required={mode === 'register'}
                          disabled={loading}
                          max={new Date().toISOString().split('T')[0]}
                        />
                      </div>

                      <label htmlFor="confirmPassword" className="block text-[#E8E6F5] mb-2.5 sm:mb-3 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-[#A998FF]" />
                        <span>Повторите пароль</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          id="confirmPassword"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          className="w-full h-12 px-5 pr-14 rounded-2xl bg-[rgba(13,11,36,0.5)] text-[#E8E6F5] border border-[rgba(169,152,255,0.2)] focus:border-[rgba(169,152,255,0.6)] outline-none transition-all duration-300 placeholder-[rgba(184,181,209,0.5)] backdrop-blur-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(169,152,255,0.05)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_0_16px_rgba(169,152,255,0.15),inset_0_0_0_1px_rgba(169,152,255,0.1)]"
                          placeholder="••••••••"
                          required={mode === 'register'}
                          minLength={6}
                          disabled={loading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B8B5D1] hover:text-[#E8E6F5] transition-colors p-1"
                          disabled={loading}
                        >
                          {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {mode === 'login' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="text-right"
                    >
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(true)}
                        className="text-[#A998FF] hover:text-[#F4E0A7] transition-colors text-sm"
                        disabled={loading}
                      >
                        Забыли пароль?
                      </button>
                    </motion.div>
                  )}

                  <PrimaryCTA className="w-full mt-4 sm:mt-6" disabled={loading}>
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span className="ml-2">Загрузка...</span>
                      </div>
                    ) : (
                      mode === 'login' ? 'Войти' : 'Зарегистрироваться'
                    )}
                  </PrimaryCTA>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-[#B8B5D1] text-sm">
                    {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
                    {' '}
                    <button
                      onClick={toggleMode}
                      className="text-[#A998FF] hover:text-[#F4E0A7] transition-colors"
                    >
                      {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
                    </button>
                  </p>
                </div>

                <p className="text-[#B8B5D1] text-xs text-center mt-6 opacity-70">
                  Ваши данные защищены и используются только для персонализации
                </p>
              </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PhoneVerificationModal
        isOpen={showPhoneVerification}
        onClose={() => setShowPhoneVerification(false)}
        onVerify={async () => {
          // Complete the registration/login process after phone verification
          setShowPhoneVerification(false);
          if (mode === 'register') {
            // Since registration already happened and we're just using this as a stub verification,
            // we can complete the registration process now.
            // The registration API call already returned the user data and token.
            try {
              // If we have already called registerUser, we might need to use the results from the previous call
              // For now, let's implement it as a stub - just complete the registration
              // In a real implementation, we would verify the code with the backend

              // Since registration already happened and returned, the user is already registered
              // We can just close the modal and trigger the auth flow
              onAuth();
              onClose();
            } catch (error) {
              console.error('Error completing registration:', error);
            }
          } else if (mode === 'login') {
            const loginResult = await import('../services/api').then(api =>
              api.loginUser(phoneNumber, password)
            );
            login(loginResult.access_token);
            onAuth();
            onClose();
          }
        }}
        phoneNumber={phoneNumber}
        isRegistration={mode === 'register'}
      />

      <ResetPasswordModal
        isOpen={showResetPassword}
        onClose={() => setShowResetPassword(false)}
        onReset={() => {
          setShowResetPassword(false);
        }}
      />
    </>
  );
}
