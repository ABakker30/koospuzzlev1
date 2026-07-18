import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PuzzleCard } from './PuzzleCard';
import type { IJK } from '../../types/shape';
import { getPublicPuzzles, getMyPuzzles, deletePuzzle, updatePuzzle, type PuzzleRecord } from '../../api/puzzles';
import { getPublicSolutions, deleteSolution } from '../../api/solutions';
import { updateSolution } from '../../api/solutionUpdate';
import { getUserLikedSolutionIds, toggleSolutionLike } from '../../api/solutionsGallery';
import { EditMetadataModal } from './EditMetadataModal';
import { GalleryTile, getTileCreator } from '../../types/gallery';
import { buildGalleryTiles, sortGalleryTiles } from '../../utils/galleryTiles';
import { withRetry, isOnline } from '../../utils/networkRetry';
import { ThreeDotMenu } from '../../components/ThreeDotMenu';
import { AskAntonModal } from '../../components/AskAntonModal';
import { useAuth } from '../../context/AuthContext';
import { CATEGORY_META, CATEGORY_ORDER, effectiveCategory, type PuzzleCategory } from '../../utils/puzzleCategory';
import { getPosedChallenges, formatChallengeTime, type PosedChallenge } from '../../services/challengeService';
import { getUsernames } from '../../services/usernameService';
import { supabase } from '../../lib/supabase';
import { tokens } from '../../styles/tokens';

// Localized "5m ago" — same shape as ActivityTicker's helper.
function relTime(iso: string, locale: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' });
  if (s < 3600) return rtf.format(-Math.max(1, Math.floor(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  return rtf.format(-Math.floor(s / 86400), 'day');
}

interface PuzzleMetadata {
  id: string;
  name: string;
  creator: string;
  creatorId?: string;
  cells: IJK[];
  thumbnailUrl?: string;
  cellCount?: number;
  solutionCount?: number;
  hasSolutions?: boolean;
}

type TabMode = 'public' | 'mine';

// Mock data for development
const MOCK_PUZZLES: PuzzleMetadata[] = [
  {
    id: '1',
    name: 'Simple Cube',
    creator: 'Demo',
    creatorId: 'user123',
    cells: [
      { i: 0, j: 0, k: 0 }, { i: 1, j: 0, k: 0 }, { i: 0, j: 1, k: 0 }, { i: 1, j: 1, k: 0 },
      { i: 0, j: 0, k: 1 }, { i: 1, j: 0, k: 1 }, { i: 0, j: 1, k: 1 }, { i: 1, j: 1, k: 1 }
    ]
  },
  {
    id: '2',
    name: 'Tower',
    creator: 'Demo',
    creatorId: 'user123',
    cells: [
      { i: 0, j: 0, k: 0 }, { i: 0, j: 1, k: 0 }, { i: 0, j: 2, k: 0 },
      { i: 0, j: 0, k: 1 }, { i: 0, j: 1, k: 1 }, { i: 0, j: 2, k: 1 }
    ]
  },
  {
    id: '3',
    name: 'L-Shape',
    creator: 'Alice',
    creatorId: 'other-user',
    cells: [
      { i: 0, j: 0, k: 0 }, { i: 1, j: 0, k: 0 }, { i: 2, j: 0, k: 0 },
      { i: 0, j: 1, k: 0 }, { i: 0, j: 2, k: 0 }
    ]
  }
];

type SortField = 'date' | 'solutions' | 'difficulty';
type SortDirection = 'asc' | 'desc';

export default function GalleryPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'public' | 'mine' | 'challenges'>('public');
  const [posedChallenges, setPosedChallenges] = useState<PosedChallenge[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [challengeSort, setChallengeSort] = useState<'recent' | 'fastest'>('recent');
  const [showChallengeSortMenu, setShowChallengeSortMenu] = useState(false);
  // "Latest" strip: most recent solves on puzzles that have posed challenges.
  const [challengeActivity, setChallengeActivity] = useState<
    { id: string; solver: string; puzzle: string; at: string }[]
  >([]);
  const [challengeNames, setChallengeNames] = useState<Map<string, string>>(new Map());
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Moderation controls (edit/delete) are shown only to admins. The real
  // enforcement lives in Supabase RLS; this just decides what the UI renders.
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTile, setEditingTile] = useState<GalleryTile | null>(null);
  const [showAskAnton, setShowAskAnton] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'all' | PuzzleCategory>('all');
  
  // Unified tile system state
  const [tiles, setTiles] = useState<GalleryTile[]>([]);
  
  // Track which solutions the current user has liked
  const [likedSolutionIds, setLikedSolutionIds] = useState<Set<string>>(new Set());
  
  // Legacy state for backward compatibility
  const [puzzles, setPuzzles] = useState<PuzzleMetadata[]>([]);
  
  // (Removed the hidden "M" key toggle that exposed edit/delete to anyone.
  //  Moderation controls are now gated by `isAdmin` above.)
  
  
  // Update tab when URL parameter changes
  useEffect(() => {
    const tab = searchParams.get('tab') as TabMode;
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
      console.log('🎬 Gallery tab changed via URL:', tab);
    }
  }, [searchParams]);

  // Load posed challenges (solutions with minted share codes) for the tab
  useEffect(() => {
    if (activeTab !== 'challenges') return;
    let cancelled = false;
    (async () => {
      setChallengesLoading(true);
      const data = await getPosedChallenges();
      const nameMap = await getUsernames(data.map((c) => c.created_by));
      if (!cancelled) {
        setPosedChallenges(data);
        setChallengeNames(nameMap);
        setChallengesLoading(false);
      }
      // Latest strip: recent solves on the challenged puzzles (races count).
      const puzzleIds = [...new Set(data.map((c) => c.puzzle_id))];
      if (puzzleIds.length) {
        const { data: acts } = await supabase
          .from('solutions')
          .select('id, solver_name, created_at, puzzles(name)')
          .in('puzzle_id', puzzleIds)
          .eq('solution_type', 'manual')
          .order('created_at', { ascending: false })
          .limit(4);
        if (!cancelled && acts) {
          setChallengeActivity(
            (acts as any[]).map((a) => ({
              id: a.id,
              solver: (a.solver_name || 'a solver').split('@')[0],
              puzzle: a.puzzles?.name ?? '?',
              at: a.created_at,
            }))
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Handle shared puzzle links from URL parameters - navigate to viewer
  useEffect(() => {
    const puzzleId = searchParams.get('puzzle');
    const isShared = searchParams.get('shared') === 'true';

    if (isShared && puzzleId) {
      // Navigate directly to puzzle viewer
      navigate(`/puzzles/${puzzleId}/view`);
    }
  }, [searchParams, navigate]);
  
  // Load tiles based on active tab
  useEffect(() => {
    const loadContent = async () => {
      console.log('🔄 Gallery loading tiles for tab:', activeTab);
      setLoading(true);
      setError(null);
      
      try {
        console.log('🧩 Loading puzzles and solutions for tab:', activeTab);
        
        // Check if we're online first
        if (!isOnline()) {
          console.warn('📴 Device is offline - waiting for connection...');
          setError('You appear to be offline. Waiting for connection...');
        }
        
        // Retry configuration for mobile networks
        const retryOptions = {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 8000,
          onRetry: (attempt: number) => console.log(`🔄 Gallery data retry ${attempt}/3`)
        };
        
        // Fetch puzzles with retry
        let records: PuzzleRecord[];
        
        records = await withRetry(
          async () => {
            const timeoutPromise = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Database query timeout')), 15000) // 15s timeout
            );
            
            if (activeTab === 'mine') {
              console.log('📂 Fetching user puzzles...');
              return Promise.race([getMyPuzzles(), timeoutPromise]);
            } else {
              console.log('🌐 Fetching public puzzles...');
              return Promise.race([getPublicPuzzles(), timeoutPromise]);
            }
          },
          retryOptions
        );
        
        console.log('✅ Loaded', records.length, 'puzzle records');

        // Fetch solutions with retry
        console.log('🎬 Fetching solutions...');
        const solutions = await withRetry(
          async () => {
            const timeoutPromise = new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Solutions query timeout')), 15000)
            );
            return Promise.race([getPublicSolutions(), timeoutPromise]);
          },
          retryOptions
        );
        console.log('✅ Loaded', solutions.length, 'solution records');

        // Fetch user's liked solutions (non-blocking, don't fail if this errors)
        console.log('❤️ Fetching user likes...');
        try {
          const userLikes = await getUserLikedSolutionIds();
          setLikedSolutionIds(userLikes);
          console.log('✅ User has liked', userLikes.size, 'solutions');
        } catch (likesError) {
          console.warn('⚠️ Could not fetch user likes:', likesError);
        }

          // Build unified tiles (one per puzzle_id)
          const builtTiles = buildGalleryTiles(records, solutions);
          console.log('🎯 Built', builtTiles.length, 'unified tiles');

          // Sort tiles (solutions first, then shapes)
          const sortedTiles = sortGalleryTiles(builtTiles);
          setTiles(sortedTiles);
          
          // Also keep legacy puzzle list for backward compatibility
          const transformed = records.map(record => ({
            id: record.id,
            name: record.name,
            creator: record.creator_name,
            creatorId: record.creator_name,
            cells: [],
            thumbnailUrl: record.thumbnail_url,
            cellCount: record.shape_size,
            solutionCount: record.solution_count || 0,
            hasSolutions: record.has_solutions || false
          }));
          
          console.log('📦 Transformed', transformed.length, 'puzzles with solution counts');
          setPuzzles(transformed);
      } catch (err) {
        console.error('❌ Failed to load content:', err);
        setError(err instanceof Error ? err.message : 'Failed to load content');
        // Fallback to mock data on error
        console.log('⚠️ Using mock puzzles as fallback');
        setPuzzles(MOCK_PUZZLES);
        setTiles([]);
      } finally {
        setLoading(false);
        console.log('✅ Gallery loading complete');
      }
    };
    
    loadContent();
  }, [activeTab]);

  // Reload data when app becomes visible (mobile background/foreground)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && tiles.length === 0 && !loading) {
        console.log('👁️ App became visible with no tiles - reloading gallery...');
        setError(null);
        // Trigger reload by forcing a state change
        setLoading(true);
        setTimeout(() => {
          window.location.reload(); // Simple reload for now
        }, 100);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tiles.length, loading]);

  // Reload data when network comes back online
  useEffect(() => {
    const handleOnline = () => {
      if (error || tiles.length === 0) {
        console.log('🌐 Network back online - reloading gallery...');
        setError(null);
        setLoading(true);
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [error, tiles.length]);

  // Manual retry function
  const handleRetry = useCallback(() => {
    console.log('🔄 Manual retry triggered');
    setError(null);
    setLoading(true);
    window.location.reload();
  }, []);

  // Sort tiles based on current sort settings
  const sortedTiles = useMemo(() => {
    return [...tiles].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'date':
          const dateA = new Date(a.puzzle.created_at || 0).getTime();
          const dateB = new Date(b.puzzle.created_at || 0).getTime();
          comparison = dateA - dateB;
          break;
        case 'solutions':
          comparison = (a.solution_count || 0) - (b.solution_count || 0);
          break;
        case 'difficulty':
          // Use shape_size from puzzle, fallback to geometry length
          const sizeA = a.puzzle.shape_size || (a.puzzle.geometry?.length || 0);
          const sizeB = b.puzzle.shape_size || (b.puzzle.geometry?.length || 0);
          comparison = sizeA - sizeB;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [tiles, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField): string => {
    if (sortField !== field) return '';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // Close sort menu when clicking outside
  useEffect(() => {
    if (!showSortMenu) return;
    const handleClickOutside = () => setShowSortMenu(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showSortMenu]);

  return (
    <div className="gallery-page" style={{
      minHeight: '100vh',
      height: '100dvh',
      background: tokens.gradient.brandTri,
      padding: '80px 20px 40px 20px',
      overflowY: 'auto',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* Three-Dot Menu - Top Right */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
        <ThreeDotMenu
          items={[
            { icon: '🏠', label: t('nav.home'), onClick: () => (window.location.href = '/') },
            { icon: '✨', label: t('menu.createPuzzle'), onClick: () => navigate('/create') },
            { icon: '🔴', label: t('prototype.menuLabel'), onClick: () => navigate('/prototype') },
            { icon: '🎨', label: 'Ask Anton', onClick: () => setShowAskAnton(true) },
          ]}
        />
      </div>

      {/* Ask Anton — embedded artist Q&A */}
      <AskAntonModal isOpen={showAskAnton} onClose={() => setShowAskAnton(false)} />

      {/* Create puzzle — floating action button (the gallery's "new" entry;
          /create starts fresh with a single sphere) */}
      <button
        onClick={() => navigate('/create')}
        title="Create a new puzzle"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 1000,
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          border: 'none',
          background: tokens.gradient.success,
          color: '#fff',
          fontSize: '30px',
          lineHeight: 1,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        aria-label="Create a new puzzle"
      >
        +
      </button>

      {/* Header */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto 40px auto'
      }}>
        <style>{`
          @keyframes titleShimmer {
            0% { background-position: 200% center; }
            100% { background-position: 0% center; }
          }
        `}</style>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 900,
          marginBottom: '24px',
          textShadow: '0 4px 20px rgba(0,0,0,0.3), 0 0 60px rgba(255,255,255,0.4)',
          letterSpacing: '0.15em',
          background: 'linear-gradient(90deg, #fff 0%, #fff 10%, #ff6b6b 20%, #ffa94d 28%, #51cf66 36%, #339af0 44%, #cc5de8 52%, #fff 62%, #fff 100%)',
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'titleShimmer 5s linear infinite',
        }}>
          KOOS {t('gallery.tabs.puzzles')} {t('gallery.title')}
        </h1>
        
        {/* Tabs & Filters */}
        <div className="gallery-header-tabs" style={{
          display: 'flex',
          gap: '12px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.3)',
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexWrap: 'wrap',
          paddingBottom: '8px'
        }}>
          {/* Tab Buttons */}
          <div style={{ display: 'flex', gap: '8px', flex: '0 0 auto' }}>
            <button
              onClick={() => setActiveTab('public')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'public' ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize: '1rem',
                fontWeight: 600,
                padding: '12px 24px',
                cursor: 'pointer',
                borderBottom: activeTab === 'public' ? '3px solid #feca57' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease',
                textShadow: activeTab === 'public' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
              }}
            >
              {t('gallery.tabs.puzzles')}
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'mine' ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize: '1rem',
                fontWeight: 600,
                padding: '12px 24px',
                cursor: 'pointer',
                borderBottom: activeTab === 'mine' ? '3px solid #feca57' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease',
                textShadow: activeTab === 'mine' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
              }}
            >
              {t('gallery.filters.mine')}
            </button>
            <button
              onClick={() => setActiveTab('challenges')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'challenges' ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize: '1rem',
                fontWeight: 600,
                padding: '12px 24px',
                cursor: 'pointer',
                borderBottom: activeTab === 'challenges' ? '3px solid #feca57' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease',
                textShadow: activeTab === 'challenges' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
              }}
            >
              🏁 {t('challenges.tab')}
            </button>
          </div>

          {/* Category filter chips — shared by puzzles, mine, and challenges */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {(['all', ...CATEGORY_ORDER] as const).map((c) => {
              const active = categoryFilter === c;
              const meta = c === 'all' ? null : CATEGORY_META[c];
              return (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c as 'all' | PuzzleCategory)}
                  style={{
                    background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${active ? (meta?.color ?? '#fff') : 'rgba(255,255,255,0.25)'}`,
                    borderRadius: '999px',
                    color: '#fff',
                    fontSize: '0.8rem',
                    fontWeight: active ? 700 : 500,
                    padding: '5px 12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title={meta ? t(meta.blurbKey) : undefined}
                >
                  {meta ? t(meta.labelKey) : t('categories.all')}
                </button>
              );
            })}
          </div>

          {/* Sort Button with Dropdown */}
          {activeTab !== 'challenges' && (
          <div style={{
            position: 'relative'
          }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSortMenu(!showSortMenu);
              }}
              style={{
                background: showSortMenu ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '20px',
                padding: '6px 12px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {/* Sliders/Filter Icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <circle cx="8" cy="6" r="2" fill="currentColor" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <circle cx="16" cy="12" r="2" fill="currentColor" />
                <line x1="4" y1="18" x2="20" y2="18" />
                <circle cx="10" cy="18" r="2" fill="currentColor" />
              </svg>
              <span>{sortField === 'date' ? t('gallerySort.recent') : sortField === 'solutions' ? t('gallerySort.solutions') : t('gallerySort.pieces')}</span>
              <span style={{ opacity: 0.7, fontSize: '0.7rem' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
            </button>
            
            {/* Sort Dropdown Menu */}
            {showSortMenu && (
              <div 
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: 'rgba(30, 30, 40, 0.98)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  overflow: 'hidden',
                  zIndex: 100,
                  minWidth: '130px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {[
                  { field: 'date' as SortField, icon: '📅', label: t('gallerySort.recent') },
                  { field: 'solutions' as SortField, icon: '✓', label: t('gallerySort.solutions') },
                  { field: 'difficulty' as SortField, icon: '🔵', label: t('gallerySort.pieces') }
                ].map(({ field, icon, label }) => (
                  <button
                    key={field}
                    onClick={() => {
                      handleSort(field);
                      setShowSortMenu(false);
                    }}
                    style={{
                      width: '100%',
                      background: sortField === field ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                      border: 'none',
                      padding: '10px 14px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: sortField === field ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = sortField === field ? 'rgba(99, 102, 241, 0.3)' : 'transparent'}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                    {sortField === field && (
                      <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Challenges sort — same style, its own options (Recent / Fastest) */}
          {activeTab === 'challenges' && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowChallengeSortMenu(!showChallengeSortMenu);
              }}
              style={{
                background: showChallengeSortMenu ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '20px',
                padding: '6px 12px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <circle cx="8" cy="6" r="2" fill="currentColor" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <circle cx="16" cy="12" r="2" fill="currentColor" />
                <line x1="4" y1="18" x2="20" y2="18" />
                <circle cx="10" cy="18" r="2" fill="currentColor" />
              </svg>
              <span>{challengeSort === 'recent' ? t('gallerySort.recent') : t('gallerySort.fastest')}</span>
            </button>
            {showChallengeSortMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: 'rgba(30, 30, 40, 0.98)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  overflow: 'hidden',
                  zIndex: 100,
                  minWidth: '130px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {[
                  { key: 'recent' as const, icon: '📅', label: t('gallerySort.recent') },
                  { key: 'fastest' as const, icon: '⏱', label: t('gallerySort.fastest') },
                ].map(({ key, icon, label }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setChallengeSort(key);
                      setShowChallengeSortMenu(false);
                    }}
                    style={{
                      width: '100%',
                      background: challengeSort === key ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                      border: 'none',
                      padding: '10px 14px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: challengeSort === key ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

        </div>
      </div>

      {/* Posed challenges — the browsable ghost pool */}
      {activeTab === 'challenges' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '120px' }}>
          {/* Latest — recent solves on challenged puzzles (mirrors home ticker) */}
          {!challengesLoading && challengeActivity.length > 0 && (
            <div
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '14px',
                padding: '12px 16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontWeight: 700, color: '#feca57', fontSize: '0.85rem', marginBottom: 6 }}>
                ⚡ {t('activity.title')}
              </div>
              {challengeActivity.map((a) => (
                <div
                  key={a.id}
                  onClick={() => navigate(`/c/${a.id}`)}
                  role="link"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '4px 0',
                    fontSize: '0.85rem',
                    color: 'rgba(255,255,255,0.85)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t('activity.solved', { name: a.solver, puzzle: a.puzzle })}
                  </span>
                  <span style={{ opacity: 0.6, whiteSpace: 'nowrap' }}>{relTime(a.at, i18n.language)}</span>
                </div>
              ))}
            </div>
          )}

          {challengesLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.8)' }}>
              ⏳
            </div>
          ) : posedChallenges.length === 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '16px',
              padding: '3rem',
              textAlign: 'center',
              color: '#fff',
            }}>
              {t('challenges.empty')}
              <br />
              <span style={{ fontSize: '0.9rem', opacity: 0.75 }}>{t('challenges.emptyHint')}</span>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}>
              {posedChallenges
                .filter((c) => categoryFilter === 'all' || c.puzzle_category === categoryFilter)
                .sort((a, b) =>
                  challengeSort === 'fastest'
                    ? (a.duration_ms ?? Infinity) - (b.duration_ms ?? Infinity)
                    : b.created_at.localeCompare(a.created_at)
                )
                .map((c) => {
                const name =
                  (c.created_by && challengeNames.get(c.created_by)) ||
                  c.solver_name?.split('@')[0] ||
                  t('challenge.aSolver');
                const score =
                  c.placements_by_you != null && c.total_pieces != null
                    ? `${c.placements_by_you}/${c.total_pieces}`
                    : null;
                const time = formatChallengeTime(c.duration_ms);
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/c/${c.share_code}`)}
                    role="link"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'transform 0.15s, background 0.15s',
                    }}
                    onMouseOver={(ev) => {
                      ev.currentTarget.style.background = 'rgba(255,255,255,0.14)';
                      ev.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(ev) => {
                      ev.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                      ev.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {c.puzzle_thumbnail && (
                      <div style={{ height: '140px', overflow: 'hidden' }}>
                        <img
                          src={c.puzzle_thumbnail}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    )}
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                        {t('challenge.beat', { name })}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.65)', marginBottom: 10 }}>
                        {c.puzzle_name}
                        {c.puzzle_category ? ` · ${t(CATEGORY_META[c.puzzle_category].labelKey)}` : ''}
                        {c.piece_mode === 'duplicates' && ` · ${t('pieceMode.free')}`}
                        {c.piece_mode === 'single' &&
                          ` · ${t('pieceMode.single')}${c.single_piece_id ? ` (${c.single_piece_id})` : ''}`}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {score && (
                          <span style={{ fontWeight: 700, color: tokens.color.success }}>{score}</span>
                        )}
                        {time && <span style={{ color: '#ffd24d', fontWeight: 600 }}>⏱ {time}</span>}
                        <span
                          style={{
                            marginLeft: 'auto',
                            background: tokens.gradient.success,
                            color: '#fff',
                            borderRadius: '999px',
                            padding: '5px 14px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                          }}
                        >
                          🏁 {t('leaderboard.race')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {activeTab !== 'challenges' && loading && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          textAlign: 'center',
          padding: '60px 20px',
          color: '#888'
        }}>
          <div style={{
            fontSize: '2rem',
            marginBottom: '16px'
          }}>
            ⏳
          </div>
          <p style={{ fontSize: '1.1rem' }}>{t('loading.puzzle')}</p>
        </div>
      )}

      {/* Error State with Retry Button */}
      {error && !loading && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          textAlign: 'center',
          padding: '60px 20px',
        }}>
          <div style={{
            backgroundColor: 'rgba(255,107,107,0.15)',
            border: '2px solid rgba(255,107,107,0.4)',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '400px',
            margin: '0 auto'
          }}>
            <p style={{ fontSize: '3rem', marginBottom: '16px' }}>📡</p>
            <p style={{ fontSize: '1.2rem', marginBottom: '12px', color: '#fff', fontWeight: 600 }}>
              Connection Issue
            </p>
            <p style={{ fontSize: '1rem', marginBottom: '24px', color: 'rgba(255,255,255,0.8)' }}>
              {error}
            </p>
            <button
              onClick={handleRetry}
              style={{
                padding: '12px 32px',
                fontSize: '1rem',
                fontWeight: 600,
                background: tokens.gradient.brand,
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(102,126,234,0.4)',
              }}
            >
              🔄 Try Again
            </button>
            <p style={{ fontSize: '0.85rem', color: tokens.text.onGradientMuted, marginTop: '16px' }}>
              Check your internet connection and try again
            </p>
          </div>
        </div>
      )}

      {/* Gallery Grid - Unified Tiles */}
      {activeTab !== 'challenges' && !loading && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '24px',
          paddingBottom: '120px'
        }}>
          {sortedTiles.filter((tile) =>
            categoryFilter === 'all' || effectiveCategory(tile.puzzle) === categoryFilter
          ).map((tile) => {
            const tileCategory = effectiveCategory(tile.puzzle);
            // Get solution ID for like tracking (only solution tiles have this)
            const solutionId = tile.kind === 'solution' ? tile.solution.id : null;
            const isLiked = solutionId ? likedSolutionIds.has(solutionId) : false;
            // Use total_like_count (sum across ALL solutions for this puzzle)
            const likeCount = tile.total_like_count || 0;
            
            // Convert tile to puzzle format for card rendering
            // Get piece count from shape_size or geometry length
            const pieceCount = tile.puzzle.shape_size || tile.puzzle.geometry?.length || 0;
            
            const puzzleForCard = {
              id: tile.puzzle_id,
              name: tile.puzzle_name,
              creator: getTileCreator(tile),
              cells: [] as IJK[],
              thumbnailUrl: tile.display_image, // Use display_image (solution preview or puzzle thumbnail)
              cellCount: pieceCount,
              solutionCount: tile.solution_count,
              hasSolutions: tile.kind === 'solution',
              likeCount: likeCount,
              isLiked: isLiked
            };
            
            return (
              <div key={tile.puzzle_id} style={{ position: 'relative' }}>
                {/* Category badge */}
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  zIndex: 2,
                  background: 'rgba(0,0,0,0.55)',
                  border: `1px solid ${CATEGORY_META[tileCategory].color}`,
                  color: CATEGORY_META[tileCategory].color,
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  pointerEvents: 'none',
                }}>
                  {t(CATEGORY_META[tileCategory].labelKey)}
                </div>
              <PuzzleCard
                puzzle={puzzleForCard}
                onSelect={() => navigate(`/puzzles/${tile.puzzle_id}/view`)}
                onLike={solutionId ? async (_id, newLikedState) => {
                  try {
                    await toggleSolutionLike(solutionId, newLikedState);
                    // Update local state
                    setLikedSolutionIds(prev => {
                      const newSet = new Set(prev);
                      if (newLikedState) {
                        newSet.add(solutionId);
                      } else {
                        newSet.delete(solutionId);
                      }
                      return newSet;
                    });
                    // Update tile's total like count
                    setTiles(prev => prev.map(t => {
                      if (t.kind === 'solution' && t.solution.id === solutionId) {
                        return {
                          ...t,
                          total_like_count: Math.max(0, (t.total_like_count || 0) + (newLikedState ? 1 : -1))
                        } as typeof t;
                      }
                      return t;
                    }));
                  } catch (err) {
                    console.error('Failed to toggle like:', err);
                  }
                } : undefined}
                onEdit={
                  isAdmin
                    ? () => {
                        setEditingTile(tile);
                        setEditModalOpen(true);
                      }
                    : undefined
                }
                onDelete={
                  isAdmin
                    ? async () => {
                        try {
                          if (tile.kind === 'shape') {
                            await deletePuzzle(tile.puzzle_id);
                          } else {
                            // For solutions, delete by ID (storage cleanup handled if file_url exists)
                            await deleteSolution(tile.solution.id, '');
                          }
                          
                          // Reload content
                          const updatedPuzzles = await getPublicPuzzles();
                          const updatedSolutions = await getPublicSolutions();
                          const newTiles = sortGalleryTiles(buildGalleryTiles(updatedPuzzles, updatedSolutions));
                          setTiles(newTiles);
                        } catch (err) {
                          console.error('❌ Failed to delete:', err);
                          setError(tile.kind === 'shape' ? 'Failed to delete puzzle' : 'Failed to delete solution');
                        }
                      }
                    : undefined
                }
                showManagementButtons={isAdmin}
              />
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Metadata Modal */}
      <EditMetadataModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingTile(null);
        }}
        onSave={async (updates) => {
          if (!editingTile) return;
          
          try {
            if (editingTile.kind === 'shape') {
              // Update puzzle (category included only in manager mode)
              await updatePuzzle(editingTile.puzzle_id, {
                name: updates.name,
                description: updates.description,
                ...('category' in updates ? { category: updates.category } : {})
              });
            } else {
              // Update solution
              await updateSolution(editingTile.solution.id, {
                solver_name: updates.name,
                notes: updates.description
              });
            }
            
            // Reload content
            const updatedPuzzles = await getPublicPuzzles();
            const updatedSolutions = await getPublicSolutions();
            const newTiles = sortGalleryTiles(buildGalleryTiles(updatedPuzzles, updatedSolutions));
            setTiles(newTiles);
          } catch (err) {
            console.error('❌ Failed to update:', err);
            setError('Failed to update metadata');
            throw err;
          }
        }}
        itemType={editingTile?.kind === 'shape' ? 'puzzle' : 'solution'}
        showCategory={isAdmin}
        puzzleId={editingTile?.kind === 'shape'
          ? editingTile.puzzle_id
          : editingTile?.solution.puzzle_id}
        initialData={{
          name: editingTile?.kind === 'shape'
            ? editingTile.puzzle.name
            : editingTile?.solution.solver_name || '',
          description: editingTile?.kind === 'shape'
            ? editingTile.puzzle.description
            : editingTile?.solution.notes,
          category: editingTile?.kind === 'shape'
            ? editingTile.puzzle.category ?? null
            : null
        }}
      />
    </div>
  );
}
