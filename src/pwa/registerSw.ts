/**
 * Registers the service worker (public/sw.js) in production builds only, so it
 * never caches Vite's dev modules. The app version names its caches.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(__APP_VERSION__)}`, { scope: '/' }).catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}
