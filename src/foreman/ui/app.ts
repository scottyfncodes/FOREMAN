import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/saira-stencil-one/400.css';
import './foreman.css';
import { audio } from '../../audio/audio';
import { Session, starsFor, type GameEvent } from '../game/session';
import { View } from '../render/view';
import { Store } from '../save';
import { LEVELS } from '../sim/levels';
import { MATS } from '../sim/types';
import { DT, LOOSE, STANDING } from '../sim/world';

type Child = Node | string | null | false | undefined;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k) e.append(k);
  return e;
}

function svg(path: string, cls = '', fill = true): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = fill ? `<path fill="currentColor" d="${path}"/>` : `<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="${path}"/>`;
  return s;
}

const ICON = {
  star: 'M12 2.2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.4l-6.1 3.4 1.4-6.8L2.2 9.3l6.9-.8z',
  /** The wedge at the top of an arch: the piece that holds the rest up. */
  key: 'M5 4h14l-3.2 16H8.2z',
  back: 'M15 5l-7 7 7 7',
  retry: 'M19 12a7 7 0 1 1-2.2-5.1M19 4v4h-4',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  lock: 'M7 10V7.5a5 5 0 0 1 10 0V10h1.5v11h-13V10zm2.5 0h5V7.5a2.5 2.5 0 0 0-5 0z',
  loads: 'M12 3v10M7.5 9l4.5 4.5L16.5 9M4 19h16',
  list: 'M5 7h14M5 12h14M5 17h14',
};

const NAMES: Record<string, [string, string]> = {
  timber: ['Timber', 'Timber panel'],
  brick: ['Brick', 'Brick infill'],
  concrete: ['Concrete', 'Concrete panel'],
  steel: ['Steel', 'Steel sheet'],
  glass: ['Glass', 'Glass'],
  gas: ['Gas bottle', 'Gas bottle'],
  crate: ['Supply crate', 'Supply crate'],
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** FOREMAN: the whole game shell. One canvas stays up behind every screen. */
export class Foreman {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ui: HTMLElement;
  private view: View;
  readonly store = new Store();
  session!: Session;
  private index = 0;
  private mode: 'title' | 'jobs' | 'play' = 'title';
  private last = 0;
  private acc = 0;
  private slow = 1;
  private slowFor = 0;
  private freeze = 0;
  private selected = -1;
  private arming = -1;
  private armLeft = 0;
  private armTicks = 0;
  private loads = false;
  private notes = 0;
  private booms = 0;
  private hud: {
    pips: HTMLElement; stars: HTMLElement; blast: HTMLButtonElement; chip: HTMLElement; chain: HTMLElement; fx: HTMLElement;
    flash: HTMLElement; gold: HTMLElement; loads: HTMLButtonElement; linetag: HTMLElement; top: HTMLElement; bottom: HTMLElement;
  } | null = null;
  private resultTimer = 0;
  private sheet: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    document.body.classList.add('fm');
    root.className = 'fm-root';
    this.canvas = el('canvas', 'fm-canvas');
    this.ui = el('div', 'fm-layer');
    root.append(this.canvas, this.ui);
    this.view = new View(this.canvas);
    this.applySettings();
    const unlock = (): void => audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.bindPointer();
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.index = this.store.nextIndex();
    this.loadLevel(this.index);
    this.showTitle();
    this.last = performance.now();
    requestAnimationFrame((t) => this.tick(t));
  }

  private applySettings(): void {
    audio.enabled = this.store.data.sound;
    const calm = this.store.data.calm || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    this.view.calm = calm;
    this.root.classList.toggle('fm-calm', calm);
  }

  private buzz(pattern: number | number[]): void {
    if (!this.store.data.haptics) return;
    try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
  }

  private loadLevel(index: number): void {
    this.index = index;
    this.session = new Session(LEVELS[index]);
    this.view.load(this.session);
    this.selected = -1;
    this.arming = -1;
    this.slow = 1;
    this.slowFor = 0;
    this.freeze = 0;
    this.acc = 0;
    window.clearTimeout(this.resultTimer);
    this.resize();
  }

  private resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    let top = 0;
    let bottom = 0;
    if (this.mode === 'play' && this.hud) {
      top = this.hud.top.getBoundingClientRect().bottom + 6;
      bottom = h - this.hud.bottom.getBoundingClientRect().top + 8;
    } else if (this.mode === 'title') {
      top = h * 0.3;
      bottom = h * 0.24;
    }
    this.view.resize(w, h, top, bottom);
    this.placeLineTag();
  }

  private placeLineTag(): void {
    if (!this.hud) return;
    const lv = this.session.level;
    const p = this.view.project(lv.members[0].x, lv.lineY);
    this.hud.linetag.style.left = '8px';
    this.hud.linetag.style.top = `${p.y}px`;
  }

  // ---------------------------------------------------------------- screens

  private clearUi(): void {
    this.ui.replaceChildren();
    this.hud = null;
    this.sheet = null;
  }

  private button(label: string, cls: string, onClick: () => void, icon?: SVGSVGElement): HTMLButtonElement {
    const b = el('button', `fm-btn ${cls}`, icon, label);
    b.type = 'button';
    b.addEventListener('click', () => { audio.play('tap'); onClick(); });
    return b;
  }

  showTitle(): void {
    this.mode = 'title';
    this.clearUi();
    this.view.loads = false;
    this.view.selected = -1;
    const next = this.store.nextIndex();
    if (next !== this.index || this.session.used > 0) this.loadLevel(next);
    const word = el('h1', 'fm-word', 'FOREMAN', el('b'));
    const started = Object.keys(this.store.data.levels).length > 0;
    const play = el('button', 'fm-btn primary', started ? 'Continue' : 'Start', el('small', '', `JOB ${pad(next + 1)} · ${LEVELS[next].name.toUpperCase()}`));
    play.type = 'button';
    play.addEventListener('click', () => { audio.play('select'); this.startLevel(next); });
    const jobs = this.button('All jobs', '', () => this.showJobs(), svg(ICON.list, '', false));
    const gear = this.button('', 'icon', () => this.showSettings(), svg(ICON.gear, '', false));
    gear.setAttribute('aria-label', 'Settings');
    this.ui.append(el('div', 'fm-title', word, el('p', 'fm-tag', 'Every building has a weak point. Find it.'), el('div', 'fm-title-actions', play, el('div', 'fm-title-row', jobs, gear))));
    this.resize();
  }

  showJobs(): void {
    this.mode = 'jobs';
    this.clearUi();
    const back = this.button('', 'icon', () => this.showTitle(), svg(ICON.back, '', false));
    back.setAttribute('aria-label', 'Back');
    const total = el('span', '', svg(ICON.star), `${this.store.totalStars()} / ${LEVELS.length * 3}`);
    const list = el('div', 'fm-jobs-list');
    LEVELS.forEach((lv, i) => {
      const rec = this.store.record(lv.id);
      const open = this.store.unlocked(i);
      const marks = el('div', 'fm-job-marks');
      if (open) {
        for (let s = 0; s < 3; s++) marks.append(svg(ICON.star, s < (rec?.stars ?? 0) ? 'on' : ''));
        marks.append(svg(ICON.key, `key${rec?.keystone ? ' on' : ''}`));
        marks.setAttribute('aria-label', `${rec?.stars ?? 0} of 3 stars${rec?.keystone ? ', keystone found' : ''}`);
      } else marks.append(svg(ICON.lock));
      const row = el('button', 'fm-job', el('div', 'fm-job-no', pad(i + 1)), el('div', '', el('div', 'fm-job-name', lv.name), el('div', 'fm-job-kind', open ? lv.kind : `Clear job ${pad(i)} first`)), marks);
      row.type = 'button';
      row.disabled = !open;
      row.addEventListener('click', () => { audio.play('select'); this.startLevel(i); });
      list.append(row);
    });
    this.ui.append(el('div', 'fm-jobs', el('div', 'fm-jobs-head', back, el('h1', '', 'JOBS'), total), list));
  }

  private showSettings(): void {
    const scrim = el('div', 'fm-scrim');
    const card = el('div', 'fm-card');
    const toggle = (label: string, key: 'sound' | 'haptics' | 'calm'): HTMLButtonElement => {
      const b = el('button', 'fm-toggle', label, el('i'));
      b.type = 'button';
      b.setAttribute('role', 'switch');
      b.setAttribute('aria-checked', String(this.store.data[key]));
      b.addEventListener('click', () => {
        this.store.data[key] = !this.store.data[key];
        this.store.save();
        this.applySettings();
        b.setAttribute('aria-checked', String(this.store.data[key]));
        audio.play('tap');
      });
      return b;
    };
    const link = (label: string, cls: string, fn: () => void): HTMLButtonElement => {
      const b = el('button', `fm-link ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    };
    let armed = false;
    const reset = link('Erase FOREMAN progress', 'danger', () => {
      if (!armed) { armed = true; reset.textContent = 'Tap again to erase every star'; return; }
      this.store.reset();
      scrim.remove();
      this.showTitle();
    });
    card.append(
      el('h2', '', 'SETTINGS'),
      toggle('Sound', 'sound'), toggle('Vibration', 'haptics'), toggle('Less shake and motion', 'calm'),
      el('div', 'fm-links',
        link('Open the Demo Day archive (golf and crew games)', '', () => { window.location.search = '?archive=1'; }),
        reset),
      el('div', 'fm-card-actions one', this.button('Done', 'primary', () => scrim.remove())),
    );
    scrim.append(card);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) scrim.remove(); });
    this.ui.append(scrim);
  }

  startLevel(index: number): void {
    this.mode = 'play';
    this.clearUi();
    this.loadLevel(index);
    const lv = this.session.level;
    const back = this.button('', 'icon', () => this.showJobs(), svg(ICON.back, '', false));
    back.setAttribute('aria-label', 'Jobs');
    const retry = this.button('', 'icon', () => this.startLevel(this.index), svg(ICON.retry, '', false));
    retry.setAttribute('aria-label', 'Start this job again');
    const plate = el('div', 'fm-plate', el('div', 'fm-plate-no', pad(index + 1)), el('div', 'fm-plate-text', el('div', 'fm-plate-name', lv.name), el('div', 'fm-plate-brief', lv.brief)));
    const top = el('div', 'fm-top', back, plate, retry);
    const pips = el('div', 'fm-pips');
    const stars = el('div', 'fm-kit-stars');
    const kit = el('div', 'fm-kit', el('div', 'fm-kit-label', 'CHARGES'), pips, stars);
    const blast = el('button', 'fm-btn fm-blast', 'BLAST');
    blast.type = 'button';
    blast.disabled = true;
    blast.addEventListener('click', () => this.arm());
    const loads = el('button', 'fm-btn fm-loads', svg(ICON.loads, '', false), 'LOADS');
    loads.type = 'button';
    loads.setAttribute('aria-pressed', 'false');
    loads.addEventListener('click', () => {
      this.loads = !this.loads;
      this.view.loads = this.loads;
      loads.setAttribute('aria-pressed', String(this.loads));
      audio.play('inspect');
    });
    const bottom = el('div', 'fm-bottom', kit, blast, loads);
    const chip = el('div', 'fm-chip');
    chip.hidden = true;
    const chain = el('div', 'fm-chain');
    chain.hidden = true;
    const fx = el('div', 'fm-fx');
    const flash = el('div', 'fm-flash');
    const gold = el('div', 'fm-gold');
    const linetag = el('div', 'fm-linetag', 'BELOW THIS LINE');
    this.ui.append(fx, linetag, flash, gold, top, chain, chip, bottom);
    this.hud = { pips, stars, blast, chip, chain, fx, flash, gold, loads, linetag, top, bottom };
    this.loads = false;
    this.view.loads = false;
    this.refreshKit();
    this.resize();
    if (lv.lesson && !this.store.data.seen.includes(lv.id)) this.showLesson();
  }

  private showLesson(): void {
    const lv = this.session.level;
    if (!lv.lesson) return;
    const scrim = el('div', 'fm-scrim clear');
    const done = (): void => {
      scrim.remove();
      this.sheet = null;
      if (!this.store.data.seen.includes(lv.id)) { this.store.data.seen.push(lv.id); this.store.save(); }
    };
    scrim.append(el('div', 'fm-card', el('div', 'fm-eyebrow', `JOB ${pad(this.index + 1)} · NEW`), el('h2', '', lv.lesson.title.toUpperCase()), el('p', '', lv.lesson.body), el('div', 'fm-card-actions one', this.button('Got it', 'primary', done))));
    this.sheet = scrim;
    this.ui.append(scrim);
  }

  private refreshKit(): void {
    if (!this.hud) return;
    const s = this.session;
    const total = s.charges + s.used;
    const pips = this.hud.pips;
    while (pips.children.length < total) pips.append(el('i', `fm-pip${pips.children.length >= s.level.charges ? ' new' : ''}`));
    [...pips.children].forEach((p, i) => p.classList.toggle('spent', i < s.used));
    pips.setAttribute('aria-label', `${s.charges} charges left`);
    const now = starsFor(s.level, Math.max(1, s.used));
    this.hud.stars.replaceChildren(...[0, 1, 2].map((i) => svg(ICON.star, i < now ? 'on' : '')));
    this.hud.stars.setAttribute('aria-label', `${now} stars still possible`);
  }

  // ---------------------------------------------------------------- input

  private bindPointer(): void {
    let downX = 0;
    let downY = 0;
    let downId = -1;
    this.canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downId = e.pointerId; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerId !== downId) return;
      downId = -1;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 14) return;
      this.tap(e.clientX, e.clientY);
    });
  }

  private tap(cx: number, cy: number): void {
    if (this.mode !== 'play' || this.sheet || this.arming >= 0) return;
    const s = this.session;
    if (s.status !== 'aim') return;
    const p = this.view.pick(cx, cy, this.canvas.getBoundingClientRect());
    const id = s.sim.pick(p.x, p.y, 0.3);
    if (id < 0) { this.select(-1); return; }
    if (id === this.selected && s.canStrike(id)) { this.arm(); return; }
    this.select(id);
  }

  private select(id: number): void {
    this.selected = id;
    this.view.selected = id;
    const hud = this.hud;
    if (!hud) return;
    if (id < 0) { hud.chip.hidden = true; hud.blast.disabled = true; hud.blast.classList.remove('ready'); return; }
    const s = this.session;
    const m = s.sim.members[id];
    const name = NAMES[m.mat][m.layer === 1 ? 1 : 0];
    hud.chip.hidden = false;
    hud.chip.classList.remove('warn');
    const ok = s.sim.canStrike(id);
    let html = `<b>${name}</b>`;
    if (m.protect) { html = `<b>Not yours</b> · The neighbour's house stays up`; hud.chip.classList.add('warn'); }
    else if (MATS[m.mat].hp === 0) { html = `<b>Steel</b> · Charges will not cut it`; hud.chip.classList.add('warn'); }
    else if (m.mat === 'gas') html += ' · Goes off, and sets off bottles near it';
    else if (m.mat === 'crate') html += ' · Break it open for a spare charge';
    else if (m.mat === 'glass') html += ' · Holds nothing up';
    else if (m.state === LOOSE) html += ' · Rubble';
    else if (m.layer === 1) html += ' · Fills a gap. Holds nothing up';
    else {
      const tonnes = m.load / 10000;
      const pct = Math.round(Math.min(1.5, m.util) * 100);
      html += ` · holding ${tonnes >= 10 ? tonnes.toFixed(0) : tonnes.toFixed(1)} t · ${pct}% of its limit`;
      if (m.mat === 'concrete' && m.hp > 1) html += '<br>First charge cracks it. Second one finishes it';
      html += `<span class="meter"><i class="${pct >= 80 ? 'hot' : ''}" style="width:${Math.min(100, pct)}%"></i></span>`;
    }
    hud.chip.innerHTML = html;
    hud.blast.disabled = !ok || s.charges <= 0;
    hud.blast.classList.toggle('ready', !hud.blast.disabled);
    audio.play(ok ? 'select' : 'error');
    if (m.state === STANDING) this.buzz(8);
  }

  private arm(): void {
    const s = this.session;
    if (this.arming >= 0 || this.selected < 0 || !s.canStrike(this.selected)) return;
    this.arming = this.selected;
    this.armLeft = 0.46;
    this.armTicks = 0;
    const m = s.sim.members[this.arming];
    const p = s.sim.pose(m, { x: 0, y: 0, a: 0 });
    this.view.showCharge(p.x, p.y, true);
    audio.play('place', 1, 'small');
    if (this.hud) { this.hud.blast.disabled = true; this.hud.blast.classList.remove('ready'); this.hud.chip.hidden = true; }
    this.notes = 0;
    this.booms = 0;
  }

  private onKey(e: KeyboardEvent): void {
    if (this.mode !== 'play') return;
    if (e.key === 'r' || e.key === 'R') this.startLevel(this.index);
    else if (e.key === ' ' || e.key === 'Enter') { if (this.selected >= 0 && !this.sheet) { e.preventDefault(); this.arm(); } }
    else if (e.key === 'l' || e.key === 'L') this.hud?.loads.click();
  }

  // ---------------------------------------------------------------- loop

  private tick(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.arming >= 0) {
      this.armLeft -= dt;
      const due = Math.floor((0.46 - this.armLeft) / 0.14);
      if (due > this.armTicks && this.armTicks < 3) { this.armTicks = due; audio.play('tick', Math.min(1, due / 3)); this.buzz(6); }
      if (this.armLeft <= 0) {
        const id = this.arming;
        this.arming = -1;
        this.view.showCharge(0, 0, false);
        this.selected = -1;
        this.view.selected = -1;
        if (this.session.strike(id)) {
          this.freeze = 0.055;
          this.refreshKit();
          this.buzz(30);
        }
      }
    }
    if (this.slowFor > 0) {
      this.slowFor -= dt;
      if (this.slowFor <= 0) this.slow = 1;
    }
    const scale = this.slowFor > 0 ? this.slow : Math.min(1, this.slow + dt * 2.5);
    this.slow = scale;
    if (this.freeze > 0) this.freeze -= dt;
    else if (this.session.status === 'busy') {
      this.acc += dt * scale;
      let guard = 0;
      while (this.acc >= DT && guard++ < 5) {
        this.acc -= DT;
        this.session.step();
      }
      if (this.acc > DT * 2) this.acc = 0;
    }
    const frame = this.session.frame;
    if (frame.length) {
      this.view.consume(frame);
      this.react(frame);
      frame.length = 0;
    }
    this.view.sync(dt, this.freeze > 0 ? 0 : scale);
    requestAnimationFrame((t) => this.tick(t));
  }

  private note(x: number, y: number, text: string, cls = ''): void {
    if (!this.hud) return;
    const p = this.view.project(x, y);
    const n = el('div', `fm-note ${cls}`, text);
    n.style.left = `${Math.max(50, Math.min(this.root.clientWidth - 50, p.x))}px`;
    n.style.top = `${Math.max(120, p.y - 12)}px`;
    this.hud.fx.append(n);
    window.setTimeout(() => n.remove(), 1750);
  }

  private stamp(text: string, sub: string, cls: string): void {
    if (!this.hud) return;
    const s = el('div', `fm-stamp ${cls}`, text, sub ? el('small', '', sub) : null);
    this.hud.fx.append(s);
    window.setTimeout(() => s.remove(), 1600);
  }

  /** Sound, HUD and pacing for what the simulation just did. */
  private react(frame: GameEvent[]): void {
    const hud = this.hud;
    for (const e of frame) {
      switch (e.t) {
        case 'break':
          if (e.cause === 'charge') {
            audio.play('detonate', 0.55, 'small');
            if (hud) { hud.flash.classList.remove('go'); void hud.flash.offsetWidth; hud.flash.classList.add('go'); }
          }
          if (e.mat === 'glass') audio.play('glass', 0.8);
          else if (e.mat === 'timber') audio.play('snap', 0.8, 'wood');
          else if (e.mat === 'brick') audio.play('crumble', 0.8, 'brick');
          else if (e.mat === 'concrete') audio.play('crumble', 1, 'concrete');
          if (e.cause === 'crush' && this.notes < 4 && e.standing && e.mass > 150) { this.notes++; this.note(e.x, e.y + e.h / 2, 'CRUSHED', 'red'); }
          break;
        case 'crack':
          audio.play('crack', 1, 'concrete');
          this.note(e.x, e.y, 'CRACKED · HALF STRENGTH', 'amber');
          break;
        case 'strain':
          audio.play('creak', 0.9);
          audio.play('crack', 0.6);
          if (this.notes < 4) { this.notes++; this.note(e.x, e.y + 0.6, e.mode === 'snap' ? 'SPAN TOO LONG' : 'OVERLOADED', 'red'); }
          this.buzz(10);
          break;
        case 'snap':
          audio.play('snap', 1, e.mat === 'timber' ? 'wood' : 'concrete');
          audio.play('failMajor', 0.6);
          break;
        case 'loose':
          if (e.mass > 1500) { audio.play('rumble', Math.min(1, e.mass / 30000)); audio.play('failMajor', Math.min(1, e.mass / 40000)); }
          if (this.notes < 4 && e.mass > 800) { this.notes++; this.note(e.x, e.y, e.why === 'tip' ? 'TIPPING' : 'NOTHING UNDER IT', ''); }
          break;
        case 'impact': {
          const k = Math.min(1, e.j / 26000);
          if (k > 0.25) audio.play('heavyLanding', k);
          else audio.play('thump', 0.4 + k * 2, e.mat === 'timber' ? 'wood' : e.mat === 'steel' ? 'steel' : 'concrete');
          if (k > 0.3) this.buzz(Math.round(10 + k * 30));
          break;
        }
        case 'fuse':
          audio.play('armClick', 0.8);
          this.note(e.x, e.y + 0.5, 'GAS', 'red');
          break;
        case 'reveal':
          audio.play('reveal');
          break;
        case 'boom':
          audio.play('detonate', 1, 'heavy');
          this.booms++;
          if (hud) { hud.flash.classList.remove('go'); void hud.flash.offsetWidth; hud.flash.classList.add('go'); }
          if (this.booms === 2) { this.slow = 0.45; this.slowFor = 0.5; }
          this.buzz([20, 30, 40]);
          break;
        case 'pickup':
          audio.play('earned');
          this.note(e.x, e.y + 0.8, '+1 CHARGE', 'amber');
          break;
        case 'charge':
          this.refreshKit();
          break;
        case 'protect':
          if (!this.session.neighbourHit || this.notes < 9) { this.notes = 9; this.note(e.x, e.y + 0.6, 'NEIGHBOUR HIT', 'red'); audio.play('error'); }
          break;
        case 'chain':
          if (hud && e.n >= 2) {
            hud.chain.hidden = false;
            hud.chain.innerHTML = `<div class="fm-chain-n"><small>CHAIN</small>${e.n}</div><div class="fm-chain-x">SCORE ×${this.session.multiplier.toFixed(2).replace(/0$/, '')}</div>`;
            hud.chain.classList.remove('tick');
            void hud.chain.offsetWidth;
            hud.chain.classList.add('tick');
            audio.play('meter', Math.min(1, e.n / 12));
          }
          break;
        case 'tier':
          if (e.tier === 'keystone') {
            this.stamp('KEYSTONE', 'HALF THE BUILDING, ONE CHARGE', '');
            audio.play('houseDown');
            this.slow = 0.28;
            this.slowFor = this.view.calm ? 0.4 : 1.1;
            this.view.lean(1);
            if (hud) { hud.gold.classList.remove('go'); void hud.gold.offsetWidth; hud.gold.classList.add('go'); }
            this.buzz([30, 40, 30, 40, 80]);
          } else {
            this.stamp('BIG DROP', '', 'big');
            audio.play('bonus');
            this.slow = 0.55;
            this.slowFor = 0.35;
            this.view.lean(0.5);
          }
          break;
        case 'settled':
          audio.play('settled');
          if (hud) window.setTimeout(() => { if (this.hud === hud) hud.chain.hidden = true; }, 900);
          this.refreshKit();
          if (e.status === 'won' || e.status === 'lost') this.resultTimer = window.setTimeout(() => this.showResult(), 650);
          break;
        default:
          break;
      }
    }
  }

  private showResult(): void {
    if (this.mode !== 'play' || !this.hud) return;
    const s = this.session;
    const lv = s.level;
    const scrim = el('div', 'fm-scrim clear');
    const card = el('div', 'fm-card');
    const last = this.index >= LEVELS.length - 1;
    if (s.status === 'won') {
      const out = this.store.win(lv.id, s.stars, s.score, s.keystone, s.used);
      audio.play(s.stars === 3 ? 'total' : 'earned');
      const stars = el('div', 'fm-stars', ...[0, 1, 2].map((i) => svg(ICON.star, i < s.stars ? 'on' : '')));
      stars.setAttribute('aria-label', `${s.stars} of 3 stars`);
      const facts = el('dl', 'fm-facts');
      const fact = (k: string, v: string, flag = ''): void => { facts.append(el('dt', '', k), el('dd', '', v, flag ? el('em', '', flag) : null)); };
      fact('Charges used', `${s.used}`, s.used <= lv.par ? '' : `3 STARS AT ${lv.par}`);
      fact('Longest chain', `${s.bestChain}`);
      fact('Score', s.score.toLocaleString('en-US'), out.newBest ? 'BEST' : '');
      card.append(el('div', 'fm-eyebrow', `JOB ${pad(this.index + 1)} · ${lv.name.toUpperCase()}`), el('div', 'fm-verdict', 'CLEARED'), stars);
      if (s.keystone) card.append(el('div', 'fm-keyline', svg(ICON.key), out.newKeystone ? 'Keystone found: one charge took half of it' : 'Keystone: one charge took half of it'));
      card.append(
        facts,
        el('div', 'fm-card-actions', this.button('Again', '', () => this.startLevel(this.index)), last ? this.button('All jobs', 'primary', () => this.showJobs()) : this.button('Next job', 'primary', () => this.startLevel(this.index + 1))),
      );
    } else {
      audio.play('fail');
      const why = s.loss === 'neighbour'
        ? 'The neighbour\'s house took a hit. Drop it the other way: a building falls toward the support it lost.'
        : `Out of charges with ${Math.round((1 - s.sim.progress()) * 100)}% still above the line. Press LOADS to see which pieces carry the most.`;
      card.append(
        el('div', 'fm-eyebrow', `JOB ${pad(this.index + 1)} · ${lv.name.toUpperCase()}`),
        el('div', 'fm-verdict lost', s.loss === 'neighbour' ? 'WRONG WAY' : 'STILL STANDING'),
        el('p', '', why),
        el('div', 'fm-card-actions', this.button('Jobs', '', () => this.showJobs()), this.button('Try again', 'primary', () => this.startLevel(this.index))),
      );
    }
    scrim.append(card);
    this.sheet = scrim;
    this.ui.append(scrim);
  }

  /** Automation hook for the smoke tests. */
  debug(): { mode: string; index: number; status: string; charges: number; selected: number; progress: number; stars: number } {
    return { mode: this.mode, index: this.index, status: this.session.status, charges: this.session.charges, selected: this.selected, progress: this.session.sim.progress(), stars: this.session.stars };
  }

  /** Screen position of a piece, for automation. */
  locate(id: number): { x: number; y: number } {
    const m = this.session.sim.members[id];
    const p = this.session.sim.pose(m, { x: 0, y: 0, a: 0 });
    return this.view.project(p.x, p.y);
  }
}
