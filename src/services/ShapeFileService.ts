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

const MANIFEST_URL = "https://raw.githubusercontent.com/ABakker30/koospuzzlev1/main/public/data/containers/v1/manifest.json"; // served from GitHub

export class ShapeFileService {
  async listPublic(): Promise<ShapeListItem[]> {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}` );
    const man = await res.json();
    const items = man.groups?.flatMap((g: any) =>
      g.items?.map((it: any) => ({
        id: it.id, name: it.name, cells: it.cells, path: `https://raw.githubusercontent.com/ABakker30/koospuzzlev1/main/public${man.baseUrl}/${it.path}` , source: "public" as const
      })) ?? []
    ) ?? [];
    return items;
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
