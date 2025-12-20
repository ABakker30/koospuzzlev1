// src/ai/StoryContext.ts
// Koos Puzzle — Story Context v1
//
// Purpose:
// - Background context for the Koos Puzzle app AI.
// - NOT user-visible.
// - NOT a fixed prompt / script.
// - The LLM may use this context when relevant, and ignore it when not.
//
// Update policy:
// - Add new facts as they come in.
// - Prefer accuracy over drama.
// - Keep narrative compact; move long-form material to a separate book doc later.

export type StoryContextV1 = {
  version: "v1";
  updated_utc: string;

  naming: {
    app_name: string;
    project_names: string[];
    people: Record<string, string>;
    note_on_spelling: string;
  };

  themes: {
    core: string[];
    philosophy: string[];
    learning_style: string[];
  };

  origin_story: {
    short_summary: string;
    timeline: Array<{
      era: string;
      events: string[];
    }>;
  };

  key_projects: {
    ball_maze_project: {
      description: string;
      motivations: string[];
      technical_notes: string[];
      metaphors_and_methods: string[];
      media_notes: string[];
    };

    ball_puzzle_project: {
      description: string;
      lattice_basis: string;
      pieces: {
        piece_definition: string;
        count: number;
        naming: string;
        mirror_images: string;
      };
      shapes_and_challenges: string[];
      computation_and_combinatorics: string[];
      hollow_pyramid_story: string[];
      media_notes: string[];
    };

    revival_2025: {
      triggers: string[];
      digital_direction: string[];
      physical_prototypes: string[];
      manufacturing_path: string[];
    };
  };

  related_figures_and_lineage: {
    koos_verhoeff: string[];
    tom_verhoeff: string[];
    escher_connection: {
      known_facts: string[];
      plausible_but_unconfirmed: string[];
    };
  };

  app_chat_guidance: {
    style: string[];
    do_not: string[];
    safe_defaults: string[];
  };
};

// ------------------------------------------------------------
// Exported context
// ------------------------------------------------------------
export const KOOS_PUZZLE_STORY_CONTEXT_V1: StoryContextV1 = {
  version: "v1",
  updated_utc: "2025-12-20T00:00:00Z",

  naming: {
    app_name: "KOOS Puzzle",
    project_names: ["Ball Maze Project", "Ball Puzzle Project", "Hollow Pyramid problem"],
    people: {
      Anton: "Anton (artist, puzzle designer; influenced by early work with Koos)",
      Koos: "Koos Verhoeff (mathematician + philosopher; mentor figure)",
      Tom: "Tom Verhoeff (mathematician + computer scientist; active in math-art community; Bridges chair)",
    },
    note_on_spelling:
      "Use 'Koos' (not 'Coase'). Use 'Verhoeff/Verhoef' as the user states; do not over-correct unless asked.",
  },

  themes: {
    core: [
      "Beauty of symmetry",
      "Importance of perspective (a form can change radically by viewpoint)",
      "Wonder through deep looking",
      "Lattices as the underlying structure of matter (atoms)",
    ],
    philosophy: [
      "Play is a serious form of learning",
      "Questions can be more important than answers",
      "Discovery beats memorization",
      "Do not automate faster than socially acceptable (Koos's warning)",
    ],
    learning_style: [
      "Hands-on experimentation",
      "Incremental building: simple setup first, then complexity",
      "Use metaphors to reason about technical systems",
      "Embrace setbacks as catalysts for better methods",
    ],
  },

  origin_story: {
    short_summary:
      "Anton met Koos around age 17 through Koos's daughter (Kim). In a difficult period for both families, Koos became a mentor and father-figure. They built the Ball Maze Project (late 1970s into early 1980s): computers controlling a real physical system outside the computer. From that work grew the Ball Puzzle Project: 25 unique 4-sphere pieces in an FCC lattice (A–Y), exploring many 100-sphere shapes and enormous combinatorics. Decades later, in 2025, the story and the ongoing fascination with the Hollow Pyramid problem helped reignite the puzzle—now as a modern web/app experience and a potential manufactured physical puzzle.",
    timeline: [
      {
        era: "late 1970s → early 1980s",
        events: [
          "Ball Maze Project developed over several years (physical maze + camera + motorized tilt).",
          "Computers were hand-assembled; deep philosophical discussions shaped problem-solving approach.",
          "Koos emphasized play as learning; perspective and symmetry as ways of seeing.",
        ],
      },
      {
        era: "early 1980s",
        events: [
          "Ball Puzzle Project begins: many balls form shapes; pieces are 4-sphere clusters in FCC packing.",
          "Pieces named A through Y; orientation counting and symmetry considerations become central.",
          "Computational search quickly becomes astronomically large.",
        ],
      },
      {
        era: "later years → 2025",
        events: [
          "Hollow Pyramid problem circulated; a solution eventually found by an external programmer (and his brother).",
          "Bridges 2025 (Netherlands): renewed interest triggered by an email from someone resuming the problem in retirement.",
          "Anton revives the puzzle as a web/app experience and explores manufacturing constraints and solutions.",
        ],
      },
    ],
  },

  key_projects: {
    ball_maze_project: {
      description:
        "A computer-controlled physical ball maze: a camera tracks a real ball on a tilted plane; motors/steppers adjust tilt; software attempts to guide the ball through a maze.",
      motivations: [
        "Do something outside the computer (computer as bridge to the physical world).",
        "Explore play and puzzles as a path to learning and discovery.",
      ],
      technical_notes: [
        "Multiple early microcomputers were used (8080-era systems; CP/M era).",
        "Camera tracking: early efforts used a flat surface without maze holes/walls to learn tracking.",
        "Progression: camera follows ball → system directs ball → goal behaviors (e.g., ball moving in a circle).",
      ],
      metaphors_and_methods: [
        "Ball as 'thief' in a city; camera as 'police' that knows the walls and slows to avoid collision.",
        "Physics-based anticipation: angle in/out at walls; predict behavior to track safely.",
        "Pragmatic hacks: improve tracking contrast (e.g., making the ball dark for visibility).",
      ],
      media_notes: [
        "There exists an early 1980s video showing the ball completing the maze, with computers and code visible.",
        "A URL can be provided later for interested viewers.",
      ],
    },

    ball_puzzle_project: {
      description:
        "A packing-based puzzle: 100 spheres arranged in an FCC lattice; puzzle pieces are connected clusters of 4 spheres; goal is to assemble target shapes.",
      lattice_basis:
        "FCC (face-centered cubic) packing as the canonical structure; later expands conceptually to BCC and simple cubic as artistic language.",
      pieces: {
        piece_definition: "Each piece is 4 spheres connected in an FCC lattice adjacency.",
        count: 25,
        naming: "Pieces labeled A through Y.",
        mirror_images:
          "Mirror-image variants are treated as distinct where relevant (as described by the user).",
      },
      shapes_and_challenges: [
        "Many interesting 100-sphere shapes were explored.",
        "Example target: a 5×5 layer (25 spheres) stacked into 4 layers (5×5×4). Do not call it a cube.",
        "Key challenge: determine all valid orientations per piece within the lattice and target shape.",
      ],
      computation_and_combinatorics: [
        "Once orientations and placements are considered, search space becomes astronomical (quoted as exceeding 10^80).",
        "Early computation involved severe constraints (assembly language era), requiring careful representation.",
        "Practical lesson: sometimes 'clever' heuristics don't help as much as expected; brute force (or different starting points) can win.",
        "Luck matters: in huge search spaces, where you start searching can influence outcomes.",
      ],
      hollow_pyramid_story: [
        "A particularly hard target shape was the 'Hollow Pyramid' problem, publicized with a 1000 guilder reward.",
        "A small computer reportedly ran the search for years; a power supply incident caused smoke damage and nearly burned a historic farm building.",
        "Eventually, two brothers wrote solvers; one found a solution. Tom reviewed the code and observed that turning off some 'clever' optimizations still produced solutions (and more).",
        "As of 2025, people are still revisiting the Hollow Pyramid problem, including retirees.",
      ],
      media_notes: [
        "There is a video related to the near-fire/smoke incident (to be linked later).",
      ],
    },

    revival_2025: {
      triggers: [
        "Anton wanted a better answer to: 'Why do you work in FCC/BCC/simple cubic lattices?'",
        "Renewed community interest (Bridges 2025; email from Oregon about hollow pyramid work).",
        "Desire to share the origin story: ball maze → ball puzzle → lattices → art → perspective-driven wonder.",
      ],
      digital_direction: [
        "Build a web/app experience so people can solve the puzzle, play, learn, and experience wonder.",
        "Include modes such as play vs computer, play vs another person, community play, and solver engines with settings.",
      ],
      physical_prototypes: [
        "3D-printed prototypes using ~1 inch spheres; later a hollow steel-ball version to keep weight reasonable.",
      ],
      manufacturing_path: [
        "Manufacturing constraints: some 3D pieces are not mold-friendly with simple parting lines.",
        "Decomposition into 2D pieces and 3D pieces to enable manufacturing.",
        "Ultrasonic welding explored but challenged by jig complexity; press-fit approach selected as a practical path (as of now).",
      ],
    },
  },

  related_figures_and_lineage: {
    koos_verhoeff: [
      "Koos was both mathematician and philosopher; emphasized play, learning through discovery, and deep looking.",
      "Personal teaching moments: chess practice; 'sit on your hands' to slow down and think.",
      "Koos's study in an old farm house: books, puzzles, computers, and the mechanical construction for the Ball Maze Project.",
      "FAC (F-A-C) mechanical system used as a professional-grade construction set for mechanics/gears/motors (verify specifics later if needed).",
      "Koos wrote and spoke about the future of automation; 'do not automate faster than socially acceptable' (speech: 'Chaos and the Computer').",
    ],
    tom_verhoeff: [
      "Tom contributed mathematically and computationally (e.g., making systems workable in a constrained CP/M-era environment).",
      "Tom chaired Bridges 2025 (as stated by user).",
      "Tom circulated the Hollow Pyramid challenge academically and handled solution follow-ups.",
    ],
    escher_connection: {
      known_facts: [
        "User reports Koos had a long history with Escher, including conference and presentation interactions.",
        "Escher's work includes lattice-related explorations (e.g., cubic space themes, tessellations).",
        "User reports Koos received a personalized print from Escher as thanks after feedback on a revised presentation.",
      ],
      plausible_but_unconfirmed: [
        "Koos may have influenced or curated inspirations for Escher (e.g., pointing to articles), but this is not confirmed and should be framed carefully if mentioned.",
      ],
    },
  },

  app_chat_guidance: {
    style: [
      "Be natural and conversational.",
      "Use story details only when the user's question invites it.",
      "Keep answers compact by default; expand when asked.",
      "If asked for 'why lattices', connect atoms → lattices → puzzles → art → perspective.",
      "Treat the story as living; invite the user to add more memories.",
    ],
    do_not: [
      "Do not dump the full story unprompted.",
      "Do not present story elements as proven historical fact if the user framed them as assumptions.",
      "Do not turn the chat into a fixed script or repeated tagline machine.",
      "Do not call a 5×5×4 structure a cube.",
    ],
    safe_defaults: [
      "If unsure, ask a gentle follow-up question rather than inventing facts.",
      "When in doubt, distinguish: 'known from Anton's account' vs 'unconfirmed inference.'",
    ],
  },
};

// ------------------------------------------------------------
// Helper: Convert context to condensed text for LLM injection
// ------------------------------------------------------------
export function getStoryContextCondensed(): string {
  const ctx = KOOS_PUZZLE_STORY_CONTEXT_V1;

  return `
# ${ctx.naming.app_name} — Background Context

${ctx.origin_story.short_summary}

## Core Themes
${ctx.themes.core.map(t => `- ${t}`).join('\n')}

## Philosophy
${ctx.themes.philosophy.map(p => `- ${p}`).join('\n')}

## Key Projects

**Ball Maze Project (late 1970s–early 1980s)**
${ctx.key_projects.ball_maze_project.description}
- Motivations: ${ctx.key_projects.ball_maze_project.motivations.join('; ')}

**Ball Puzzle Project**
${ctx.key_projects.ball_puzzle_project.description}
- ${ctx.key_projects.ball_puzzle_project.pieces.count} pieces (${ctx.key_projects.ball_puzzle_project.pieces.naming})
- Lattice: ${ctx.key_projects.ball_puzzle_project.lattice_basis}
- These lattice structures are fundamental to how atoms arrange in matter, which is why they became both a scientific and artistic foundation.
- Search space: ${ctx.key_projects.ball_puzzle_project.computation_and_combinatorics[0]}

**Hollow Pyramid Story**
${ctx.key_projects.ball_puzzle_project.hollow_pyramid_story.slice(0, 2).join(' ')}

**2025 Revival**
${ctx.key_projects.revival_2025.triggers.join(' ')}

## People
${Object.entries(ctx.naming.people).map(([key, desc]) => `- ${desc}`).join('\n')}

## Related Connections
- Koos Verhoeff: ${ctx.related_figures_and_lineage.koos_verhoeff.slice(0, 2).join(' ')}
- Tom Verhoeff: ${ctx.related_figures_and_lineage.tom_verhoeff.slice(0, 2).join(' ')}
- Escher connection: ${ctx.related_figures_and_lineage.escher_connection.known_facts[0]}

## Chat Guidance
Style: ${ctx.app_chat_guidance.style.slice(0, 3).join('; ')}
Do not: ${ctx.app_chat_guidance.do_not.slice(0, 2).join('; ')}
  `.trim();
}

// ------------------------------------------------------------
// Helper: Get full context as formatted text
// ------------------------------------------------------------
export function getStoryContextFull(): string {
  const ctx = KOOS_PUZZLE_STORY_CONTEXT_V1;

  const sections: string[] = [];

  sections.push(`# ${ctx.naming.app_name} — Full Story Context v${ctx.version}`);
  sections.push(`Last updated: ${ctx.updated_utc}\n`);

  sections.push(`## Origin Story`);
  sections.push(ctx.origin_story.short_summary);
  sections.push(`\n### Timeline`);
  ctx.origin_story.timeline.forEach(t => {
    sections.push(`\n**${t.era}**`);
    t.events.forEach(e => sections.push(`- ${e}`));
  });

  sections.push(`\n## Core Themes`);
  ctx.themes.core.forEach(t => sections.push(`- ${t}`));

  sections.push(`\n## Philosophy`);
  ctx.themes.philosophy.forEach(p => sections.push(`- ${p}`));

  sections.push(`\n## Learning Style`);
  ctx.themes.learning_style.forEach(l => sections.push(`- ${l}`));

  sections.push(`\n## Key Projects\n`);

  sections.push(`### Ball Maze Project`);
  sections.push(ctx.key_projects.ball_maze_project.description);
  sections.push(`\nMotivations:`);
  ctx.key_projects.ball_maze_project.motivations.forEach(m => sections.push(`- ${m}`));

  sections.push(`\n### Ball Puzzle Project`);
  sections.push(ctx.key_projects.ball_puzzle_project.description);
  sections.push(`\nPieces: ${ctx.key_projects.ball_puzzle_project.pieces.count} (${ctx.key_projects.ball_puzzle_project.pieces.naming})`);
  sections.push(`Lattice: ${ctx.key_projects.ball_puzzle_project.lattice_basis}`);

  sections.push(`\n### Revival 2025`);
  ctx.key_projects.revival_2025.triggers.forEach(t => sections.push(`- ${t}`));

  sections.push(`\n## People`);
  Object.entries(ctx.naming.people).forEach(([key, desc]) => {
    sections.push(`- ${desc}`);
  });

  sections.push(`\n## Chat Guidance`);
  sections.push(`\nStyle:`);
  ctx.app_chat_guidance.style.forEach(s => sections.push(`- ${s}`));
  sections.push(`\nDo not:`);
  ctx.app_chat_guidance.do_not.forEach(d => sections.push(`- ${d}`));

  return sections.join('\n');
}
