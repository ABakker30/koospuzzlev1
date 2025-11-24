# Cache Busting & Auto-Update Setup

This document explains the cache invalidation and automatic update system implemented in the app.

## 🎯 Overview

The system ensures users always get the latest version without manually clearing cache, using:
1. **Netlify Cache Headers** - Proper HTTP caching strategy
2. **Service Worker (PWA)** - Auto-update on new deployments  
3. **Version Check** - In-app notification for updates

## 📦 Installation

### 1. Install Dependencies

```bash
npm install -D vite-plugin-pwa workbox-window
```

### 2. Configure Vite

Already configured in `vite.config.ts` with:
- Auto-update Service Worker
- Workbox for caching strategies
- PWA manifest for mobile

### 3. Netlify Headers

Already configured in `netlify.toml`:
- HTML: 5-minute cache
- Assets (JS/CSS): 1-year cache with immutable flag
- Service Worker: No cache (always fresh)

## 🚀 Usage

### Add Update Notification to Your App

In your main `App.tsx` or layout component:

```tsx
import { UpdateNotification } from './components/UpdateNotification';

function App() {
  return (
    <>
      <UpdateNotification />
      {/* Rest of your app */}
    </>
  );
}
```

### Update Version on Release

1. **Update package.json version:**
   ```bash
   # Manually or use npm version
   npm version patch  # 32.1.0 -> 32.1.1
   npm version minor  # 32.1.0 -> 32.2.0
   npm version major  # 32.1.0 -> 33.0.0
   ```

2. **Commit and tag:**
   ```bash
   git add package.json
   git commit -m "chore: bump version to vX.X.X"
   git tag vX.X.X
   git push origin main --tags
   ```

3. **Deploy to Netlify** - Service Worker will auto-update!

## 🔧 How It Works

### On First Visit
1. User loads app
2. Service Worker installs and caches assets
3. Version stored in localStorage

### On New Deployment
1. User visits app (or after 15 min)
2. Service Worker detects new version
3. New assets downloaded in background
4. Update notification appears
5. User clicks "Update Now" → hard reload

### Cache Strategy
- **HTML**: NetworkFirst (always check server first)
- **Assets** (JS/CSS): CacheFirst (fast load, update in background)
- **Supabase API**: NetworkFirst with 24h fallback

## 🎨 Customization

### Change Update Check Interval

Edit `src/services/versionCheck.ts`:
```ts
const VERSION_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes
```

### Customize Notification

Edit `src/components/UpdateNotification.tsx` for styling and behavior.

### Modify Cache Strategy

Edit `vite.config.ts` workbox section:
```ts
workbox: {
  runtimeCaching: [
    // Add your caching rules here
  ]
}
```

## 🐛 Troubleshooting

### Users Not Seeing Updates

1. Check Netlify headers are deployed (check Network tab)
2. Verify Service Worker is registered (Application tab in DevTools)
3. Check version in localStorage matches current
4. Hard reload: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Service Worker Not Installing

1. Must be HTTPS or localhost
2. Check browser console for errors
3. Verify `sw.js` is being served
4. Check Application > Service Workers in DevTools

## 📊 Testing

### Test Update Flow Locally

1. Build and serve:
   ```bash
   npm run build
   npx serve dist
   ```

2. Open in browser, note version

3. Change version in package.json

4. Rebuild and refresh → notification should appear

### Test Cache Headers

Use browser DevTools Network tab:
- `index.html` should have `Cache-Control: max-age=300`
- Assets should have `Cache-Control: max-age=31536000, immutable`
- `sw.js` should have `Cache-Control: no-cache`

## 🎉 Benefits

✅ **No Manual Cache Clearing** - Users always get latest version
✅ **Fast Load Times** - Aggressive asset caching
✅ **Offline Support** - PWA works without connection
✅ **Smooth Updates** - No forced interruptions
✅ **Mobile Friendly** - Works on iOS and Android
✅ **Production Ready** - Used by major apps

## 📚 References

- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- [Workbox Strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies/)
- [Netlify Headers](https://docs.netlify.com/routing/headers/)
