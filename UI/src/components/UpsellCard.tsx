import React, { useState } from 'react';
import { motion } from 'motion/react';
import { PrimaryCTA } from './PrimaryCTA';
import { Sparkles, Check, Zap } from 'lucide-react';
import { pricingPlans, BASE_PRICE_PER_ANALYSIS } from '../data/pricingPlans';

interface UpsellCardProps {
  price: string;
  onPurchase: () => void;
  // Если кредиты есть — показываем кнопку «Потратить 1 кредит» основной,
  // а тарифы — как вторичную опцию «Пополнить баланс».
  availableAnalyses?: number;
  onUseCredit?: () => void;
}

export function UpsellCard({ price, onPurchase, availableAnalyses = 0, onUseCredit }: UpsellCardProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>('plan-5');
  const hasCredits = availableAnalyses > 0;

  const benefits = [
    'Детальный разбор всех символов',
    'Психологический анализ',
    'Персональные рекомендации',
  ];

  const currentPlan = pricingPlans.find(plan => plan.id === selectedPlan) || pricingPlans[1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="my-8 rounded-[28px] p-6 sm:p-8 relative overflow-hidden"
      style={{
        background: hasCredits
          ? 'linear-gradient(135deg, rgba(169, 152, 255, 0.14), rgba(244, 224, 167, 0.08))'
          : 'linear-gradient(135deg, rgba(244, 224, 167, 0.12), rgba(169, 152, 255, 0.08))',
        border: hasCredits
          ? '2px solid rgba(169, 152, 255, 0.5)'
          : '2px solid rgba(244, 224, 167, 0.4)',
        backdropFilter: 'blur(20px)',
        boxShadow: hasCredits
          ? '0 8px 32px rgba(169, 152, 255, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(244, 224, 167, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* Glow effect */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className={`absolute top-0 right-0 w-48 h-48 rounded-full filter blur-[80px] ${hasCredits ? 'bg-[#A998FF]' : 'bg-[#F4E0A7]'}`} />
        <div className={`absolute bottom-0 left-0 w-48 h-48 rounded-full filter blur-[80px] ${hasCredits ? 'bg-[#F4E0A7]' : 'bg-[#A998FF]'}`} />
      </div>

      <div className="relative">
        {/* ── Заголовок ── */}
        <div className="flex items-start gap-3 sm:gap-4 mb-6">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            hasCredits
              ? 'bg-gradient-to-br from-[rgba(169,152,255,0.3)] to-[rgba(244,224,167,0.2)] shadow-[0_0_24px_rgba(169,152,255,0.4)]'
              : 'bg-gradient-to-br from-[rgba(244,224,167,0.3)] to-[rgba(169,152,255,0.2)] shadow-[0_0_24px_rgba(244,224,167,0.4)]'
          }`}>
            <Sparkles className="w-6 h-6 text-[#F4E0A7]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[#F4E0A7] mb-2 font-tech text-lg">
              {hasCredits ? 'Глубокий анализ доступен' : 'Полный Подсознательный Анализ'}
            </h3>
            <p className="text-[#E8E6F5] leading-relaxed opacity-90 text-sm sm:text-base">
              {hasCredits
                ? `У вас ${availableAnalyses} ${availableAnalyses === 1 ? 'кредит' : availableAnalyses < 5 ? 'кредита' : 'кредитов'} глубокого анализа. Используйте один прямо сейчас — Amnis проведёт полный психологический разбор вашего сна.`
                : 'Углубленное толкование вашего сна с раскрытием символов и личных смыслов. Amnis проведет детальный анализ всех элементов.'
              }
            </p>
          </div>
        </div>

        {/* ── Преимущества ── */}
        <div className="space-y-2.5 mb-6">
          {benefits.map((benefit, index) => (
            <div key={index} className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-[rgba(244,224,167,0.2)] border border-[rgba(244,224,167,0.4)]">
                <Check className="w-3 h-3 text-[#F4E0A7]" />
              </div>
              <span className="text-[#E8E6F5] text-sm">{benefit}</span>
            </div>
          ))}
        </div>

        {/* ── Основная кнопка: кредит или оплата ── */}
        {hasCredits ? (
          <div className="mb-6">
            <motion.button
              onClick={onUseCredit}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="w-full px-8 py-4 rounded-2xl bg-gradient-to-r from-[#A998FF] to-[#F4E0A7] text-[#0D0B24] font-semibold text-lg shadow-[0_4px_24px_rgba(169,152,255,0.4)] hover:shadow-[0_6px_32px_rgba(169,152,255,0.6)] transition-shadow flex items-center justify-center gap-3"
            >
              <Zap className="w-5 h-5" />
              <span>Потратить 1 кредит — начать глубокий анализ</span>
            </motion.button>
            <p className="text-[#B8B5D1] text-xs text-center mt-2">
              Останется {availableAnalyses - 1} {availableAnalyses - 1 === 1 ? 'кредит' : availableAnalyses - 1 < 5 ? 'кредита' : 'кредитов'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
            <div className="min-h-[72px] flex flex-col justify-center">
              <div className="text-[#B8B5D1] text-sm mb-1">К оплате</div>
              <div className="text-[#F4E0A7] text-2xl sm:text-3xl">{currentPlan.price}₽</div>
              <div className="min-h-[20px]">
                {currentPlan.analyses > 1 && (
                  <div className="text-[#A998FF] text-xs sm:text-sm mt-1">
                    Экономия {((currentPlan.analyses * BASE_PRICE_PER_ANALYSIS) - currentPlan.price)}₽
                  </div>
                )}
              </div>
            </div>
            <div className="flex-shrink-0">
              <PrimaryCTA onClick={onPurchase} icon={<Sparkles className="w-4 h-4" />}>
                Заказать анализ
              </PrimaryCTA>
            </div>
          </div>
        )}

        {/* ── Тарифы (всегда видны) ── */}
        <div className="border-t border-[rgba(169,152,255,0.2)] pt-5">
          <div className="text-[#B8B5D1] text-sm mb-3">
            {hasCredits ? 'Пополнить баланс:' : 'Выберите тариф:'}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {pricingPlans.map((plan) => (
              <motion.button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`relative p-3 sm:p-4 rounded-2xl transition-all ${
                  selectedPlan === plan.id
                    ? 'bg-gradient-to-br from-[rgba(244,224,167,0.25)] to-[rgba(169,152,255,0.15)] border-2 border-[rgba(244,224,167,0.6)] shadow-[0_0_20px_rgba(244,224,167,0.3)]'
                    : 'bg-[rgba(13,11,36,0.4)] border-2 border-[rgba(169,152,255,0.2)] hover:border-[rgba(169,152,255,0.4)]'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] bg-gradient-to-r from-[#F4E0A7] to-[#A998FF] text-[#12103A]">
                    Популярно
                  </div>
                )}
                <div className="text-center">
                  <div className={`text-xs mb-1 ${selectedPlan === plan.id ? 'text-[#F4E0A7]' : 'text-[#B8B5D1]'}`}>
                    {plan.name}
                  </div>
                  <div className={`mb-1 ${selectedPlan === plan.id ? 'text-[#F4E0A7]' : 'text-[#E8E6F5]'}`}>
                    {plan.analyses} {plan.analyses === 1 ? 'анализ' : 'анализов'}
                  </div>
                  <div className={`text-sm sm:text-base ${selectedPlan === plan.id ? 'text-[#F4E0A7]' : 'text-[#E8E6F5]'}`}>
                    {plan.price}₽
                  </div>
                  {plan.analyses > 1 && (
                    <div className="text-[10px] text-[#B8B5D1] mt-1">
                      {plan.pricePerAnalysis}₽/анализ
                    </div>
                  )}
                </div>
              </motion.button>
            ))}
          </div>

          {/* Кнопка покупки для тарифов (только когда кредитов нет ИЛИ хотят пополнить) */}
          {!hasCredits ? null : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-5">
              <div className="min-h-[48px] flex flex-col justify-center">
                <div className="text-[#B8B5D1] text-sm">К оплате</div>
                <div className="text-[#F4E0A7] text-xl">{currentPlan.price}₽</div>
              </div>
              <div className="flex-shrink-0">
                <PrimaryCTA onClick={onPurchase} icon={<Sparkles className="w-4 h-4" />}>
                  Пополнить
                </PrimaryCTA>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
