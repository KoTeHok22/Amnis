import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
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

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
    }
    return Promise.reject(error);
  }
);

export const registerUser = async (phone_number: string, password: string, name: string, birth_date: string) => {
  try {
    const response = await apiClient.post('/register', {
      phone_number,
      name,
      birth_date,
      password,
    });
    const { access_token, token_type, user } = response.data;

    // Сохраняем токен в localStorage
    if (token_type === 'bearer' && access_token) {
      localStorage.setItem('access_token', access_token);
    }

    return { ...response.data, user };
  } catch (error: any) {
    if (!error.response) {
      throw { detail: 'Не удалось подключиться к серверу. Проверьте подключение к интернету' };
    }
    throw error.response?.data || { detail: 'Ошибка при регистрации' };
  }
};

export const loginUser = async (phone_number: string, password: string) => {
  try {
    const response = await apiClient.post('/login', {
      phone_number,
      password,
    });
    const { access_token, token_type } = response.data;

    if (token_type === 'bearer' && access_token) {
      localStorage.setItem('access_token', access_token);
    }

    return response.data;
  } catch (error: any) {
    if (!error.response) {
      throw { detail: 'Не удалось подключиться к серверу. Проверьте подключение к интернету' };
    }
    if (error.response?.status === 401) {
      throw { detail: 'Неверный номер телефона или пароль' };
    }
    if (error.response?.status >= 500) {
      throw { detail: 'Сервер временно недоступен. Попробуйте позже' };
    }
    throw error.response?.data || { detail: 'Ошибка при входе' };
  }
};

export const verifyToken = async () => {
  try {
    const response = await apiClient.get('/verify-token');
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
    }
    return null;
  }
};

export const updateUserProfile = async (name: string, birth_date: string) => {
  try {
    const response = await apiClient.put('/profile', {
      name,
      birth_date,
    });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при обновлении профиля' };
  }
};

export const getUserSubscription = async () => {
  try {
    const response = await apiClient.get('/subscription');
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при получении данных подписки' };
  }
};

export const purchasePlan = async (planId: string) => {
  try {
    // Map planId to the appropriate analyses count and validity period
    let analysesCount = 1;
    let validityDays = 30; // Default validity period

    switch (planId) {
      case 'plan-1':
        analysesCount = 1;
        validityDays = 30;
        break;
      case 'plan-5':
        analysesCount = 5;
        validityDays = 90;
        break;
      case 'plan-10':
        analysesCount = 10;
        validityDays = 180;
        break;
      case 'plan-15':
        analysesCount = 15;
        validityDays = 365;
        break;
      default:
        analysesCount = 1;
        validityDays = 30;
    }

    const response = await apiClient.post('/payment/success', {
      plan: planId,
      analyses_count: analysesCount,
      validity_days: validityDays
    });

    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при оформлении покупки' };
  }
};

export const fetchUserProfileData = async () => {
  try {
    const response = await apiClient.get('/profile');
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при получении данных профиля' };
  }
};

export const changePassword = async (oldPassword: string, newPassword: string) => {
  try {
    const response = await apiClient.post('/change-password', {
      old_password: oldPassword,
      new_password: newPassword
    });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при смене пароля' };
  }
};

export const logoutUser = () => {
  localStorage.removeItem('access_token');
};

export const createNicePayPayment = async (plan: string) => {
  try {
    const response = await apiClient.post('/payment/nicepay/create', {
      plan
    });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { detail: 'Ошибка при создании платежа' };
  }
};

// Серверная озвучка текста (edge-tts). Возвращает MP3 как Blob.
// Работает в любом браузере и для любого языка, т.к. аудио синтезируется
// на сервере и не зависит от установленных в ОС голосов.
export const fetchTtsAudio = async (text: string, lang?: string): Promise<Blob> => {
  const response = await apiClient.post(
    '/tts',
    { text, lang },
    { responseType: 'blob' }
  );
  return response.data as Blob;
};