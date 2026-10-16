import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android app wrapper (stage 9). `npm run build && npx cap sync android` copies dist/ into the app;
 * GitHub Actions builds it (.github/workflows/android.yml), see docs/android.md.
 */
const config: CapacitorConfig = {
  appId: 'com.joongyub.deadmarch',
  appName: '데드 마치',
  webDir: 'dist',
  backgroundColor: '#11140f',
  android: {
    // Game assets are all bundled; nothing is loaded over plain http.
    allowMixedContent: false,
  },
  plugins: {
    // The splash stays up until the title screen has drawn (src/platform/app.ts lifts it).
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#11140f',
      showSpinner: false,
    },
    // Full screen: status and navigation bars hidden (MainActivity keeps them hidden after a swipe).
    // Notch insets reach the page as --safe-area-inset-* CSS variables (index.html).
    SystemBars: {
      hidden: true,
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
