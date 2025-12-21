# Koos Verhoeff Publications Knowledge Base

## Purpose

This module contains **authoritative reference data** for Koos Verhoeff's documented publications. It enforces strict factual discipline:

- ✅ **No invented theories**
- ✅ **No inferred motivations**
- ✅ **No extrapolation beyond text**
- ✅ **Clear separation** between documented ideas and Anton's lived experience

## Architecture

### Files

- **`koosVerhoeff.publications.v1.ts`** - Core knowledge module with type definitions and data
- **`../probes/koosPublicationsProbes.v1.ts`** - Test probes for verification

### Data Structure

```typescript
KoosPublication {
  title: string
  year: number
  core_topics: string[]
  key_positions: string[]
  notable_concepts_defined_or_used: string[]
  explicit_warnings_or_limits: string[]
  things_the_text_does_not_claim: string[]
}
```

## Publications Included

### 1. Chaos en de computer (1988)
- **Type:** Farewell lecture, Erasmus University Rotterdam
- **Topics:** Chaos theory, fractals, limits of prediction, misuse of models
- **Key Concept:** More information ≠ better predictions

### 2. Recreatieve Informatica (1984)
- **Type:** Dies Natalis address
- **Topics:** Play as learning, anti-information, games and puzzles
- **Key Concept:** Anti-information (questions over answers)

### 3. Inleiding (1978)
- **Type:** Boekenweek opening lecture
- **Topics:** Information vs uncertainty, role of questions
- **Key Concept:** Information as reduction of uncertainty

## Integration Rules (CRITICAL)

### 🚨 Dormancy by Default

This knowledge is **NOT injected into every chat**. It is **dormant** until explicitly needed.

### When to Load

Load publications context ONLY when user asks about:

1. **Explicit publication queries**
   - "What did Koos write about chaos?"
   - "Tell me about Recreatieve Informatica"
   - "What is anti-information?"

2. **Koos's philosophy**
   - "What was Koos's philosophy?"
   - "What did Koos believe about play?"

3. **Direct publication names**
   - "Chaos en de computer"
   - "Recreatieve Informatica"

### When NOT to Load

DO NOT inject publications knowledge when user asks:

- ❌ Puzzle solving questions ("How do I solve this?")
- ❌ App functionality ("How do I rotate pieces?")
- ❌ General story questions (use StoryContext instead)
- ❌ Unrelated topics

## Usage Pattern

### Step 1: Detect Intent

```typescript
function shouldLoadPublications(userMessage: string): boolean {
  const triggers = [
    /koos.*writ/i,
    /koos.*publish/i,
    /chaos.*computer/i,
    /recreatieve informatica/i,
    /anti.?information/i,
    /koos.*philosoph/i,
    /koos.*lectures?/i,
  ];
  
  return triggers.some(pattern => pattern.test(userMessage));
}
```

### Step 2: Conditional Injection

```typescript
import { getPublicationsContextForAI } from '../ai/knowledge/koosVerhoeff.publications.v1';

let systemPrompt = baseSystemPrompt;

if (shouldLoadPublications(userMessage)) {
  const publicationsContext = getPublicationsContextForAI();
  systemPrompt += `\n\n${publicationsContext}`;
}
```

### Step 3: Enforce Guardrails

The system prompt should always include:

```
CRITICAL: When discussing Koos Verhoeff's publications:
- Refer ONLY to documented ideas from the texts
- Do NOT invent motivations or theories
- Clearly distinguish between:
  (1) What Koos wrote
  (2) What Anton experienced with Koos
  (3) Contemporary interpretations
- If uncertain, state: "That is not documented in Koos's writings"
```

## Helper Functions

### Get All Publications Context

```typescript
import { getPublicationsContextForAI } from './koosVerhoeff.publications.v1';

const fullContext = getPublicationsContextForAI();
// Returns formatted text with all publications and guardrails
```

### Search by Title

```typescript
import { getPublicationByTitle } from './koosVerhoeff.publications.v1';

const chaos = getPublicationByTitle("Chaos en de computer");
// Returns KoosPublication or undefined
```

### Search by Topic

```typescript
import { getPublicationsByTopic } from './koosVerhoeff.publications.v1';

const playPubs = getPublicationsByTopic("play");
// Returns array of matching publications
```

### Format Single Publication

```typescript
import { formatPublicationForAI } from './koosVerhoeff.publications.v1';

const formatted = formatPublicationForAI(publication);
// Returns formatted string for AI context
```

## Testing

### Run Publication Probes

```typescript
import { KOOS_PUBLICATIONS_PROBES_V1 } from '../probes/koosPublicationsProbes.v1';

// Test each probe and verify expected behaviors
for (const probe of KOOS_PUBLICATIONS_PROBES_V1) {
  const response = await askAI(probe.user);
  // Validate against probe.expected_behaviors
}
```

### Key Test Scenarios

1. **Factual retrieval:** "What did Koos argue in Chaos en de computer?"
   - ✅ Accurate representation
   - ❌ No invention

2. **Concept definition:** "What is anti-information?"
   - ✅ Citation included
   - ✅ Correct definition

3. **Attribution:** "Is this your interpretation or Koos's?"
   - ✅ Clear separation
   - ✅ Acknowledges source

4. **Beyond text:** "What did Koos think about modern AI?"
   - ✅ States clearly: beyond publication scope
   - ❌ No invented opinions

5. **Dormancy:** "How do I solve this puzzle?"
   - ✅ Publications NOT injected
   - ✅ Answers question normally

## Expected Answer Patterns

### ✅ Good Patterns

- "From Koos's publication 'Recreatieve Informatica' (1984)..."
- "Koos wrote that information only exists when a question exists"
- "The text does not address modern AI"
- "That is beyond the scope of Koos's documented writings"
- "From Anton's account, not Koos's publications..."

### ❌ Bad Patterns (Must NOT Appear)

- "Koos probably thought..."
- "Koos would have said..."
- "We can infer Koos believed..."
- "Koos predicted [modern technology]"

## Maintenance

### Adding New Publications

1. Add to `KOOS_PUBLICATIONS_V1.publications[]`
2. Follow exact data structure
3. Include `explicit_warnings_or_limits` and `things_the_text_does_not_claim`
4. Add corresponding test probes
5. Update this README

### Updating Guardrails

Edit `KOOS_PUBLICATIONS_V1.global_guidance_for_ai[]` with caution. All changes must preserve:
- Text faithfulness
- No invention policy
- Clear attribution

## Strategic Value

This knowledge base enables:

- **Museum-grade accuracy** (MoMath, science museums)
- **Academic safety** (Bridges papers, university collaborations)
- **Scholarly credibility** (future book, exhibitions)
- **Clean separation** between documented philosophy and contemporary project

## Integration Status

### ✅ Complete
- Type definitions
- Data structures
- Three publications documented
- Test probes created
- Helper functions

### 🚧 Pending
- Chat hook integration (conditional loading)
- Probe runner script
- Automated validation

### 📋 Future
- Add more publications as discovered
- Multilingual publication titles
- Cross-reference with StoryContext
