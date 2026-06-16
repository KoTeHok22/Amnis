import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageBubble } from './MessageBubble';
import { UpsellCard } from './UpsellCard';
import { AnimatedBackground } from './StarField';
import { FloatingSparkles } from './SparkleIcon';
import { Send, Mic, MicOff, Menu, Moon, Plus, MessageSquare, User, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../context/AuthContext';
import { createChat, sendMessage, sendMessageStream, getUserChats, switchChat, deleteChat, getChatMessages, updateChatTitle, getStreamStatus, listenToStream } from '../services/chatApi';
import { useAnalysisCredit } from '../services/api';
import { ProfileModal } from './ProfileModal';
import PaymentWarningModal from './PaymentWarningModal';
import { usePayment } from '../context/PaymentContext';
import { pricingPlans } from '../data/pricingPlans';
import { logger } from '../utils/logger';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  taskId?: string; // For tracking async processing tasks
}

interface Chat {
  id: string;
  title: string;
  lastMessage?: string;
  timestamp: Date;
}

interface ChatWindowProps {
  onProfileOpen: () => void;
  onPurchase: (planId: string) => void;
}

export function ChatWindow({ onProfileOpen, onPurchase }: ChatWindowProps) {
  const { isAuthenticated, logout, user, updateUserProfile } = useAuth();
  const { paymentStatus, setPaymentStatus } = usePayment();
  
  // Custom media query hook
  const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
      const media = window.matchMedia(query);
      if (media.matches !== matches) {
        setMatches(media.matches);
      }
      const listener = () => setMatches(media.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }, [matches, query]);
    return matches;
  };
  
  const isDesktop = useMediaQuery('(min-width: 768px)'); // md breakpoint
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showUpsell, setShowUpsell] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  
  // Effect to automatically show sidebar on desktop and hide on mobile
  useEffect(() => {
    setShowSidebar(isDesktop);
  }, [isDesktop]);
  
  // Check for ongoing chat creation on component mount and cleanup stale states
  useEffect(() => {
    const savedCreatingState = localStorage.getItem('creatingChatState');
    if (savedCreatingState) {
      try {
        const parsedState = JSON.parse(savedCreatingState);
        const now = Date.now();
        // Clean up if the state is older than 2 minutes (120000 ms) - reduced from 5 minutes for better UX
        if (now - parsedState.timestamp > 120000) {
          localStorage.removeItem('creatingChatState');
          if (showCreatingChatModal) {
            setShowCreatingChatModal(false);
          }
        } else {
          // Restore the creating state if still valid
          if (!showCreatingChatModal) {
            setShowCreatingChatModal(parsedState.showCreatingChatModal);
          }
        }
      } catch (error) {
        logger.error('Error parsing creating chat state:', error);
        localStorage.removeItem('creatingChatState');
        if (showCreatingChatModal) {
          setShowCreatingChatModal(false);
        }
      }
    }
  }, []);
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentChatTitle, setCurrentChatTitle] = useState<string>('Новый чат');
  const [isLoadingChats, setIsLoadingChats] = useState<boolean>(true);
  const [isCreatingChat, setIsCreatingChat] = useState<boolean>(false);
  const [paymentTriggered, setPaymentTriggered] = useState(false);
  const [showPaymentWarning, setShowPaymentWarning] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [newChatTitle, setNewChatTitle] = useState<string>('');
  const [chatPendingDeletion, setChatPendingDeletion] = useState<string | null>(null);
  
  // Check for ongoing chat creation in localStorage on component mount
  const [showCreatingChatModal, setShowCreatingChatModal] = useState<boolean>(() => {
    const savedCreatingState = localStorage.getItem('creatingChatState');
    return savedCreatingState ? JSON.parse(savedCreatingState).showCreatingChatModal : false;
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const streamTextRef = useRef<string>('');
  const [, setRenderTick] = useState(0);
  const isStreamingRef = useRef<boolean>(false);
  // Защита от повторного авто-создания чата (на случай повторного вызова загрузки).
  const autoCreatingRef = useRef<boolean>(false);
  
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isAuthenticated || !currentChatId) return;

    let cancelled = false;

    const reconnect = async () => {
      try {
        const status = await getStreamStatus();
        if (cancelled) return;
        if (!status.is_generating) return;

        isStreamingRef.current = true;
        setIsAiTyping(true);

        const aiResponseId = `ai-${Date.now()}`;
        streamTextRef.current = status.partial_content || '';

        if (streamTextRef.current) {
          setMessages(prev => {
            const hasStreamingMsg = prev.some(msg => msg.id.startsWith('ai-reconnect-') || (msg.id.startsWith('ai-') && !msg.isUser && !msg.text));
            if (hasStreamingMsg) {
              return prev.map(msg =>
                (msg.id.startsWith('ai-reconnect-') || (msg.id.startsWith('ai-') && !msg.isUser && !msg.text))
                  ? { ...msg, text: streamTextRef.current }
                  : msg
              );
            }
            return [...prev, {
              id: aiResponseId,
              text: streamTextRef.current,
              isUser: false,
              timestamp: new Date(),
            }];
          });
          setRenderTick(n => n + 1);
        } else {
          setMessages(prev => [...prev, {
            id: aiResponseId,
            text: '',
            isUser: false,
            timestamp: new Date(),
          }]);
        }

        const handleStreamData = (data: any) => {
          if (cancelled) return;
          if (data.type === 'stream' && data.content) {
            streamTextRef.current += data.content;
            setRenderTick(n => n + 1);
            setMessages(prev => {
              const idx = prev.findIndex(msg => msg.id === aiResponseId);
              if (idx === -1) return prev;
              const updated = [...prev];
              updated[idx] = { ...updated[idx], text: streamTextRef.current };
              return updated;
            });
          } else if (data.type === 'complete') {
            isStreamingRef.current = false;
            setIsAiTyping(false);
            const finalContent = data.content || streamTextRef.current;
            let cleanContent = finalContent;
            const nameChangeMatch = cleanContent.match(/\[NAME_CHANGE\s*=\s*["']([^"']*)["']\]/);
            if (nameChangeMatch) {
              cleanContent = cleanContent.replace(nameChangeMatch[0], '').trim();
              if (currentChatId) {
                updateChatTitle(currentChatId, nameChangeMatch[1]).catch(logger.error);
                setCurrentChatTitle(nameChangeMatch[1]);
              }
            }
            const symbolsMatch = cleanContent.match(/\[SYMBOLS\s*=\s*["']([^"']*)["']\]/);
            if (symbolsMatch) {
              cleanContent = cleanContent.replace(symbolsMatch[0], '').trim();
            }
            const { processedContent } = processMessageContent(cleanContent);
            setMessages(prev => {
              const idx = prev.findIndex(msg => msg.id === aiResponseId);
              if (idx === -1) return prev;
              const updated = [...prev];
              updated[idx] = { ...updated[idx], text: processedContent };
              return updated;
            });
          } else if (data.error) {
            isStreamingRef.current = false;
            setIsAiTyping(false);
          }
        };

        await listenToStream(status.position, handleStreamData);

        if (!cancelled) {
          isStreamingRef.current = false;
          setIsAiTyping(false);
        }
      } catch {
        if (!cancelled) {
          isStreamingRef.current = false;
          setIsAiTyping(false);
        }
      }
    };

    reconnect();

    return () => { cancelled = true; };
  }, [isAuthenticated, currentChatId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [inputValue]);
  
  // Load user chats when component mounts and when user authenticates
  useEffect(() => {
    if (isAuthenticated) {
      loadUserChats();
    }
  }, [isAuthenticated]);
  
  // Refresh chat list when a new chat is created
  useEffect(() => {
    if (isAuthenticated && currentChatId) {
      // Update the current chat in the chat list if it exists
      setChats(prev => {
        return prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, title: currentChatTitle }
            : chat
        );
      });
    }
  }, [currentChatId, currentChatTitle]);
  
  const loadUserChats = async () => {
    try {
      setIsLoadingChats(true);
      const userChatsData = await getUserChats();
      // Convert API response to Chat objects
      const loadedChats: Chat[] = userChatsData.map((apiChat: any) => ({
        id: apiChat.id,
        title: apiChat.title,
        timestamp: new Date(apiChat.updated_at || apiChat.created_at),
      }));
      setChats(loadedChats);
      // Список чатов получен — сразу снимаем спиннер списка. Сообщения последнего
      // чата подгружаем отдельно ниже: их задержка или ошибка больше не держит
      // список в состоянии «загрузка» бесконечно (из-за чего новые чаты не были видны).
      setIsLoadingChats(false);

      if (loadedChats.length === 0) {
        // Чатов нет вообще — создаём автоматически, чтобы пользователь не оставался без чата.
        if (!autoCreatingRef.current) {
          autoCreatingRef.current = true;
          await handleCreateNewChat();
        }
        return;
      }

      // Есть чаты — открываем самый свежий и подгружаем его сообщения.
      const mostRecentChat = loadedChats[0];
      setCurrentChatId(mostRecentChat.id);
      setCurrentChatTitle(mostRecentChat.title);
      try {
        const switchResult = await switchChat(mostRecentChat.id);
        const chatMessages = switchResult.messages || [];
        // Filter out system messages and convert to UI format
        let hasPaymentTrigger = false;
        let hasCreditTrigger = false;
        const uiMessages = chatMessages
          .filter((msg: any) => msg.role !== 'system')  // Don't show system messages to users
          .map((msg: any, index: number) => {
            // Process the message content to remove triggers
            const { processedContent: content, hasPaymentTrigger: messageHasPaymentTrigger, hasCreditTrigger: messageHasCreditTrigger, nameChangeValue } = processMessageContent(msg.content);
            if (messageHasPaymentTrigger) {
              hasPaymentTrigger = true;
            }
            if (messageHasCreditTrigger) {
              hasCreditTrigger = true;
            }
            // Handle name change trigger when loading messages
            if (nameChangeValue) {
              updateChatTitle(mostRecentChat.id, nameChangeValue)
                .then(() => {
                  setCurrentChatTitle(nameChangeValue);
                  setChats(prev => prev.map(chat =>
                    chat.id === mostRecentChat.id ? { ...chat, title: nameChangeValue } : chat
                  ));
                })
                .catch(error => {
                  logger.error('Error updating chat title:', error);
                });
            }
            return {
              id: `${msg.timestamp || Date.now()}-${index}`,
              text: content,
              isUser: msg.role === 'user',
              timestamp: new Date(msg.timestamp || Date.now())
            };
          });
        setMessages(uiMessages);
        // Списываем кредит если в загруженных сообщениях был триггер использования
        if (hasCreditTrigger) {
          useAnalysisCredit().then(r => {
            updateUserProfile({ available_analyses: r.available_analyses });
          }).catch(e => { logger.error('Deduct credit fail:', e); });
        }
        // UpsellCard показываем только если кредитов реально нет
        if (hasPaymentTrigger) {
          setPaymentTriggered(true);
          if ((user?.available_analyses ?? 0) <= 0) {
            setShowUpsell(true);
          }
        }
      } catch (error) {
        logger.error('Error loading most recent chat messages:', error);
        setMessages([]); // Clear messages if loading fails
      }
    } catch (error) {
      logger.error('Error loading user chats:', error);
      // Even if loading fails, we still need to handle the UI state
      setChats([]);
      setCurrentChatId(null);
      setCurrentChatTitle('Новый чат');
      setMessages([]);
      setIsLoadingChats(false);
    }
  };
  
  const handleCreateNewChat = async () => {
    isStreamingRef.current = false;
    streamTextRef.current = '';
    setIsAiTyping(false);
    // Set the states first to show the modal
    setIsCreatingChat(true);
    setShowCreatingChatModal(true);
    // Save state to localStorage to persist across page reloads
    localStorage.setItem('creatingChatState', JSON.stringify({
      showCreatingChatModal: true,
      timestamp: Date.now()
    }));
    try {
      // Create a friendly greeting message for the user
      const greetingMessage = "Привет! Я - Amnis, хранитель тайн сновидений. Расскажите мне о вашем сне, и я помогу раскрыть его скрытые послания из глубин вашего подсознания.";
      // Create chat without sending system prompt (it will be handled internally by backend)
      const result = await createChat("Новый анализ сна");
      const newChat: Chat = {
        id: result.chat_id,
        title: result.title,
        timestamp: new Date(),
      };
      setChats(prev => [newChat, ...prev]);
      setCurrentChatId(result.chat_id);
      setCurrentChatTitle(result.title);
      // Process the greeting message for potential triggers (не должно быть в приветствии, но защита)
      const { processedContent: processedGreeting, hasPaymentTrigger, hasCreditTrigger, nameChangeValue, symbolsValue } = processMessageContent(greetingMessage);
      if (hasCreditTrigger) {
        useAnalysisCredit().then(r => {
          updateUserProfile({ available_analyses: r.available_analyses });
        }).catch(e => { logger.error('Deduct credit fail:', e); });
      }
      if (hasPaymentTrigger) {
        setPaymentTriggered(true);
        if ((user?.available_analyses ?? 0) <= 0) {
          setShowUpsell(true);
        }
      }
      // Add only the friendly greeting to the UI
      setMessages([{
        id: '1',
        text: processedGreeting,
        isUser: false,
        timestamp: new Date(),
      }]);
    } catch (error) {
      logger.error('Error creating chat:', error);
      // Fallback: create a local chat
      const newChat: Chat = {
        id: Date.now().toString(),
        title: "Новый анализ сна",
        timestamp: new Date(),
      };
      setChats(prev => [newChat, ...prev]);
      setCurrentChatId(newChat.id);
      setCurrentChatTitle(newChat.title);
      setMessages([{
        id: '1',
        text: "Привет! Я - Amnis, хранитель тайн сновидений. Расскажите мне о вашем сне, и я помогу раскрыть его скрытые послания из глубин вашего подсознания.",
        isUser: false,
        timestamp: new Date(),
      }]);
    } finally {
      // Always clean up the states
      setIsCreatingChat(false);
      setShowCreatingChatModal(false);
      // Remove state from localStorage when completed
      localStorage.removeItem('creatingChatState');
    }
  };
  
  // Авто-отправка «Да» для запуска глубокого анализа по кредиту.
  const handleStartDeepAnalysis = async () => {
    setShowUpsell(false);
    setPaymentTriggered(false);
    const msg = "Да, используй один кредит для глубокого анализа.";
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`, text: msg, isUser: true, timestamp: new Date(),
    }]);
    setIsAiTyping(true);
    isStreamingRef.current = true;
    try {
      try {
        const r = await useAnalysisCredit();
        updateUserProfile({ available_analyses: r.available_analyses });
      } catch (e) { logger.error('Credit deduct fail:', e); }
      const aid = `ai-${Date.now()}`;
      streamTextRef.current = '';
      setMessages(prev => [...prev, { id: aid, text: '', isUser: false, timestamp: new Date() }]);
      const onData = (data: any) => {
        if (data.type === 'stream' && data.content) {
          streamTextRef.current += data.content;
          setRenderTick(n => n + 1);
          setMessages(prev => {
            const i = prev.findIndex(m => m.id === aid);
            if (i < 0) return prev;
            const u = [...prev];
            u[i] = { ...u[i], text: streamTextRef.current };
            return u;
          });
        } else if (data.type === 'complete') {
          const fin = data.content || streamTextRef.current;
          isStreamingRef.current = false;
          setIsAiTyping(false);
          let cl = fin;
          const nm = cl.match(/\[NAME_CHANGE\s*=\s*["']([^"']*)["']\]/);
          if (nm) { cl = cl.replace(nm[0], '').trim(); }
          cl = cl.replace(/\[SYMBOLS\s*=\s*["']([^"']*)["']\]/g, '').trim();
          const { processedContent, hasPaymentTrigger } = processMessageContent(cl);
          setMessages(prev => {
            const i = prev.findIndex(m => m.id === aid);
            if (i < 0) return prev;
            const u = [...prev];
            u[i] = { ...u[i], text: processedContent };
            return u;
          });
          if (nm && currentChatId) {
            updateChatTitle(currentChatId, nm[1]).then(() => {
              setCurrentChatTitle(nm[1]);
              setChats(prev => prev.map(c =>
                c.id === currentChatId ? { ...c, title: nm![1] } : c
              ));
            }).catch(logger.error);
          }
          if (hasPaymentTrigger && (user?.available_analyses ?? 0) <= 0) {
            setPaymentTriggered(true);
            setShowUpsell(true);
          }
        } else if (data.error) {
          isStreamingRef.current = false;
          setIsAiTyping(false);
          setMessages(prev => {
            const i = prev.findIndex(m => m.id === aid);
            if (i < 0) return prev;
            const u = [...prev];
            u[i] = { ...u[i], text: `Ошибка: ${data.error}` };
            return u;
          });
        }
      };
      await sendMessageStream(msg, onData);
      if (isStreamingRef.current) { isStreamingRef.current = false; setIsAiTyping(false); }
    } catch (error) {
      logger.error('Deep analysis start err:', error);
      isStreamingRef.current = false;
      setIsAiTyping(false);
    }
  };

  const handleSelectChat = async (chat: Chat) => {
    isStreamingRef.current = false;
    streamTextRef.current = '';
    setIsAiTyping(false);
    try {
      // Switch to the selected chat
      const switchResult = await switchChat(chat.id);
      setCurrentChatId(chat.id);
      setCurrentChatTitle(chat.title);
      // Load messages for the selected chat
      const chatMessages = switchResult.messages || [];
      // Filter out system messages and convert to UI format
      let hasPaymentTrigger = false;
      let hasCreditTrigger = false;
      const uiMessages = chatMessages
        .filter((msg: any) => msg.role !== 'system')  // Don't show system messages to users
        .map((msg: any, index: number) => {
          // Process the message content to remove triggers
          const { processedContent: content, hasPaymentTrigger: messageHasPaymentTrigger, hasCreditTrigger: messageHasCreditTrigger, nameChangeValue } = processMessageContent(msg.content);
          if (messageHasPaymentTrigger) {
            hasPaymentTrigger = true;
          }
          if (messageHasCreditTrigger) {
            hasCreditTrigger = true;
          }
          // Handle name change trigger when loading messages
          if (nameChangeValue && currentChatId) {
            updateChatTitle(currentChatId, nameChangeValue)
              .then(() => {
                setCurrentChatTitle(nameChangeValue);
                // Update in the chat list as well
                setChats(prev => prev.map(chat =>
                  chat.id === currentChatId ? { ...chat, title: nameChangeValue } : chat
                ));
              })
              .catch(error => {
                logger.error('Error updating chat title:', error);
              });
          }
          return {
            id: `${msg.timestamp || Date.now()}-${index}`,
            text: content,
            isUser: msg.role === 'user',
            timestamp: new Date(msg.timestamp || Date.now())
          };
        });
      setMessages(uiMessages);
      // Списываем кредит если в загруженных сообщениях был триггер использования
      if (hasCreditTrigger) {
        useAnalysisCredit().then(r => {
          updateUserProfile({ available_analyses: r.available_analyses });
        }).catch(e => { logger.error('Deduct credit fail:', e); });
      }
      // UpsellCard показываем только если кредитов реально нет
      if (hasPaymentTrigger) {
        setPaymentTriggered(true);
        if ((user?.available_analyses ?? 0) <= 0) {
          setShowUpsell(true);
        }
      }
    } catch (error) {
      logger.error('Error switching chat:', error);
      toast.error('Ошибка при переключении чата');
    }
  };
  
  const handleDeleteChat = (chatId: string, event: React.MouseEvent) => {
    // Prevent the click from also selecting the chat
    event.stopPropagation();
    // Open a styled confirmation modal instead of native confirm()
    setChatPendingDeletion(chatId);
  };

  const confirmDeleteChat = async () => {
    const chatId = chatPendingDeletion;
    if (!chatId) return;
    setChatPendingDeletion(null);
    try {
      await deleteChat(chatId);
      // Remove the chat from the UI
      setChats(prev => prev.filter(chat => chat.id !== chatId));
      // If we're deleting the current chat, switch to another chat or create a new one
      if (currentChatId === chatId) {
        setChats(prevChats => {
          const remainingChats = prevChats.filter(chat => chat.id !== chatId);
          if (remainingChats.length > 0) {
            // Use setTimeout to avoid state update timing issues
            setTimeout(() => {
              const nextChat = remainingChats[0];
              handleSelectChat(nextChat).catch(logger.error);
            }, 0);
          } else {
            // No remaining chats, create a new one
            setTimeout(() => {
              handleCreateNewChat();
            }, 0);
          }
          return remainingChats;
        });
      }
    } catch (error) {
      logger.error('Error deleting chat:', error);
      toast.error('Ошибка при удалении чата');
    }
  };
  
  const handleRenameChat = async (chatId: string, newTitle: string) => {
    try {
      // Call the API to update the chat title on the backend
      await updateChatTitle(chatId, newTitle);
      // Update the chat in the UI immediately
      setChats(prev => prev.map(chat =>
        chat.id === chatId ? { ...chat, title: newTitle, timestamp: new Date() } : chat
      ));
      // If this is the current chat, update the current chat title too
      if (currentChatId === chatId) {
        setCurrentChatTitle(newTitle);
      }
      // Exit renaming mode
      setRenamingChatId(null);
      setNewChatTitle('');
      return true;
    } catch (error) {
      logger.error('Error renaming chat:', error);
      toast.error('Ошибка при переименовании чата');
      return false;
    }
  };
  
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isAiTyping || !currentChatId) return;
    if (isRecording) {
      stopRecording();
    }
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      text: inputValue,
      isUser: true,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsAiTyping(true);
    isStreamingRef.current = true;

    try {
      const aiResponseId = `ai-${Date.now()}`;
      streamTextRef.current = '';
      const initialAiMessage: Message = {
        id: aiResponseId,
        text: '',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, initialAiMessage]);

      const handleStreamData = (data: any) => {
        if (data.type === 'stream' && data.content) {
          streamTextRef.current += data.content;
          setRenderTick(n => n + 1);
          setMessages(prev => {
            const idx = prev.findIndex(msg => msg.id === aiResponseId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], text: streamTextRef.current };
            return updated;
          });
        } else if (data.type === 'complete') {
          const finalContent = data.content || streamTextRef.current;
          isStreamingRef.current = false;
          setIsAiTyping(false);

          let cleanContent = finalContent;
          let nameChangeValue: string | null = null;

          const nameChangeMatch = cleanContent.match(/\[NAME_CHANGE\s*=\s*["']([^"']*)["']\]/);
          if (nameChangeMatch) {
            nameChangeValue = nameChangeMatch[1];
            cleanContent = cleanContent.replace(nameChangeMatch[0], '').trim();
          }

          const symbolsMatch = cleanContent.match(/\[SYMBOLS\s*=\s*["']([^"']*)["']\]/);
          if (symbolsMatch) {
            cleanContent = cleanContent.replace(symbolsMatch[0], '').trim();
          }

          const { processedContent, hasPaymentTrigger, hasCreditTrigger } = processMessageContent(cleanContent);

          setMessages(prev => {
            const idx = prev.findIndex(msg => msg.id === aiResponseId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], text: processedContent };
            return updated;
          });

          if (nameChangeValue && currentChatId) {
            updateChatTitle(currentChatId, nameChangeValue)
              .then(() => {
                setCurrentChatTitle(nameChangeValue);
                setChats(prev => prev.map(chat =>
                  chat.id === currentChatId ? { ...chat, title: nameChangeValue } : chat
                ));
              })
              .catch(logger.error);
          }

          // Списываем кредит при обнаружении триггера использования
          if (hasCreditTrigger) {
            useAnalysisCredit().then(r => {
              updateUserProfile({ available_analyses: r.available_analyses });
            }).catch(e => { logger.error('Deduct credit fail:', e); });
          }

          // UpsellCard показываем только если реально нет кредитов
          if (hasPaymentTrigger) {
            setPaymentTriggered(true);
            if ((user?.available_analyses ?? 0) <= 0) {
              setShowUpsell(true);
            }
          }
        } else if (data.error) {
          isStreamingRef.current = false;
          setIsAiTyping(false);
          setMessages(prev => {
            const idx = prev.findIndex(msg => msg.id === aiResponseId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], text: `Ошибка: ${data.error}` };
            return updated;
          });
        }
      };

      await sendMessageStream(inputValue, handleStreamData);

      if (isStreamingRef.current) {
        isStreamingRef.current = false;
        setIsAiTyping(false);
      }
    } catch (error) {
      logger.error('Error sending message:', error);
      isStreamingRef.current = false;
      setIsAiTyping(false);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        text: "Ошибка при отправке сообщения",
        isUser: false,
        timestamp: new Date(),
      }]);
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isAiTyping) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handlePurchase = () => {
    // When user initiates purchase, show warning modal instead of direct payment
    setShowUpsell(false);
    setShowPaymentWarning(true);
  };
  
  const handlePlanSelection = (planId: string) => {
    // Call the parent's purchase handler to process the purchase
    onPurchase(planId);
  };
  
  const handlePurchaseSuccess = (planId: string) => {
    // Determine how many analyses were purchased based on the plan ID
    const plan = pricingPlans.find(p => p.id === planId);
    if (plan) {
      // Update user's available analyses count
      if (user) {
        const newAvailableAnalyses = (user.available_analyses || 0) + plan.analyses;
        updateUserProfile({ available_analyses: newAvailableAnalyses });
      }
    }
  };
  
  const handleOpenProfileForPayment = () => {
    // Open profile modal for user to select payment plan
    setShowPaymentWarning(false);
    onProfileOpen();
  };
  
  const handlePaymentStatusChange = (status: 'paid' | 'cancelled') => {
    setPaymentStatus(status);
    // Reset the payment trigger after handling the status
    setPaymentTriggered(false);
    // Show appropriate feedback to user
    if (status === 'paid') {
      logger.log('Платеж успешно завершен');
      // Here we can add any logic that should happen when payment is successful
    } else {
      logger.log('Платеж отменен');
      // Here we can add any logic that should happen when payment is cancelled
    }
  };
  
  // Helper function to process message content and detect triggers
  const processMessageContent = (content: string): { processedContent: string; hasPaymentTrigger: boolean; hasCreditTrigger: boolean; nameChangeValue: string | null; symbolsValue: string | null } => {
    let processedContent = content;
    let hasPaymentTrigger = false;
    let hasCreditTrigger = false;
    let nameChangeValue: string | null = null;
    let symbolsValue: string | null = null;
    
    // Extract and remove NAME_CHANGE trigger
    const nameChangeMatch = processedContent.match(/\[NAME_CHANGE\s*=\s*["']([^"']*)["']\]/);
    if (nameChangeMatch) {
      nameChangeValue = nameChangeMatch[1];
      // Remove the trigger from the content shown to user
      processedContent = processedContent.replace(nameChangeMatch[0], '').trim();
    }
    
    // Extract and remove SYMBOLS trigger (dream summary)
    const symbolsMatch = processedContent.match(/\[SYMBOLS\s*=\s*["']([^"']*)["']\]/);
    if (symbolsMatch) {
      symbolsValue = symbolsMatch[1];
      // Remove the trigger from the content shown to user
      processedContent = processedContent.replace(symbolsMatch[0], '').trim();
    }
    
    if (content.includes('[ACTION: TRIGGER_PAYMENT_ROBOKASSA]')) {
      processedContent = content.replace(/\[ACTION:\s*TRIGGER_PAYMENT_ROBOKASSA\]/g, '').trim();
      hasPaymentTrigger = true;
    } else if (content.includes('[ACTION: TRIGGER_USE_ANALYSIS_CREDIT]')) {
      processedContent = content.replace(/\[ACTION:\s*TRIGGER_USE_ANALYSIS_CREDIT\]/g, '').trim();
      hasCreditTrigger = true;
    }
    
    return { processedContent, hasPaymentTrigger, hasCreditTrigger, nameChangeValue, symbolsValue };
  };
  
  const toggleRecording = async () => {
    // Check if browser supports speech recognition
    const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    // Check if browser supports media devices
    const hasMediaDevices = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    
    if (hasSpeechRecognition && hasMediaDevices) {
      try {
        // Request microphone permission before starting recognition
        await navigator.mediaDevices.getUserMedia({ audio: true });
        if (isRecording) {
          // If currently recording, stop the existing recognition
          stopRecording();
        } else {
          // If not recording, create a new recognition instance
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          const recognition = new SpeechRecognition();
          recognition.continuous = true;  // Keep listening until stopped
          recognition.interimResults = true;  // Show results while speaking
          recognition.lang = 'ru-RU';  // Set language to Russian
          
          recognition.onstart = () => {
            setIsRecording(true);
          };
          
          recognition.onresult = (event: any) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i];
              if (result.isFinal) {
                transcript += result[0].transcript + ' ';
              } else {
                // For interim results (while still speaking)
                transcript += result[0].transcript;
              }
            }
            setInputValue(transcript);
          };
          
          recognition.onerror = (event: any) => {
            logger.error('Speech recognition error', event.error);
            setIsRecording(false);
            if (event.error === 'no-speech') {
              toast.error('Не удалось распознать речь. Пожалуйста, повторите попытку.');
            } else if (event.error === 'audio-capture') {
              toast.error('Ошибка захвата аудио. Проверьте настройки микрофона.');
            } else if (event.error === 'not-allowed') {
              toast.error('Микрофон заблокирован. Разрешите доступ к микрофону в настройках браузера.');
            } else {
              toast.error(`Ошибка распознавания речи: ${event.error}`);
            }
          };
          
          recognition.onend = () => {
            // If the recognition stopped but we're still in a "recording" state,
            // it might have stopped automatically, so we'll reset the recording state
            setIsRecording(false);
          };
          
          // Start the recognition
          recognition.start();
          recognitionRef.current = recognition; // Store the reference
        }
      } catch (error) {
        logger.error('Error accessing microphone:', error);
        if ((error as any).name === 'NotAllowedError') {
          toast.error('Доступ к микрофону запрещен. Пожалуйста, разрешите доступ к микрофону в настройках браузера.');
        } else if ((error as any).name === 'NotFoundError' || (error as any).name === 'DevicesNotFoundError') {
          toast.error('Микрофон не найден на этом устройстве.');
        } else {
          toast.error('Произошла ошибка при доступе к микрофону. Пожалуйста, убедитесь, что микрофон подключен и разрешен в настройках браузера.');
        }
      }
    } else {
      let errorMessage = 'Распознавание речи не поддерживается в вашем браузере. Пожалуйста, используйте современный браузер, например, Chrome.';
      if (!hasMediaDevices) {
        errorMessage = 'Доступ к микрофону недоступен. Убедитесь, что вы используете безопасное соединение (HTTPS), и современный браузер, например, Chrome.';
      }
      toast.error(errorMessage);
    }
  };
  
  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null; // Clear the reference after stopping
    }
    setIsRecording(false);
  };
  
  const handleMenuClick = () => {
    setShowMenu(true);
  };
  
  const handleLogout = () => {
    logout();
    setShowMenu(false);
  };
  
  return (
    <div className="flex flex-col h-screen bg-[#0D0B24] relative overflow-hidden">
      <AnimatedBackground />

      {/* Main content container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay when sidebar is open */}
        {showSidebar && !isDesktop && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setShowSidebar(false)}
          ></div>
        )}

        {/* Sidebar */}
        {showSidebar && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={`fixed md:static z-50 backdrop-blur-xl flex flex-col border-r border-[rgba(169,152,255,0.3)] bg-[#1A1640] ${
              isDesktop ? 'w-64 h-full' : 'w-full h-screen'
            }`}
            style={{
              minWidth: isDesktop ? '256px' : undefined,
              top: 0,
              left: 0,
            }}
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside sidebar
          >
            <div className="p-4 border-b border-[rgba(169,152,255,0.3)]">
              <div className="flex items-center justify-between">
                <h2 className="text-[#F4E0A7] font-tech text-lg">Чаты</h2>
                <div className="flex space-x-2">
                  <motion.button
                    onClick={handleCreateNewChat}
                    aria-label="Новый чат"
                    title="Новый чат"
                    className="p-2 rounded-lg bg-[rgba(169,152,255,0.2)] hover:bg-[rgba(169,152,255,0.3)] text-[#A998FF] transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Plus className="w-5 h-5" />
                  </motion.button>
                  <motion.button
                    onClick={() => setShowSidebar(false)}
                    aria-label="Свернуть список чатов"
                    title="Свернуть список чатов"
                    className="p-2 rounded-lg bg-[rgba(244,224,167,0.1)] hover:bg-[rgba(244,224,167,0.2)] text-[#F4E0A7] transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {isLoadingChats ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#A998FF]"></div>
                </div>
              ) : chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4">
                  <p className="text-[#B8B5D1] text-center mb-4">У вас пока нет чатов</p>
                  <motion.button
                    onClick={handleCreateNewChat}
                    disabled={isCreatingChat}
                    className={`px-4 py-2 rounded-lg text-[#F4E0A7] transition-colors ${
                      isCreatingChat
                        ? 'bg-[rgba(169,152,255,0.2)] cursor-not-allowed'
                        : 'bg-[rgba(169,152,255,0.2)] hover:bg-[rgba(169,152,255,0.3)]'
                    }`}
                    whileHover={isCreatingChat ? {} : { scale: 1.05 }}
                    whileTap={isCreatingChat ? {} : { scale: 0.95 }}
                  >
                    {isCreatingChat ? (
                      <span className="flex items-center">
                        <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-r-2 border-[#F4E0A7] rounded-full"></span>
                        Создание...
                      </span>
                    ) : (
                      'Создать чат'
                    )}
                  </motion.button>
                </div>
              ) : (
                <AnimatePresence>
                  {chats.map((chat) => (
                    <motion.div
                      key={chat.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`p-3 rounded-xl mb-2 cursor-pointer transition-all ${
                        currentChatId === chat.id
                          ? 'bg-[rgba(169,152,255,0.3)] border border-[rgba(169,152,255,0.5)]'
                          : 'hover:bg-[rgba(169,152,255,0.1)]'
                      }`}
                      onClick={() => handleSelectChat(chat)}
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 mt-0.5 text-[#A998FF] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          {renamingChatId === chat.id ? (
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={newChatTitle}
                                onChange={(e) => setNewChatTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleRenameChat(chat.id, newChatTitle);
                                  } else if (e.key === 'Escape') {
                                    setRenamingChatId(null);
                                    setNewChatTitle('');
                                  }
                                }}
                                className="flex-1 bg-transparent text-[#F4E0A7] outline-none border-b border-[#A998FF] focus:border-[#F4E0A7] text-sm"
                                autoFocus
                                maxLength={50}
                              />
                              <button
                                onClick={() => handleRenameChat(chat.id, newChatTitle)}
                                aria-label="Сохранить название"
                                title="Сохранить название"
                                className="text-[#A998FF] hover:text-[#F4E0A7] transition-colors p-1"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <div>
                              <h3
                                className="text-[#F4E0A7] text-sm font-medium truncate cursor-pointer hover:text-[#A998FF] transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent the chat selection
                                  setRenamingChatId(chat.id);
                                  setNewChatTitle(chat.title);
                                }}
                              >
                                {chat.title}
                              </h3>
                              <p className="text-[#B8B5D1] text-xs mt-1 opacity-70">
                                {chat.timestamp.toLocaleDateString()}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {renamingChatId !== chat.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent the chat selection
                                setRenamingChatId(chat.id);
                                setNewChatTitle(chat.title);
                              }}
                              aria-label="Переименовать чат"
                              title="Переименовать чат"
                              className="text-[#B8B5D1] hover:text-[#A998FF] transition-colors p-1 rounded hover:bg-[rgba(169,152,255,0.1)]"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDeleteChat(chat.id, e)}
                            aria-label="Удалить чат"
                            title="Удалить чат"
                            className="text-[#B8B5D1] hover:text-[#F4E0A7] transition-colors p-1 rounded hover:bg-[rgba(244,224,167,0.1)]"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
            <div className="p-4 border-t border-[rgba(169,152,255,0.3)]">
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 text-[#F4E0A7] hover:bg-[rgba(244,224,167,0.15)] rounded-lg transition-colors text-sm"
              >
                Выйти
              </button>
            </div>
          </motion.div>
        )}

        {/* Main Chat Area */}
        {/* На desktop сайдбар md:static уже занимает 256px в потоке flex,
            поэтому дополнительный marginLeft не нужен (иначе двойной сдвиг). */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Menu dropdown (moved out of scroller) */}
          {showMenu && (
            <div className="absolute top-20 right-4 z-70 bg-[#1A1640] border border-[rgba(169,152,255,0.3)] backdrop-blur-xl rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-2 min-w-[160px]">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-[#F4E0A7] hover:bg-[rgba(244,224,167,0.15)] rounded-lg transition-colors"
              >
                Выйти
              </button>
            </div>
          )}

          {/* Header - fixed height */}
          <header
            className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 flex-shrink-0"
            style={{
              borderBottom: '1px solid rgba(169, 152, 255, 0.12)',
              backdropFilter: 'blur(20px)',
              background: 'rgba(13, 11, 36, 0.8)',
            }}
          >
            {/* Left Group */}
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                aria-label={showSidebar ? 'Свернуть список чатов' : 'Открыть список чатов'}
                title={showSidebar ? 'Свернуть список чатов' : 'Открыть список чатов'}
                className="text-[#B8B5D1] hover:text-[#F4E0A7] transition-colors p-2 rounded-xl hover:bg-[rgba(169,152,255,0.1)]"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 sm:gap-3">
                <div
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(169, 152, 255, 0.3), rgba(244, 224, 167, 0.25))',
                    boxShadow: '0 0 16px rgba(169, 152, 255, 0.3)',
                  }}
                >
                  <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-[#F4E0A7]" />
                </div>
                <div>
                  <h1 className="text-[#F4E0A7] text-[17px] sm:text-[20px] font-mystical" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {currentChatTitle}
                  </h1>
                  <div className="text-[#B8B5D1] text-[10px] sm:text-xs hidden sm:block font-body italic">Хранитель снов</div>
                </div>
              </div>
            </div>
            {/* Right Group (Moved Button) */}
            <button
              onClick={onProfileOpen}
              className="text-[#F4E0A7] bg-[rgba(244,224,167,0.1)] hover:bg-[rgba(244,224,167,0.2)] border border-[rgba(244,224,167,0.2)] hover:border-[rgba(244,224,167,0.4)] transition-colors p-3 rounded-xl shadow-[0_0_12px_rgba(244,224,167,0.2)]"
              aria-label="Профиль"
            >
              <User className="w-5 h-5" />
            </button>
          </header>

          {/* Messages Container - FIXED HEIGHT WITH INTERNAL SCROLLING */}
          <div className="flex-1 overflow-hidden px-4 sm:px-6 py-4 sm:py-6 relative z-10">
            <div className="max-w-4xl mx-auto h-full flex flex-col">
              {currentChatId ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Messages scroll container */}
                  <div className="flex-1 overflow-y-auto pb-4">
                    <AnimatePresence>
                      {messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message.text}
                          isUser={message.isUser}
                        />
                      ))}
                    </AnimatePresence>
                    {showUpsell && (
                      <UpsellCard
                        price="499₽"
                        onPurchase={handlePurchase}
                        availableAnalyses={user?.available_analyses ?? 0}
                        onUseCredit={handleStartDeepAnalysis}
                      />
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[50vh]">
                  <h2 className="text-[#F4E0A7] text-xl mb-6 text-center font-mystical"><span className="brand">Amnis</span>, хранитель снов</h2>
                  <p className="text-[#B8B5D1] text-center mb-8 max-w-md">
                    Создайте чат, чтобы начать анализировать ваши сны и раскрывать тайны подсознания
                  </p>
                  <motion.button
                    onClick={handleCreateNewChat}
                    disabled={isCreatingChat}
                    className={`px-6 py-3 rounded-xl text-[#F4E0A7] transition-colors ${
                      isCreatingChat
                        ? 'bg-[rgba(169,152,255,0.2)] cursor-not-allowed'
                        : 'bg-[rgba(169,152,255,0.2)] hover:bg-[rgba(169,152,255,0.3)]'
                    }`}
                    whileHover={isCreatingChat ? {} : { scale: 1.05 }}
                    whileTap={isCreatingChat ? {} : { scale: 0.95 }}
                  >
                    {isCreatingChat ? (
                      <span className="flex items-center justify-center">
                        <span className="animate-spin h-4 w-4 mr-2 border-t-2 border-r-2 border-[#F4E0A7] rounded-full"></span>
                        Создание чата...
                      </span>
                    ) : (
                      'Создать чат'
                    )}
                  </motion.button>
                </div>
              )}
            </div>
          </div>

      {/* Input */}
      <div
        className="relative z-10 px-4 sm:px-6 py-4 sm:py-6"
        style={{
          borderTop: '1px solid rgba(169, 152, 255, 0.12)',
          backdropFilter: 'blur(20px)',
          background: 'rgba(13, 11, 36, 0.8)',
        }}
      >
        <div className="max-w-4xl mx-auto">
          {isAiTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 mb-3 text-[#B8B5D1] text-sm"
            >
              <div className="flex gap-1">
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                  className="w-2 h-2 rounded-full bg-[#A998FF]"
                />
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                  className="w-2 h-2 rounded-full bg-[#A998FF]"
                />
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                  className="w-2 h-2 rounded-full bg-[#A998FF]"
                />
              </div>
              <span className="font-body italic">
                <span className="brand">Amnis</span> раскрывает тайны вашего сна...
              </span>
            </motion.div>
          )}

          <div
            className={`flex items-end gap-2 sm:gap-3 rounded-[20px] sm:rounded-[24px] px-4 sm:px-5 py-3 sm:py-4 transition-all duration-300 ${
              (showUpsell && paymentTriggered && (user?.available_analyses ?? 0) <= 0) || isAiTyping ? 'opacity-40 pointer-events-none' : ''
            }`}
            style={{
              background: 'linear-gradient(135deg, rgba(26, 22, 64, 0.6), rgba(37, 31, 92, 0.4))',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(169, 152, 255, 0.2)',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
            }}
          >
            <motion.button
              onClick={toggleRecording}
              disabled={(showUpsell && paymentTriggered && (user?.available_analyses ?? 0) <= 0) || isAiTyping}
              aria-label={isRecording ? 'Остановить запись' : 'Записать голосовое сообщение'}
              title={isRecording ? 'Остановить запись' : 'Записать голосовое сообщение'}
              className={`transition-colors p-2 rounded-xl flex-shrink-0 ${
                isRecording
                  ? 'text-[#F4E0A7] bg-[rgba(244,224,167,0.15)]'
                  : 'text-[#A998FF] hover:text-[#F4E0A7] hover:bg-[rgba(169,152,255,0.1)]'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              <Mic className="w-5 h-5" />
            </motion.button>

            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                isAiTyping
                  ? "Amnis размышляет..."
                  : (showUpsell && paymentTriggered && (user?.available_analyses ?? 0) <= 0)
                  ? "Завершите оформление анализа для продолжения..."
                  : "Опишите ваш сон подробно..."
              }
              disabled={(showUpsell && paymentTriggered && (user?.available_analyses ?? 0) <= 0) || isAiTyping}
              className="flex-1 bg-transparent text-[#E8E6F5] placeholder-[#B8B5D1] outline-none resize-none max-h-32 py-1 text-sm sm:text-base disabled:cursor-not-allowed"
              rows={1}
              style={{ minHeight: '24px' }}
            />

            <motion.button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || (showUpsell && paymentTriggered && (user?.available_analyses ?? 0) <= 0) || isAiTyping}
              aria-label="Отправить сообщение"
              title="Отправить сообщение"
              className={`p-2 rounded-xl flex-shrink-0 transition-all ${
                inputValue.trim() && !(showUpsell && paymentTriggered && (user?.available_analyses ?? 0) <= 0) && !isAiTyping
                  ? 'text-[#F4E0A7] hover:bg-[rgba(244,224,167,0.15)]'
                  : 'text-[#B8B5D1] opacity-40 cursor-not-allowed'
              }`}
              whileHover={inputValue.trim() && !(showUpsell && paymentTriggered && (user?.available_analyses ?? 0) <= 0) && !isAiTyping ? { scale: 1.05 } : {}}
              whileTap={inputValue.trim() && !(showUpsell && paymentTriggered && (user?.available_analyses ?? 0) <= 0) && !isAiTyping ? { scale: 0.95 } : {}}
            >
              <Send className="w-5 h-5" />
            </motion.button>
          </div>

          <p className="text-center text-[#B8B5D1] text-[11px] sm:text-xs mt-2 sm:mt-3 opacity-60">
            Amnis анализирует символы на основе психологии снов
          </p>
        </div>
      </div>
    </div>
  </div>


      {/* Payment Warning Modal - only once, outside the main content container */}
      <PaymentWarningModal
        open={showPaymentWarning}
        onOpenChange={setShowPaymentWarning}
        onOpenProfile={handleOpenProfileForPayment}
      />

      {/* Delete chat confirmation modal */}
      <AnimatePresence>
        {chatPendingDeletion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100001] flex items-center justify-center bg-[rgba(13,11,36,0.9)] backdrop-blur-xl p-4"
            onClick={() => setChatPendingDeletion(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md p-8 rounded-3xl bg-gradient-to-br from-[rgba(26,22,64,0.95)] to-[rgba(37,31,92,0.95)] border border-[rgba(169,152,255,0.3)] backdrop-blur-2xl shadow-[0_0_80px_rgba(169,152,255,0.2)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-mystical text-[#F4E0A7] mb-3 text-center">Удалить чат?</h3>
              <p className="text-[#B8B5D1] mb-6 text-center text-sm">
                Это действие нельзя отменить. Вся история этого чата будет удалена безвозвратно.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setChatPendingDeletion(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm text-[#E8E6F5] border border-[rgba(169,152,255,0.3)] hover:bg-[rgba(169,152,255,0.1)] transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmDeleteChat}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm text-red-100 bg-red-500/25 border border-red-500/40 hover:bg-red-500/35 transition-colors"
                >
                  Удалить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Blocking modal shown during chat creation - moved to end and ensure highest z-index */}
      {showCreatingChatModal && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-[rgba(13,11,36,0.9)] backdrop-blur-xl">
          <div className="relative w-full max-w-md p-8 rounded-3xl bg-gradient-to-br from-[rgba(26,22,64,0.95)] to-[rgba(37,31,92,0.95)] border border-[rgba(169,152,255,0.3)] backdrop-blur-2xl shadow-[0_0_80px_rgba(169,152,255,0.2)]">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-gradient-to-br from-[rgba(244,224,167,0.3)] to-[rgba(169,152,255,0.25)] shadow-[0_0_24px_rgba(244,224,167,0.4)]">
                <Moon className="w-8 h-8 text-[#F4E0A7]" />
              </div>
              <h3 className="text-xl font-tech text-[#F4E0A7] mb-2">Создание нового чата</h3>
              <p className="text-[#B8B5D1] mb-6">Пожалуйста, подождите... Инициализация вашего персонального помощника по анализу снов</p>
              <div className="flex justify-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-[#A998FF] animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-3 h-3 rounded-full bg-[#A998FF] animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                <div className="w-3 h-3 rounded-full bg-[#A998FF] animate-pulse" style={{ animationDelay: '0.5s' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <FloatingSparkles />
    </div>
  );
}