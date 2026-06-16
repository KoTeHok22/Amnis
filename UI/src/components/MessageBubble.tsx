import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner@2.0.3';
import { Volume2, VolumeX, Moon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageBubbleProps {
  message: string;
  isUser: boolean;
}

export function MessageBubble({ message, isUser }: MessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayAudio = async () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      if (isPlaying) {
        setIsPlaying(false);
        return;
      }

      let voices = window.speechSynthesis.getVoices();

      if (voices.length === 0) {
        await new Promise(resolve => {
          window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            resolve(voices);
          };
        });
      }

      // Clean message for speech synthesis: remove markdown formatting characters and triggers
      const cleanMessageForSpeech = message
        .replace(/\[ACTION:\s*TRIGGER_USE_ANALYSIS_CREDIT\]/g, '')
        .replace(/\[ACTION:\s*TRIGGER_PAYMENT_ROBOKASSA\]/g, '')
        // Remove markdown formatting: underscores, asterisks for bold/italic
        .replace(/[\*_]{1,2}([^_*]+)[\*_]{1,2}/g, '$1')
        // Remove single asterisks and underscores that might be left
        .replace(/[\*_]+/g, '')
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanMessageForSpeech);

      const russianVoice = voices.find(voice =>
        voice.lang.startsWith('ru-RU') || voice.lang.startsWith('ru')
      );

      const preferredVoice = russianVoice || voices.find(voice =>
        voice.name.toLowerCase().includes('female') ||
        voice.name.toLowerCase().includes('male') ||
        voice.name.toLowerCase().includes('google') ||
        voice.lang === 'en-US'
      );

      utterance.lang = 'ru-RU';
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      utterance.volume = 1.0;

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      window.speechSynthesis.speak(utterance);
    } else {
      toast.error('Озвучивание текста не поддерживается в вашем браузере. Попробуйте другой браузер.');
    }
  };

  // Clean up any ongoing speech when component unmounts
  useEffect(() => {
    return () => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
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
              className="mt-2 ml-3 text-[#A998FF] hover:text-[#F4E0A7] transition-colors flex items-center gap-1.5 text-sm"
              aria-label={isPlaying ? "Остановить озвучивание" : "Прослушать сообщение"}
            >
              {isPlaying ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
              <span className="text-xs">{isPlaying ? "Остановить" : "Прослушать"}</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
