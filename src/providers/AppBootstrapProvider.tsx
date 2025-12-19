import React, { createContext, useContext, useState, useEffect } from 'react';
import { initI18n, setLanguage as changeI18nLanguage } from '../i18n';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface AppBootstrapContextType {
  language: string;
  setLanguage: (lang: string) => Promise<void>;
  isBootstrapped: boolean;
}

const AppBootstrapContext = createContext<AppBootstrapContextType | null>(null);

const LANGUAGE_STORAGE_KEY = 'preferred_language';

export const AppBootstrapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<string>('en');
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  // Bootstrap: Load language preference on mount
  useEffect(() => {
    const bootstrap = async () => {
      let preferredLanguage = 'en';

      try {
        // Priority 1: If logged in, fetch from profile
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('preferred_language')
            .eq('id', user.id)
            .single();

          if (profile?.preferred_language) {
            preferredLanguage = profile.preferred_language;
          }
        }

        // Priority 2: If no profile language, check localStorage
        if (preferredLanguage === 'en') {
          const cached = localStorage.getItem(LANGUAGE_STORAGE_KEY);
          if (cached) {
            preferredLanguage = cached;
          }
        }

        // Priority 3: Browser language (optional - currently defaulting to 'en')
        // You can add browser detection here if desired

        // Initialize i18n with the determined language
        await initI18n(preferredLanguage);
        setLanguageState(preferredLanguage);
      } catch (error) {
        console.error('Failed to bootstrap language:', error);
        // Fall back to English
        await initI18n('en');
        setLanguageState('en');
      } finally {
        setIsBootstrapped(true);
      }
    };

    bootstrap();
  }, [user]);

  const setLanguage = async (lang: string) => {
    try {
      // Update i18n immediately
      await changeI18nLanguage(lang);
      setLanguageState(lang);

      // Update localStorage immediately
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);

      // Update Supabase (async, don't block)
      if (user) {
        supabase
          .from('profiles')
          .update({ preferred_language: lang })
          .eq('id', user.id)
          .then((result) => {
            if (result.error) {
              console.error('Failed to save language to profile:', result.error);
            }
          });
      }
    } catch (error) {
      console.error('Failed to set language:', error);
    }
  };

  const value: AppBootstrapContextType = {
    language,
    setLanguage,
    isBootstrapped,
  };

  // Show loading state while bootstrapping
  if (!isBootstrapped) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        fontSize: '18px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <AppBootstrapContext.Provider value={value}>
      {children}
    </AppBootstrapContext.Provider>
  );
};

export const useAppBootstrap = () => {
  const context = useContext(AppBootstrapContext);
  if (!context) {
    throw new Error('useAppBootstrap must be used within AppBootstrapProvider');
  }
  return context;
};
