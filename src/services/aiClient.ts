import { supabase } from '../lib/supabase';

// AI Chat Client - Communicates with Supabase Edge Function via supabase.functions.invoke()
export const aiClient = {
  async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    context?: any
  ) {
    try {
      const payload: any = { messages };
      if (context) {
        payload.context = context;
      }
      
      const { data, error } = await supabase.functions.invoke('quick-responder', {
        body: payload,
      });
      
      if (error) {
        console.error('Supabase function error:', error);
        throw error;
      }
      
      // Edge function returns { text }
      return data.text as string;
    } catch (error) {
      console.error('AI chat error:', error);
      return "I'm having trouble connecting right now. Please try again.";
    }
  }
};

// Helper to convert history to message format
export const hToMsgs = (h: { role: 'user' | 'assistant'; content: string }[]) =>
  h.map(m => ({ role: m.role, content: m.content }));
