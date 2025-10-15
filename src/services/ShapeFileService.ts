// src/services/ShapeFileService.ts
export type Source = "public" | "local";

export interface ShapeFile {
  schema: "ab.container.v2";
  name: string;
  cid: string;
  cells: [number, number, number][];
  meta?: Record<string, unknown>;
}

export interface ShapeListItem {
  id: string;
  name: string;
  cells?: number;
  path: string;        // for public items; for local uploads we use a data URL
  source: Source;
}

const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/ABakker30/koospuzzlev1/main/public/data/containers/v1";

export class ShapeFileService {
  async listPublic(): Promise<ShapeListItem[]> {
    console.log("🔍 ShapeFileService.listPublic() called - instant list (no fetching)");
    
    // Predefined list of available files - NO FETCHING, just metadata
    const knownFiles = [
      // Root directory files
      "16 cell container.fcc.json",
      "40 cell.fcc.json", 
      "hollow_pyramid.fcc.json",
      "hollowpyramid.py.fcc.json",
      "Shape_1.fcc.json", "Shape_2.fcc.json", "Shape_3.fcc.json", "Shape_4.fcc.json", "Shape_5.fcc.json",
      "Shape_6.fcc.json", "Shape_7.fcc.json", "Shape_8.fcc.json", "Shape_9.fcc.json", "Shape_10.fcc.json",
      "Shape_11.fcc.json", "Shape_12.fcc.json", "Shape_13.fcc.json", "Shape_14.fcc.json", "Shape_15.fcc.json",
      "Shape_16.fcc.json", "Shape_17.fcc.json", "Shape_18.fcc.json", "Shape_19.fcc.json", "Shape_20.fcc.json",
      "Shape_21.fcc.json", "Shape_22.fcc.json", "Shape_23.fcc.json", "Shape_24.fcc.json",
      // Samples directory
      "samples/tiny_4.fcc.json",
      "samples/line_3.fcc.json", 
      "samples/l_shape_5.fcc.json",
      // Library directory
      "library/cube_8.fcc.json"
    ];

    // Build list instantly without fetching any files
    const items: ShapeListItem[] = knownFiles.map(filePath => {
      const filename = filePath.split('/').pop()!;
      const rawUrl = `${GITHUB_RAW_BASE}/${filePath}`;
      
      return {
        id: filename.replace('.fcc.json', ''),
        name: this.formatName(filename),
        cells: undefined, // Don't fetch - will load when user clicks
        path: rawUrl,
        source: "public" as const
      };
    });
    
    console.log(`✅ Instantly listed ${items.length} shape files (no fetching)`);
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  private formatName(filename: string): string {
    return filename
      .replace('.fcc.json', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  async readPublic(url: string): Promise<ShapeFile> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Shape fetch failed: ${res.status}` );
    const json = await res.json();
    validateShapeFile(json);
    return json;
  }

  async readLocalFile(file: File): Promise<ShapeFile> {
    const text = await file.text();
    const json = JSON.parse(text);
    validateShapeFile(json);
    return json;
  }
}

export function validateShapeFile(obj: any): asserts obj is ShapeFile {
  // Accept multiple schema formats
  if (!obj) throw new Error("Invalid file format");
  if (!Array.isArray(obj.cells) || obj.cells.length === 0) throw new Error("Missing cells");
  for (const t of obj.cells) {
    if (!Array.isArray(t) || t.length !== 3) throw new Error("Invalid cell triple");
    if (!Number.isInteger(t[0]) || !Number.isInteger(t[1]) || !Number.isInteger(t[2])) {
      throw new Error("Cells must be integer ijk");
    }
  }
  
  // Normalize the schema field for consistency
  if (!obj.schema) {
    obj.schema = "ab.container.v2";
  }
}
