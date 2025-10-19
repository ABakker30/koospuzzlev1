// AI Chat Client - Communicates with Supabase Edge Function
export const aiClient = {
  async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    context?: any
  ) {
    const functionUrl = import.meta.env.VITE_SUPABASE_FUNCTION_URL || 'http://127.0.0.1:54321/functions/v1';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    
    try {
      const payload: any = { messages };
      if (context) {
        payload.context = context;
      }
      
      const res = await fetch(`${functionUrl}/quick-responder`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        throw new Error(`AI chat failed: ${res.status} ${res.statusText}`);
      }
      
      const { text } = await res.json();
      return text as string;
    } catch (error) {
      console.error('AI chat error:', error);
      return "I'm having trouble connecting right now. Please try again.";
    }
  }
};

// Helper to convert history to message format
export const hToMsgs = (h: { role: 'user' | 'assistant'; content: string }[]) =>
  h.map(m => ({ role: m.role, content: m.content }));
