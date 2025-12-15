// Auth Context - Manages user authentication state and session
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    console.log('🔵 AuthContext initializing...');
    checkSession();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔔 Auth state changed:', event, 'Session:', !!session);
      if (session?.user) {
        // User logged in - fetch or create user record (non-blocking)
        console.log('📧 User email from session:', session.user.email);
        handleAuthUser(session.user).catch(err => {
          console.error('Failed to handle auth user:', err);
        });
      } else {
        // User logged out
        console.log('👋 No session, user logged out');
        setUser(null);
      }
    });

    console.log('✅ Auth listener registered');

    return () => {
      console.log('🔴 Auth listener unsubscribing');
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const checkSession = async () => {
    console.log('🔍 Checking for existing session...');
    setIsLoading(true);
    
    try {
      // Add 3-second timeout to session check
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session check timeout')), 3000)
      );
      
      const sessionPromise = supabase.auth.getSession();
      
      const result = await Promise.race([sessionPromise, timeoutPromise]) as any;
      const { data: { session }, error } = result;
      
      console.log('📊 Session check result:', { hasSession: !!session, error });
      
      if (session?.user) {
        console.log('✅ Found existing session for:', session.user.email);
        await handleAuthUser(session.user);
      } else {
        console.log('ℹ️ No existing session found');
      }
    } catch (error: any) {
      if (error.message === 'Session check timeout') {
        console.warn('⚠️ Session check timed out - continuing without auth');
      } else {
        console.error('❌ Failed to check session:', error);
      }
    } finally {
      setIsLoading(false);
      console.log('✅ Auth initialization complete');
    }
  };

  const handleAuthUser = async (authUser: SupabaseUser) => {
    try {
      console.log('👤 Handling auth user:', authUser.email);
      
      // Add timeout to database queries
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('DB timeout')), 3000)
      );
      
      // Check if user record exists in our users table
      const queryPromise = supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle(); // Use maybeSingle instead of single to handle no results gracefully
      
      const { data: existingUser, error: queryError } = await Promise.race([queryPromise, timeoutPromise]) as any;
      
      if (queryError) {
        console.error('❌ Error querying user:', queryError);
      }

      if (existingUser) {
        // User exists, update last active
        const { error: updateError } = await supabase
          .from('users')
          .update({ lastactiveat: new Date().toISOString() })
          .eq('id', authUser.id);

        if (updateError) console.error('Failed to update last active:', updateError);

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
        
        const insertPromise = supabase
          .from('users')
          .insert(newUserData)
          .select()
          .maybeSingle();
        
        const insertTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('DB insert timeout')), 3000)
        );
        
        const { data: newUser, error: insertError } = await Promise.race([insertPromise, insertTimeoutPromise]) as any;
        
        if (insertError) {
          console.error('❌ Failed to create user record:', insertError);
          console.error('Error code:', insertError.code);
          console.error('Error message:', insertError.message);
          console.error('Error details:', insertError.details);
          console.error('User data attempted:', newUserData);
          
          // If user already exists, try to fetch it
          if (insertError.code === '23505') { // Unique constraint violation
            console.log('🔄 User already exists, fetching existing user...');
            const { data: existingUserRetry } = await supabase
              .from('users')
              .select('*')
              .eq('id', authUser.id)
              .maybeSingle();
            
            if (existingUserRetry) {
              setUser(existingUserRetry);
              console.log('✅ Fetched existing user:', existingUserRetry.username);
            }
          }
        } else if (newUser) {
          setUser(newUser);
          console.log('✅ New user created:', newUser.username);
        }
      }
    } catch (error: any) {
      if (error.message === 'DB timeout' || error.message === 'DB insert timeout') {
        console.warn('⚠️ Database query timed out in handleAuthUser - user not persisted');
      } else {
        console.error('Failed to handle auth user:', error);
      }
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
