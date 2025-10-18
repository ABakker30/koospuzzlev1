import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isLoggedIn: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // Default to logged in
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true);

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    const authState = localStorage.getItem('auth_v1');
    // Default to true if not explicitly set to false
    if (authState !== 'false') {
      setIsLoggedIn(true);
    }
  }, []);

  // Mirror isLoggedIn state to localStorage
  useEffect(() => {
    localStorage.setItem('auth_v1', isLoggedIn.toString());
  }, [isLoggedIn]);

  const login = () => {
    setIsLoggedIn(true);
  };

  const logout = () => {
    setIsLoggedIn(false);
  };

  const value: AuthContextType = {
    isLoggedIn,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
