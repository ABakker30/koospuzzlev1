# AI Guide - Enhanced Implementation

## ✨ Features

### 🎲 Rotating Starter Questions
- **10 curated questions** across 4 categories
- **Randomly selects 3-4** questions each time modal opens
- Fresh experience every time

### Categories:
1. **Getting Started** (3 questions)
   - How do I start my first puzzle?
   - What kind of shapes can I choose?
   - Show me an easy puzzle to begin with.

2. **Discovery** (3 questions)
   - What makes one shape harder than another?
   - Why do some puzzles have more than one solution?
   - What happens when I add or remove spheres?

3. **Tips** (2 questions)
   - Any tricks for spotting patterns while solving?
   - What's the difference between manual and auto solving?

4. **Social** (2 questions)
   - Can I share my puzzle or solution with others?
   - Where can I see puzzles other people created?

### 📊 Context Metadata
Every AI request now includes comprehensive context for future RAG capabilities:

```typescript
{
  app: {
    version: '1.0.0',
    build: 'beta',
    environment: 'prod' | 'dev'
  },
  user: {
    session_id: 'uuid-string',
    user_id: 'anon',
    language: 'en-US',
    device: 'mobile' | 'tablet' | 'desktop',
    first_visit: true
  },
  screen: {
    name: 'home' | 'solver' | 'studio' | 'view',
    mode: 'intro' | 'active',
    active_shape_id: null,
    timestamp: ISO 8601 timestamp
  },
  shape: null,  // Future: shape details when loaded
  settings: {
    theme: 'light' | 'dark',
    language: 'en'
  },
  telemetry: {
    session_open_count: 1,
    ai_modal_open_count: number
  }
}
```

### 🎯 Tone & System Prompt
- **Friendly, game-like tone** - not philosophical or academic
- **Concise responses** - max 60 words
- **Context-aware** - knows which page user is on

System prompt:
```
You are a friendly puzzle assistant for KOOS Puzzle. 
Keep answers short and helpful (max 60 words). 
Use a simple, curious, game-like tone.
```

## 📁 Files Modified

### `src/components/AIChatModal.tsx`
- ✅ Added 10 rotating starter questions
- ✅ Random selection (3-4 questions per session)
- ✅ Updated system prompt for friendly tone
- ✅ Built full context metadata object
- ✅ Passes context to aiClient

### `src/services/aiClient.ts`
- ✅ Added optional `context` parameter
- ✅ Includes context in payload when provided
- ✅ Future-proof for RAG integration

### `src/components/InfoModal.tsx`
- ✅ Added `aiContext` prop (screen, topic)
- ✅ Passes context to AIChatModal

### `src/pages/home-previews/HomeVariantC.tsx`
- ✅ Example implementation with context:
  - Screen: "Home"
  - Topic: "Getting started with KOOS Puzzle..."

## 🚀 Usage Examples

### Home Page
```tsx
<InfoModal
  isOpen={showAbout}
  title="About KOOS Puzzle"
  onClose={() => setShowAbout(false)}
  aiContext={{
    screen: "Home",
    topic: "Getting started with KOOS Puzzle, understanding puzzle shapes, and how to begin solving"
  }}
>
```

### Studio Page
```tsx
<InfoModal
  isOpen={showHelp}
  title="Studio Help"
  onClose={() => setShowHelp(false)}
  aiContext={{
    screen: "Content Studio",
    topic: "Creating animations, recording videos, applying effects, and exporting content"
  }}
>
```

### Manual Puzzle Page
```tsx
<InfoModal
  isOpen={showHelp}
  title="Manual Solving Help"
  onClose={() => setShowHelp(false)}
  aiContext={{
    screen: "Manual Puzzle",
    topic: "Piece placement strategies, rotation controls, and solving techniques"
  }}
>
```

## 🔮 Future Enhancements

### Shape Context (When Shape is Loaded)
```typescript
shape: {
  id: "shape_1234",
  name: "FCC_16_Tetra",
  num_cells: 16,
  num_pieces: 25,
  symmetry_type: "tetrahedral",
  difficulty_estimate: 0.6
}
```

### Page-Specific Question Sets
- **Home**: Getting started questions
- **Solver**: Piece placement, strategy questions
- **Studio**: Animation, effects, recording questions
- **Viewer**: Solution analysis questions

### RAG Integration
The context metadata is already structured for future RAG:
- Log all questions with context
- Build knowledge base of common patterns
- Provide context-specific answers from past interactions
- Link to relevant documentation automatically

## 📊 Analytics Potential

With the current context metadata, you can track:
- Most common questions per page
- User journey (screen transitions)
- Device-specific issues
- Feature discovery patterns
- Popular starter questions

## 🎨 UI Details

### Greeting
```
👋 Hi! I'm your AI guide. Ask me anything about KOOS Puzzle!
```

### Input Placeholder
```
Ask about what you're viewing…
```

### Starter Questions
- Displayed as **pill buttons**
- **4 random questions** selected per session
- Click to send immediately
- Buttons disabled during loading

### Visual Design
- Purple gradient AI Help button
- Draggable modal window
- No dark backdrop (transparent)
- Message bubbles (user: blue, AI: white)
- Typing indicator with animated dots

## 🧪 Testing

### Test the Home Page AI
1. Go to koospuzzle.com
2. Click ℹ (info button)
3. Click "🤖 AI Help" button
4. Observe 4 random starter questions
5. Click a question or type your own
6. Response should be concise, friendly, game-like

### Expected Behavior
- ✅ Different questions each time modal opens
- ✅ Short responses (under 60 words typical)
- ✅ Context-aware (knows you're on home page)
- ✅ Friendly, curious tone
- ✅ No philosophical language

## 💰 Cost Estimate

With enhanced context metadata:
- **Token increase**: +150 tokens per request (context object)
- **Model**: gpt-4o-mini
- **Cost per interaction**: ~$0.0003
- **1000 chats/month**: ~$0.30/month

The context adds minimal cost but enables powerful future features.

## 🔒 Privacy & Security

### What's Logged (in context)
- ✅ Session ID (anonymous, temporary)
- ✅ Device type (mobile/desktop)
- ✅ Page name
- ✅ Language preference

### NOT Logged
- ❌ No personally identifiable information
- ❌ No user messages in context (only in messages array)
- ❌ No IP addresses
- ❌ No authentication tokens

All data sent to Edge Function only, never stored long-term.

## 📝 Version History

### v22.2.0 (Current)
- ✅ Rotating starter questions (10 questions, 4 categories)
- ✅ Full context metadata schema
- ✅ Updated system prompt (friendly, concise, game-like)
- ✅ Device detection
- ✅ Session tracking
- ✅ Screen context awareness

### v22.1.1
- Basic AI chat with fixed 3 questions
- Simple context (screen, topic)
- Manual authentication

### v22.1.0
- Initial AI chat implementation
- Draggable modal
- Basic OpenAI integration

## 🎯 Next Steps

1. **Add to other pages**: Apply aiContext to Studio, Solver, Viewer info modals
2. **Test variations**: Monitor which starter questions get most clicks
3. **Expand questions**: Add page-specific question sets
4. **Enable RAG**: Start logging context for knowledge base
5. **Add shape context**: When shape loaded, include shape details
6. **Streaming responses**: For longer, more detailed answers
7. **Multi-language**: Support for non-English users
