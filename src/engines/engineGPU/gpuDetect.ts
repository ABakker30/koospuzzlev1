// src/engines/engineGPU/gpuDetect.ts
// WebGPU capability detection with graceful fallback

import type { GPUCapability } from './types';

export type { GPUCapability };

let cachedCapability: GPUCapability | null = null;

/**
 * Detect WebGPU capability on the client
 * Results are cached for subsequent calls
 */
export async function detectGPUCapability(): Promise<GPUCapability> {
  if (cachedCapability) {
    return cachedCapability;
  }

  // Check if WebGPU is available at all
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    cachedCapability = {
      supported: false,
      maxWorkgroupSize: 0,
      maxBufferSize: 0,
      maxComputeInvocationsPerWorkgroup: 0,
      reason: 'WebGPU not available in this browser',
    };
    return cachedCapability;
  }

  try {
    // Request adapter
    const gpu = (navigator as any).gpu;
    const adapter = await gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      cachedCapability = {
        supported: false,
        maxWorkgroupSize: 0,
        maxBufferSize: 0,
        maxComputeInvocationsPerWorkgroup: 0,
        reason: 'No GPU adapter available',
      };
      return cachedCapability;
    }

    // Request device with compute capabilities
    // Try to get adapter limits for larger buffers on capable GPUs
    const adapterLimits = adapter.limits;
    const requestedMaxBuffer = Math.min(
      adapterLimits?.maxBufferSize ?? 256 * 1024 * 1024,
      1024 * 1024 * 1024 // Cap at 1GB
    );
    const requestedStorageBuffer = Math.min(
      adapterLimits?.maxStorageBufferBindingSize ?? 128 * 1024 * 1024,
      512 * 1024 * 1024 // Cap at 512MB
    );
    
    const device = await adapter.requestDevice({
      requiredLimits: {
        maxComputeWorkgroupSizeX: 256,
        maxComputeWorkgroupSizeY: 1,
        maxComputeWorkgroupSizeZ: 1,
        maxComputeInvocationsPerWorkgroup: 256,
        maxStorageBufferBindingSize: requestedStorageBuffer,
        maxBufferSize: requestedMaxBuffer,
      },
    });

    if (!device) {
      cachedCapability = {
        supported: false,
        maxWorkgroupSize: 0,
        maxBufferSize: 0,
        maxComputeInvocationsPerWorkgroup: 0,
        reason: 'Failed to create GPU device',
      };
      return cachedCapability;
    }

    const limits = device.limits;

    cachedCapability = {
      supported: true,
      adapter,
      device,
      limits,
      maxWorkgroupSize: limits.maxComputeWorkgroupSizeX,
      maxBufferSize: limits.maxBufferSize,
      maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup,
    };

    console.log('🎮 GPU detected:', {
      adapter: await getAdapterInfo(adapter),
      maxWorkgroupSize: limits.maxComputeWorkgroupSizeX,
      maxBufferSize: `${(limits.maxBufferSize / (1024 * 1024)).toFixed(0)} MB`,
    });

    return cachedCapability;

  } catch (error) {
    cachedCapability = {
      supported: false,
      maxWorkgroupSize: 0,
      maxBufferSize: 0,
      maxComputeInvocationsPerWorkgroup: 0,
      reason: `GPU initialization error: ${error instanceof Error ? error.message : String(error)}`,
    };
    return cachedCapability;
  }
}

/**
 * Get adapter info string for logging
 */
async function getAdapterInfo(adapter: any): Promise<string> {
  try {
    const info = await adapter.requestAdapterInfo();
    return `${info.vendor} ${info.architecture} (${info.device})`;
  } catch {
    return 'Unknown adapter';
  }
}

/**
 * Check if GPU is available synchronously (uses cached result)
 * Returns false if detection hasn't been run yet
 */
export function isGPUAvailable(): boolean {
  return cachedCapability?.supported ?? false;
}

/**
 * Get cached GPU capability (returns null if not yet detected)
 */
export function getCachedCapability(): GPUCapability | null {
  return cachedCapability;
}

/**
 * Clear cached capability (useful for testing)
 */
export function clearCapabilityCache(): void {
  cachedCapability = null;
}

/**
 * Estimate if GPU has enough resources for a given puzzle size
 */
export function canHandlePuzzle(
  numCells: number,
  numEmbeddings: number,
  targetPrefixes: number
): { canHandle: boolean; reason?: string } {
  if (!cachedCapability?.supported) {
    return { canHandle: false, reason: 'GPU not available' };
  }

  const limits = cachedCapability.limits!;
  
  // Estimate memory requirements
  const embeddingBytes = numEmbeddings * 32; // ~32 bytes per embedding
  const checkpointBytes = targetPrefixes * 128; // ~128 bytes per checkpoint
  const bucketBytes = numCells * 8; // 8 bytes per bucket entry
  const totalBytes = embeddingBytes + checkpointBytes + bucketBytes;
  const maxBufferBytes = limits.maxBufferSize;
  
  console.log(`🎮 GPU memory check: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB needed, ${(maxBufferBytes / (1024 * 1024)).toFixed(0)} MB available`);

  if (totalBytes > maxBufferBytes * 0.9) { // Use 90% threshold instead of 80%
    return {
      canHandle: false,
      reason: `Estimated memory (${(totalBytes / (1024 * 1024)).toFixed(0)} MB) exceeds GPU buffer limit (${(maxBufferBytes / (1024 * 1024)).toFixed(0)} MB)`,
    };
  }

  // Check workgroup requirements
  if (256 > limits.maxComputeWorkgroupSizeX) {
    return {
      canHandle: false,
      reason: `Workgroup size 256 exceeds GPU limit of ${limits.maxComputeWorkgroupSizeX}`,
    };
  }

  return { canHandle: true };
}
