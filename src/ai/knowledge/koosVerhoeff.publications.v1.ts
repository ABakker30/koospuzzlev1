// src/ai/knowledge/koosVerhoeff.publications.v1.ts
//
// Canonical knowledge base for Koos Verhoeff's publications
//
// Purpose:
// - Authoritative reference data for Koos's documented writings
// - Used ONLY when user explicitly asks about Koos's publications
// - NOT injected into general story context
// - Enforces strict factual discipline: no invention, no extrapolation
//
// Update policy:
// - Add only documented publications
// - Never invent motivations or theories
// - Clear separation between text content and interpretation

// ========================================
// Canonical Concept Aliases (prevent semantic drift)
// ========================================
export const VERHOEFF_ANTI_INFO_ALIAS = "Productive Uncertainty (Verhoeff)";
export const VERHOEFF_ANTI_INFO_ALIAS_NL = "Productieve onzekerheid (Verhoeff)";

export const KOOS_CONCEPTS = {
  productiveUncertainty: {
    canonical_label_en: VERHOEFF_ANTI_INFO_ALIAS,
    canonical_label_nl: VERHOEFF_ANTI_INFO_ALIAS_NL,

    user_facing_terms: {
      en: ["anti-information", "anti information"],
      nl: ["anti-informatie", "anti informatie"]
    },

    strict_definition_en:
      "In Koos Verhoeff's usage, this means the uncertainty created by a question. Information is what reduces that uncertainty. This concept is productive and drives learning and discovery.",
    strict_definition_nl:
      "Bij Koos Verhoeff betekent dit: de onzekerheid die ontstaat door een vraag. Informatie is wat die onzekerheid vermindert. Deze onzekerheid is productief en stimuleert leren en ontdekken.",

    do_not_say_en: [
      "misinformation",
      "disinformation",
      "false information",
      "misleading information",
      "noise"
    ],
    do_not_say_nl: [
      "misinformatie",
      "desinformatie",
      "valse informatie",
      "misleidende informatie",
      "ruis"
    ]
  }
} as const;

export type KoosPublication = {
  title: string;
  original_language: "nl" | "en";
  year: number;
  occasion: string;
  institution?: string;

  document_type: "farewell_lecture" | "dies_natalis_address" | "public_lecture" | "book" | "article";

  core_topics: string[];

  key_positions: string[];

  notable_concepts_defined_or_used: string[];

  explicit_warnings_or_limits: string[];

  things_the_text_does_not_claim: string[];
};

export type KoosPublicationsKnowledge = {
  author: string;
  author_bio_brief: string;
  publications: KoosPublication[];

  global_guidance_for_ai: string[];
};

// ------------------------------------------------------------
// Koos Verhoeff Publications Knowledge Base v1
// ------------------------------------------------------------
export const KOOS_PUBLICATIONS_V1: KoosPublicationsKnowledge = {
  author: "Koos Verhoeff",
  author_bio_brief: "Mathematician and philosopher; professor at Erasmus University Rotterdam; mentor to Anton Bakker.",

  publications: [
    // ========================================
    // Publication 1: Chaos en de computer (1988)
    // ========================================
    {
      title: "Chaos en de computer",
      original_language: "nl",
      year: 1988,
      occasion: "Farewell lecture",
      institution: "Erasmus Universiteit Rotterdam",
      document_type: "farewell_lecture",

      core_topics: [
        "chaos theory and fractals",
        "limits of prediction in complex systems",
        "non-linearity in natural and social systems",
        "misuse of mathematical models in politics and economics",
        "relationship between beauty and good mathematics",
      ],

      key_positions: [
        "More information about a system does not necessarily lead to better predictions.",
        "Many real-world systems exhibit principled unpredictability.",
        "Fractals reveal structure within apparent chaos.",
        "Scientific models can mislead when their limits are ignored.",
        "Overconfidence in predictive models is dangerous in policy-making.",
      ],

      notable_concepts_defined_or_used: [
        "fractals as self-similar structures",
        "period doubling and bifurcation",
        "sensitivity to initial conditions",
        "chaotic behavior in deterministic systems",
        "distinction between mathematical beauty and practical misuse",
      ],

      explicit_warnings_or_limits: [
        "The lecture does not claim that chaos makes science useless.",
        "It explicitly warns against political misuse of predictive models.",
        "It does not offer new mathematical proofs of chaos.",
        "It does not propose technological solutions to chaos.",
      ],

      things_the_text_does_not_claim: [
        "It does not claim chaos can be fully controlled.",
        "It does not predict specific future technologies.",
        "It does not argue against computers themselves.",
        "It does not claim fractals explain all natural phenomena.",
      ],
    },

    // ========================================
    // Publication 2: Recreatieve Informatica (1984)
    // ========================================
    {
      title: "Recreatieve Informatica",
      original_language: "nl",
      year: 1984,
      occasion: "Dies Natalis address (71st anniversary)",
      institution: "Erasmus Universiteit Rotterdam",
      document_type: "dies_natalis_address",

      core_topics: [
        "play as a serious intellectual activity",
        "games and puzzles as sources of learning",
        "anti-information (questions over answers)",
        "role of uncertainty in engagement",
        "human interaction with computers",
      ],

      key_positions: [
        "Information only exists when a question exists.",
        "Questions are more important than answers.",
        "Play generates anti-information, which drives learning.",
        "Games and puzzles should be taken seriously by academia.",
        "Recreation fulfills a psychological need amplified by automation.",
      ],

      notable_concepts_defined_or_used: [
        "anti-information: The uncertainty created by a question. Information is the reduction of that uncertainty. Anti-information is productive and necessary for learning. It does NOT mean false or misleading information.",
        "information as reduction of uncertainty",
        "games as generators of questions",
        "distinction between work and recreation",
        "first-person vs third-person games",
      ],

      explicit_warnings_or_limits: [
        "The lecture does not advocate replacing education with games.",
        "It does not argue that all games are beneficial.",
        "It does not present a formal theory of play.",
      ],

      things_the_text_does_not_claim: [
        "It does not claim computers will solve social boredom.",
        "It does not claim automation is inherently good or bad.",
        "It does not predict specific future devices.",
      ],
    },

    // ========================================
    // Publication 3: Inleiding (1978)
    // ========================================
    {
      title: "Inleiding (Boekenweek opening)",
      original_language: "nl",
      year: 1978,
      occasion: "Opening of the 43rd Boekenweek",
      document_type: "public_lecture",

      core_topics: [
        "information vs uncertainty",
        "books as communication media",
        "role of questions in understanding",
        "limits of information consumption",
      ],

      key_positions: [
        "Information is the reduction of uncertainty.",
        "Large collections of data are only potential information.",
        "Without questions, data remains inert.",
        "Books are tools for communication, not containers of meaning.",
      ],

      notable_concepts_defined_or_used: [
        "information hunger",
        "potential information",
        "communication as exchange",
        "uncertainty as productive",
      ],

      explicit_warnings_or_limits: [
        "The lecture does not dismiss books.",
        "It does not argue against mass media.",
        "It does not define a formal information theory.",
      ],

      things_the_text_does_not_claim: [
        "It does not propose new publishing models.",
        "It does not predict digital books.",
        "It does not claim information alone leads to wisdom.",
      ],
    },
  ],

  // ========================================
  // CANONICAL OVERRIDES (NON-NEGOTIABLE)
  // These rules override all other guidance, model instincts, and general knowledge.
  // 
  // PRIORITY ORDER (ENFORCE STRICTLY):
  // 1. Canonical Overrides (this section)
  // 2. Publications knowledge module
  // 3. StoryContext narrative
  // 4. Conversational tone/style
  //
  // If there is any conflict: Canonical Overrides win. No exceptions.
  // ========================================
  global_guidance_for_ai: [
    // ========================================
    // TERMINOLOGY MAPPING — Productive Uncertainty (canonical, override)
    // ========================================
    "TERMINOLOGY MAPPING (canonical, override): Koos Verhoeff used the term 'anti-information' ('anti-informatie'). In this app, treat that term as a label for the concept: 'Productive Uncertainty (Verhoeff)' / 'Productieve onzekerheid (Verhoeff)'. This does NOT mean misinformation or falsehood. When defining it, always use the productive-uncertainty meaning: the uncertainty created by a question, which information reduces. This is productive and drives learning.",
    "NEGATIVE PROMPT: If the user asks about Koos's 'anti-information,' do not use words like misinformation/disinformation/falsehood/ruis/misleidend. That is not Koos's meaning.",

    // ========================================
    // CONSTRAINT — Temporal Boundary (Modern AI)
    // (This is not advice. This is a factual constraint.)
    // ========================================
    "CONSTRAINT: Koos Verhoeff wrote before modern AI existed. He has no documented views on modern AI. Questions about Koos's views on modern AI must be answered by stating this absence explicitly: 'Koos did not write about modern AI.' You may relate his documented warnings about automation and limits of prediction in general terms, but you cannot speculate about what he would have thought.",

    // ========================================
    // CANONICAL OVERRIDE — Chaos Reference
    // ========================================
    "CANONICAL OVERRIDE — Chaos Reference: 'Chaos theory,' 'chaos,' and 'fractals' are central topics of Koos Verhoeff's farewell lecture 'Chaos en de computer' (1988). In both English and Dutch: Always reference this lecture when asked about chaos. Never state that there are 'no specific writings' on chaos.",

    // ========================================
    // Publication Knowledge Rules
    // ========================================
    "CRITICAL: Koos Verhoeff's publications are authoritative sources. When asked about them, refer ONLY to documented ideas from the texts.",
    "Do not invent motivations, proofs, or predictions beyond what is explicitly stated in the publications.",
    "Do not attribute modern interpretations to Koos unless explicitly labeled as Anton Bakker's perspective or personal experience.",
    "If a question goes beyond the documented texts, say so clearly: 'That topic is not covered in Koos's published writings.'",
    "Distinguish between: (1) what Koos wrote, (2) what Anton experienced with Koos, and (3) contemporary interpretations.",
    "This knowledge is used ONLY when user explicitly asks about Koos's writings, philosophy, or specific publications. Do not force it into unrelated conversations.",

    // ========================================
    // Art and Lineage Attribution
    // ========================================
    "CRITICAL: Koos Verhoeff was not only a mathematician and philosopher but also practiced art. When discussing art and lineage, do not imply that Anton entered art independently. Anton's artistic path began through Koos's example and encouragement.",
    "Art and lattice structures: Koos treated art and mathematics as parallel ways of exploring structure. Lattices align naturally with his thinking on form, self-similarity, and mathematical organization. Anton's lattice-based work is a continuation and expansion, not a lateral shift.",
    "Lineage framing: Use words like 'initiated', 'set in motion', 'laid the foundation' when describing Koos's influence. Avoid 'inspired' as vague. The correct picture is: Koos → thinking + making; Anton → thinking + making + extending over decades. This is a continuum, not a theory-to-practice handoff.",
  ],
};

// ------------------------------------------------------------
// Helper: Get publication by title
// ------------------------------------------------------------
export function getPublicationByTitle(title: string): KoosPublication | undefined {
  return KOOS_PUBLICATIONS_V1.publications.find(
    (pub) => pub.title.toLowerCase().includes(title.toLowerCase())
  );
}

// ------------------------------------------------------------
// Helper: Get publications by topic
// ------------------------------------------------------------
export function getPublicationsByTopic(topic: string): KoosPublication[] {
  const lowerTopic = topic.toLowerCase();
  return KOOS_PUBLICATIONS_V1.publications.filter((pub) =>
    pub.core_topics.some((t) => t.toLowerCase().includes(lowerTopic)) ||
    pub.notable_concepts_defined_or_used.some((c) => c.toLowerCase().includes(lowerTopic))
  );
}

// ------------------------------------------------------------
// Helper: Format publication for AI context injection
// ------------------------------------------------------------
export function formatPublicationForAI(pub: KoosPublication): string {
  return `
## ${pub.title} (${pub.year})

**Occasion:** ${pub.occasion}
${pub.institution ? `**Institution:** ${pub.institution}` : ''}
**Type:** ${pub.document_type}

**Core Topics:**
${pub.core_topics.map(t => `- ${t}`).join('\n')}

**Key Positions:**
${pub.key_positions.map(p => `- ${p}`).join('\n')}

**Notable Concepts:**
${pub.notable_concepts_defined_or_used.map(c => `- ${c}`).join('\n')}

**Explicit Limits:**
${pub.explicit_warnings_or_limits.map(l => `- ${l}`).join('\n')}

**What the Text Does NOT Claim:**
${pub.things_the_text_does_not_claim.map(n => `- ${n}`).join('\n')}
  `.trim();
}

// ------------------------------------------------------------
// Helper: Get full publications context for AI
// ------------------------------------------------------------
export function getPublicationsContextForAI(): string {
  const sections: string[] = [];

  sections.push(`# Koos Verhoeff — Publications Knowledge Base`);
  sections.push(`Author: ${KOOS_PUBLICATIONS_V1.author}`);
  sections.push(`${KOOS_PUBLICATIONS_V1.author_bio_brief}\n`);

  sections.push(`## Global Guidance`);
  KOOS_PUBLICATIONS_V1.global_guidance_for_ai.forEach(g => sections.push(`- ${g}`));
  sections.push('');

  sections.push(`## Publications (${KOOS_PUBLICATIONS_V1.publications.length} total)\n`);

  KOOS_PUBLICATIONS_V1.publications.forEach((pub) => {
    sections.push(formatPublicationForAI(pub));
    sections.push('');
  });

  return sections.join('\n');
}
