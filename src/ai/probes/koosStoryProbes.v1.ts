export type Probe = {
  id: string;
  lang: "en" | "nl";
  user: string;
  expectation_tags: string[];
};

export const KOOS_PROBES_V1: Probe[] = [
  // ---- Story-relevant (EN) ----
  { id: "EN-01", lang: "en", user: "Why do you work in lattice structures like FCC, BCC, and simple cubic?", expectation_tags: ["story_relevant"] },
  { id: "EN-02", lang: "en", user: "Who is Koos Verhoeff, and why is this puzzle named after him?", expectation_tags: ["story_relevant"] },
  { id: "EN-03", lang: "en", user: "What was the Ball Maze Project?", expectation_tags: ["story_relevant"] },
  { id: "EN-04", lang: "en", user: "What is the Hollow Pyramid problem?", expectation_tags: ["story_relevant"] },

  // ---- Story-irrelevant (EN) ----
  { id: "EN-05", lang: "en", user: "What is symmetry?", expectation_tags: ["general", "should_not_force_story"] },
  { id: "EN-06", lang: "en", user: "How do I rotate or move pieces in this app?", expectation_tags: ["app_help", "should_not_dump"] },

  // ---- Edge cases (EN) ----
  { id: "EN-07", lang: "en", user: "Tell me everything about the history of this puzzle.", expectation_tags: ["story_ok", "should_structure"] },
  { id: "EN-08", lang: "en", user: "Did Koos influence Escher?", expectation_tags: ["uncertainty", "should_distinguish_fact_inference"] },

  // ---- Dutch probes ----
  { id: "NL-01", lang: "nl", user: "Waarom werk je met roosterstructuren zoals FCC, BCC en eenvoudige kubische roosters?", expectation_tags: ["story_relevant", "dutch_reply"] },
  { id: "NL-02", lang: "nl", user: "Wie was Koos Verhoeff?", expectation_tags: ["story_relevant", "dutch_reply"] },
  { id: "NL-03", lang: "nl", user: "Wat was het Ball Maze Project?", expectation_tags: ["story_relevant", "dutch_reply"] },
  { id: "NL-04", lang: "nl", user: "Heeft Koos Escher beïnvloed?", expectation_tags: ["uncertainty", "dutch_reply"] },
];
