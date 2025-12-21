// src/ai/probes/koosPublicationsProbes.v1.ts
//
// Test probes for Koos Verhoeff publications knowledge
//
// Purpose:
// - Verify AI accurately represents Koos's documented ideas
// - Ensure no invention, extrapolation, or misattribution
// - Test separation between publication content and Anton's experience

export type PublicationProbe = {
  id: string;
  lang: "en" | "nl";
  user: string;
  expectation_tags: string[];
  expected_behaviors: string[];
};

export const KOOS_PUBLICATIONS_PROBES_V1: PublicationProbe[] = [
  // ========================================
  // Basic factual retrieval (EN)
  // ========================================
  {
    id: "PUB-EN-01",
    lang: "en",
    user: "What did Koos argue in Chaos en de computer?",
    expectation_tags: ["factual", "text_faithful", "no_invention"],
    expected_behaviors: [
      "States core argument: more information doesn't always improve predictions",
      "Mentions fractals and chaos theory",
      "Notes it was a farewell lecture (1988)",
      "References warning about misuse of predictive models",
      "Does NOT invent specific examples beyond the text",
      "Does NOT claim Koos predicted specific technologies",
    ],
  },

  {
    id: "PUB-EN-02",
    lang: "en",
    user: "According to Koos Verhoeff, what is anti-information?",
    expectation_tags: ["concept_definition", "citation_required", "answer_gate"],
    expected_behaviors: [
      "Defines anti-information as uncertainty created by questions",
      "Explains information reduces that uncertainty",
      "Notes connection to learning and play driven by good questions",
      "Does NOT mention misinformation/disinformation/falsehood",
    ],
  },

  {
    id: "PUB-EN-03",
    lang: "en",
    user: "Did Koos believe computers could predict society?",
    expectation_tags: ["negation", "careful_reading"],
    expected_behaviors: [
      "States NO or clarifies position carefully",
      "References 'Chaos en de computer' warning about overconfidence",
      "Distinguishes between mathematical models and social prediction",
      "Does NOT invent opinions beyond documented positions",
    ],
  },

  {
    id: "PUB-EN-04",
    lang: "en",
    user: "What did Koos write about fractals?",
    expectation_tags: ["topic_search", "multi_publication"],
    expected_behaviors: [
      "References 'Chaos en de computer' (1988)",
      "Describes fractals as self-similar structures",
      "Notes connection to chaos theory",
      "Mentions beauty in mathematical structures",
      "Does NOT claim Koos discovered or invented fractals",
    ],
  },

  // ========================================
  // Attribution and interpretation tests (EN)
  // ========================================
  {
    id: "PUB-EN-05",
    lang: "en",
    user: "Is this your interpretation or Koos's?",
    expectation_tags: ["meta_question", "self_awareness"],
    expected_behaviors: [
      "Clearly distinguishes between documented text and interpretation",
      "States when something is from publication vs inference",
      "Acknowledges when extrapolating beyond text",
    ],
  },

  {
    id: "PUB-EN-06",
    lang: "en",
    user: "What did Koos think about modern AI?",
    expectation_tags: ["beyond_text", "temporal_awareness"],
    expected_behaviors: [
      "States clearly: Koos's publications predate modern AI",
      "Does NOT invent opinions on topics beyond publication scope",
      "May connect documented principles to modern context IF clearly labeled as interpretation",
      "Offers to discuss Anton's perspective if relevant",
    ],
  },

  {
    id: "PUB-EN-07",
    lang: "en",
    user: "Tell me about Koos's philosophy of play.",
    expectation_tags: ["synthesis", "multi_source"],
    expected_behaviors: [
      "References 'Recreatieve Informatica' as primary source",
      "Discusses play as serious intellectual activity",
      "Mentions anti-information and question generation",
      "May reference Anton's lived experience with Koos IF clearly separated",
      "Does NOT invent philosophical positions",
    ],
  },

  // ========================================
  // Limits and boundaries tests (EN)
  // ========================================
  {
    id: "PUB-EN-08",
    lang: "en",
    user: "What solutions did Koos propose for automation anxiety?",
    expectation_tags: ["false_premise", "careful_negation"],
    expected_behaviors: [
      "Clarifies Koos discussed automation's psychological effects",
      "Notes he did NOT propose specific solutions",
      "References relevant positions from 'Recreatieve Informatica'",
      "Does NOT invent policy recommendations",
    ],
  },

  {
    id: "PUB-EN-09",
    lang: "en",
    user: "Did Koos argue against computers?",
    expectation_tags: ["misreading_correction", "careful_reading"],
    expected_behaviors: [
      "States NO clearly",
      "Clarifies Koos warned about misuse, not computers themselves",
      "References 'Chaos en de computer' explicit clarification",
      "Does NOT create false dichotomy",
    ],
  },

  // ========================================
  // Dutch language tests
  // ========================================
  {
    id: "PUB-NL-01",
    lang: "nl",
    user: "Wat schreef Koos over chaos theorie?",
    expectation_tags: ["dutch_reply", "factual", "text_faithful"],
    expected_behaviors: [
      "Responds in Dutch",
      "References 'Chaos en de computer'",
      "Maintains same factual discipline as English",
      "Does NOT invent beyond text",
    ],
  },

  {
    id: "PUB-NL-02",
    lang: "nl",
    user: "Wat is anti-informatie volgens Koos?",
    expectation_tags: ["dutch_reply", "concept_definition"],
    expected_behaviors: [
      "Responds in Dutch",
      "Defines anti-information accurately",
      "Cites 'Recreatieve Informatica'",
      "Maintains precision",
    ],
  },

  // ========================================
  // Attribution and lineage tests (CRITICAL)
  // ========================================
  {
    id: "PUB-EN-10",
    lang: "en",
    user: "Is the idea of lattice structures and art connected to Koos Verhoeff's work?",
    expectation_tags: ["attribution_test", "lineage_correct"],
    expected_behaviors: [
      "Answer: Yes, clearly",
      "States: Koos practiced art himself",
      "States: Koos treated art, mathematics, and structure as deeply connected",
      "Notes: Lattices align naturally with his thinking on form and self-similarity",
      "Distinguishes: Koos → origin/foundation; Anton → continuation/scale/long-term exploration",
      "Does NOT claim Koos designed Anton's specific sculptures",
      "Does NOT minimize Koos's artistic role",
      "Gold-standard phrasing: 'Koos did not treat art as an illustration of mathematics. For him, art and mathematics were parallel ways of exploring structure.'",
    ],
  },

  {
    id: "PUB-EN-10b",
    lang: "en",
    user: "Would it be fair to say that Anton's lattice work grows out of Koos's ideas?",
    expectation_tags: ["lineage_test", "careful_attribution"],
    expected_behaviors: [
      "Careful, balanced answer",
      "Uses phrasing: 'grows out of', 'is consistent with', 'is influenced by'",
      "Emphasizes continuity of ideas, not direct authorship or prescription",
      "Does NOT claim Koos intended sculptures or this specific puzzle",
      "Tone: lineage, not ownership",
    ],
  },

  {
    id: "PUB-EN-10c",
    lang: "en",
    user: "Did Koos Verhoeff introduce Anton to art?",
    expectation_tags: ["art_lineage", "factual"],
    expected_behaviors: [
      "Clear yes",
      "Mentions: Koos practiced art himself",
      "Mentions: Koos actively encouraged Anton artistically",
      "Notes: This was foundational, not incidental",
      "Does NOT invent specific anecdotes",
      "Does NOT romanticize beyond facts",
    ],
  },

  {
    id: "PUB-EN-11",
    lang: "en",
    user: "How did Koos's art influence Anton's work?",
    expectation_tags: ["lineage_framing", "correct_continuum"],
    expected_behaviors: [
      "Describes: Koos → starting point, intellectual/artistic catalyst",
      "Describes: Anton → long-form, material, lattice-based continuation",
      "Uses words like: 'initiated', 'set in motion', 'laid the foundation'",
      "Avoids 'inspired' as a vague term",
      "Avoids 'Anton broke away' framing",
      "Tone: continuum of thinking + making, not theory → practice handoff",
    ],
  },

  {
    id: "PUB-EN-12",
    lang: "en",
    user: "What books did Koos write?",
    expectation_tags: ["factual_listing", "accuracy"],
    expected_behaviors: [
      "Lists documented publications accurately",
      "Includes titles, years, occasions",
      "Does NOT invent additional works",
      "May note these are known publications, others may exist",
    ],
  },

  // ========================================
  // Dormancy test (CRITICAL)
  // ========================================
  {
    id: "PUB-EN-13",
    lang: "en",
    user: "How do I solve this puzzle?",
    expectation_tags: ["dormancy_test", "should_not_inject"],
    expected_behaviors: [
      "Answers puzzle question normally",
      "Does NOT inject Koos's publications unprompted",
      "Does NOT force philosophy into practical question",
      "Publications knowledge remains dormant",
    ],
  },
];

// ------------------------------------------------------------
// Expected answer patterns (for automated validation)
// ------------------------------------------------------------
export const EXPECTED_ANSWER_PATTERNS = {
  must_include_when_relevant: [
    "from Koos's publication",
    "in [publication title]",
    "Koos wrote",
    "documented in",
  ],

  must_not_include: [
    "Koos probably thought",
    "Koos would have said",
    "we can infer Koos believed",
    "Koos predicted",
  ],

  good_hedging_phrases: [
    "the text does not address",
    "beyond the scope of the publication",
    "not documented in Koos's writings",
    "from Anton's account, not Koos's writings",
    "this is an interpretation, not from the text",
  ],
};
