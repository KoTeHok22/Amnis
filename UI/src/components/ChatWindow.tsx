import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageBubble } from './MessageBubble';
import { UpsellCard } from './UpsellCard';
import { AnimatedBackground } from './StarField';
import { FloatingSparkles } from './SparkleIcon';
import { Send, Mic, MicOff, Menu, Moon, Plus, MessageSquare, User, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { createChat, sendMessage, sendMessageStream, getUserChats, switchChat, deleteChat, getChatMessages, updateChatTitle } from '../services/chatApi';
import { ProfileModal } from './ProfileModal';
import PaymentWarningModal from './PaymentWarningModal';
import { usePayment } from '../context/PaymentContext';

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
        console.error('Error parsing creating chat state:', error);
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
  
  // Check for ongoing chat creation in localStorage on component mount
  const [showCreatingChatModal, setShowCreatingChatModal] = useState<boolean>(() => {
    const savedCreatingState = localStorage.getItem('creatingChatState');
    return savedCreatingState ? JSON.parse(savedCreatingState).showCreatingChatModal : false;
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null); // Reference to hold the recognition instance
  
  const pricingPlans = [
    { id: 'plan-1', name: 'Одиночный', analyses: 1, price: 199, pricePerAnalysis: 199, popular: false },
    { id: 'plan-5', name: 'Начальный', analyses: 5, price: 799, pricePerAnalysis: 160, popular: true },
    { id: 'plan-10', name: 'Глубокий', analyses: 10, price: 1399, pricePerAnalysis: 140, popular: false },
    { id: 'plan-15', name: 'Мастер', analyses: 15, price: 1899, pricePerAnalysis: 127, popular: false },
  ];
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
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
      // If there are existing chats, load the most recent one
      if (loadedChats.length > 0) {
        const mostRecentChat = loadedChats[0];
        setCurrentChatId(mostRecentChat.id);
        setCurrentChatTitle(mostRecentChat.title);
        // Load messages for the most recent chat
        try {
          const switchResult = await switchChat(mostRecentChat.id);
          setCurrentChatId(mostRecentChat.id);
          setCurrentChatTitle(mostRecentChat.title);
          // Load messages for the selected chat
          const chatMessages = switchResult.messages || [];
          // Filter out system messages and convert to UI format
          let hasPaymentTrigger = false;
          const uiMessages = chatMessages
            .filter((msg: any) => msg.role !== 'system')  // Don't show system messages to users
            .map((msg: any, index: number) => {
              // Process the message content to remove triggers
              const { processedContent: content, hasPaymentTrigger: messageHasPaymentTrigger, nameChangeValue, symbolsValue } = processMessageContent(msg.content);
              if (messageHasPaymentTrigger) {
                hasPaymentTrigger = true;
              }
              // Handle name change and symbols triggers if needed when loading messages
              if (nameChangeValue && currentChatId) {
                // Update chat title in a separate operation if this is the current chat
                updateChatTitle(currentChatId, nameChangeValue)
                  .then(() => {
                    setCurrentChatTitle(nameChangeValue);
                    // Update in the chat list as well
                    setChats(prev => prev.map(chat =>
                      chat.id === currentChatId ? { ...chat, title: nameChangeValue } : chat
                    ));
                  })
                  .catch(error => {
                    console.error('Error updating chat title:', error);
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
          // Update payment trigger state if any message contained a payment trigger
          if (hasPaymentTrigger) {
            setPaymentTriggered(true);
            setShowUpsell(true);
          }
        } catch (error) {
          console.error('Error loading most recent chat messages:', error);
          setMessages([]); // Clear messages if loading fails
        }
      } else {
        // If no existing chats, don't create one automatically, let the user do it
        setCurrentChatId(null);
        setCurrentChatTitle('Новый чат');
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading user chats:', error);
      // Even if loading fails, we still need to handle the UI state
      setChats([]);
      setCurrentChatId(null);
      setCurrentChatTitle('Новый чат');
      setMessages([]);
    } finally {
      setIsLoadingChats(false);
    }
  };
  
  const handleCreateNewChat = async () => {
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
      // Process the greeting message for potential triggers
      const { processedContent: processedGreeting, hasPaymentTrigger, nameChangeValue, symbolsValue } = processMessageContent(greetingMessage);
      if (hasPaymentTrigger) {
        setPaymentTriggered(true);
        setShowUpsell(true);
      }
      // Add only the friendly greeting to the UI
      setMessages([{
        id: '1',
        text: processedGreeting,
        isUser: false,
        timestamp: new Date(),
      }]);
    } catch (error) {
      console.error('Error creating chat:', error);
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
  
  const handleSelectChat = async (chat: Chat) => {
    try {
      // Switch to the selected chat
      const switchResult = await switchChat(chat.id);
      setCurrentChatId(chat.id);
      setCurrentChatTitle(chat.title);
      // Load messages for the selected chat
      const chatMessages = switchResult.messages || [];
      // Filter out system messages and convert to UI format
      let hasPaymentTrigger = false;
      const uiMessages = chatMessages
        .filter((msg: any) => msg.role !== 'system')  // Don't show system messages to users
        .map((msg: any, index: number) => {
          // Process the message content to remove triggers
          const { processedContent: content, hasPaymentTrigger: messageHasPaymentTrigger, nameChangeValue, symbolsValue } = processMessageContent(msg.content);
          if (messageHasPaymentTrigger) {
            hasPaymentTrigger = true;
          }
          // Handle name change and symbols triggers if needed when loading messages
          if (nameChangeValue && currentChatId) {
            // Update chat title in a separate operation if this is the current chat
            updateChatTitle(currentChatId, nameChangeValue)
              .then(() => {
                setCurrentChatTitle(nameChangeValue);
                // Update in the chat list as well
                setChats(prev => prev.map(chat =>
                  chat.id === currentChatId ? { ...chat, title: nameChangeValue } : chat
                ));
              })
              .catch(error => {
                console.error('Error updating chat title:', error);
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
      // Update payment trigger state if any message contained a payment trigger
      if (hasPaymentTrigger) {
        setPaymentTriggered(true);
        setShowUpsell(true);
      }
    } catch (error) {
      console.error('Error switching chat:', error);
      alert('Ошибка при переключении чата');
    }
  };
  
  const handleDeleteChat = async (chatId: string, event: React.MouseEvent) => {
    // Prevent the click from also selecting the chat
    event.stopPropagation();
    if (window.confirm('Вы уверены, что хотите удалить этот чат?')) {
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
                handleSelectChat(nextChat).catch(console.error);
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
        console.error('Error deleting chat:', error);
        alert('Ошибка при удалении чата');
      }
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
      console.error('Error renaming chat:', error);
      alert('Ошибка при переименовании чата');
      return false;
    }
  };
  
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isAiTyping || !currentChatId) return;
    // Stop recording if it's active
    if (isRecording) {
      stopRecording(); // This will stop the recording properly
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
    try {
      // Create an AI response message placeholder with a distinctive ID
      const aiResponseId = `ai-${Date.now()}`;
      const initialAiMessage: Message = {
        id: aiResponseId,
        text: '',
        isUser: false,
        timestamp: new Date(),
      };
      // Add the AI placeholder to messages
      setMessages(prev => [...prev, initialAiMessage]);
      // Use the streaming endpoint to get real-time responses
      await sendMessageStream(inputValue, (data) => {
        setMessages(prev => {
          const updatedMessages = [...prev];
          const aiMessageIndex = updatedMessages.findIndex(msg => msg.id === aiResponseId);
          if (aiMessageIndex !== -1) {
            if (data.type === 'stream' && data.content) {
              // Append streaming content to existing text
              updatedMessages[aiMessageIndex] = {
                ...updatedMessages[aiMessageIndex],
                text: updatedMessages[aiMessageIndex].text + data.content
              };
            } else if (data.type === 'complete' && data.content) {
              // Extract and process triggers without showing them to the user
              let contentWithoutTriggers = data.content;
              let nameChangeValue = null;
              let symbolsValue = null;
              // Extract NAME_CHANGE trigger
              const nameChangeMatch = contentWithoutTriggers.match(/\[NAME_CHANGE\s*=\s*["']([^"']*)["']\]/);
              if (nameChangeMatch) {
                nameChangeValue = nameChangeMatch[1];
                // Remove the trigger from the content shown to user
                contentWithoutTriggers = contentWithoutTriggers.replace(nameChangeMatch[0], '').trim();
              }
              // Extract SYMBOLS trigger (dream summary)
              const symbolsMatch = contentWithoutTriggers.match(/\[SYMBOLS\s*=\s*["']([^"']*)["']\]/);
              if (symbolsMatch) {
                symbolsValue = symbolsMatch[1];
                // Remove the trigger from the content shown to user
                contentWithoutTriggers = contentWithoutTriggers.replace(symbolsMatch[0], '').trim();
              }
              // Process other triggers like payment
              const {
                processedContent: additionalProcessedContent,
                hasPaymentTrigger,
                hasCreditTrigger,
                nameChangeValue: newExtractedNameChangeValue,
                symbolsValue: newExtractedSymbolsValue
              } = processMessageContent(contentWithoutTriggers);
              updatedMessages[aiMessageIndex] = {
                ...updatedMessages[aiMessageIndex],
                text: additionalProcessedContent
              };
              // After updating the message, handle the triggers separately
              const actualNameChangeValue = nameChangeValue || newExtractedNameChangeValue;
              const actualSymbolsValue = symbolsValue || newExtractedSymbolsValue;
              if (actualNameChangeValue && currentChatId) {
                // Update chat title in a separate operation
                updateChatTitle(currentChatId, actualNameChangeValue)
                  .then(() => {
                    setCurrentChatTitle(actualNameChangeValue);
                    // Update in the chat list as well
                    setChats(prev => prev.map(chat =>
                      chat.id === currentChatId ? { ...chat, title: actualNameChangeValue } : chat
                    ));
                  })
                  .catch(error => {
                    console.error('Error updating chat title:', error);
                  });
              }
              if (actualSymbolsValue) {
                // Process dream summary - this might require a backend API call to store it
                // For now, we're just processing it internally
              }
              if (hasPaymentTrigger) {
                setPaymentTriggered(true);
                setShowUpsell(true);
              }
            } else if (data.error) {
              // Handle errors
              updatedMessages[aiMessageIndex] = {
                ...updatedMessages[aiMessageIndex],
                text: `Ошибка: ${data.error}`
              };
            }
          }
          return updatedMessages;
        });
      });
      setIsAiTyping(false);
    } catch (error) {
      console.error('Error sending message:', error);
      setIsAiTyping(false);
      // Show error message
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        text: "Ошибка при отправке сообщения",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
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
      console.log('Платеж успешно завершен');
      // Here we can add any logic that should happen when payment is successful
    } else {
      console.log('Платеж отменен');
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
            console.error('Speech recognition error', event.error);
            setIsRecording(false);
            if (event.error === 'no-speech') {
              alert('Не удалось распознать речь. Пожалуйста, повторите попытку.');
            } else if (event.error === 'audio-capture') {
              alert('Ошибка захвата аудио. Проверьте настройки микрофона.');
            } else if (event.error === 'not-allowed') {
              alert('Микрофон заблокирован. Разрешите доступ к микрофону в настройках браузера.');
            } else {
              alert(`Ошибка распознавания речи: ${event.error}`);
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
        console.error('Error accessing microphone:', error);
        if ((error as any).name === 'NotAllowedError') {
          alert('Доступ к микрофону запрещен. Пожалуйста, разрешите доступ к микрофону в настройках браузера.');
        } else if ((error as any).name === 'NotFoundError' || (error as any).name === 'DevicesNotFoundError') {
          alert('Микрофон не найден на этом устройстве.');
        } else {
          alert('Произошла ошибка при доступе к микрофону. Пожалуйста, убедитесь, что микрофон подключен и разрешен в настройках браузера.');
        }
      }
    } else {
      let errorMessage = 'Распознавание речи не поддерживается в вашем браузере.';
      if (!hasMediaDevices) {
        errorMessage += '\nДоступ к микрофону недоступен. Убедитесь, что вы используете безопасное соединение (HTTPS).';
      }
      alert(errorMessage + '\nПожалуйста, используйте современный браузер, например, Chrome.');
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
                    className="p-2 rounded-lg bg-[rgba(169,152,255,0.2)] hover:bg-[rgba(169,152,255,0.3)] text-[#A998FF] transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Plus className="w-5 h-5" />
                  </motion.button>
                  <motion.button
                    onClick={() => setShowSidebar(false)}
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
                              className="text-[#B8B5D1] hover:text-[#A998FF] transition-colors p-1 rounded hover:bg-[rgba(169,152,255,0.1)]"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDeleteChat(chat.id, e)}
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
        <div className="flex-1 flex flex-col min-h-0" style={{
          marginLeft: showSidebar && isDesktop ? '256px' : '0',
          transition: 'margin-left 0.3s ease',
        }}>
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
                  <h1 className="text-[#F4E0A7] text-[17px] sm:text-[20px]" style={{ fontFamily: 'Philosopher, serif', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {currentChatTitle}
                  </h1>
                  <div className="text-[#B8B5D1] text-[10px] sm:text-xs hidden sm:block" style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic' }}>Хранитель снов</div>
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
                          onPlayAudio={!message.isUser ? () => alert('TTS функция будет воспроизводить голос') : undefined}
                        />
                      ))}
                    </AnimatePresence>
                    {showUpsell && (
                      <UpsellCard price="499₽" onPurchase={handlePurchase} />
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[50vh]">
                  <h2 className="text-[#F4E0A7] text-xl font-tech mb-6 text-center">Amnis, хранитель снов</h2>
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
              <span style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic' }}>
                Amnis раскрывает тайны вашего сна...
              </span>
            </motion.div>
          )}

          <div
            className={`flex items-end gap-2 sm:gap-3 rounded-[20px] sm:rounded-[24px] px-4 sm:px-5 py-3 sm:py-4 transition-all duration-300 ${
              (showUpsell && paymentTriggered) || isAiTyping ? 'opacity-40 pointer-events-none' : ''
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
              disabled={(showUpsell && paymentTriggered) || isAiTyping}
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
                  : (showUpsell && paymentTriggered)
                  ? "Завершите оформление анализа для продолжения..."
                  : showUpsell
                  ? "Завершите оформление анализа для продолжения..."
                  : "Опишите ваш сон подробно..."
              }
              disabled={(showUpsell && paymentTriggered) || isAiTyping}
              className="flex-1 bg-transparent text-[#E8E6F5] placeholder-[#B8B5D1] outline-none resize-none max-h-32 py-1 text-sm sm:text-base disabled:cursor-not-allowed"
              rows={1}
              style={{ minHeight: '24px' }}
            />

            <motion.button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || (showUpsell && paymentTriggered) || isAiTyping}
              className={`p-2 rounded-xl flex-shrink-0 transition-all ${
                inputValue.trim() && !(showUpsell && paymentTriggered) && !isAiTyping
                  ? 'text-[#F4E0A7] hover:bg-[rgba(244,224,167,0.15)]'
                  : 'text-[#B8B5D1] opacity-40 cursor-not-allowed'
              }`}
              whileHover={inputValue.trim() && !(showUpsell && paymentTriggered) && !isAiTyping ? { scale: 1.05 } : {}}
              whileTap={inputValue.trim() && !(showUpsell && paymentTriggered) && !isAiTyping ? { scale: 0.95 } : {}}
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