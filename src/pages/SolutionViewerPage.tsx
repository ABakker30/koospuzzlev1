import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { useActiveState } from '../context/ActiveStateContext';

// Solution Viewer modules
import { orientSolutionWorld } from './solution-viewer/pipeline/orient';
import { buildSolutionGroup, computeRevealOrder, applyRevealK, applyExplosion } from './solution-viewer/pipeline/build';
import { BrowseContractSolutionsModal } from '../components/BrowseContractSolutionsModal';
import { InfoModal } from '../components/InfoModal';
import type { LoadedSolution, PieceOrderEntry, SolutionJSON } from './solution-viewer/types';
import SolutionViewerCanvas, { type SolutionViewerCanvasHandle } from './solution-viewer/components/SolutionViewerCanvas';

// Import Studio styles
import '../styles/shape.css';

const SolutionViewerPage: React.FC = () => {
  const navigate = useNavigate();
  const { setActiveState } = useActiveState();
  const canvasRef = useRef<SolutionViewerCanvasHandle>(null);
  
  // State
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [solution, setSolution] = useState<LoadedSolution | null>(null);
  const [order, setOrder] = useState<PieceOrderEntry[]>([]);
  const [revealMax, setRevealMax] = useState<number>(1);
  const [revealK, setRevealK] = useState<number>(1);
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = 3x exploded
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Optimized material settings applied directly in build.ts:
  // brightness: 2.50, metalness: 0.40, reflectiveness: 0.90, bondRadius: 0.35
  const [isMobile, setIsMobile] = useState(false);
  // const [bondsVisible, setBondsVisible] = useState(true);

  const solutionRootRef = useRef<THREE.Group | null>(null);

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle solution loading (called from BrowseContractSolutionsModal)
  const onLoaded = async (solutionData: SolutionJSON, filename: string, koosState?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`📡 SolutionViewer: *** NEW CODE VERSION ${timestamp} *** onLoaded called with ${filename}`);
    
    // Close the modal
    setShowLoad(false);
    
    setLoading(true);
    setCurrentPath(filename);
    
    try {
      console.log(`🎯 SolutionViewer: Processing ${filename}`);
      
      // 1) Solution data already parsed by modal
      const raw = solutionData;
      
      // 2) Orient via Studio pipeline
      console.log(`🧭 SolutionViewer: Raw solution has ${raw.placements?.length || 0} placements`);
      const oriented = orientSolutionWorld(raw);
      console.log(`🧭 SolutionViewer: Oriented solution has ${oriented.pieces?.length || 0} pieces`);
      console.log(`🧭 SolutionViewer: First oriented piece:`, oriented.pieces?.[0]);
      
      // 3) Build high-quality meshes
      console.log(`🔨 SolutionViewer: *** ABOUT TO CALL buildSolutionGroup ***`);
      console.log(`🔨 SolutionViewer: Building solution group...`);
      const { root, pieceMeta } = buildSolutionGroup(oriented);
      console.log(`🔨 SolutionViewer: *** RETURNED FROM buildSolutionGroup ***`);
      console.log(`🔨 SolutionViewer: Solution group built with ${root.children.length} piece groups`);
      
      // 4) Replace prior root and attach (Studio pattern)
      console.log(`🎭 SolutionViewer: Adding solution to scene...`);
      
      if (!canvasRef.current?.scene) {
        console.warn(`⚠️ SolutionViewer: Scene not ready`);
        return;
      }
      
      // Remove previous solution if exists
      if (solutionRootRef.current) {
        canvasRef.current.scene.remove(solutionRootRef.current);
        console.log(`🗑️ SolutionViewer: Removed previous solution`);
      }
      
      // Add new solution
      canvasRef.current.scene.add(root);
      solutionRootRef.current = root;
      console.log(`🎭 SolutionViewer: Added solution (${root.children.length} pieces) to scene`);
      
      // Trigger re-render for new solution
      canvasRef.current.triggerRender();
      
      // 5) Fit camera
      if (root.children.length > 0 && canvasRef.current) {
        console.log(`📷 SolutionViewer: Fitting camera to root with ${root.children.length} children`);
        canvasRef.current.fitToObject(root);
      } else {
        console.warn(`⚠️ SolutionViewer: Root has no children, skipping camera fit`);
      }
      
      // 6) Compute reveal order
      const revealOrder = computeRevealOrder(pieceMeta);
      setOrder(revealOrder);
      setRevealMax(revealOrder.length);
      setRevealK(revealOrder.length); // Show all by default
      
      // 7) Save state
      setSolution({ path: filename, oriented, root, pieceMeta });
      
      // CONTRACT: View - After load, set activeState from loaded solution (in memory only)
      if (koosState) {
        setActiveState({
          schema: 'koos.state',
          version: 1,
          shapeRef: koosState.shapeRef,
          placements: koosState.placements
        });
        console.log('✅ Solution Viewer: ActiveState set from loaded solution');
      }
      
      console.log(`✅ SolutionViewer: Loaded ${filename} with ${revealOrder.length} pieces`);
    } catch (error) {
      console.error('Failed to load solution:', error);
      alert(`Failed to load ${filename}: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Apply reveal changes
  useEffect(() => {
    if (!solution || !order.length || !solutionRootRef.current || !canvasRef.current) return;
    console.log(`👁️ SolutionViewer: Applying reveal K=${revealK}/${order.length}`);
    applyRevealK(solutionRootRef.current, order, revealK);
    
    // Trigger re-render after reveal changes
    canvasRef.current.triggerRender();
  }, [solution, order, revealK]);

  // Apply explosion changes
  useEffect(() => {
    if (!solution || !order.length || !solutionRootRef.current || !canvasRef.current) return;
    console.log(`💥 SolutionViewer: Applying explosion factor=${explosionFactor.toFixed(2)}`);
    applyExplosion(solutionRootRef.current, order, explosionFactor);
    
    // Trigger re-render after explosion changes
    canvasRef.current.triggerRender();
  }, [solution, order, explosionFactor]);

  // Debug showLoad state changes
  useEffect(() => {
    console.log(`📁 SolutionViewer: showLoad changed to: ${showLoad}`);
  }, [showLoad]);

  // // Handle view reset
  // const handleResetView = () => {
  //   if (solutionRootRef.current) {
  //     fitToObject(solutionRootRef.current);
  //   }
  // };

  // // Handle bonds toggle
  // const handleToggleBonds = () => {
  //   if (!solutionRootRef.current) return;
    
  //   const newBondsVisible = !bondsVisible;
  //   setBondsVisible(newBondsVisible);
    
  //   // Toggle visibility of all bond meshes
  //   solutionRootRef.current.traverse((child) => {
  //     if (child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry) {
  //       child.visible = newBondsVisible;
  //     }
  //   });
  // };

  return (
    <div className="content-studio-page" style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}>
      {/* Header */}
      <div style={{ 
        padding: isMobile ? ".5rem .75rem" : ".75rem 1rem", 
        borderBottom: "1px solid #eee", 
        background: "#fff"
      }}>
        {/* Page Title & Menu */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem"
        }}>
          <div style={{
            fontSize: isMobile ? "1.25rem" : "1.5rem",
            fontWeight: "600",
            color: "#2196F3",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>
            <span>📂</span>
            <span>Solution Viewer</span>
          </div>
          
          <button 
            className="btn" 
            onClick={() => setShowMenuModal(true)}
            style={{ 
              height: "2.5rem", 
              width: "2.5rem", 
              minWidth: "2.5rem", 
              padding: "0", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontFamily: "monospace", 
              fontSize: isMobile ? "1.4em" : "1.5em" 
            }}
            title="Menu"
          >
            ☰
          </button>
        </div>
        
        {isMobile ? (
          /* Mobile: Sliders only */
          <>
            
            {/* Reveal & Explosion Sliders */}
            {solution && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", paddingRight: "0.5rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: "500", minWidth: "4rem" }}>Reveal</span>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, revealMax)}
                    step={1}
                    value={revealK}
                    onChange={(e) => setRevealK(parseInt(e.target.value, 10))}
                    style={{ flex: 1 }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem", width: "100%", paddingRight: "0.5rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: "500", minWidth: "4rem" }}>Explode</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={explosionFactor * 100}
                    onChange={(e) => setExplosionFactor(parseInt(e.target.value, 10) / 100)}
                    style={{ flex: 1 }}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          /* Desktop: Sliders and info */
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              {/* Reveal & Explosion Sliders */}
              {solution && order.length > 0 && (
                <>
                  <div style={{ marginBottom: '1rem', minWidth: '150px' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Reveal
                    </label>
                    <input
                      type="range"
                      min="1"
                      max={revealMax}
                      value={revealK}
                      onChange={(e) => setRevealK(parseInt(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ marginBottom: '1rem', minWidth: '150px' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Explode
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={explosionFactor * 100}
                      onChange={(e) => setExplosionFactor(parseInt(e.target.value) / 100)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        
        {/* Load Solution Modal */}
        <BrowseContractSolutionsModal
          open={showLoad}
          onLoaded={onLoaded}
          onClose={() => setShowLoad(false)}
        />
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <SolutionViewerCanvas ref={canvasRef} />
        
        {/* Loading Overlay */}
        {loading && (
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10
          }}>
            <div style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "1.5rem",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{
                  width: "1.5rem",
                  height: "1.5rem",
                  border: "2px solid #e5e7eb",
                  borderTop: "2px solid #3b82f6",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite"
                }}></div>
                <span style={{ fontWeight: "500" }}>Loading solution...</span>
              </div>
            </div>
          </div>
        )}

        {/* Piece Information Panel - Temporarily disabled for debugging */}
        {/* {solution && order.length > 0 && (
          <PieceInfo pieces={order} revealK={revealK} />
        )} */}
        
        {/* View Controls - Removed per user request */}
      </div>

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="Solution Viewer Help"
      >
        <div style={{ lineHeight: '1.6' }}>
          <p style={{ marginTop: 0, padding: '0.75rem', backgroundColor: '#f0f9ff', borderRadius: '6px', borderLeft: '4px solid #2196F3' }}>
            <strong>See solved puzzles in 3D!</strong> Browse solutions from the library and watch them assemble piece by piece. 
            Perfect for learning solving strategies or admiring complex solutions!
          </p>

          <h4>Getting Started</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Browse:</strong> Load a saved solution from the library</li>
            <li>Solutions automatically orient to show the best view</li>
          </ul>

          <h4>Features</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Reveal Slider:</strong> Show pieces one at a time or all at once</li>
            <li>Watch the solution assemble in the order pieces were placed</li>
            <li>Each piece has its own color for easy identification</li>
            <li><strong>Toggle Bonds:</strong> Show/hide connections between spheres</li>
            <li><strong>Reset View:</strong> Reframe the camera to center the solution</li>
          </ul>

          <h4>View Controls</h4>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li><strong>Rotate:</strong> Left-click and drag</li>
            <li><strong>Pan:</strong> Right-click and drag</li>
            <li><strong>Zoom:</strong> Mouse wheel or pinch</li>
          </ul>
        </div>
      </InfoModal>

      {/* Menu Modal */}
      {showMenuModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onMouseMove={(e) => {
            if (isDragging) {
              setMenuPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
              });
            }
          }}
          onMouseUp={() => setIsDragging(false)}
        >
          <div 
            style={{
              position: menuPosition.x === 0 && menuPosition.y === 0 ? 'relative' : 'fixed',
              left: menuPosition.x === 0 && menuPosition.y === 0 ? 'auto' : `${menuPosition.x}px`,
              top: menuPosition.y === 0 && menuPosition.y === 0 ? 'auto' : `${menuPosition.y}px`,
              background: '#fff',
              borderRadius: '12px',
              padding: '0',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              cursor: isDragging ? 'grabbing' : 'default',
              pointerEvents: 'auto'
            }}
          >
            {/* Draggable Header */}
            <div 
              style={{
                padding: '1rem 2rem',
                cursor: 'grab',
                userSelect: 'none',
                borderBottom: '1px solid #dee2e6',
                borderRadius: '12px 12px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseDown={(e) => {
                setIsDragging(true);
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                setDragOffset({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
                });
              }}
            >
              <div style={{ fontSize: '2rem' }}>☰</div>
            </div>
            
            <div style={{ padding: '1rem 2rem 2rem 2rem' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', textAlign: 'center' }}>Menu</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  setShowLoad(true);
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>📂</span>
                <span>Select a Solution</span>
              </button>
              
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  navigate('/shape');
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🧩</span>
                <span>Shape Selector</span>
              </button>
              
              {solution && (
                <button
                  className="btn"
                  onClick={() => {
                    setShowMenuModal(false);
                    navigate('/studio');
                  }}
                  style={{
                    width: '100%',
                    padding: '1rem',
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: '#9c27b0',
                    color: '#fff',
                    border: 'none',
                    justifyContent: 'flex-start'
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>🎥</span>
                  <span>Content Studio</span>
                </button>
              )}

              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  setShowInfo(true);
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>💡</span>
                <span>Help & Information</span>
              </button>

              <button
                className="btn"
                onClick={() => setShowMenuModal(false)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '0.95rem',
                  background: 'transparent',
                  color: '#6c757d',
                  border: '1px solid #dee2e6'
                }}
              >
                Close
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside handler removed - now using backdrop in modal */}
    </div>
  );
};

export default SolutionViewerPage;
