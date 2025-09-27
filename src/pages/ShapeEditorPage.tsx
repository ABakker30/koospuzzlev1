import React, { useState, useCallback } from 'react';
import { ShapeModel, CellRecord, EditMode, IJK } from '../types/shape';
import { createIJK, equalIJK, getNeighbors } from '../lib/ijk';
import { ijkToXYZ } from '../lib/xyz';
import { FileSystemService } from '../services/FileSystemService';
import { CanonicalizationService } from '../services/CanonicalizationService';

const ShapeEditorPage: React.FC = () => {
  // State management
  const [currentShape, setCurrentShape] = useState<ShapeModel>({
    id: 'new-shape',
    name: 'New Shape',
    description: 'A new puzzle shape',
    cells: [],
    bounds: { min: createIJK(0, 0, 0), max: createIJK(0, 0, 0) },
    metadata: {
      created: new Date(),
      modified: new Date(),
      version: '1.0.0',
      author: 'User',
    },
    settings: {
      backgroundColor: '#f0f0f0',
      gridVisible: true,
      axesVisible: true,
      lighting: { ambient: 0.4, directional: 0.6 },
      camera: {
        position: { x: 10, y: 10, z: 10 },
        target: { x: 0, y: 0, z: 0 },
        fov: 45,
      },
    },
  });

  const [editMode, setEditMode] = useState<EditMode>(EditMode.ADD);
  const [selectedCell, setSelectedCell] = useState<IJK | null>(null);
  const [gridSize] = useState(10);

  // Helper functions using centralized services
  const addCell = useCallback((ijk: IJK) => {
    const xyz = ijkToXYZ(ijk);
    const newCell: CellRecord = {
      ijk,
      xyz,
      color: '#4CAF50',
      material: 'default',
      visible: true,
      selected: false,
    };

    setCurrentShape(prev => ({
      ...prev,
      cells: [...prev.cells.filter(cell => !equalIJK(cell.ijk, ijk)), newCell],
      metadata: { ...prev.metadata, modified: new Date() },
    }));
  }, []);

  const removeCell = useCallback((ijk: IJK) => {
    setCurrentShape(prev => ({
      ...prev,
      cells: prev.cells.filter(cell => !equalIJK(cell.ijk, ijk)),
      metadata: { ...prev.metadata, modified: new Date() },
    }));
  }, []);

  const handleCellClick = useCallback((ijk: IJK) => {
    switch (editMode) {
      case EditMode.ADD:
        addCell(ijk);
        break;
      case EditMode.REMOVE:
        removeCell(ijk);
        break;
      case EditMode.SELECT:
        setSelectedCell(equalIJK(selectedCell || createIJK(0, 0, 0), ijk) ? null : ijk);
        break;
    }
  }, [editMode, selectedCell, addCell, removeCell]);

  const saveShape = useCallback(async () => {
    const canonicalShape = CanonicalizationService.canonicalizeShape(currentShape);
    const success = await FileSystemService.saveShape(canonicalShape, `${currentShape.name}.koos`);
    if (success) {
      alert('Shape saved successfully!');
    } else {
      alert('Failed to save shape. Feature not fully implemented yet.');
    }
  }, [currentShape]);

  const clearShape = useCallback(() => {
    setCurrentShape(prev => ({
      ...prev,
      cells: [],
      metadata: { ...prev.metadata, modified: new Date() },
    }));
  }, []);

  // Render grid cells
  const renderGrid = () => {
    const cells = [];
    const halfGrid = Math.floor(gridSize / 2);
    
    for (let i = -halfGrid; i <= halfGrid; i++) {
      for (let j = -halfGrid; j <= halfGrid; j++) {
        for (let k = -halfGrid; k <= halfGrid; k++) {
          const ijk = createIJK(i, j, k);
          const hasCell = currentShape.cells.some(cell => equalIJK(cell.ijk, ijk));
          const isSelected = selectedCell && equalIJK(selectedCell, ijk);
          
          // Only render cells that exist or are adjacent to existing cells for performance
          const shouldRender = hasCell || 
            (currentShape.cells.length === 0 && i === 0 && j === 0 && k === 0) ||
            getNeighbors(ijk).some(neighbor => 
              currentShape.cells.some(cell => equalIJK(cell.ijk, neighbor))
            );

          if (shouldRender) {
            cells.push(
              <div
                key={`${i}-${j}-${k}`}
                style={{
                  position: 'absolute',
                  left: `${(i + halfGrid) * 20}px`,
                  top: `${(j + halfGrid) * 20}px`,
                  width: '18px',
                  height: '18px',
                  border: '1px solid #ddd',
                  backgroundColor: hasCell ? '#4CAF50' : 
                                  isSelected ? '#2196F3' : 
                                  'rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  borderRadius: '2px',
                  transform: `translateZ(${k * 2}px)`,
                }}
                onClick={() => handleCellClick(ijk)}
                title={`Cell (${i}, ${j}, ${k})`}
              />
            );
          }
        }
      }
    }
    return cells;
  };

  return (
    <div style={{ padding: '1rem', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem',
        padding: '1rem',
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: 0, color: '#333' }}>Shape Editor</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ color: '#666' }}>Cells: {currentShape.cells.length}</span>
          <input
            type="text"
            value={currentShape.name}
            onChange={(e) => setCurrentShape(prev => ({ 
              ...prev, 
              name: e.target.value,
              metadata: { ...prev.metadata, modified: new Date() }
            }))}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            placeholder="Shape name"
          />
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '1rem' }}>
        {/* Toolbar */}
        <div style={{ 
          width: '200px', 
          backgroundColor: '#fff', 
          padding: '1rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          height: 'fit-content'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Tools</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>Edit Mode:</label>
            <select 
              value={editMode} 
              onChange={(e) => setEditMode(e.target.value as EditMode)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value={EditMode.ADD}>Add Cells</option>
              <option value={EditMode.REMOVE}>Remove Cells</option>
              <option value={EditMode.SELECT}>Select Cells</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button 
              onClick={saveShape}
              style={{
                padding: '0.75rem',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Save Shape
            </button>
            <button 
              onClick={clearShape}
              style={{
                padding: '0.75rem',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          </div>

          {selectedCell && (
            <div style={{ marginTop: '1rem', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <strong>Selected Cell:</strong><br />
              ({selectedCell.i}, {selectedCell.j}, {selectedCell.k})
            </div>
          )}
        </div>

        {/* 3D Viewport (simplified 2D representation for now) */}
        <div style={{ 
          flex: 1, 
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          position: 'relative',
          overflow: 'hidden',
          minHeight: '600px'
        }}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            perspective: '1000px',
          }}>
            <div style={{
              position: 'relative',
              transformStyle: 'preserve-3d',
              transform: 'rotateX(45deg) rotateY(45deg)',
            }}>
              {renderGrid()}
            </div>
          </div>
          
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '0.5rem',
            borderRadius: '4px',
            fontSize: '0.8rem'
          }}>
            Click cells to {editMode.toLowerCase()}. Use tools panel to change mode.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShapeEditorPage;
