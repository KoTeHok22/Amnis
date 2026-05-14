import React from 'react';
import { motion } from 'motion/react';
import { PrimaryCTA } from './PrimaryCTA';
import { AnimatedBackground } from './StarField';
import { FloatingSparkles, SparkleIcon } from './SparkleIcon';
import { PricingSection } from './PricingSection';
import { Moon, Sparkles, MessageCircle, Brain, Compass, ArrowRight } from 'lucide-react';

interface LandingViewProps {
  onStartClick: () => void;
}

const features = [
  {
    icon: <Brain className="w-7 h-7" />,
    title: 'Глубинный анализ',
    description: 'Продвинутая интерпретация символов на основе психологии Юнга и современных исследований сновидений',
  },
  {
    icon: <MessageCircle className="w-7 h-7" />,
    title: 'Живой диалог',
    description: 'Интерактивная беседа с Amnis для раскрытия уникальных смыслов вашего подсознания',
  },
  {
    icon: <Compass className="w-7 h-7" />,
    title: 'Персонализация',
    description: 'Толкование с учетом вашего личного контекста, архетипов и жизненных обстоятельств',
  },
];

const steps = [
  { number: '01', title: 'Опишите сон', desc: 'Расскажите детали сновидения в свободной форме или голосом' },
  { number: '02', title: 'Диалог', desc: 'Amnis задаст уточняющие вопросы для глубокого понимания' },
  { number: '03', title: 'Откройте смыслы', desc: 'Получите развернутый анализ символов и их значений' },
  { number: '04', title: 'Глубокий анализ', desc: 'Получите глубокий анализ основанный на Вашей психологии' },
];

export function LandingView({ onStartClick }: LandingViewProps) {

  return (
    <div className="min-h-screen bg-[#0D0B24] relative overflow-hidden">
      <AnimatedBackground />
      <FloatingSparkles />

      {/* Hero Section */}
      <section className="relative z-10 px-4 sm:px-6 pt-16 sm:pt-20 md:pt-24 pb-20 sm:pb-28 md:pb-32 text-center">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-6 sm:mb-8 inline-flex items-center justify-center relative"
          >
            <SparkleIcon className="absolute -top-2 -left-2 text-[#F4E0A7]" size={20} delay={0} />
            <SparkleIcon className="absolute -bottom-2 -right-2 text-[#A998FF]" size={16} delay={0.5} />
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center relative bg-gradient-to-br from-[rgba(169,152,255,0.3)] to-[rgba(244,224,167,0.3)] backdrop-blur-sm shadow-[0_0_40px_rgba(169,152,255,0.4),inset_0_0_20px_rgba(255,255,255,0.1)]">
              <Moon className="w-10 h-10 sm:w-12 sm:h-12 text-[#F4E0A7]" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            <h1 className="text-[#E8E6F5] mb-4 sm:mb-6 leading-tight px-2 font-mystical">
              Раскройте послания
              <br />
              <span className="text-[#F4E0A7] inline-flex flex-wrap items-center gap-2 sm:gap-3 justify-center">
                вашего подсознания
                <SparkleIcon className="text-[#F4E0A7]" size={28} delay={0.3} />
              </span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="text-[#B8B5D1] text-base sm:text-lg mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed px-4 font-accent" style={{ fontSize: 'clamp(16px, 4vw, 19px)', fontStyle: 'italic' }}
          >
            <span className="text-[#E8E6F5] font-tech" style={{ fontWeight: 600 }}>Amnis</span> — ваш проводник в мир сновидений. 
            Глубинная интерпретация через призму юнгианской психологии и символизма.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="flex justify-center px-4"
          >
            <PrimaryCTA 
              onClick={onStartClick} 
              icon={<Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />}
              size="large"
            >
              Начать толкование сна
            </PrimaryCTA>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-4 sm:px-6 py-10 sm:py-14 md:py-16 border-t border-[rgba(169,152,255,0.1)]">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10 sm:mb-12 md:mb-14 relative px-4"
          >
            <SparkleIcon className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-8 text-[#F4E0A7]" size={24} delay={0} />
            <h2 className="text-[#E8E6F5] mb-3 sm:mb-4 font-mystical">Как это работает</h2>
            <p className="text-[#B8B5D1] max-w-xl mx-auto text-sm sm:text-base">
              Простой путь к глубинному пониманию ваших снов
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {steps.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="relative"
              >
                <SparkleIcon className="absolute -top-3 -right-3 text-[#A998FF]" size={16} delay={index * 0.3} />
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4 sm:mb-6 bg-gradient-to-br from-[rgba(169,152,255,0.2)] to-[rgba(244,224,167,0.1)] border border-[rgba(169,152,255,0.3)]">
                    <span className="text-[#A998FF] font-semibold number-symbol">{item.number}</span>
                  </div>
                  <h3 className="text-[#E8E6F5] mb-2 sm:mb-3 font-mystical">{item.title}</h3>
                  <p className="text-[#B8B5D1] leading-relaxed text-sm sm:text-base font-light">{item.desc}</p>
                </div>
                
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-7 left-[60%] w-[80%]">
                    <div className="h-[1px] bg-gradient-to-r from-[rgba(169,152,255,0.3)] to-transparent" />
                    <ArrowRight className="w-4 h-4 text-[#A998FF] opacity-40 absolute right-0 top-1/2 -translate-y-1/2" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-4 sm:px-6 py-10 sm:py-14 md:py-16 border-t border-[rgba(169,152,255,0.1)]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10 sm:mb-12 md:mb-14 relative px-4"
          >
            <SparkleIcon className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-8 text-[#F4E0A7]" size={24} delay={0.2} />
            <h2 className="text-[#E8E6F5] mb-3 sm:mb-4 font-mystical">Возможности Amnis</h2>
            <p className="text-[#B8B5D1] max-w-xl mx-auto text-sm sm:text-base font-symbolic">
              Продвинутый инструментарий для работы с вашими сновидениями
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5 sm:gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="group rounded-3xl p-6 sm:p-8 transition-all duration-300 relative bg-gradient-to-br from-[rgba(26,22,64,0.6)] to-[rgba(37,31,92,0.3)] border border-[rgba(169,152,255,0.15)] backdrop-blur-sm will-change-transform hover:border-[rgba(169,152,255,0.35)] hover:shadow-[0_0_30px_rgba(169,152,255,0.12),inset_0_1px_0_rgba(255,255,255,0.05)]"
                whileHover={{
                  y: -4,
                }}
              >
                <SparkleIcon className="absolute top-4 right-4 text-[#F4E0A7]" size={14} delay={index * 0.4} />
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-5 sm:mb-6 transition-all duration-300 bg-gradient-to-br from-[rgba(169,152,255,0.25)] to-[rgba(244,224,167,0.15)] shadow-[0_0_20px_rgba(169,152,255,0.2)]">
                  <div className="text-[#F4E0A7]">{feature.icon}</div>
                </div>
                <h3 className="text-[#E8E6F5] mb-2 sm:mb-3 font-mystical">{feature.title}</h3>
                <p className="text-[#B8B5D1] leading-relaxed text-sm sm:text-base font-light">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <PricingSection onSelectPlan={onStartClick} />

      {/* Final CTA */}
      <section className="relative z-10 px-4 sm:px-6 py-14 sm:py-20 md:py-24 border-t border-[rgba(169,152,255,0.1)]">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="rounded-[24px] sm:rounded-[32px] p-8 sm:p-12 md:p-16 relative overflow-hidden bg-gradient-to-br from-[rgba(169,152,255,0.12)] to-[rgba(244,224,167,0.08)] border border-[rgba(244,224,167,0.3)] backdrop-blur-xl shadow-[0_0_60px_rgba(244,224,167,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <SparkleIcon className="absolute top-6 left-6 sm:top-8 sm:left-8 text-[#F4E0A7]" size={20} delay={0} />
            <SparkleIcon className="absolute top-6 right-6 sm:top-8 sm:right-8 text-[#A998FF]" size={18} delay={0.5} />
            <SparkleIcon className="absolute bottom-6 left-8 sm:bottom-8 sm:left-12 text-[#A998FF]" size={16} delay={1} />
            <SparkleIcon className="absolute bottom-6 right-8 sm:bottom-8 sm:right-12 text-[#F4E0A7]" size={22} delay={0.7} />
            
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-0 right-0 w-48 h-48 sm:w-64 sm:h-64 bg-[#F4E0A7] rounded-full filter blur-[80px] sm:blur-[100px]" />
              <div className="absolute bottom-0 left-0 w-48 h-48 sm:w-64 sm:h-64 bg-[#A998FF] rounded-full filter blur-[80px] sm:blur-[100px]" />
            </div>
            
            <div className="relative">
              <div className="mb-5 sm:mb-6 inline-flex">
                <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-[#F4E0A7]" />
              </div>
              <h2 className="text-[#F4E0A7] mb-4 sm:mb-5 px-2 font-mystical">
                Начните своё путешествие в мир снов
              </h2>
              <p className="text-[#E8E6F5] mb-8 sm:mb-10 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed opacity-90 px-4">
                Откройте двери в ваше подсознание и раскройте скрытые послания, 
                которые приносят вам сновидения каждую ночь
              </p>
              <div className="flex justify-center">
                <PrimaryCTA 
                  onClick={onStartClick} 
                  icon={<Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
                  size="large"
                >
                  Начать диалог с Amnis
                </PrimaryCTA>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-10 border-t border-[rgba(169,152,255,0.1)]">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[#B8B5D1] text-sm font-light">
            © 2025 Amnis — Проводник в мир сновидений
          </p>
        </div>
      </footer>
    </div>
  );
}