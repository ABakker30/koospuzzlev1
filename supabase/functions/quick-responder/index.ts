// AI Chat Edge Function - Proxy to OpenAI Chat Completions
// Deployed at: /functions/v1/quick-responder (the name aiClient invokes —
// this folder was previously "ai-chat", which was never the deployed name)
// Environment variables required: OPENAI_API_KEY, OPENAI_MODEL (optional)
//
// Blast-day guards: per-IP hourly rate limit (ai_chat_rate table, fails
// OPEN on infra errors so chat never breaks on a hiccup) + payload caps so
// one caller can't burn the OpenAI budget.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATE_LIMIT_PER_HOUR = 30;
const MAX_MESSAGES = 20;
const MAX_TOTAL_CHARS = 8000;

async function checkRateLimit(req: Request): Promise<boolean> {
  try {
    const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const ipHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data } = await db.from('ai_chat_rate').select('window_start, count').eq('ip_hash', ipHash).maybeSingle();

    if (!data || data.window_start < hourAgo) {
      await db.from('ai_chat_rate').upsert({ ip_hash: ipHash, window_start: new Date().toISOString(), count: 1 });
      return true;
    }
    if (data.count >= RATE_LIMIT_PER_HOUR) return false;
    await db.from('ai_chat_rate').update({ count: data.count + 1 }).eq('ip_hash', ipHash);
    return true;
  } catch (e) {
    console.error('rate limit check failed (failing open):', e);
    return true;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    const { messages, context } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: messages array required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Payload caps — one request can't smuggle in a huge prompt.
    const totalChars = messages.reduce(
      (n: number, m: any) => n + String(m?.content ?? '').length, 0);
    if (messages.length > MAX_MESSAGES || totalChars > MAX_TOTAL_CHARS) {
      return new Response(
        JSON.stringify({ error: 'Request too large' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!(await checkRateLimit(req))) {
      return new Response(
        JSON.stringify({ error: 'Too many requests — try again in a bit.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get OpenAI API key from environment
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error('OPENAI_API_KEY not set in environment');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get model from environment or use default
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    
    // Check if JSON mode is requested via context
    const responseFormat = context?.response_format || undefined;
    const maxTokens = responseFormat?.type === 'json_object' ? 600 : 200;
    const temperature = responseFormat?.type === 'json_object' ? 0.3 : 0.2;

    console.log(`AI chat request: ${messages.length} messages, model: ${model}, json_mode: ${!!responseFormat}`);

    // Build OpenAI request payload
    const openaiPayload: any = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages
    };
    
    // Add response_format if specified
    if (responseFormat) {
      openaiPayload.response_format = responseFormat;
    }

    // Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(openaiPayload)
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error(`OpenAI API error: ${openaiResponse.status} ${errorText}`);
      return new Response(
        JSON.stringify({ error: 'Failed to get AI response' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const data = await openaiResponse.json();
    const text = data?.choices?.[0]?.message?.content || "I'm not sure how to respond to that.";

    console.log(`AI response: ${text.substring(0, 100)}...`);

    return new Response(
      JSON.stringify({ text }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
