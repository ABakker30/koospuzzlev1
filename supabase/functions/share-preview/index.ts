// Share Preview Edge Function - Generates Open Graph meta tags for social sharing
// Deployed at: /functions/v1/share-preview
// Usage: /functions/v1/share-preview?type=puzzle&id=xxx

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Site configuration
const SITE_URL = 'https://koospuzzle.com';
const SITE_NAME = 'KOOS Puzzle';
const DEFAULT_IMAGE = `${SITE_URL}/og-default.svg`;

interface PuzzleData {
  id: string;
  name: string;
  creator_name: string;
  description?: string;
  thumbnail_url?: string;
}

/**
 * Generate HTML page with Open Graph meta tags
 */
function generateOGHtml(params: {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
  redirectUrl: string;
  type: string;
}): string {
  const { title, description, imageUrl, pageUrl, redirectUrl, type } = params;
  
  // Escape HTML entities to prevent XSS
  const escapeHtml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Primary Meta Tags -->
  <title>${safeTitle} | ${SITE_NAME}</title>
  <meta name="title" content="${safeTitle} | ${SITE_NAME}">
  <meta name="description" content="${safeDescription}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="${SITE_NAME}">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${pageUrl}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${imageUrl}">
  
  <!-- Redirect to actual page -->
  <meta http-equiv="refresh" content="0;url=${redirectUrl}">
  
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      text-align: center;
      padding: 20px;
    }
    .container {
      max-width: 500px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    p {
      opacity: 0.8;
      margin-bottom: 1.5rem;
    }
    a {
      color: #ec4899;
      text-decoration: none;
    }
    .loading {
      font-size: 2rem;
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="loading">🧩</div>
    <h1>${safeTitle}</h1>
    <p>Redirecting to ${SITE_NAME}...</p>
    <p><a href="${redirectUrl}">Click here if not redirected</a></p>
  </div>
  <script>
    // Immediate redirect for browsers that don't support meta refresh
    window.location.href = "${redirectUrl}";
  </script>
</body>
</html>`;
}

/**
 * Generate error HTML page
 */
function generateErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Not Found | ${SITE_NAME}</title>
  <meta property="og:title" content="Content Not Found">
  <meta property="og:description" content="${message}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta http-equiv="refresh" content="2;url=${SITE_URL}">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      text-align: center;
    }
    h1 { color: #f87171; }
  </style>
</head>
<body>
  <div>
    <h1>😕 Not Found</h1>
    <p>${message}</p>
    <p>Redirecting to home...</p>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('id');

    // Validate parameters
    if (!type || !id) {
      return new Response(
        generateErrorHtml('Missing type or id parameter'),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        generateErrorHtml('Server configuration error'),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle different content types
    if (type === 'puzzle') {
      const { data: puzzle, error } = await supabase
        .from('puzzles')
        .select('id, name, creator_name, description, thumbnail_url')
        .eq('id', id)
        .eq('visibility', 'public')
        .single();

      if (error || !puzzle) {
        console.error('Puzzle not found:', id, error);
        return new Response(
          generateErrorHtml('Puzzle not found or is private'),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }

      const html = generateOGHtml({
        title: puzzle.name || 'Untitled Puzzle',
        description: puzzle.description || `A 3D puzzle by ${puzzle.creator_name || 'Anonymous'}. Can you solve it?`,
        imageUrl: puzzle.thumbnail_url || DEFAULT_IMAGE,
        pageUrl: `${SITE_URL}/share/puzzle/${id}`,
        redirectUrl: `${SITE_URL}/puzzles/${id}/view`,
        type: 'puzzle'
      });

      return new Response(html, {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        }
      });
    }

    // Future: Handle other types (movie, solution, etc.)
    // if (type === 'movie') { ... }
    // if (type === 'solution') { ... }

    return new Response(
      generateErrorHtml(`Unknown content type: ${type}`),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    );

  } catch (error) {
    console.error('Share preview error:', error);
    return new Response(
      generateErrorHtml('An error occurred'),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
});
