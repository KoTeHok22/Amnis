import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner@2.0.3';
import { Volume2, VolumeX, Moon, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchTtsAudio } from '../services/api';

interface MessageBubbleProps {
  message: string;
  isUser: boolean;
}

// Очищаем текст от служебных триггеров и markdown-разметки перед озвучкой.
function cleanForSpeech(message: string): string {
  return message
    .replace(/\[ACTION:\s*TRIGGER_USE_ANALYSIS_CREDIT\]/g, '')
    .replace(/\[ACTION:\s*TRIGGER_PAYMENT_ROBOKASSA\]/g, '')
    .replace(/[\*_]{1,2}([^_*]+)[\*_]{1,2}/g, '$1')
    .replace(/[\*_]+/g, '')
    .trim();
}

// Грубое определение языка по преобладающей письменности (ISO 639-1).
// Нужно, чтобы не привязывать озвучку жёстко к русскому: текст может быть
// на любом языке, который вернула модель.
function detectLang(text: string): string {
  const counts: Record<string, number> = {};
  for (const ch of text) {
    const o = ch.codePointAt(0) ?? 0;
    if (o >= 0x0400 && o <= 0x04ff) counts.cyr = (counts.cyr || 0) + 1;
    else if (o >= 0x3040 && o <= 0x30ff) counts.kana = (counts.kana || 0) + 1;
    else if (o >= 0x4e00 && o <= 0x9fff) counts.han = (counts.han || 0) + 1;
    else if (o >= 0xac00 && o <= 0xd7a3) counts.hangul = (counts.hangul || 0) + 1;
    else if (o >= 0x0600 && o <= 0x06ff) counts.arab = (counts.arab || 0) + 1;
    else if (o >= 0x0590 && o <= 0x05ff) counts.hebrew = (counts.hebrew || 0) + 1;
    else if (o >= 0x0900 && o <= 0x097f) counts.deva = (counts.deva || 0) + 1;
    else if (o >= 0x0370 && o <= 0x03ff) counts.greek = (counts.greek || 0) + 1;
    else if (o >= 0x0e00 && o <= 0x0e7f) counts.thai = (counts.thai || 0) + 1;
    else if (o >= 0x0041 && o <= 0x024f) counts.lat = (counts.lat || 0) + 1;
  }
  const keys = Object.keys(counts);
  if (keys.length === 0) return 'en';
  const dominant = keys.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  const map: Record<string, string> = {
    kana: 'ja', han: 'zh', hangul: 'ko', arab: 'ar',
    hebrew: 'he', deva: 'hi', greek: 'el', thai: 'th',
  };
  if (map[dominant]) return map[dominant];
  if (dominant === 'cyr') return /[іїєґІЇЄҐ]/.test(text) ? 'uk' : 'ru';
  return 'en';
}

// Язык (ISO 639-1) -> предпочитаемая BCP-47 локаль для SpeechSynthesisUtterance.
const BCP47: Record<string, string> = {
  ru: 'ru-RU', uk: 'uk-UA', en: 'en-US', es: 'es-ES', fr: 'fr-FR',
  de: 'de-DE', it: 'it-IT', pt: 'pt-BR', pl: 'pl-PL', nl: 'nl-NL',
  tr: 'tr-TR', ar: 'ar-SA', hi: 'hi-IN', zh: 'zh-CN', ja: 'ja-JP',
  ko: 'ko-KR', he: 'he-IL', el: 'el-GR', th: 'th-TH',
};

export function MessageBubble({ message, isUser }: MessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Полная остановка любой текущей озвучки (и серверной, и браузерной).
  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  };

  // Фолбэк: браузерный SpeechSynthesis с подбором голоса под язык текста.
  const speakWithBrowser = async (text: string, lang: string) => {
    if (!('speechSynthesis' in window)) {
      toast.error('Озвучивание текста не поддерживается в вашем браузере. Попробуйте другой браузер.');
      return;
    }

    window.speechSynthesis.cancel();

    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      // Голоса грузятся асинхронно. Ждём onvoiceschanged, но с таймаутом —
      // в части браузеров событие может не сработать, тогда не зависаем.
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          voices = window.speechSynthesis.getVoices();
          resolve();
        };
        window.speechSynthesis.onvoiceschanged = finish;
        setTimeout(finish, 1500);
      });
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const targetLang = BCP47[lang] || lang;

    // Ищем голос нужного языка: сначала точное совпадение локали, затем по коду языка.
    const matchVoice =
      voices.find((v) => v.lang.toLowerCase() === targetLang.toLowerCase()) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(lang));

    utterance.lang = matchVoice ? matchVoice.lang : targetLang;
    if (matchVoice) {
      utterance.voice = matchVoice;
    } else {
      toast.error('В системе нет голоса для языка этого текста — озвучивание может быть некорректным.');
    }

    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
  };

  const handlePlayAudio = async () => {
    // Повторное нажатие во время проигрывания/загрузки — остановка.
    if (isPlaying || isLoading) {
      stopPlayback();
      setIsLoading(false);
      return;
    }

    const text = cleanForSpeech(message);
    if (!text) return;

    const lang = detectLang(text);
    setIsLoading(true);

    try {
      // Основной путь: серверная озвучка — работает в любом браузере и для любого языка.
      const blob = await fetchTtsAudio(text, lang);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;

      audio.onended = () => stopPlayback();
      audio.onerror = () => stopPlayback();

      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      // Сервер недоступен/не отдал аудио — пробуем браузерную озвучку.
      await speakWithBrowser(text, lang);
    } finally {
      setIsLoading(false);
    }
  };

  // Останавливаем любую озвучку при размонтировании компонента.
  useEffect(() => {
    return () => {
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanMessage = message
    .replace(/\[ACTION:\s*TRIGGER_USE_ANALYSIS_CREDIT\]/g, '')
    .replace(/\[ACTION:\s*TRIGGER_PAYMENT_ROBOKASSA\]/g, '')
    .trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}
    >
      <div className={`flex gap-3 max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isUser && (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
            style={{
              background: 'linear-gradient(135deg, rgba(169, 152, 255, 0.4), rgba(244, 224, 167, 0.3))',
              boxShadow: '0 0 20px rgba(169, 152, 255, 0.3)',
            }}
          >
            <Moon className="w-5 h-5 text-[#F4E0A7]" />
          </div>
        )}

        <div className="flex flex-col">
          <div
            className={`rounded-3xl px-5 py-4 ${
              isUser
                ? 'rounded-tr-md'
                : 'rounded-tl-md'
            }`}
            style={{
              background: isUser
                ? 'linear-gradient(135deg, rgba(77, 74, 168, 0.35), rgba(77, 74, 168, 0.25))'
                : 'linear-gradient(135deg, rgba(244, 224, 167, 0.08), rgba(169, 152, 255, 0.06))',
              backdropFilter: 'blur(10px)',
              border: isUser
                ? '1px solid rgba(77, 74, 168, 0.3)'
                : '1px solid rgba(244, 224, 167, 0.15)',
              boxShadow: isUser
                ? '0 4px 16px rgba(77, 74, 168, 0.15)'
                : '0 4px 16px rgba(244, 224, 167, 0.1)',
            }}
          >
            <div className={`${isUser ? 'text-[#E8E6F5]' : 'text-[#E8E6F5]'} leading-relaxed`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom components for better styling
                  p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                  h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-3 mt-4" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-3 mt-4" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-lg font-bold mb-2 mt-3" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                  em: ({node, ...props}) => <em className="italic" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 ml-4" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 ml-4" {...props} />,
                  li: ({node, ...props}) => <li className="mb-1" {...props} />,
                  a: ({node, ...props}) => <a className="text-[#A998FF] hover:text-[#F4E0A7] underline" target="_blank" rel="noopener noreferrer" {...props} />,
                  code: ({node, inline, ...props}) => {
                    if (inline) {
                      return <code className="bg-[rgba(169,152,255,0.1)] px-1.5 py-0.5 rounded text-sm font-mono" {...props} />;
                    } else {
                      return <code className="block bg-[rgba(169,152,255,0.1)] p-3 rounded text-sm font-mono overflow-x-auto mt-2 mb-3" {...props} />;
                    }
                  },
                  blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-[#A998FF] pl-4 italic text-[#B8B5D1]" {...props} />,
                  hr: ({node, ...props}) => <hr className="my-4 border-t border-[rgba(169,152,255,0.3)]" {...props} />
                }}
              >
                {cleanMessage}
              </ReactMarkdown>
            </div>
          </div>

          {!isUser && (
            <button
              onClick={handlePlayAudio}
              className="mt-2 ml-3 text-[#A998FF] hover:text-[#F4E0A7] transition-colors flex items-center gap-1.5 text-sm disabled:opacity-60"
              aria-label={isPlaying ? "Остановить озвучивание" : "Прослушать сообщение"}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              <span className="text-xs">
                {isLoading ? "Загрузка…" : isPlaying ? "Остановить" : "Прослушать"}
              </span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
