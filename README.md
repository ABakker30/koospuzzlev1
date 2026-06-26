# Koos Puzzle v1

A 3D puzzle visualization tool built with React, TypeScript, and Three.js.

🌐 **Live Site:** [koospuzzle.com](https://koospuzzle.com)

## Latest Updates (v8.2.0)
- **Orbit Keyframe Animation System** - Create smooth camera paths with keyframes
- **Enhanced Modal UX** - Fixed dragging, improved sizing, functional Jump buttons
- **Turn Table Effect** - Simple Y-axis rotation for objects and camera
- **Effects Framework** - Registry, Host, Transport Bar with play/pause controls
- **3D Studio Environment** - HDR lighting, shadows, orbit controls

## Deployment

The site deploys automatically to [koospuzzle.com](https://koospuzzle.com) on every
push to `main`, via the **`.github/workflows/deploy-pages.yml`** GitHub Actions
workflow (build → GitHub Pages). GitHub Pages is configured with `build_type: workflow`
and the `koospuzzle.com` custom domain. There is no manual deploy step.

### Setup Requirements
The build pulls Supabase config from **GitHub Secrets**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_FUNCTION_URL`
