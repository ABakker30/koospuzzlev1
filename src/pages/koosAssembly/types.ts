// Types for KOOS Assembly orientation continuity

export interface CameraSnapshot {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
}

export interface SolutionOrientation {
  quaternion: [number, number, number, number];
}

export interface KoosAssemblyState {
  thumbDataUrl?: string;
  cameraSnapshot?: CameraSnapshot;
  solutionOrientation?: SolutionOrientation;
}
