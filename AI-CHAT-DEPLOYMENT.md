# AI Chat Feature - Deployment Guide

## Overview
The AI Chat feature provides an interactive assistant accessible from all Info modals. It uses a Supabase Edge Function to proxy OpenAI API calls securely.

## Architecture
```
Frontend (InfoModal) 
  → 🤖 AI Help button
  → AIChatModal (React component)
  → aiClient.ts (API wrapper)
  → Supabase Edge Function (/ai-chat)
  → OpenAI Chat Completions API
```

## Files Created
- `src/components/AIChatModal.tsx` - Interactive chat UI with draggable modal
- `src/services/aiClient.ts` - API client wrapper
- `supabase/functions/ai-chat/index.ts` - Edge Function proxy
- Updated `src/components/InfoModal.tsx` - Added AI button

## Local Development Setup

### 1. Environment Configuration
Already configured in `.env.local`:
```bash
VITE_SUPABASE_FUNCTION_URL=https://cpblvcajrvlqatniceap.supabase.co/functions/v1
```

For local testing with Supabase CLI, change to:
```bash
VITE_SUPABASE_FUNCTION_URL=http://127.0.0.1:54321/functions/v1
```

### 2. Start Development Server
```bash
npm run dev
```

The AI chat will attempt to connect to the production Edge Function by default.

## Production Deployment

### Prerequisites
1. Supabase CLI installed: `npm install -g supabase`
2. Supabase project access (already configured)
3. OpenAI API key

### Step 1: Deploy Edge Function
```bash
# Navigate to project root
cd "c:\Projects\Koos puzzle v1"

# Login to Supabase (if not already logged in)
supabase login

# Link to project
supabase link --project-ref cpblvcajrvlqatniceap

# Deploy the ai-chat function
supabase functions deploy ai-chat
```

### Step 2: Set Environment Secrets
```bash
# Set OpenAI API key (REQUIRED)
supabase secrets set OPENAI_API_KEY=sk-YOUR_OPENAI_KEY_HERE

# Set model (optional, defaults to gpt-4o-mini)
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```

### Step 3: Verify Deployment
Test the endpoint:
```bash
curl -X POST https://cpblvcajrvlqatniceap.supabase.co/functions/v1/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello!"}]}'
```

Expected response:
```json
{"text":"Hello! How can I help you with KOOS Puzzle today?"}
```

### Step 4: Deploy Frontend
Standard deployment process:
```bash
git add .
git commit -m "Add AI chat feature"
git push origin main
```

GitHub Actions will automatically deploy to koospuzzle.com.

## Features

### UI Components
- **AI Help Button**: Purple gradient button in InfoModal footer
- **Chat Interface**: Draggable modal with message history
- **Starter Suggestions**: 3 quick-start prompts when chat is empty
- **Loading States**: Animated typing indicator during AI responses
- **Error Handling**: Graceful fallback messages on API failures

### Starter Suggestions
1. "What am I looking at?"
2. "How does symmetry affect this shape?"
3. "Why won't this piece fit?"

### Chat Features
- Message history preserved during session
- Enter key to send (Shift+Enter for new line)
- Auto-scroll to latest message
- Draggable modal window
- No dark backdrop (transparent)

## Security

### Best Practices
✅ **API Key Security**
- OpenAI key stored in Supabase secrets (never in frontend)
- Edge Function acts as secure proxy
- No keys committed to git

✅ **CORS Configuration**
- Edge Function allows all origins (*)
- Can be restricted to koospuzzle.com if needed

✅ **Rate Limiting**
- Currently no rate limiting
- Can be added with IP/session tracking if needed

### Environment Variables
- **Frontend**: `VITE_SUPABASE_FUNCTION_URL` (public)
- **Edge Function**: 
  - `OPENAI_API_KEY` (secret, required)
  - `OPENAI_MODEL` (secret, optional)

## Configuration

### OpenAI Settings
Current configuration in Edge Function:
```typescript
{
  model: "gpt-4o-mini",      // Fast, affordable
  max_tokens: 200,            // Concise responses
  temperature: 0.2,           // Consistent, focused
  messages: [
    {
      role: "system",
      content: "You are a helpful assistant for the KOOS Puzzle app..."
    },
    ...userMessages
  ]
}
```

### Adjusting Response Length
To allow longer responses, edit `supabase/functions/ai-chat/index.ts`:
```typescript
max_tokens: 500  // Increase from 200
```

Then redeploy:
```bash
supabase functions deploy ai-chat
```

## Troubleshooting

### "Missing OPENAI_API_KEY" Error
Set the secret:
```bash
supabase secrets set OPENAI_API_KEY=sk-...
```

### "Failed to get AI response"
1. Check OpenAI API key is valid
2. Check OpenAI account has credits
3. View Edge Function logs:
```bash
supabase functions logs ai-chat
```

### Connection Errors
1. Verify function URL in `.env.local`
2. Check function is deployed:
```bash
supabase functions list
```

### CORS Errors
Edge Function already includes CORS headers. If issues persist, check browser console for details.

## Monitoring

### View Logs
```bash
# Real-time logs
supabase functions logs ai-chat --follow

# Recent logs
supabase functions logs ai-chat --limit 50
```

### Usage Metrics
Monitor in Supabase Dashboard:
- Functions → ai-chat → Metrics
- View invocations, errors, duration

### OpenAI Usage
Track costs at: https://platform.openai.com/usage

## Future Enhancements

### Planned Features
- [ ] Context injection (page-specific guidance)
- [ ] Streaming responses for longer answers
- [ ] Rate limiting per user/IP
- [ ] Session persistence across page reloads
- [ ] Export chat history
- [ ] Multi-language support

### Context Integration (Future)
Pass screen context to AI:
```typescript
<AIChatModal 
  onClose={() => setShowAI(false)}
  screen="studio"
  topic="piece-placement"
/>
```

Edge Function can then inject relevant context into system message.

## Cost Estimate

### OpenAI Pricing (gpt-4o-mini)
- Input: $0.150 per 1M tokens (~$0.0002 per message)
- Output: $0.600 per 1M tokens (~$0.0001 per response)

### Example Monthly Cost
- 1,000 chat sessions/month
- Average 5 messages per session
- ~$1-2/month total

Monitor actual usage in OpenAI dashboard.

## Support

### Credentials Needed
If regenerating secrets:
1. **OpenAI API Key**: Get from https://platform.openai.com/api-keys
2. **Supabase Access**: Already configured (project: cpblvcajrvlqatniceap)

### Quick Reference
```bash
# Deploy function
supabase functions deploy ai-chat

# Set secrets
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_MODEL=gpt-4o-mini

# View logs
supabase functions logs ai-chat

# Test endpoint
curl -X POST https://cpblvcajrvlqatniceap.supabase.co/functions/v1/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Test"}]}'
```

## Status
- ✅ Frontend components created
- ✅ Edge Function ready for deployment
- ✅ Environment configured
- ⏳ Awaiting OpenAI API key and deployment

## Next Steps
1. Obtain OpenAI API key
2. Deploy Edge Function: `supabase functions deploy ai-chat`
3. Set secrets: `supabase secrets set OPENAI_API_KEY=sk-...`
4. Test in development
5. Deploy to production
