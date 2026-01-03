// Badge system types and definitions

export type BadgeId = 
  | 'new_explorer'
  | 'puzzle_maker_1'
  | 'puzzle_maker_2'
  | 'puzzle_maker_3'
  | 'solver_1'
  | 'solver_2'
  | 'solver_3'
  | 'ai_challenger';

export interface BadgeDefinition {
  id: BadgeId;
  name: string;
  description: string;
  icon: string;
  category: 'account' | 'creator' | 'solver' | 'special';
  tier?: number;
}

export interface UserBadge {
  badgeId: BadgeId;
  earnedAt?: string;
}

export interface UserWithBadges {
  id: string;
  username: string;
  avatarUrl?: string;
  badges: BadgeId[];
  isCreator?: boolean;
  solveDate?: string;
}

// Badge definitions
export const BADGE_DEFINITIONS: Record<BadgeId, BadgeDefinition> = {
  new_explorer: {
    id: 'new_explorer',
    name: 'New Explorer',
    description: 'Welcome to KOOS Puzzle! Earned by creating an account.',
    icon: '🌟',
    category: 'account'
  },
  puzzle_maker_1: {
    id: 'puzzle_maker_1',
    name: 'Puzzle Maker I',
    description: 'Created your first puzzle.',
    icon: '🧩',
    category: 'creator',
    tier: 1
  },
  puzzle_maker_2: {
    id: 'puzzle_maker_2',
    name: 'Puzzle Maker II',
    description: 'Created 5 puzzles.',
    icon: '🧩',
    category: 'creator',
    tier: 2
  },
  puzzle_maker_3: {
    id: 'puzzle_maker_3',
    name: 'Puzzle Maker III',
    description: 'Created 20 puzzles. Master creator!',
    icon: '🧩',
    category: 'creator',
    tier: 3
  },
  solver_1: {
    id: 'solver_1',
    name: 'Solver I',
    description: 'Solved your first puzzle.',
    icon: '✅',
    category: 'solver',
    tier: 1
  },
  solver_2: {
    id: 'solver_2',
    name: 'Solver II',
    description: 'Solved 10 puzzles.',
    icon: '✅',
    category: 'solver',
    tier: 2
  },
  solver_3: {
    id: 'solver_3',
    name: 'Solver III',
    description: 'Solved 50 puzzles. Expert solver!',
    icon: '✅',
    category: 'solver',
    tier: 3
  },
  ai_challenger: {
    id: 'ai_challenger',
    name: 'AI Challenger',
    description: 'Beat the computer solver in a race!',
    icon: '🤖',
    category: 'special'
  }
};

// Thresholds for tiered badges
export const BADGE_THRESHOLDS = {
  puzzlesCreated: {
    puzzle_maker_1: 1,
    puzzle_maker_2: 5,
    puzzle_maker_3: 20
  },
  puzzlesSolved: {
    solver_1: 1,
    solver_2: 10,
    solver_3: 50
  }
};
