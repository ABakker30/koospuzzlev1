// AI Chat Edge Function - Proxy to OpenAI Chat Completions
// Deployed at: /functions/v1/ai-chat
// Environment variables required: OPENAI_API_KEY, OPENAI_MODEL (optional)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
