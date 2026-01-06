// Auth Context - Manages user authentication state and session
// With automatic retry, recovery, and reconnection handling for mobile
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { withRetry, isOnline } from '../utils/networkRetry';

export interface User {
  id: string;
  email: string;
  username: string;
  preferredlanguage: string;
  region: string | null;
  termsaccepted: boolean;
  allownotifications: boolean;
  usertype: 'regular' | 'beta' | 'developer';
  registeredat: string;
  lastactiveat: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, username: string, preferredLanguage: string, termsAccepted: boolean, allowNotifications: boolean) => Promise<void>;
  logout: () => void;
  updateLastActive: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Retry configuration for mobile networks
const SESSION_TIMEOUT_MS = 15000; // 15 seconds (increased from 3s for mobile)
const DB_TIMEOUT_MS = 10000; // 10 seconds for DB operations
const RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isCheckingSession = useRef(false);
  const lastSessionCheck = useRef<number>(0);

  // Memoized session check to prevent duplicate calls
  const checkSession = useCallback(async (forceCheck = false) => {
    // Debounce: Don't check more than once per 5 seconds unless forced
    const now = Date.now();
    if (!forceCheck && now - lastSessionCheck.current < 5000) {
      console.log('⏭️ Session check debounced');
      return;
    }
    
    // Prevent concurrent session checks
    if (isCheckingSession.current) {
      console.log('⏭️ Session check already in progress');
      return;
    }
    
    isCheckingSession.current = true;
    lastSessionCheck.current = now;
    console.log('🔍 Checking for existing session...');
    setIsLoading(true);
    
    try {
      // Use retry logic for session check
      const result = await withRetry(
        async () => {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Session check timeout')), SESSION_TIMEOUT_MS)
          );
          
          const sessionPromise = supabase.auth.getSession();
          return Promise.race([sessionPromise, timeoutPromise]) as Promise<any>;
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (attempt) => console.log(`🔄 Session check retry ${attempt}/${RETRY_OPTIONS.maxRetries}`)
        }
      );
      
      const { data: { session }, error } = result;
      
      console.log('📊 Session check result:', { hasSession: !!session, error });
      
      if (session?.user) {
        console.log('✅ Found existing session for:', session.user.email);
        await handleAuthUser(session.user);
      } else {
        console.log('ℹ️ No existing session found');
        setUser(null);
      }
    } catch (error: any) {
      console.error('❌ Session check failed after retries:', error.message);
      // Don't clear user on timeout - keep existing state if we have it
      // This prevents logging out users due to temporary network issues
    } finally {
      isCheckingSession.current = false;
      setIsLoading(false);
      console.log('✅ Auth initialization complete');
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    console.log('🔵 AuthContext initializing...');
    checkSession(true);

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔔 Auth state changed:', event, 'Session:', !!session);
      if (session?.user) {
        // User logged in - fetch or create user record (non-blocking)
        console.log('📧 User email from session:', session.user.email);
        handleAuthUser(session.user).catch(err => {
          console.error('Failed to handle auth user:', err);
        });
      } else if (event === 'SIGNED_OUT') {
        // Only clear user on explicit sign out, not on connection issues
        console.log('👋 User signed out');
        setUser(null);
      }
    });

    console.log('✅ Auth listener registered');

    return () => {
      console.log('🔴 Auth listener unsubscribing');
      authListener?.subscription.unsubscribe();
    };
  }, [checkSession]);

  // Re-check session when app becomes visible (mobile background/foreground)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ App became visible - checking session...');
        checkSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkSession]);

  // Re-check session when network comes back online
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Network back online - checking session...');
      // Small delay to let connection stabilize
      setTimeout(() => checkSession(), 1000);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [checkSession]);

  // Handle auth user with retry logic for DB operations
  const handleAuthUser = async (authUser: SupabaseUser) => {
    try {
      console.log('👤 Handling auth user:', authUser.email);
      
      // Use retry for fetching user record
      const existingUser = await withRetry(
        async () => {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('DB timeout')), DB_TIMEOUT_MS)
          );
          
          const queryPromise = supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .maybeSingle();
          
          const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;
          if (error) throw error;
          return data;
        },
        {
          ...RETRY_OPTIONS,
          onRetry: (attempt) => console.log(`🔄 User query retry ${attempt}/${RETRY_OPTIONS.maxRetries}`)
        }
      ).catch(err => {
        console.error('❌ Error querying user after retries:', err);
        return null;
      });

      if (existingUser) {
        // User exists, update last active (fire and forget, no retry needed)
        supabase
          .from('users')
          .update({ lastactiveat: new Date().toISOString() })
          .eq('id', authUser.id)
          .then(({ error }) => {
            if (error) console.warn('Failed to update last active:', error);
          });

        setUser(existingUser);
        console.log('✅ Session restored:', existingUser.username);
      } else {
        // New user - create record from metadata
        console.log('🆕 New user detected, creating user record...');
        const metadata = authUser.user_metadata;
        
        const newUserData = {
          id: authUser.id,
          email: authUser.email!,
          username: metadata.username || authUser.email?.split('@')[0] || 'user',
          preferredlanguage: metadata.preferredLanguage || 'English',
          region: null,
          termsaccepted: metadata.termsAccepted || true,
          allownotifications: metadata.allowNotifications || false,
          usertype: 'regular' as const
        };
        
        // Use retry for inserting new user
        const newUser = await withRetry(
          async () => {
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('DB insert timeout')), DB_TIMEOUT_MS)
            );
            
            const insertPromise = supabase
              .from('users')
              .insert(newUserData)
              .select()
              .maybeSingle();
            
            const { data, error } = await Promise.race([insertPromise, timeoutPromise]) as any;
            if (error) throw error;
            return data;
          },
          {
            ...RETRY_OPTIONS,
            onRetry: (attempt) => console.log(`🔄 User insert retry ${attempt}/${RETRY_OPTIONS.maxRetries}`)
          }
        ).catch(async (insertError: any) => {
          console.error('❌ Failed to create user record:', insertError.message);
          
          // If user already exists (race condition), try to fetch it
          if (insertError.code === '23505') {
            console.log('🔄 User already exists, fetching existing user...');
            const { data } = await supabase
              .from('users')
              .select('*')
              .eq('id', authUser.id)
              .maybeSingle();
            return data;
          }
          return null;
        });
        
        if (newUser) {
          setUser(newUser);
          console.log('✅ User record ready:', newUser.username);
        }
      }
    } catch (error: any) {
      console.error('Failed to handle auth user:', error);
      // Don't clear user state on error - keep any existing state
    }
  };

  const login = async (
    email: string,
    username: string,
    preferredLanguage: string,
    termsAccepted: boolean,
    allowNotifications: boolean
  ) => {
    try {
      // Send magic link with PKCE flow
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: true,
          data: {
            username,
            preferredLanguage,
            termsAccepted,
            allowNotifications
          }
        }
      });

      if (error) throw error;
      
      console.log('✅ Magic link sent to:', email);
      // The actual user record will be created in the callback after email verification
    } catch (error) {
      console.error('Failed to send magic link:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      // Keep remembered email so user can easily log back in
      console.log('✅ User logged out');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const updateLastActive = async () => {
    if (user) {
      const updatedUser = {
        ...user,
        lastactiveat: new Date().toISOString()
      };
      setUser(updatedUser);
      
      // Update in Supabase
      await supabase
        .from('users')
        .update({ lastactiveat: updatedUser.lastactiveat })
        .eq('id', user.id);
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
    updateLastActive
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
