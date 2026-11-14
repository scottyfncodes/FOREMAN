import { Foreman } from './foreman/ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root');

if (new URLSearchParams(window.location.search).has('archive')) {
  // The earlier Demo Day games load on their own page so their styles never touch FOREMAN.
  void import('./archive').then((m) => m.bootArchive(root));
} else {
  const game = new Foreman(root);
  // Automation hook (used by the smoke tests).
  (window as unknown as { __foreman?: Foreman }).__foreman = game;
}

// Offline support and Home Screen install.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
