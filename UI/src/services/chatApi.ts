import axios from 'axios';
import { verifyToken } from './api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const chatApiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

chatApiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

chatApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
    }
    return Promise.reject(error);
  }
);

export const createChat = async (title: string) => {
  try {
    const response = await chatApiClient.post('/chat/create', {
      title,
    });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при создании чата' };
  }
};

export const sendMessageAsync = async (message: string) => {
  try {
    const response = await chatApiClient.post('/chat/send', {
      message,
    });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при постановке сообщения в очередь' };
  }
};

export const getTaskStatus = async (taskId: string) => {
  try {
    const response = await chatApiClient.get(`/chat/task/${taskId}`);
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при получении статуса задачи' };
  }
};

export const sendMessage = async (message: string) => {
  try {
    const response = await chatApiClient.post('/chat/send', {
      message,
    });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при отправке сообщения' };
  }
};

export const sendMessageStream = async (message: string, onMessage: (data: any) => void) => {
  try {
    const token = localStorage.getItem('access_token');
    const response = await fetch(`${API_BASE_URL}/chat/send-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported in this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
              onMessage(data);
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error: any) {
    console.error('Error in sendMessageStream:', error);
    throw error;
  }
};

export const clearChat = async () => {
  try {
    const response = await chatApiClient.post('/chat/clear');
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при очистке чата' };
  }
};

export const getUserChats = async () => {
  try {
    const response = await chatApiClient.get('/chats');
    return response.data.chats || [];
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при получении списка чатов' };
  }
};

export const switchChat = async (chatId: string) => {
  try {
    const response = await chatApiClient.post('/chat/switch', {
      chat_id: chatId
    });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при переключении чата' };
  }
};

export const deleteChat = async (chatId: string) => {
  try {
    const response = await chatApiClient.delete(`/chat/${chatId}`);
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при удалении чата' };
  }
};

export const getChatMessages = async (chatId: string) => {
  try {
    const response = await chatApiClient.get(`/chat/${chatId}/messages`);
    return response.data.messages || [];
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при получении сообщений чата' };
  }
};

export const updateChatTitle = async (chatId: string, title: string) => {
  try {
    const response = await chatApiClient.put(`/chat/${chatId}/title`, {
      title
    });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при изменении названия чата' };
  }
};