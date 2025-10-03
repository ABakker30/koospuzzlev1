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

### Automatic Deployment
The site automatically deploys to [koospuzzle.com](https://koospuzzle.com) when you push to the `main` branch via GitHub Actions.

### Manual Deployment
```bash
# Build and deploy manually
./deploy.sh
```

### Setup Requirements
For deployment, you need:
1. **Netlify account** connected to your GitHub repository
2. **Custom domain** (koospuzzle.com) configured in Netlify
3. **Environment variables** set in GitHub Secrets:
   - `NETLIFY_AUTH_TOKEN`
   - `NETLIFY_SITE_ID`
