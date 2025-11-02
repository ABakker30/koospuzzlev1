// Service for capturing and uploading puzzle thumbnails
import { supabase } from '../lib/supabase';

/**
 * Capture a screenshot from a canvas element
 */
export async function captureCanvasScreenshot(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to capture canvas screenshot'));
      }
    }, 'image/png', 0.9); // PNG format, 90% quality
  });
}

/**
 * Upload thumbnail to Supabase Storage
 * @param blob - Image blob to upload
 * @param puzzleId - Unique puzzle ID for filename
 * @returns Public URL of uploaded thumbnail
 */
export async function uploadThumbnail(blob: Blob, puzzleId: string): Promise<string> {
  const fileName = `${puzzleId}.png`;
  const filePath = `thumbnails/${fileName}`;

  console.log('📸 Uploading thumbnail:', filePath);

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('puzzle-thumbnails')
    .upload(filePath, blob, {
      contentType: 'image/png',
      upsert: true // Overwrite if exists
    });

  if (error) {
    console.error('❌ Failed to upload thumbnail:', error);
    throw new Error(`Failed to upload thumbnail: ${error.message}`);
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from('puzzle-thumbnails')
    .getPublicUrl(filePath);

  console.log('✅ Thumbnail uploaded:', publicUrlData.publicUrl);
  return publicUrlData.publicUrl;
}

/**
 * Upload movie thumbnail to Supabase Storage
 * @param blob - Image blob to upload
 * @param movieId - Unique movie ID for filename
 * @returns Public URL of uploaded thumbnail
 */
export async function uploadMovieThumbnail(blob: Blob, movieId: string): Promise<string> {
  const fileName = `${movieId}.png`;
  const filePath = `thumbnails/${fileName}`;

  console.log('📸 Uploading movie thumbnail:', filePath);

  // Upload to Supabase Storage (movie-thumbnails bucket)
  const { data, error } = await supabase.storage
    .from('movie-thumbnails')
    .upload(filePath, blob, {
      contentType: 'image/png',
      upsert: true // Overwrite if exists
    });

  if (error) {
    console.error('❌ Failed to upload movie thumbnail:', error);
    throw new Error(`Failed to upload movie thumbnail: ${error.message}`);
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from('movie-thumbnails')
    .getPublicUrl(filePath);

  console.log('✅ Movie thumbnail uploaded:', publicUrlData.publicUrl);
  return publicUrlData.publicUrl;
}

/**
 * Capture canvas and upload as thumbnail
 * @param canvas - Canvas element to capture
 * @param puzzleId - Puzzle ID for storage
 * @returns Public URL of uploaded thumbnail
 */
export async function captureAndUploadThumbnail(
  canvas: HTMLCanvasElement,
  puzzleId: string
): Promise<string> {
  console.log('📸 Capturing canvas screenshot for puzzle:', puzzleId);
  
  const blob = await captureCanvasScreenshot(canvas);
  console.log('✅ Screenshot captured, size:', (blob.size / 1024).toFixed(2), 'KB');
  
  const url = await uploadThumbnail(blob, puzzleId);
  return url;
}
