// Share Preview Edge Function - Generates Open Graph meta tags for social sharing
// Deployed at: /functions/v1/share-preview
// Usage: /functions/v1/share-preview?type=puzzle&id=xxx
//        /functions/v1/share-preview?type=challenge&id=<share_code|solution uuid>[&m=<message>]
//
// Crawlers get OG HTML ("Beat Anton — 5/5 · 1:23"); humans get a 302 to
// koospuzzle.com. Deploy with --no-verify-jwt so crawlers can fetch it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Site configuration
const SITE_URL = 'https://koospuzzle.com';
const SITE_NAME = 'Koos Puzzle';
// PNG, not SVG — most platforms reject SVG og:images.
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatTime(ms: number | null): string | null {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

interface PuzzleData {
  id: string;
  name: string;
  creator_name: string;
  description?: string;
  thumbnail_url?: string;
}

/**
 * Generate minimal HTML page with Open Graph meta tags
 * No inline styles or scripts - only meta refresh for redirect (CSP compliant)
 */
function generateOGHtml(params: {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
  redirectUrl: string;
  type: string;
}): string {
  const { title, description, imageUrl, pageUrl, redirectUrl } = params;
  
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
  <title>${safeTitle} | ${SITE_NAME}</title>
  <meta name="description" content="${safeDescription}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta http-equiv="refresh" content="0;url=${redirectUrl}">
</head>
<body>
  <p>Redirecting to <a href="${redirectUrl}">${safeTitle}</a>...</p>
</body>
</html>`;
}

/**
 * Generate minimal error HTML page (CSP compliant)
 */
function generateErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Not Found | ${SITE_NAME}</title>
  <meta http-equiv="refresh" content="2;url=${SITE_URL}">
</head>
<body>
  <p>Not Found: ${message}</p>
  <p>Redirecting to <a href="${SITE_URL}">home</a>...</p>
</body>
</html>`;
}

// Check if request is from a social media crawler that needs OG tags
function isCrawler(userAgent: string): boolean {
  const crawlers = [
    'facebookexternalhit',
    'Facebot',
    'Twitterbot',
    'WhatsApp',
    'Slackbot',
    'LinkedInBot',
    'Discordbot',
    'TelegramBot',
    'Googlebot',
    'bingbot'
  ];
  return crawlers.some(crawler => userAgent.toLowerCase().includes(crawler.toLowerCase()));
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
    const userAgent = req.headers.get('user-agent') || '';

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

      // Try to get a colorful solution image if available
      let imageUrl = puzzle.thumbnail_url || DEFAULT_IMAGE;
      
      const { data: solution } = await supabase
        .from('solutions')
        .select('thumbnail_url')
        .eq('puzzle_id', id)
        .not('thumbnail_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (solution?.thumbnail_url) {
        imageUrl = solution.thumbnail_url;
        console.log('Using solution thumbnail:', imageUrl);
      }

      const redirectUrl = `${SITE_URL}/puzzles/${id}/view`;
      
      // For crawlers: return HTML with OG tags
      // For browsers: 302 redirect (bypasses CSP issues)
      if (isCrawler(userAgent)) {
        const html = generateOGHtml({
          title: puzzle.name || 'Untitled Puzzle',
          description: puzzle.description || `A 3D puzzle by ${puzzle.creator_name || 'Anonymous'}. Can you solve it?`,
          imageUrl: imageUrl,
          pageUrl: redirectUrl,
          redirectUrl: redirectUrl,
          type: 'puzzle'
        });

        return new Response(html, {
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      } else {
        // Browser: use 302 redirect
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            'Location': redirectUrl
          }
        });
      }
    }

    // Challenge card: "Beat Anton — 5/5 · 1:23". `id` is a share code or a
    // solution UUID; optional `m` (challenger's message) rides through to the
    // landing page.
    if (type === 'challenge') {
      const col = UUID_RE.test(id) ? 'id' : 'share_code';
      const { data: sol, error } = await supabase
        .from('solutions')
        .select('id, share_code, solver_name, created_by, placements_by_you, total_pieces, duration_ms, thumbnail_url, puzzle_id')
        .eq(col, col === 'share_code' ? id.toLowerCase() : id)
        .maybeSingle();

      if (error || !sol) {
        return new Response(
          generateErrorHtml('Challenge not found'),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }

      // Live display name (users.username via created_by), fallback stored name.
      let name = (sol.solver_name || '').split('@')[0] || 'a solver';
      if (sol.created_by) {
        const { data: prof } = await supabase
          .from('public_profiles')
          .select('username')
          .eq('id', sol.created_by)
          .maybeSingle();
        if (prof?.username) name = prof.username;
      }

      const { data: pz } = await supabase
        .from('puzzles')
        .select('name')
        .eq('id', sol.puzzle_id)
        .single();

      const score =
        sol.placements_by_you != null && sol.total_pieces != null
          ? `${sol.placements_by_you}/${sol.total_pieces}`
          : null;
      const time = formatTime(sol.duration_ms);
      const title = `Beat ${name}${score ? ` — ${score}` : ''}${time ? ` · ${time}` : ''}`;

      const message = (url.searchParams.get('m') || '').trim().slice(0, 80);
      const dare = `${name} solved ${pz?.name ? `“${pz.name}”` : 'a Koos puzzle'}${score ? ` placing ${score} pieces` : ''}${time ? ` in ${time}` : ''}. Race their ghost — every piece they placed replays live against you.`;
      const description = message ? `“${message}” — ${dare}` : dare;

      const codeOrId = sol.share_code || sol.id;
      const redirectUrl = `${SITE_URL}/c/${codeOrId}${message ? `?m=${encodeURIComponent(message)}` : ''}`;

      if (isCrawler(userAgent)) {
        const html = generateOGHtml({
          title,
          description,
          imageUrl: sol.thumbnail_url || DEFAULT_IMAGE,
          pageUrl: redirectUrl,
          redirectUrl,
          type: 'challenge',
        });
        return new Response(html, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=600',
          },
        });
      }
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': redirectUrl },
      });
    }

    // Future: Handle other types (movie, solution, etc.)
    // if (type === 'movie') { ... }

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
