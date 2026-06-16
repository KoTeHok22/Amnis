import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Уважать настройку пользователя: при reduced-motion канвас не анимируем.
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reducedMotion?.matches) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    setCanvasSize();

    // Масштабируем число частиц от площади экрана, чтобы не жечь батарею на мобильных.
    const area = window.innerWidth * window.innerHeight;
    const densityScale = Math.min(1, area / (1440 * 900));

    const stars: Array<{ x: number; y: number; radius: number; opacity: number; twinkleSpeed: number }> = [];
    const starCount = Math.round(110 * densityScale);

    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2,
        opacity: Math.random(),
        twinkleSpeed: 0.01 + Math.random() * 0.04,
      });
    }

    const sparkles: Array<{ x: number; y: number; opacity: number; fadeSpeed: number }> = [];
    const sparkleCount = Math.round(140 * densityScale);

    for (let i = 0; i < sparkleCount; i++) {
      sparkles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        opacity: Math.random(),
        fadeSpeed: 0.02 + Math.random() * 0.05,
      });
    }

    let animationFrameId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Рисуем мелкие сверкающие точки
      for (let i = 0; i < sparkles.length; i++) {
        const sparkle = sparkles[i];
        sparkle.opacity += sparkle.fadeSpeed;
        if (sparkle.opacity > 1 || sparkle.opacity < 0) {
          sparkle.fadeSpeed = -sparkle.fadeSpeed;
        }

        const opacity = Math.max(0, Math.min(1, sparkle.opacity)) * 0.7;
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fillRect(sparkle.x, sparkle.y, 1, 1);
      }

      // Рисуем большие звезды (упрощенно, без градиентов)
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.opacity += star.twinkleSpeed;
        if (star.opacity > 1 || star.opacity < 0.1) {
          star.twinkleSpeed = -star.twinkleSpeed;
        }

        const opacity = Math.max(0, Math.min(1, star.opacity));
        
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(244, 224, 167, ${opacity * 0.9})`;
        ctx.fill();
        
        // Упрощенное свечение для ярких звезд
        if (opacity > 0.7 && star.radius > 1) {
          ctx.strokeStyle = `rgba(244, 224, 167, ${(opacity - 0.7) * 0.3})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(star.x - star.radius * 3, star.y);
          ctx.lineTo(star.x + star.radius * 3, star.y);
          ctx.moveTo(star.x, star.y - star.radius * 3);
          ctx.lineTo(star.x, star.y + star.radius * 3);
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Пауза анимации при скрытой вкладке (не жечь кадры в фоне).
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrameId);
      } else {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    // Debounced resize
    let resizeTimeout: number;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        setCanvasSize();
      }, 250);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />;
}

export function AnimatedBackground() {
  const reducedMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <StarField />

      {/* Soft glows */}
      <motion.div
        className="absolute top-[10%] left-[10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(169,152,255,0.15)_0%,transparent_70%)] blur-[60px] will-change-transform"
        animate={reducedMotion ? undefined : {
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="absolute bottom-0 right-0 w-[800px] h-[800px] rounded-full bg-[radial-gradient(circle,rgba(244,224,167,0.1)_0%,transparent_70%)] blur-[80px] will-change-transform"
        animate={reducedMotion ? undefined : {
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
      />
    </div>
  );
}