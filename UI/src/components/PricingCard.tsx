import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { SparkleIcon } from './SparkleIcon';
import { Sparkles } from 'lucide-react';

interface PricingCardProps {
  plan: {
    id: string;
    name: string;
    analyses: number;
    price: number;
    pricePerAnalysis: number;
    popular?: boolean;
  };
  index: number;
  onSelect: (planId: string) => void;
}

// Helper function to map number ranges
function mapNumberRange(n: number, a: number, b: number, c: number, d: number): number {
  return ((n - a) * (d - c)) / (b - a) + c;
}

export function PricingCard({ plan, index, onSelect }: PricingCardProps) {
  const glossStyleRef = useRef({ opacity: 0, transform: 'translate(0%, 0%) scale(2.4)' });
  const contentStyleRef = useRef({});
  const [isAnimatable, setIsAnimatable] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const checkTouchDevice = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };

    checkTouchDevice();

    // Делаем gloss анимируемым после монтирования
    requestAnimationFrame(() => {
      setIsAnimatable(true);
    });

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchDevice || !cardRef.current) return;

    // Cancel any pending animation frame
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }

    // Use requestAnimationFrame to batch updates
    rafId.current = requestAnimationFrame(() => {
      const pointerX = e.clientX;
      const pointerY = e.clientY;

      const cardRect = cardRef.current!.getBoundingClientRect();

      const halfWidth = cardRect.width / 2;
      const halfHeight = cardRect.height / 2;

      const cardCenterX = cardRect.left + halfWidth;
      const cardCenterY = cardRect.top + halfHeight;

      const deltaX = pointerX - cardCenterX;
      const deltaY = pointerY - cardCenterY;

      const distanceToCenter = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      const maxDistance = Math.max(halfWidth, halfHeight);

      const degree = mapNumberRange(distanceToCenter, 0, maxDistance, 0, 10);

      const rx = mapNumberRange(deltaY, 0, halfWidth, 0, 1);
      const ry = mapNumberRange(deltaX, 0, halfHeight, 0, 1);

      contentStyleRef.current = {
        transform: `perspective(400px) rotate3d(${-rx}, ${ry}, 0, ${degree}deg)`,
      };

      glossStyleRef.current = {
        transform: `translate(${-ry * 100}%, ${-rx * 100}%) scale(2.4)`,
        opacity: mapNumberRange(distanceToCenter, 0, maxDistance, 0, 0.6),
      };

      // Apply styles directly to elements to avoid re-rendering
      const card = cardRef.current?.children[0] as HTMLElement;
      if (card) {
        card.style.transform = contentStyleRef.current.transform;
      }

      const gloss = cardRef.current?.querySelector('.gloss-effect') as HTMLElement;
      if (gloss) {
        gloss.style.transform = glossStyleRef.current.transform;
        gloss.style.opacity = glossStyleRef.current.opacity.toString();
      }
    });
  };

  const handleMouseLeave = () => {
    if (isTouchDevice) return;

    contentStyleRef.current = {};
    glossStyleRef.current = { opacity: 0, transform: 'translate(0%, 0%) scale(2.4)' };

    // Reset styles
    const card = cardRef.current?.children[0] as HTMLElement;
    if (card) {
      card.style.transform = '';
    }

    const gloss = cardRef.current?.querySelector('.gloss-effect') as HTMLElement;
    if (gloss) {
      gloss.style.transform = 'translate(0%, 0%) scale(2.4)';
      gloss.style.opacity = '0';
    }

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative rounded-3xl transition-all duration-300 will-change-transform cursor-pointer"
      style={{ padding: '10px', paddingTop: '20px' }}
    >
      <div
        className={`relative rounded-3xl p-6 sm:p-7 backdrop-blur-sm flex flex-col transition-transform duration-200 ease-out h-[420px] ${
          plan.popular
            ? 'bg-gradient-to-br from-[rgba(244,224,167,0.15)] to-[rgba(169,152,255,0.12)] border-2 border-[rgba(244,224,167,0.5)] shadow-[0_0_40px_rgba(244,224,167,0.25)]'
            : 'bg-gradient-to-br from-[rgba(26,22,64,0.6)] to-[rgba(37,31,92,0.3)] border border-[rgba(169,152,255,0.2)]'
        }`}
      >
        {/* Gloss Effect */}
        {!isTouchDevice && (
          <div
            className={`gloss-effect absolute w-full h-full left-0 top-0 rounded-3xl pointer-events-none z-10 ${
              isAnimatable ? 'transition-opacity duration-250' : ''
            }`}
            style={{
              opacity: 0,
              background: `radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 50%, rgba(255, 255, 255, 0) 100%)`,
            }}
          />
        )}

        {plan.popular && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#F4E0A7] to-[#A998FF] text-[#12103A] text-xs z-20">
            Популярно
          </div>
        )}
        
        <SparkleIcon 
          className={`absolute top-5 right-5 z-20 ${plan.popular ? 'text-[#F4E0A7]' : 'text-[#A998FF]'}`} 
          size={14} 
          delay={index * 0.3} 
        />

        <div className="text-center flex-1 relative z-10">
          <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 ${
            plan.popular
              ? 'bg-gradient-to-br from-[rgba(244,224,167,0.3)] to-[rgba(169,152,255,0.2)] shadow-[0_0_24px_rgba(244,224,167,0.4)]'
              : 'bg-gradient-to-br from-[rgba(169,152,255,0.25)] to-[rgba(244,224,167,0.15)]'
          }`}>
            <Sparkles className={`w-7 h-7 ${plan.popular ? 'text-[#F4E0A7]' : 'text-[#A998FF]'}`} />
          </div>
          
          <h3 className={`mb-2 ${plan.popular ? 'text-[#F4E0A7]' : 'text-[#E8E6F5]'}`}>
            {plan.name}
          </h3>
          
          <div className="mb-3">
            <span className={`text-3xl sm:text-4xl ${plan.popular ? 'text-[#F4E0A7]' : 'text-[#E8E6F5]'}`}>
              {plan.price}₽
            </span>
          </div>
          
          <div className="text-[#B8B5D1] mb-2">
            {plan.analyses} {plan.analyses === 1 ? 'глубокий анализ' : 'глубоких анализов'}
          </div>
          
          <div className="min-h-[48px]">
            {plan.analyses > 1 && (
              <>
                <div className={`text-xs ${plan.popular ? 'text-[#A998FF]' : 'text-[#B8B5D1]'} mb-2`}>
                  {plan.pricePerAnalysis}₽ за анализ
                </div>
                <div className="text-xs text-green-400">
                  Экономия {((plan.analyses * 199) - plan.price)}₽
                </div>
              </>
            )}
          </div>
        </div>

        <button
          onClick={() => onSelect(plan.id)}
          className={`w-full h-11 rounded-full transition-all duration-300 flex items-center justify-center gap-2 mt-6 relative z-10 ${
            plan.popular
              ? 'bg-gradient-to-r from-[#F4E0A7] to-[#A998FF] text-[#12103A] shadow-[0_8px_32px_rgba(244,224,167,0.4)] hover:shadow-[0_12px_48px_rgba(244,224,167,0.6)]'
              : 'bg-gradient-to-r from-[#A998FF] to-[#7C6FDB] text-white shadow-[0_8px_32px_rgba(169,152,255,0.3)] hover:shadow-[0_12px_48px_rgba(169,152,255,0.5)]'
          } hover:scale-[1.02]`}
        >
          <span>Выбрать</span>
        </button>
      </div>
    </motion.div>
  );
}
