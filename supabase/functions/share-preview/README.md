# Share Preview Edge Function

Generates Open Graph meta tags for rich link previews when sharing puzzles on social platforms (WhatsApp, iMessage, Slack, Twitter, etc.).

## How it Works

1. When a user shares a puzzle, they share a URL pointing to this edge function
2. Social media crawlers fetch this URL and receive HTML with OG meta tags
3. The HTML includes a redirect to the actual app page
4. Users clicking the link are immediately redirected to the puzzle viewer

## URL Format

```
https://[PROJECT_ID].supabase.co/functions/v1/share-preview?type=puzzle&id=[PUZZLE_ID]
```

## Supported Types

- `puzzle` - Puzzles from the gallery
- (Future) `solution` - User solutions
- (Future) `movie` - Puzzle movies

## Deployment

### Prerequisites

1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link project: `supabase link --project-ref cpblvcajrvlqatniceap`

### Deploy the Function

```bash
cd supabase
supabase functions deploy share-preview
```

### Environment Variables

The function uses these environment variables (automatically available in Supabase):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for bypassing RLS if needed)

## Testing

### Test locally

```bash
supabase functions serve share-preview
```

Then visit: `http://localhost:54321/functions/v1/share-preview?type=puzzle&id=[PUZZLE_ID]`

### Test in production

1. Copy a share URL from the app
2. Paste into WhatsApp (or another messaging app)
3. Verify the preview shows:
   - Puzzle thumbnail image
   - Puzzle title
   - Description

### Debug with Facebook Sharing Debugger

https://developers.facebook.com/tools/debug/

Paste your share URL to see how Facebook/Meta parses the OG tags.

## Caching Notes

- WhatsApp aggressively caches link previews
- To force refresh during development, append a query param: `?v=2`
- Or use Facebook's Sharing Debugger to scrape fresh

## Open Graph Tags Generated

```html
<meta property="og:type" content="website">
<meta property="og:url" content="https://...">
<meta property="og:title" content="Puzzle Name">
<meta property="og:description" content="Description...">
<meta property="og:image" content="https://...thumbnail.png">
<meta property="og:site_name" content="KOOS Puzzle">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Puzzle Name">
<meta name="twitter:description" content="Description...">
<meta name="twitter:image" content="https://...thumbnail.png">
```

## Image Requirements

For best results, puzzle thumbnails should be:
- At least 1200×630 pixels (OG standard)
- JPG or PNG format
- Publicly accessible without authentication
- No redirects on the image URL
