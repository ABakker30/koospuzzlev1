// sponsorLogoUpload — shared sponsor-logo upload for the admin contest cards
// (legacy Discovery Challenge + contest engine). Raster only ON PURPOSE (SVG
// can carry scripts → XSS when rendered from a public bucket); source files
// over 2MB are rejected and everything is re-encoded to a ≤512px PNG
// client-side before hitting the public 'sponsors' bucket.

import { supabase } from '../../lib/supabase';

export const SPONSOR_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const SPONSOR_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const SPONSOR_LOGO_MAX_EDGE = 512;

async function downscaleLogoToPng(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    const scale = Math.min(1, SPONSOR_LOGO_MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
    );
  } finally {
    bmp.close();
  }
}

export interface SponsorLogoUploadResult {
  /** Public URL of the uploaded PNG — null when an error occurred. */
  url: string | null;
  /** Human-readable failure (validation or upload) — null on success. */
  error: string | null;
}

/**
 * Validate → downscale → upload to the public 'sponsors' bucket. Returns the
 * public URL or an error message (never throws). `pathPrefix` namespaces the
 * object, e.g. 'contest' (legacy) or 'engine'.
 */
export async function uploadSponsorLogo(
  file: File,
  pathPrefix: string
): Promise<SponsorLogoUploadResult> {
  if (!SPONSOR_LOGO_TYPES.includes(file.type)) {
    return { url: null, error: 'Only PNG, JPEG, or WebP — SVG is rejected on purpose (script risk).' };
  }
  if (file.size > SPONSOR_LOGO_MAX_BYTES) {
    return { url: null, error: 'Image too large — max 2MB source file.' };
  }
  try {
    const blob = await downscaleLogoToPng(file);
    const path = `${pathPrefix}/logo-${Date.now()}.png`;
    const up = await supabase.storage
      .from('sponsors')
      .upload(path, blob, { contentType: 'image/png' });
    if (up.error) throw up.error;
    const { data } = supabase.storage.from('sponsors').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (err: any) {
    return {
      url: null,
      error: /bucket/i.test(err?.message ?? '')
        ? 'Upload failed — has 20260802_sponsor_age_gate.sql been run (sponsors bucket)?'
        : `Upload failed: ${err?.message ?? err}`,
    };
  }
}
