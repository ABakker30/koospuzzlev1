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

const GITHUB_API_URL = "https://api.github.com/repos/ABakker30/koospuzzlev1/contents/public/data/containers/v1";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/ABakker30/koospuzzlev1/main/public/data/containers/v1";

export class ShapeFileService {
  async listPublic(): Promise<ShapeListItem[]> {
    try {
      // Get directory contents from GitHub API
      const items: ShapeListItem[] = [];
      
      // Scan root directory
      await this.scanDirectory("", items);
      
      // Scan samples subdirectory
      await this.scanDirectory("samples", items);
      
      // Scan library subdirectory  
      await this.scanDirectory("library", items);
      
      return items.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error("Failed to list GitHub files:", error);
      throw new Error("Failed to load shape files from GitHub");
    }
  }

  private async scanDirectory(subPath: string, items: ShapeListItem[]): Promise<void> {
    try {
      const url = subPath ? `${GITHUB_API_URL}/${subPath}` : GITHUB_API_URL;
      const res = await fetch(url);
      if (!res.ok) return; // Skip if directory doesn't exist
      
      const files = await res.json();
      if (!Array.isArray(files)) return;
      
      for (const file of files) {
        if (file.type === "file" && file.name.endsWith(".fcc.json")) {
          const rawUrl = subPath ? 
            `${GITHUB_RAW_BASE}/${subPath}/${file.name}` : 
            `${GITHUB_RAW_BASE}/${file.name}`;
          
          // Try to extract cell count from filename or fetch the file
          let cells: number | undefined;
          try {
            const shapeRes = await fetch(rawUrl);
            if (shapeRes.ok) {
              const shapeData = await shapeRes.json();
              cells = shapeData.cells?.length;
            }
          } catch {
            // If we can't fetch the file, extract from filename if possible
            const match = file.name.match(/(\d+)\s*cell/i);
            if (match) cells = parseInt(match[1]);
          }
          
          items.push({
            id: file.name.replace('.fcc.json', ''),
            name: this.formatName(file.name),
            cells,
            path: rawUrl,
            source: "public" as const
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to scan directory ${subPath}:`, error);
    }
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
  if (!obj || obj.schema !== "ab.container.v2") throw new Error("Invalid schema (expect ab.container.v2)");
  if (!Array.isArray(obj.cells) || obj.cells.length === 0) throw new Error("Missing cells");
  for (const t of obj.cells) {
    if (!Array.isArray(t) || t.length !== 3) throw new Error("Invalid cell triple");
    if (!Number.isInteger(t[0]) || !Number.isInteger(t[1]) || !Number.isInteger(t[2])) {
      throw new Error("Cells must be integer ijk");
    }
  }
}
