import { LEVELS } from './sim/levels';

const KEY = 'foreman:v1';

export interface LevelRecord {
  stars: number;
  best: number;
  keystone: boolean;
  /** Fewest charges it has been cleared with. */
  charges: number;
}

export interface SaveData {
  version: 1;
  levels: Record<string, LevelRecord>;
  /** Lessons already shown. */
  seen: string[];
  sound: boolean;
  haptics: boolean;
  calm: boolean;
}

function fresh(): SaveData {
  return { version: 1, levels: {}, seen: [], sound: true, haptics: true, calm: false };
}

/** FOREMAN progress. Its own key: the Demo Day saves are never read or written. */
export class Store {
  data: SaveData;

  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        if (parsed && parsed.version === 1) this.data = { ...fresh(), ...parsed, levels: { ...(parsed.levels ?? {}) }, seen: [...(parsed.seen ?? [])] };
      }
    } catch {
      // Private mode or a corrupt save: start clean.
    }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked. Progress simply lasts for this visit.
    }
  }

  record(id: string): LevelRecord | undefined {
    return this.data.levels[id];
  }

  /** Stores a win. Returns what improved. */
  win(id: string, stars: number, score: number, keystone: boolean, charges: number): { newBest: boolean; newStars: boolean; newKeystone: boolean } {
    const old = this.data.levels[id];
    const out = { newBest: !old || score > old.best, newStars: !old || stars > old.stars, newKeystone: keystone && !old?.keystone };
    this.data.levels[id] = {
      stars: Math.max(stars, old?.stars ?? 0),
      best: Math.max(score, old?.best ?? 0),
      keystone: keystone || !!old?.keystone,
      charges: Math.min(charges, old?.charges ?? 99),
    };
    this.save();
    return out;
  }

  unlocked(index: number): boolean {
    if (index <= 0) return true;
    return (this.data.levels[LEVELS[index - 1].id]?.stars ?? 0) > 0;
  }

  /** The first level not yet cleared, or the last one. */
  nextIndex(): number {
    for (let i = 0; i < LEVELS.length; i++) if (!this.data.levels[LEVELS[i].id]) return i;
    return LEVELS.length - 1;
  }

  totalStars(): number {
    let n = 0;
    for (const l of LEVELS) n += this.data.levels[l.id]?.stars ?? 0;
    return n;
  }

  reset(): void {
    this.data = { ...fresh(), sound: this.data.sound, haptics: this.data.haptics, calm: this.data.calm };
    this.save();
  }
}
