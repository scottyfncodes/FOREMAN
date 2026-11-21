import './styles.css';
import './golf/ui/golf.css';
import { App } from './app';
import { golfPlayScreen } from './golf/ui/play';
import { golfChallengesScreen, golfHousesScreen, golfSettingsScreen, golfTitleScreen } from './golf/ui/screens';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root');

const app = new App(root);
// The game: golf shots knocking down houses.
app.register('title', golfTitleScreen);
app.register('classic-golf', golfTitleScreen);
// The frame-building experiment, kept reachable from Settings. Its code loads when opened.
app.registerLazy('frames', () => import('./foreman/ui/screen').then((m) => m.foremanScreen));
app.register('houses', golfHousesScreen);
app.register('challenges', golfChallengesScreen);
app.register('levels', golfChallengesScreen);
app.register('golf', golfPlayScreen);
app.register('golf-settings', golfSettingsScreen);
// The original crew-contracts game, kept whole and reachable from Settings. It is one
// chunk, fetched the first time any of its screens opens.
const classic = (): Promise<typeof import('./classic')> => import('./classic');
app.registerLazy('classic', () => classic().then((m) => m.titleScreen));
app.registerLazy('jobs', () => classic().then((m) => m.jobsScreen));
app.registerLazy('brief', () => classic().then((m) => m.briefScreen));
app.registerLazy('play', () => classic().then((m) => m.playScreen));
app.registerLazy('garage', () => classic().then((m) => m.garageScreen));
app.registerLazy('settings', () => classic().then((m) => m.settingsScreen));
app.registerLazy('records', () => classic().then((m) => m.recordsScreen));
// ?frames opens the frame-building experiment directly (its smoke test uses this).
app.go(new URLSearchParams(window.location.search).has('frames') ? 'frames' : 'title');

// From the iOS Home Screen the viewport can come up short of the real screen, leaving a
// dark band under fixed layers. There the app fills the whole screen, so size to it.
const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
const fit = (): void => {
  const root = document.documentElement;
  let layer = window.innerHeight;
  if (standalone) {
    const { width, height } = window.screen;
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    // iOS reports the screen in portrait whatever the orientation.
    const h = portrait ? Math.max(width, height) : Math.min(width, height);
    layer = Math.max(h, window.innerHeight);
    root.style.setProperty('--screen-h', `${layer}px`);
  }
  // Part of the game layer can sit below what is actually on screen (the Home Screen band,
  // a browser bar over the page). Bottom controls lift by that much so they stay in reach.
  const seen = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
  root.style.setProperty('--lift', `${Math.max(0, Math.round(layer - seen))}px`);
};
fit();
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', fit);
window.visualViewport?.addEventListener('resize', fit);

// Automation hook (used by the smoke tests).
(window as unknown as { __demoDay?: App }).__demoDay = app;

// Offline support and Home Screen install.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

// Once the houses are up, fetch the side modes quietly so they open at once and work offline.
window.addEventListener('load', () => {
  const warm = (): void => void Promise.all([import('./classic'), import('./foreman/ui/screen')]).catch(() => undefined);
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  window.setTimeout(() => (idle ? idle(warm, { timeout: 4000 }) : warm()), 6000);
});
