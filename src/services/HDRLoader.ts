import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export interface HDREnvironment {
  id: string;
  name: string;
  url: string;
  texture?: THREE.DataTexture;
  envMap?: THREE.Texture;
}

export class HDRLoader {
  private static instance: HDRLoader;
  private loader: RGBELoader;
  private pmremGenerator?: THREE.PMREMGenerator;
  private environments: Map<string, HDREnvironment> = new Map();

  // Local HDRI assets (more reliable than GitHub raw)
  private static readonly LOCAL_BASE_URL = '/assets/hdri';

  // Available HDRI environments
  private static readonly AVAILABLE_HDRIS: Omit<HDREnvironment, 'texture' | 'envMap'>[] = [
    {
      id: 'studio',
      name: 'Studio',
      url: `${HDRLoader.LOCAL_BASE_URL}/Studio.hdr`
    },
    {
      id: 'outdoor',
      name: 'Outdoor', 
      url: `${HDRLoader.LOCAL_BASE_URL}/Outdoor.hdr`
    }
  ];

  private constructor() {
    this.loader = new RGBELoader();
    this.loader.setCrossOrigin('anonymous');
    // Try different data types - maybe the HDR files need FloatType
    this.loader.setDataType(THREE.FloatType);
    console.log('🌅 HDRLoader: Initialized with CORS and FloatType data type');
  }

  public static getInstance(): HDRLoader {
    if (!HDRLoader.instance) {
      HDRLoader.instance = new HDRLoader();
    }
    return HDRLoader.instance;
  }

  public static resetInstance(): void {
    if (HDRLoader.instance) {
      HDRLoader.instance.dispose();
      HDRLoader.instance = null as any;
    }
    console.log('🌅 HDRLoader: Instance reset');
  }

  public initializePMREMGenerator(renderer: THREE.WebGLRenderer): void {
    if (!this.pmremGenerator) {
      this.pmremGenerator = new THREE.PMREMGenerator(renderer);
      this.pmremGenerator.compileEquirectangularShader();
      console.log('🌅 HDRLoader: PMREM Generator initialized');
    }
  }

  public getAvailableEnvironments(): Omit<HDREnvironment, 'texture' | 'envMap'>[] {
    return HDRLoader.AVAILABLE_HDRIS;
  }

  public async loadEnvironment(envId: string): Promise<THREE.Texture | null> {
    if (!this.pmremGenerator) {
      console.error('🌅 HDRLoader: PMREM Generator not initialized');
      return null;
    }

    // Check if already loaded
    const existing = this.environments.get(envId);
    if (existing?.envMap) {
      console.log(`🌅 HDRLoader: Using cached environment '${envId}'`);
      return existing.envMap;
    }

    // Find environment config
    const envConfig = HDRLoader.AVAILABLE_HDRIS.find(env => env.id === envId);
    if (!envConfig) {
      console.error(`🌅 HDRLoader: Environment '${envId}' not found`);
      return null;
    }

    try {
      console.log(`🌅 HDRLoader: Loading '${envConfig.name}' from ${envConfig.url}`);
      
      // First, let's test if we can fetch the file directly
      console.log(`🌅 HDRLoader: Testing direct fetch of ${envConfig.url}`);
      try {
        const response = await fetch(envConfig.url);
        console.log(`🌅 HDRLoader: Fetch response:`, {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length')
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (fetchError) {
        console.error(`🌅 HDRLoader: Direct fetch failed:`, fetchError);
        throw fetchError;
      }

      // Load HDR texture with better error handling
      const hdrTexture = await new Promise<THREE.DataTexture>((resolve, reject) => {
        this.loader.load(
          envConfig.url,
          (texture) => {
            console.log(`🌅 HDRLoader: Successfully loaded '${envConfig.name}'`);
            console.log(`🌅 HDRLoader: Texture details:`, {
              width: texture.image?.width,
              height: texture.image?.height,
              format: texture.format,
              type: texture.type,
              isDataTexture: texture.isDataTexture
            });
            resolve(texture);
          },
          (progress) => {
            if (progress.total > 0) {
              const percent = Math.round((progress.loaded / progress.total) * 100);
              console.log(`🌅 HDRLoader: Loading '${envConfig.name}' - ${percent}%`);
            }
          },
          (error) => {
            console.error(`🌅 HDRLoader: Failed to load '${envConfig.name}':`, error);
            console.error(`🌅 HDRLoader: URL was: ${envConfig.url}`);
            console.error(`🌅 HDRLoader: This might be a CORS issue or the file might not be a valid HDR`);
            reject(error);
          }
        );
      });

      // Generate environment map using PMREM
      if (!this.pmremGenerator) {
        console.error('🌅 HDRLoader: PMREM Generator became undefined during load');
        hdrTexture.dispose();
        return null;
      }
      const envMap = this.pmremGenerator.fromEquirectangular(hdrTexture).texture;
      
      // Cache only the PMREM result (don't cache disposed texture)
      const environment: HDREnvironment = {
        ...envConfig,
        envMap: envMap
      };
      this.environments.set(envId, environment);
      
      // Clean up original texture after caching
      hdrTexture.dispose();

      console.log(`🌅 HDRLoader: Environment '${envConfig.name}' ready for use`);
      return envMap;

    } catch (error) {
      console.error(`🌅 HDRLoader: Error loading environment '${envId}':`, error);
      console.warn(`🌅 HDRLoader: HDR loading failed - returning null`);
      return null;
    }
  }

  public dispose(): void {
    // Dispose all loaded environments
    this.environments.forEach(env => {
      if (env.texture) env.texture.dispose();
      if (env.envMap) env.envMap.dispose();
    });
    this.environments.clear();

    // Dispose PMREM generator
    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
      this.pmremGenerator = undefined;
    }

    console.log('🌅 HDRLoader: Disposed all resources');
  }
}
