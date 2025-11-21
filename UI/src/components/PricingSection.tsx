import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { PrimaryCTA } from './PrimaryCTA';
import { SparkleIcon } from './SparkleIcon';
import { Sparkles, Check } from 'lucide-react';
import { PricingCard } from './PricingCard';

interface PricingSectionProps {
  onSelectPlan: () => void;
}

interface PricingPlan {
  id: string;
  name: string;
  analyses: number;
  price: number;
  pricePerAnalysis: number;
  popular?: boolean;
}

const pricingPlans: PricingPlan[] = [
  {
    id: 'single',
    name: 'Пробный',
    analyses: 1,
    price: 199,
    pricePerAnalysis: 199,
  },
  {
    id: 'starter',
    name: 'Начальный',
    analyses: 5,
    price: 799,
    pricePerAnalysis: 160,
    popular: true,
  },
  {
    id: 'standard',
    name: 'Стандартный',
    analyses: 10,
    price: 1399,
    pricePerAnalysis: 140,
  },
  {
    id: 'premium',
    name: 'Премиум',
    analyses: 15,
    price: 1899,
    pricePerAnalysis: 127,
  },
];

const deepAnalysisFeatures = [
  'Детальный разбор всех символов',
  'Психологический анализ',
  'Персональные рекомендации',
  'Связь с подсознанием',
];

export function PricingSection({ onSelectPlan }: PricingSectionProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>('starter');

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId);
    onSelectPlan();
  };

  return (
    <section className="relative z-10 px-4 sm:px-6 py-16 sm:py-20 md:py-24 border-t border-[rgba(169,152,255,0.1)]">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8 sm:mb-10 relative px-4"
        >
          <SparkleIcon className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-8 text-[#F4E0A7]" size={24} delay={0} />
          <h2 className="text-[#E8E6F5] mb-3 sm:mb-4">Тарифы</h2>
          <p className="text-[#B8B5D1] max-w-2xl mx-auto text-sm sm:text-base mb-6">
            Выберите количество глубоких анализов. Все тарифы предоставляют одинаковый уровень качества и детализации.
          </p>
          
          {/* Unified Features */}
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="inline-flex flex-wrap gap-3 sm:gap-4 justify-center"
            >
              {deepAnalysisFeatures.map((feature, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[rgba(169,152,255,0.15)] to-[rgba(244,224,167,0.1)] border border-[rgba(169,152,255,0.2)]"
                >
                  <Check className="w-4 h-4 text-[#A998FF] flex-shrink-0" />
                  <span className="text-[#E8E6F5] text-sm">{feature}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {pricingPlans.map((plan, index) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              index={index}
              onSelect={handleSelectPlan}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center mt-8 sm:mt-10"
        >
          <p className="text-[#B8B5D1] text-sm font-accent" style={{ fontStyle: 'italic' }}>
            Все платежи защищены и обрабатываются через Robokassa
          </p>
        </motion.div>
      </div>
    </section>
  );
}