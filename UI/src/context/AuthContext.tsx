import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { verifyToken, fetchUserProfileData } from '../services/api';
import { logger } from '../utils/logger';

interface User {
  id?: number;
  phone_number?: string;
  name?: string;
  birth_date?: string;
  available_analyses?: number;
}

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  user: User | null;
  login: (token: string, userData?: User) => void;
  logout: () => void;
  fetchUserProfile: () => Promise<void>;
  updateUserProfile: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('access_token');
      if (storedToken) {
        setToken(storedToken);
        try {
          const tokenData = await verifyToken();
          if (tokenData) {
            setIsAuthenticated(true);
            await fetchUserProfile();
          } else {
            localStorage.removeItem('access_token');
            setToken(null);
            setIsAuthenticated(false);
          }
        } catch (error) {
          logger.error('Error during auth initialization:', error);
          localStorage.removeItem('access_token');
          setToken(null);
          setIsAuthenticated(false);
        }
      }
    };

    initializeAuth();
  }, []);

  const login = async (newToken: string, userData?: User) => {
    localStorage.setItem('access_token', newToken);
    setToken(newToken);
    setIsAuthenticated(true);
    if (userData) {
      setUser(userData);
    } else {
      // If no user data provided, fetch it from server
      await fetchUserProfile();
    }
  };

  const fetchUserProfile = async () => {
    if (!token) {
      logger.error('No token available for fetching user profile');
      return;
    }

    try {
      const userData = await fetchUserProfileData();

      if (userData) {
        setUser(prevUser => {
          if (!prevUser ||
              prevUser.name !== userData.name ||
              prevUser.phone_number !== userData.phone_number ||
              prevUser.birth_date !== userData.birth_date ||
              prevUser.available_analyses !== userData.available_analyses) {
            return {
              id: userData.id,
              phone_number: userData.phone_number,
              name: userData.name,
              birth_date: userData.birth_date ? new Date(userData.birth_date).toISOString().split('T')[0] : undefined,
              available_analyses: userData.available_analyses || 0
            };
          }
          return prevUser;
        });
      }
    } catch (error) {
      logger.error('Error fetching user profile:', error);
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  const updateUserProfile = (userData: Partial<User>) => {
    if (user) {
      setUser(prev => ({
        ...prev!,
        ...userData
      }));
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, user, login, logout, fetchUserProfile, updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};