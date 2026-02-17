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
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'public' | 'mine'>('public');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managementMode, setManagementMode] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTile, setEditingTile] = useState<GalleryTile | null>(null);
  
  // Unified tile system state
  const [tiles, setTiles] = useState<GalleryTile[]>([]);
  
  // Track which solutions the current user has liked
  const [likedSolutionIds, setLikedSolutionIds] = useState<Set<string>>(new Set());
  
  // Legacy state for backward compatibility
  const [puzzles, setPuzzles] = useState<PuzzleMetadata[]>([]);
  
  // Keyboard listener for "M" key to toggle management buttons
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        // Don't trigger if user is typing in an input field
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        
        setManagementMode(prev => {
          const newMode = !prev;
          console.log(`🔧 Management mode ${newMode ? 'ENABLED' : 'DISABLED'}`);
          return newMode;
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);
  
  
  // Update tab when URL parameter changes
  useEffect(() => {
    const tab = searchParams.get('tab') as TabMode;
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
      console.log('🎬 Gallery tab changed via URL:', tab);
    }
  }, [searchParams]);

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
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
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
          ]}
        />
      </div>


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
          </div>

          {/* Sort Button with Dropdown */}
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
              <span>{sortField === 'date' ? 'Recent' : sortField === 'solutions' ? 'Solutions' : 'Pieces'}</span>
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
                  { field: 'date' as SortField, icon: '📅', label: 'Recent' },
                  { field: 'solutions' as SortField, icon: '✓', label: 'Solutions' },
                  { field: 'difficulty' as SortField, icon: '🔵', label: 'Pieces' }
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
          
        </div>
      </div>

      {/* Loading State */}
      {loading && (
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
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(102,126,234,0.4)',
              }}
            >
              🔄 Try Again
            </button>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginTop: '16px' }}>
              Check your internet connection and try again
            </p>
          </div>
        </div>
      )}

      {/* Gallery Grid - Unified Tiles */}
      {!loading && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '24px',
          paddingBottom: '120px'
        }}>
          {sortedTiles.map((tile) => {
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
              <PuzzleCard
                key={tile.puzzle_id}
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
                  managementMode
                    ? () => {
                        setEditingTile(tile);
                        setEditModalOpen(true);
                      }
                    : undefined
                }
                onDelete={
                  managementMode
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
                showManagementButtons={managementMode}
              />
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
              // Update puzzle
              await updatePuzzle(editingTile.puzzle_id, {
                name: updates.name,
                description: updates.description
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
        initialData={{
          name: editingTile?.kind === 'shape' 
            ? editingTile.puzzle.name 
            : editingTile?.solution.solver_name || '',
          description: editingTile?.kind === 'shape'
            ? editingTile.puzzle.description
            : editingTile?.solution.notes
        }}
      />
    </div>
  );
}
