import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PuzzleCard } from './PuzzleCard';
import type { IJK } from '../../types/shape';
import { getPublicPuzzles, getMyPuzzles, deletePuzzle, updatePuzzle, type PuzzleRecord } from '../../api/puzzles';
import { getPublicSolutions, deleteSolution } from '../../api/solutions';
import { updateSolution } from '../../api/solutionUpdate';
import { EditMetadataModal } from './EditMetadataModal';
import { GalleryTile, getTileCreator } from '../../types/gallery';
import { buildGalleryTiles, sortGalleryTiles, filterTilesBySolutions } from '../../utils/galleryTiles';

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

export default function GalleryPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'public' | 'mine'>('public');
  const [filterMode, setFilterMode] = useState<'all' | 'with-solutions' | 'without-solutions'>('all');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managementMode, setManagementMode] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTile, setEditingTile] = useState<GalleryTile | null>(null);
  
  // Unified tile system state
  const [tiles, setTiles] = useState<GalleryTile[]>([]);
  
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
          
          // Add 5-second timeout to database queries
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), 5000)
          );
          
          let records: PuzzleRecord[];
          
          try {
            if (activeTab === 'mine') {
              console.log('📂 Fetching user puzzles...');
              records = await Promise.race([getMyPuzzles(), timeoutPromise]);
            } else {
              console.log('🌐 Fetching public puzzles...');
              records = await Promise.race([getPublicPuzzles(), timeoutPromise]);
            }
            
            console.log('✅ Loaded', records.length, 'puzzle records');
          } catch (dbError: any) {
            if (dbError.message === 'Database query timeout') {
              console.warn('⚠️ Database query timed out - using mock data');
              throw new Error('Database unavailable - showing sample puzzles');
            }
            throw dbError;
          }

          // Fetch solutions for unified gallery
          console.log('🎬 Fetching solutions...');
          const solutions = await Promise.race([getPublicSolutions(), timeoutPromise]);
          console.log('✅ Loaded', solutions.length, 'solution records');

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
  
  // Apply solution filter to tiles
  const filteredTiles = filterTilesBySolutions(tiles, filterMode);

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
      {/* Home Button - Top Right */}
      <button
        onClick={() => (window.location.href = '/')}
        style={{
          position: 'fixed',
          top: '20px',
          right: '40px',
          background: 'rgba(255,255,255,0.3)',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(255,255,255,0.5)',
          borderRadius: '12px',
          padding: '0.75rem 1.5rem',
          color: '#fff',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 4px 16px rgba(255,255,255,0.2)',
          textShadow: '0 2px 4px rgba(0,0,0,0.2)',
          zIndex: 1000
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        🏠 {t('nav.home')}
      </button>


      {/* Header */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto 40px auto'
      }}>
        <h1 style={{
          color: '#fff',
          fontSize: '2.5rem',
          fontWeight: 700,
          marginBottom: '24px',
          textShadow: '0 2px 10px rgba(0,0,0,0.3)'
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
          
          {/* Filter Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button
              onClick={() => setFilterMode('all')}
              style={{
                background: filterMode === 'all' ? 'rgba(255,255,255,0.2)' : 'none',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 500,
                padding: '8px 16px',
                cursor: 'pointer',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('with-solutions')}
              style={{
                background: filterMode === 'with-solutions' ? 'rgba(255,255,255,0.2)' : 'none',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 500,
                padding: '8px 16px',
                cursor: 'pointer',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              With Solutions
            </button>
            <button
              onClick={() => setFilterMode('without-solutions')}
              style={{
                background: filterMode === 'without-solutions' ? 'rgba(255,255,255,0.2)' : 'none',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 500,
                padding: '8px 16px',
                cursor: 'pointer',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              Without Solutions
            </button>
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

      {/* Error State */}
      {error && !loading && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          textAlign: 'center',
          padding: '60px 20px',
          color: '#ff6b6b'
        }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>⚠️ {error}</p>
          <p style={{ fontSize: '0.9rem', color: '#888' }}>{t('gallery.empty.createFirst')}</p>
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
          {filteredTiles.map((tile) => {
            // Convert tile to puzzle format for card rendering
            const puzzleForCard = {
              id: tile.puzzle_id,
              name: tile.puzzle_name,
              creator: getTileCreator(tile),
              cells: [] as IJK[],
              thumbnailUrl: tile.display_image, // Use display_image (solution preview or puzzle thumbnail)
              cellCount: tile.kind === 'shape' ? tile.puzzle.shape_size : undefined,
              solutionCount: tile.solution_count,
              hasSolutions: tile.kind === 'solution'
            };
            
            return (
              <PuzzleCard
                key={tile.puzzle_id}
                puzzle={puzzleForCard}
                onSelect={() => navigate(`/puzzles/${tile.puzzle_id}/view`)}
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
