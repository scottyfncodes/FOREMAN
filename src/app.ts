import { audio, type Cue, type Variant } from './audio/audio';
import { SaveStore, type SaveData } from './game/save';
import { GolfStore } from './golf/save';
import { clear, h, haptic } from './ui/dom';

export type ScreenName = 'title' | 'classic-golf' | 'frames' | 'levels' | 'houses' | 'challenges' | 'golf' | 'golf-settings' | 'classic' | 'jobs' | 'brief' | 'play' | 'garage' | 'settings' | 'records';

export interface ScreenInstance {
  el: HTMLElement;
  destroy?: () => void;
}

export type ScreenFactory = (app: App, params: Record<string, string>) => ScreenInstance;

/**
 * Application controller: owns the save, audio and the current screen.
 * Screens are plain factories registered by name.
 */
export class App {
  readonly root: HTMLElement;
  readonly store: SaveStore;
  readonly audio = audio;
  /** Golf progress (separate from the crew-contracts save). */
  readonly golf: GolfStore;
  private screens = new Map<ScreenName, ScreenFactory>();
  private current?: ScreenInstance;
  currentName?: ScreenName;
  private toastTimer?: number;

  constructor(root: HTMLElement, store = new SaveStore()) {
    this.root = root;
    this.store = store;
    this.golf = new GolfStore();
    this.applySettings();
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  get save(): SaveData {
    return this.store.data;
  }

  register(name: ScreenName, factory: ScreenFactory): void {
    this.screens.set(name, factory);
  }

  /**
   * A screen whose code is fetched the first time it is opened. The side
   * modes (Crew Contracts, Frame Jobs) load this way so the houses start fast.
   */
  registerLazy(name: ScreenName, load: () => Promise<ScreenFactory>): void {
    this.lazy.set(name, load);
  }

  private lazy = new Map<ScreenName, () => Promise<ScreenFactory>>();
  private navToken = 0;

  go(name: ScreenName, params: Record<string, string> = {}): void {
    const token = ++this.navToken;
    const load = this.screens.has(name) ? undefined : this.lazy.get(name);
    if (load) {
      this.root.setAttribute('aria-busy', 'true');
      load()
        .then((factory) => {
          this.screens.set(name, factory);
          // A later navigation wins over one still loading.
          if (token === this.navToken) this.show(name, factory, params);
        })
        .catch(() => this.toast('Could not load that. Check the connection and try again.', 'bad'))
        .finally(() => this.root.removeAttribute('aria-busy'));
      return;
    }
    const factory = this.screens.get(name);
    if (!factory) throw new Error(`No screen registered for ${name}`);
    this.show(name, factory, params);
  }

  private show(name: ScreenName, factory: ScreenFactory, params: Record<string, string>): void {
    this.current?.destroy?.();
    clear(this.root);
    this.current = factory(this, params);
    this.currentName = name;
    this.root.append(this.current.el);
    this.root.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  play(cue: Cue, strength = 1, variant?: Variant): void {
    this.audio.play(cue, strength, variant);
  }

  buzz(pattern: number | number[] = 12): void {
    if (this.save.settings.haptics) haptic(pattern);
  }

  persist(): void {
    this.store.save();
  }

  applySettings(): void {
    this.audio.enabled = this.save.settings.sound;
    document.documentElement.classList.toggle('reduced-motion', this.reducedMotion);
  }

  get reducedMotion(): boolean {
    const prefers = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    return this.save.settings.reducedMotion || prefers;
  }

  toast(message: string, tone: 'info' | 'good' | 'bad' = 'info'): void {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = h('div', { class: `toast ${tone}`, role: 'status', text: message });
    document.body.append(el);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.remove(), 2400);
  }
}
