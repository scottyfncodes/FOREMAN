import { writeFileSync, mkdirSync } from 'node:fs';
import { test } from 'vitest';
import { LEVELS } from '../../src/foreman/sim/levels';
import { GONE, STANDING, Sim } from '../../src/foreman/sim/world';

// SNAP="hut:0;hut:2,3" writes film strips of those strikes to scripts/foreman/out/*.svg
const COL: Record<string, string> = { timber: '#c98f4e', brick: '#b5523b', concrete: '#aaa69c', steel: '#47525c', glass: '#9fd0d8', gas: '#d6362b', crate: '#e0a82e' };

function frame(sim: Sim, ox: number, w: number, h: number, minX: number, label: string): string {
  let out = `<g transform="translate(${ox},0)"><rect width="${w}" height="${h}" fill="#f4efe4" stroke="#999"/>`;
  const sc = 22;
  const gy = h - 20;
  const X = (x: number): number => (x - minX) * sc + 20;
  const Y = (y: number): number => gy - y * sc;
  out += `<line x1="0" x2="${w}" y1="${gy}" y2="${gy}" stroke="#333"/>`;
  out += `<line x1="0" x2="${w}" y1="${Y(sim.level.lineY)}" y2="${Y(sim.level.lineY)}" stroke="#d00" stroke-dasharray="6 4"/>`;
  const p = { x: 0, y: 0, a: 0 };
  for (const m of sim.members) {
    if (m.state === GONE) continue;
    sim.pose(m, p);
    const fill = COL[m.mat];
    const op = m.layer === 1 ? 0.55 : 1;
    const stroke = m.state === STANDING ? (m.util > 1 ? '#f00' : m.protect ? '#06c' : '#222') : '#777';
    const tf = `translate(${X(p.x)},${Y(p.y)}) rotate(${(-p.a * 180) / Math.PI})`;
    const hw = (m.w * sc) / 2;
    const hh = (m.h * sc) / 2;
    if (m.shape === 'box') out += `<rect transform="${tf}" x="${-hw}" y="${-hh}" width="${hw * 2}" height="${hh * 2}" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${m.cracked ? 2.5 : 1}" ${m.cracked ? 'stroke-dasharray="3 2"' : ''}/>`;
    else {
      const ax = m.shape === 'gable' ? 0 : m.shape === 'shedL' ? -hw : hw;
      out += `<polygon transform="${tf}" points="${-hw},${hh} ${hw},${hh} ${ax},${-hh}" fill="${fill}" stroke="${stroke}"/>`;
    }
    if (m.state === STANDING && m.src >= 0 && sim.time === 0) out += `<text x="${X(p.x)}" y="${Y(p.y) + 3}" font-size="8" text-anchor="middle" fill="#000">${m.id}${m.hidden ? 'G' : ''}</text>`;
  }
  out += `<text x="6" y="14" font-size="12" font-family="monospace">${label}</text></g>`;
  return out;
}

test('snap', () => {
  mkdirSync('scripts/foreman/out', { recursive: true });
  for (const spec of (process.env.SNAP ?? '').split(';').filter(Boolean)) {
    const [id, list] = spec.split(':');
    const level = LEVELS.find((l) => l.id === id);
    if (!level) throw new Error(`no level ${id}`);
    const strikes = (list ?? '').split(',').filter(Boolean).map(Number);
    const sim = new Sim(level);
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = 0;
    for (const m of sim.members) { minX = Math.min(minX, m.x - m.w / 2); maxX = Math.max(maxX, m.x + m.w / 2); maxY = Math.max(maxY, m.y + m.h / 2); }
    minX -= 5; maxX += 5;
    const w = (maxX - minX) * 22 + 40;
    const h = maxY * 22 + 60;
    const frames: string[] = [frame(sim, 0, w, h, minX, `${id} rest`)];
    for (const s of strikes) {
      sim.strike(s);
      const marks = [0.35, 0.9, 1.6, 2.6];
      let next = 0;
      const t0 = sim.time;
      for (let i = 0; i < 1500 && !sim.settled; i++) {
        sim.step();
        if (next < marks.length && sim.time - t0 >= marks[next]) { frames.push(frame(sim, frames.length * w, w, h, minX, `#${s} +${marks[next]}s`)); next++; }
      }
      frames.push(frame(sim, frames.length * w, w, h, minX, `#${s} rest ${(sim.progress() * 100).toFixed(0)}% ${sim.cleared() ? 'CLEARED' : ''}`));
    }
    const name = `scripts/foreman/out/${id}-${strikes.join('_') || 'rest'}.svg`;
    writeFileSync(name, `<svg xmlns="http://www.w3.org/2000/svg" width="${frames.length * w}" height="${h}">${frames.join('')}</svg>`);
    console.log('wrote', name);
  }
});
