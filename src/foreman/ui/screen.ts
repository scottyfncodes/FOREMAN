import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/saira-stencil-one/400.css';
import './foreman.css';
import type { App, ScreenInstance } from '../../app';
import { audio } from '../../audio/audio';
import { isCancel, powerFor, pullFrom } from '../../golf/game/controls';
import { Session, starsFor, type GameEvent } from '../game/session';
import { View } from '../render/view';
import { Store } from '../save';
import { LEVELS } from '../sim/levels';
import { BALL_ORDER, BALLS, MATS, type BallKind } from '../sim/types';
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
  crate: ['Crate', 'Crate'],
};

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** FOREMAN: title, job list and play, over one canvas that stays up behind all three. */
class Foreman {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ui: HTMLElement;
  private view: View;
  readonly store = new Store();
  session!: Session;
  private app: App;
  private index = 0;
  private mode: 'title' | 'jobs' | 'play' = 'title';
  private last = 0;
  private acc = 0;
  private slow = 1;
  private slowFor = 0;
  private freeze = 0;
  private ball: BallKind = 'standard';
  private power = 0.85;
  private drag: { id: number; x: number; y: number; dist: number } | null = null;
  private loads = false;
  private notes = 0;
  private booms = 0;
  private raf = 0;
  private alive = true;
  private hud: {
    pips: HTMLElement; stars: HTMLElement; tray: HTMLElement; chip: HTMLElement; chain: HTMLElement; fx: HTMLElement; flash: HTMLElement;
    gold: HTMLElement; loads: HTMLButtonElement; linetag: HTMLElement; top: HTMLElement; bottom: HTMLElement; pull: HTMLElement; coach: HTMLElement;
  } | null = null;
  private resultTimer = 0;
  private sheet: HTMLElement | null = null;
  private off: Array<() => void> = [];

  constructor(app: App, root: HTMLElement) {
    this.app = app;
    this.root = root;
    document.body.classList.add('fm');
    this.canvas = el('canvas', 'fm-canvas');
    this.ui = el('div', 'fm-layer');
    root.append(this.canvas, this.ui);
    this.view = new View(this.canvas);
    this.applySettings();
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void): void => {
      window.addEventListener(type, fn);
      this.off.push(() => window.removeEventListener(type, fn));
    };
    on('resize', () => this.resize());
    on('keydown', (e) => this.onKey(e));
    const vv = window.visualViewport;
    if (vv) { const fn = (): void => this.resize(); vv.addEventListener('resize', fn); this.off.push(() => vv.removeEventListener('resize', fn)); }
    this.bindPointer();
    this.index = this.store.nextIndex();
    this.loadLevel(this.index);
    this.showTitle();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  destroy(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.resultTimer);
    for (const f of this.off) f();
    this.view.dispose();
    document.body.classList.remove('fm');
    this.app.applySettings();
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
    this.view.holdClose = false;
    this.ball = 'standard';
    this.drag = null;
    this.setAim(null);
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
    let top = h * 0.12;
    let bottom = h * 0.16;
    if (this.mode === 'play' && this.hud) {
      top = this.hud.top.getBoundingClientRect().bottom + 6;
      bottom = h - this.hud.bottom.getBoundingClientRect().top + 8;
      if (h < 520 && w > h) { top *= 0.75; bottom *= 0.3; }
    }
    this.view.resize(w, h, top, bottom);
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
    const next = this.store.nextIndex();
    if (next !== this.index || this.session.used > 0) this.loadLevel(next);
    this.setAim(null);
    const started = Object.keys(this.store.data.levels).length > 0;
    const play = el('button', 'fm-btn primary', started ? 'Continue' : 'Tee off', el('small', '', `JOB ${pad(next + 1)} · ${LEVELS[next].name.toUpperCase()}`));
    play.type = 'button';
    play.addEventListener('click', () => { audio.play('select'); this.startLevel(next); });
    const jobs = this.button('All jobs', '', () => this.showJobs(), svg(ICON.list, '', false));
    const gear = this.button('', 'icon', () => this.showSettings(), svg(ICON.gear, '', false));
    gear.setAttribute('aria-label', 'Settings');
    this.ui.append(el('div', 'fm-title', el('h1', 'fm-word', 'FOREMAN', el('b')), el('p', 'fm-tag', 'Golf balls. Load-bearing walls.'), el('div', 'fm-title-actions', play, el('div', 'fm-title-row', jobs, gear))));
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
      const row = el('button', 'fm-job', el('div', 'fm-job-no', pad(i + 1)), el('div', '', el('div', 'fm-job-name', lv.name), el('div', 'fm-job-kind', open ? `${lv.kind} · par ${lv.par}` : `Clear job ${pad(i)} first`)), marks);
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
    const reset = link('Erase progress on these jobs', 'danger', () => {
      if (!armed) { armed = true; reset.textContent = 'Tap again to erase every star'; return; }
      this.store.reset();
      scrim.remove();
      this.showTitle();
    });
    card.append(
      el('h2', '', 'SETTINGS'),
      toggle('Sound', 'sound'), toggle('Vibration', 'haptics'), toggle('Less shake and motion', 'calm'),
      el('div', 'fm-links', link('Classic: the brick houses, Daily Demo, Sandbox and Challenges', '', () => this.app.go('classic-golf')), reset),
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
    const kit = el('div', 'fm-kit', el('div', 'fm-kit-label', `SHOTS · PAR ${lv.par}`), pips, stars);
    const tray = el('div', 'fm-tray');
    const loads = el('button', 'fm-btn fm-loads', svg(ICON.loads, '', false), 'LOADS');
    loads.type = 'button';
    loads.setAttribute('aria-pressed', 'false');
    loads.addEventListener('click', () => {
      this.loads = !this.loads;
      this.view.loads = this.loads;
      loads.setAttribute('aria-pressed', String(this.loads));
      audio.play('inspect');
    });
    const bottom = el('div', 'fm-bottom', kit, tray, loads);
    const chip = el('div', 'fm-chip');
    chip.hidden = true;
    const chain = el('div', 'fm-chain');
    chain.hidden = true;
    const fx = el('div', 'fm-fx');
    const flash = el('div', 'fm-flash');
    const gold = el('div', 'fm-gold');
    const linetag = el('div', 'fm-linetag', 'GET IT BELOW THE RED LINE');
    const pull = el('div', 'fm-pull', el('i'), el('b'));
    pull.hidden = true;
    const coach = el('div', 'fm-coach', 'Touch where to hit. Pull back for power. Let go.');
    coach.hidden = this.store.data.seen.includes('coach');
    this.ui.append(fx, linetag, flash, gold, top, chain, coach, chip, pull, bottom);
    this.hud = { pips, stars, tray, chip, chain, fx, flash, gold, loads, linetag, top, bottom, pull, coach };
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
    const total = s.level.shots;
    const pips = this.hud.pips;
    if (pips.children.length !== total) pips.replaceChildren(...Array.from({ length: total }, (_, i) => el('i', `fm-pip${i === s.level.par - 1 ? ' par' : ''}`)));
    [...pips.children].forEach((p, i) => p.classList.toggle('spent', i < s.used));
    pips.setAttribute('aria-label', `${s.shotsLeft} shots left, par ${s.level.par}`);
    const now = starsFor(s.level, Math.max(1, s.used + (s.status === 'aim' ? 1 : 0)), true);
    this.hud.stars.replaceChildren(...[0, 1, 2].map((i) => svg(ICON.star, i < now ? 'on' : '')));
    this.hud.stars.setAttribute('aria-label', `${now} stars still possible`);
    // Ball tray: the standard ball, and any special balls knocked out of the building.
    if (s.bag[this.ball] <= 0) this.ball = 'standard';
    const tray = this.hud.tray;
    tray.replaceChildren();
    for (const k of BALL_ORDER) {
      if (k !== 'standard' && s.bag[k] <= 0) continue;
      const def = BALLS[k];
      const b = el('button', `fm-ball${k === this.ball ? ' on' : ''}`, el('i'), el('span', '', def.name), k === 'standard' ? null : el('em', '', `${s.bag[k]}`));
      b.type = 'button';
      (b.firstElementChild as HTMLElement).style.background = `radial-gradient(circle at 35% 30%, #fff8, #fff0 45%), ${hex(def.color)}`;
      (b.firstElementChild as HTMLElement).style.boxShadow = `inset 0 0 0 3px ${hex(def.accent)}55`;
      b.setAttribute('aria-pressed', String(k === this.ball));
      b.setAttribute('aria-label', `${def.name} ball: ${def.hint}`);
      b.addEventListener('click', () => { this.ball = k; audio.play('select'); this.refreshKit(); this.replan(); });
      tray.append(b);
    }
    this.view.aim.ball = this.ball;
  }

  // ---------------------------------------------------------------- aiming

  private target: { x: number; y: number } | null = null;

  private setAim(t: { x: number; y: number } | null): void {
    this.target = t;
    this.replan();
  }

  /** Recomputes the guide and the read-out for the current target, power and ball. */
  private replan(): void {
    const a = this.view.aim;
    a.ball = this.ball;
    a.power = this.power;
    a.target = this.target;
    a.pulling = !!this.drag && !isCancel(this.drag.dist);
    const hud = this.hud;
    if (!this.target || this.mode !== 'play' || this.session.status !== 'aim') {
      a.plan = null;
      a.effect = null;
      this.view.selected = -1;
      if (hud) hud.chip.hidden = true;
      return;
    }
    const s = this.session;
    const plan = s.plan(this.target.x, this.target.y, this.power, this.ball);
    const seen = s.foresee(plan);
    a.plan = plan;
    a.effect = seen.effect;
    this.view.selected = seen.effect === 'short' ? -1 : seen.id;
    if (!hud) return;
    hud.chip.hidden = false;
    hud.chip.classList.toggle('warn', seen.effect === 'short' || seen.effect === 'none' || seen.effect === 'miss');
    let html = '';
    if (seen.effect === 'short') html = '<b>Falls short</b> · pull back further';
    else if (seen.id < 0) html = '<b>Nothing there</b> · the ball flies straight through';
    else {
      const m = s.sim.members[seen.id];
      html = `<b>${NAMES[m.mat][m.layer === 1 ? 1 : 0]}</b>`;
      const frame = m.state === STANDING && m.layer !== 1 && m.mat !== 'glass' && m.mat !== 'gas' && m.mat !== 'crate';
      if (m.protect) html = `<b>Not yours</b> · the neighbour's house stays up`;
      else if (frame) {
        const tonnes = m.load / 10000;
        const pct = Math.round(Math.min(1.5, m.util) * 100);
        html += ` · holding ${tonnes >= 10 ? tonnes.toFixed(0) : tonnes.toFixed(1)} t · ${pct}% of its limit<span class="meter"><i class="${pct >= 75 ? 'hot' : ''}" style="width:${Math.min(100, pct)}%"></i></span>`;
      } else if (m.state === LOOSE) html += ' · rubble';
      else if (m.mat === 'glass' || m.layer === 1) html += ' · holds nothing up';
      const verdict = seen.effect === 'break' ? 'goes through it' : seen.effect === 'weaken' ? 'cracks it: up to half its strength gone' : seen.effect === 'gas' ? 'sets it off' : seen.effect === 'blast' ? 'goes off here' : `bounces off ${MATS[m.mat].label.toLowerCase()}`;
      html += `<span class="will ${seen.effect}">This shot ${verdict}</span>`;
    }
    hud.chip.innerHTML = html;
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'play' || this.sheet || this.session.status !== 'aim') return;
      const p = this.view.pick(e.clientX, e.clientY, c.getBoundingClientRect());
      if (p.y < 0.05 || p.y > 60) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dist: 0 };
      try { c.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
      audio.play('select');
      this.setAim(p);
      if (this.hud && !this.hud.coach.hidden) this.hud.coach.textContent = 'Now pull back and let go.';
    });
    c.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      d.dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const pull = pullFrom(d.dist, window.innerHeight);
      if (!isCancel(d.dist)) this.power = powerFor(pull);
      const hud = this.hud;
      if (hud) {
        hud.pull.hidden = isCancel(d.dist);
        hud.pull.style.left = `${Math.max(46, Math.min(this.root.clientWidth - 46, e.clientX))}px`;
        hud.pull.style.top = `${e.clientY - 64}px`;
        (hud.pull.firstElementChild as HTMLElement).style.width = `${Math.round(pull * 100)}%`;
        (hud.pull.lastElementChild as HTMLElement).textContent = `${Math.round(this.power * 100)}%`;
      }
      this.replan();
    });
    const end = (e: PointerEvent): void => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (this.hud) this.hud.pull.hidden = true;
      if (e.type === 'pointerup' && !isCancel(d.dist)) this.fire();
      else this.replan();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  /** Takes the shot that is lined up. */
  fire(): boolean {
    const s = this.session;
    if (!this.target || this.mode !== 'play' || this.sheet) return false;
    if (!s.fire(this.target.x, this.target.y, this.power, this.ball)) return false;
    this.notes = 0;
    this.booms = 0;
    audio.play('swing', this.power);
    window.setTimeout(() => audio.play('thwack', 0.5 + this.power * 0.5), 70);
    this.buzz(18);
    if (this.hud && !this.hud.coach.hidden) {
      this.hud.coach.hidden = true;
      this.store.data.seen.push('coach');
      this.store.save();
    }
    this.replan();
    this.refreshKit();
    return true;
  }

  /** Lines a shot up at a point on the face (automation and keyboard). */
  aimAt(x: number, y: number, power = 1, ball: BallKind = this.ball): void {
    this.ball = ball;
    this.power = power;
    this.setAim({ x, y });
    this.refreshKit();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.mode !== 'play' || this.sheet) return;
    const t = this.target;
    if (e.key === 'r' || e.key === 'R') this.startLevel(this.index);
    else if (e.key === 'l' || e.key === 'L') this.hud?.loads.click();
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.fire(); }
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 0.05 : 0.25;
      const base = t ?? { x: this.session.teeX, y: 1.2 };
      this.setAim({ x: base.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), y: Math.max(0.1, base.y + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0)) });
    } else if (e.key === 'w' || e.key === 's') { this.power = Math.max(0.15, Math.min(1, this.power + (e.key === 'w' ? 0.05 : -0.05))); this.replan(); }
  }

  // ---------------------------------------------------------------- loop

  private tick(now: number): void {
    if (!this.alive) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.slowFor > 0) {
      this.slowFor -= dt;
      if (this.slowFor <= 0) this.slow = 1;
    }
    const scale = this.slowFor > 0 ? this.slow : Math.min(1, this.slow + dt * 2.5);
    this.slow = scale;
    const st = this.session.status;
    if (this.freeze > 0) this.freeze -= dt;
    else if (st === 'busy' || st === 'flight') {
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
    if (this.hud && this.mode === 'play') {
      const lv = this.session.level;
      const p = this.view.project(lv.members[0].x, lv.lineY);
      this.hud.linetag.style.top = `${p.y}px`;
    }
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  private note(x: number, y: number, text: string, cls = ''): void {
    if (!this.hud) return;
    const p = this.view.project(x, y);
    const n = el('div', `fm-note ${cls}`, text);
    const half = 12 + text.length * 4.2;
    n.style.left = `${Math.max(half, Math.min(this.root.clientWidth - half, p.x))}px`;
    n.style.top = `${Math.max(120, p.y - 12)}px`;
    this.hud.fx.append(n);
    window.setTimeout(() => n.remove(), 1750);
  }

  private stamp(text: string, sub: string, cls: string): void {
    if (!this.hud) return;
    this.hud.fx.querySelectorAll('.fm-stamp').forEach((o) => o.remove());
    const s = el('div', `fm-stamp ${cls}`, text, sub ? el('small', '', sub) : null);
    this.hud.fx.append(s);
    window.setTimeout(() => s.remove(), 1600);
  }

  private flashNow(): void {
    const f = this.hud?.flash;
    if (!f) return;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  /** Sound, HUD and pacing for what just happened. */
  private react(frame: GameEvent[]): void {
    const hud = this.hud;
    for (const e of frame) {
      switch (e.t) {
        case 'strike':
          // The hit itself: a beat of stillness, then the consequences.
          if (e.effect === 'break' || e.effect === 'blast' || e.effect === 'gas') { this.freeze = 0.06; this.buzz(30); }
          if (e.effect === 'weaken') { audio.play('thump', 1, 'brick'); audio.play('crack', 0.8); this.note(e.x, e.y + 0.5, 'CRACKED', 'amber'); this.buzz(14); }
          else if (e.effect === 'none') { audio.play('ping', 1); this.note(e.x, e.y + 0.5, 'NO DAMAGE', ''); }
          else if (e.effect === 'short') { audio.play('rustle'); this.note(e.x, 0.8, 'SHORT', ''); }
          else if (e.effect === 'miss') this.note(e.x, e.y + 0.5, 'STRAIGHT THROUGH', '');
          break;
        case 'break':
          if (e.cause === 'ball') audio.play('impact', 0.9);
          if (e.mat === 'glass') audio.play('glass', 0.8);
          else if (e.mat === 'timber') audio.play('snap', 0.8, 'wood');
          else if (e.mat === 'brick') audio.play('crumble', 0.8, 'brick');
          else if (e.mat === 'concrete') audio.play('crumble', 1, 'concrete');
          if (e.cause === 'crush' && this.notes < 4 && e.standing && e.mass > 150) { this.notes++; this.note(e.x, e.y + e.h / 2, 'CRUSHED', 'red'); }
          break;
        case 'weaken':
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
          this.flashNow();
          if (this.booms === 2) { this.slow = 0.45; this.slowFor = 0.5; }
          this.buzz([20, 30, 40]);
          break;
        case 'found':
          audio.play('earned');
          this.note(e.x, e.y + 0.6, `${BALLS[e.ball].name.toUpperCase()} BALL`, 'amber');
          break;
        case 'bag':
          this.refreshKit();
          break;
        case 'protect':
          if (this.notes < 9) { this.notes = 9; this.note(e.x, e.y + 0.6, 'NEIGHBOUR HIT', 'red'); audio.play('error'); }
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
            this.stamp('KEYSTONE', 'HALF THE BUILDING, ONE SHOT', '');
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
          if (this.session.used > 0) audio.play('settled');
          if (hud) window.setTimeout(() => { if (this.hud === hud) hud.chain.hidden = true; }, 900);
          this.refreshKit();
          this.replan();
          if (e.status === 'won' || e.status === 'lost') { this.view.holdClose = true; this.resultTimer = window.setTimeout(() => this.showResult(), 650); }
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
    card.append(el('div', 'fm-eyebrow', `JOB ${pad(this.index + 1)} · ${lv.name.toUpperCase()}`));
    if (s.status === 'won') {
      const out = this.store.win(lv.id, s.stars, s.score, s.keystone, s.used);
      audio.play(s.stars === 3 ? 'total' : 'earned');
      const stars = el('div', 'fm-stars', ...[0, 1, 2].map((i) => svg(ICON.star, i < s.stars ? 'on' : '')));
      stars.setAttribute('aria-label', `${s.stars} of 3 stars`);
      const facts = el('dl', 'fm-facts');
      const fact = (k: string, v: string, flag = ''): void => { facts.append(el('dt', '', k), el('dd', '', v, flag ? el('em', '', flag) : null)); };
      fact('Shots', `${s.used} · par ${lv.par}`, s.stars === 3 ? '' : s.used > lv.par ? 'OVER PAR' : 'KEYSTONE FOR 3');
      fact('Longest chain', `${s.bestChain}`);
      fact('Score', s.score.toLocaleString('en-US'), out.newBest ? 'BEST' : '');
      card.append(el('div', 'fm-verdict', 'DOWN'), stars);
      if (s.keystone) card.append(el('div', 'fm-keyline', svg(ICON.key), out.newKeystone ? 'Keystone found: one shot took half of it' : 'Keystone: one shot took half of it'));
      card.append(facts, el('div', 'fm-card-actions', this.button('Again', '', () => this.startLevel(this.index)), last ? this.button('All jobs', 'primary', () => this.showJobs()) : this.button('Next job', 'primary', () => this.startLevel(this.index + 1))));
    } else {
      audio.play('fail');
      const why = s.loss === 'neighbour'
        ? 'The house next door took a hit. A building falls toward the support it lost, so take the support on the far side.'
        : `Out of shots with ${Math.round((1 - s.sim.progress()) * 100)}% still above the line. LOADS shows which pieces carry the most: those are the ones worth a ball.`;
      card.append(el('div', 'fm-verdict lost', s.loss === 'neighbour' ? 'WRONG WAY' : 'STILL STANDING'), el('p', '', why), el('div', 'fm-card-actions', this.button('Jobs', '', () => this.showJobs()), this.button('Try again', 'primary', () => this.startLevel(this.index))));
    }
    scrim.append(card);
    this.sheet = scrim;
    this.ui.append(scrim);
  }

  /** Automation hooks for the smoke tests. */
  debug(): { mode: string; index: number; status: string; shotsLeft: number; used: number; progress: number; stars: number; bag: Record<string, number> } {
    const s = this.session;
    return { mode: this.mode, index: this.index, status: s.status, shotsLeft: s.shotsLeft, used: s.used, progress: s.sim.progress(), stars: s.stars, bag: { ...s.bag, standard: -1 } };
  }

  /** Screen position of a point on the face. */
  screenOf(x: number, y: number): { x: number; y: number } {
    return this.view.project(x, y);
  }
}

export function foremanScreen(app: App): ScreenInstance {
  const root = document.createElement('div');
  root.className = 'fm-root';
  const game = new Foreman(app, root);
  (window as unknown as { __foreman?: Foreman }).__foreman = game;
  return { el: root, destroy: () => game.destroy() };
}
