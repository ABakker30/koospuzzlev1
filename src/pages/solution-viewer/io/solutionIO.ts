import { SolutionJSON } from '../types';

/** List available solution files from public/data/Solutions */
export async function listSolutionFiles(): Promise<string[]> {
  try {
    // For now, we'll hardcode the list since there's no manifest
    // In the future, this could be generated or use a manifest file
    const knownFiles = [
      '16_cell_container.fcc_16cell_dlx_corrected_001.json',
      '16_cell_container.fcc_16cell_dlx_corrected_002.json',
      '16_cell_container.fcc_16cell_dlx_corrected_003.json',
      '16_cell_container.fcc_16cell_dlx_corrected_004.json',
      '16_cell_container.fcc_16cell_dlx_corrected_005.json',
      'Shape_2.json',
      'Shape_3.json',
      'Shape_4.json',
      'Shape_5.json',
      'Shape_6.json',
      'Shape_7.json',
      'Shape_8.json',
      'Shape_9.json',
      'Shape_10.result1.json',
      'Shape_10.result2.json',
      'Shape_11.json',
      'Shape_12.json',
      'Shape_13.json',
      'Shape_14.json',
      'Shape_15.json',
      'shape_16.current.json',
      'shape_17.result1.json',
      'shape_18.current.json',
      'shape_19.current.json',
      'shape_20.current.json',
      'shape_21.current.json',
      'shape_22.current.json',
      'shape_23.current.json',
      'shape_24.current.json'
    ];
    
    return knownFiles;
  } catch (error) {
    console.error('Failed to list solution files:', error);
    return [];
  }
}

/** Load and parse a solution JSON from public/data/Solutions */
export async function loadSolutionJson(filename: string): Promise<SolutionJSON> {
  try {
    const response = await fetch(`/data/Solutions/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filename}: ${response.statusText}`);
    }
    
    const json = await response.json() as SolutionJSON;
    
    // Basic validation
    if (!json.placements || !Array.isArray(json.placements)) {
      throw new Error('Invalid solution format: missing placements array');
    }
    
    // Validate each piece has exactly 4 cells
    for (const placement of json.placements) {
      if (!placement.cells_ijk || placement.cells_ijk.length !== 4) {
        throw new Error(`Invalid piece ${placement.piece}: must have exactly 4 cells, got ${placement.cells_ijk?.length || 0}`);
      }
      
      // Validate each cell is a valid IJK coordinate
      for (const cell of placement.cells_ijk) {
        if (!Array.isArray(cell) || cell.length !== 3 || !cell.every(c => typeof c === 'number')) {
          throw new Error(`Invalid cell coordinate in piece ${placement.piece}: ${JSON.stringify(cell)}`);
        }
      }
    }
    
    console.log(`✅ Loaded solution ${filename} with ${json.placements.length} pieces`);
    return json;
  } catch (error) {
    console.error(`Failed to load solution ${filename}:`, error);
    throw error;
  }
}
