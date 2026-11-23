// Builds dist/ from public/:
//  1. copies public/ to dist/
//  2. applies the owner-editable content in content/*.json (edited through Pages CMS):
//     business phone + hours, homepage hero text, the 6 "latest work" photos, and Google reviews
//  3. fills in the site's real address wherever the pages say __DOMAIN__
// Every content step is wrapped so a bad edit logs a warning and keeps the original text
// instead of breaking the deploy.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, dirname, basename } from 'node:path';

const domain = (process.env.SITE_DOMAIN || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'localhost:3000')
  .replace(/^https?:\/\//, '').replace(/\/+$/, '');

// Values the hand-built pages were written with. The build swaps these for whatever is in content/.
const ORIGINAL = { phone: '(239) 887-8922', opens: '7 AM', closes: '5 PM' };

rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true });

const warn = (m) => console.warn(`WARNING: ${m}`);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const readJson = (f) => {
  try { return JSON.parse(readFileSync(join('content', f), 'utf8')); }
  catch (e) { warn(`could not read content/${f} (${e.message}); keeping the original page text`); return null; }
};
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.html', '.xml', '.txt', '.js'].includes(extname(p))) files.push(p);
  }
})('dist');
const page = (name) => join('dist', name);
const edit = (path, fn) => { const s = readFileSync(path, 'utf8'); const t = fn(s); if (t !== s) writeFileSync(path, t); };

// ---- Homepage hero text ----------------------------------------------------------------
const home = readJson('home.json');
if (home) {
  try {
    edit(page('index.html'), (s) => {
      const need = ['hero_kicker', 'hero_headline', 'hero_subheadline'];
      for (const k of need) if (!String(home[k] ?? '').trim()) throw new Error(`"${k}" is empty`);
      const hl = String(home.hero_highlight ?? '').trim();
      return s
        .replace(/<span class="h1-kick">[\s\S]*?<\/span>/, () => `<span class="h1-kick">${esc(home.hero_kicker.trim())}</span>`)
        .replace(/<span class="h1-main">[\s\S]*?<\/span><\/span>/,
          () => `<span class="h1-main">${esc(home.hero_headline.trim())}${hl ? ` <span class="accent">${esc(hl)}</span>` : ''}</span>`)
        .replace(/<p class="vhero-sub">[\s\S]*?<\/p>/, () => `<p class="vhero-sub">${esc(home.hero_subheadline.trim())}</p>`);
    });
  } catch (e) { warn(`homepage hero not updated: ${e.message}`); }
}

// ---- Latest work photos (homepage + about page, 6 fixed slots) -------------------------
const SLOTS = [
  { cls: 'w-a rv', sizes: '(min-width: 900px) 58vw, 100vw' },
  { cls: 'w-b rv d1', sizes: '(min-width: 900px) 34vw, 50vw' },
  { cls: 'w-c rv d2', sizes: '(min-width: 900px) 34vw, 50vw' },
  { cls: 'w-d rv', sizes: '(min-width: 900px) 34vw, 50vw' },
  { cls: 'w-e rv d1', sizes: '(min-width: 900px) 34vw, 50vw' },
  { cls: 'w-f rv d2', sizes: '(min-width: 900px) 34vw, 50vw' },
];
const GRID_RE = /(<div class="work-grid">)[\s\S]*?(\n    <\/div>)/;
// The photos the site launched with, with their hand-made responsive sizes.
const originalGrid = (readFileSync('public/index.html', 'utf8').match(GRID_RE) || [''])[0];
const known = new Map([...originalGrid.matchAll(/<img src="([^"]+)" srcset="([^"]+)"[^>]*? width="(\d+)" height="(\d+)"[^>]*?alt="([^"]*)"[\s\S]*?<figcaption>([\s\S]*?)<\/figcaption>/g)]
  .map((m) => [m[1], { srcset: m[2], width: m[3], height: m[4], alt: m[5], caption: m[6] }]));

const cleanPath = (p) => '/' + String(p || '').trim().replace(/^https?:\/\/[^/]+/, '').replace(/^\/?(public\/)?/, '');

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { warn('sharp not installed; new photos are served at their uploaded size'); }

// New uploads get resized to web-friendly WebP copies (1600px and 800px wide) inside dist/.
async function prepImage(src) {
  if (known.has(src)) return known.get(src);
  const file = join('dist', src);
  if (!existsSync(file)) throw new Error(`photo ${src} is not in the repository`);
  if (!sharp) return { src };
  const meta = await sharp(file).rotate().metadata();
  const w = (meta.autoOrient?.width ?? meta.width) || 1600;
  const h = (meta.autoOrient?.height ?? meta.height) || 1200;
  const stem = join(dirname(file), basename(file, extname(file)));
  const out = [];
  for (const width of [...new Set([Math.min(800, w), Math.min(1600, w)])]) {
    await sharp(file).rotate().resize({ width }).webp({ quality: 78 }).toFile(`${stem}-web-${width}.webp`);
    out.push({ width, url: `${dirname(src)}/${basename(file, extname(file))}-web-${width}.webp`.replace('//', '/') });
  }
  const big = out[out.length - 1];
  return { src: big.url, srcset: out.map((o) => `${o.url} ${o.width}w`).join(', '), width: big.width, height: Math.round((big.width * h) / w) };
}

const work = readJson('work-photos.json');
if (work) {
  try {
    const given = (Array.isArray(work.photos) ? work.photos : []).filter((p) => p && String(p.image || '').trim());
    if (given.length > 6) warn(`${given.length} work photos listed; only the first 6 fit the grid`);
    const fallback = [...known.entries()].map(([src, k]) => ({ image: src, caption: k.caption }));
    const items = SLOTS.map((_, i) => given[i] || fallback[i]); // keep the layout full if fewer than 6
    const figs = [];
    for (const [i, it] of items.entries()) {
      const src = cleanPath(it.image);
      let img;
      try { img = await prepImage(src); }
      catch (e) { warn(`${e.message}; using the original photo in slot ${i + 1}`); img = known.get(fallback[i].image); it.image = fallback[i].image; }
      const caption = String(it.caption ?? '').trim();
      const url = img.src || cleanPath(it.image);
      const dims = img.width ? ` width="${img.width}" height="${img.height}"` : '';
      const set = img.srcset ? ` srcset="${img.srcset}" sizes="${SLOTS[i].sizes}"` : '';
      figs.push(`      <figure class="work-item ${SLOTS[i].cls}"><img src="${esc(url)}"${set}${dims} alt="${esc(caption || 'Coastal Grounds Solutions project')}" loading="lazy" decoding="async">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`);
    }
    const block = figs.join('\n');
    for (const f of ['index.html', 'about.html']) edit(page(f), (s) => s.replace(GRID_RE, (_, a, b) => `${a}\n${block}${b}`));
  } catch (e) { warn(`work photos not updated: ${e.message}`); }
}

// ---- Google reviews (homepage, about, services) ----------------------------------------
const revs = readJson('reviews.json');
if (revs) {
  try {
    const list = (Array.isArray(revs.reviews) ? revs.reviews : []).filter((r) => r && String(r.name || '').trim() && String(r.review || '').trim());
    if (!list.length) throw new Error('no reviews with both a name and text');
    const cards = list.map((r) => {
      const name = String(r.name).trim();
      const paras = String(r.review).trim().split(/\n\s*\n/).map((p) => `<p>${esc(p.replace(/\s*\n\s*/g, ' ').trim())}</p>`).join('');
      return `    <figure class="rev">
      <div class="stars" aria-label="5 out of 5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
      <blockquote>${paras}</blockquote>
      <figcaption><span class="av" aria-hidden="true">${esc(name[0].toUpperCase())}</span><span><cite>${esc(name)}</cite><span class="src">Google review</span></span></figcaption>
    </figure>`;
    }).join('\n');
    const RAIL_RE = /(<div class="revs-rail rv" id="revs-rail"[^>]*>)[\s\S]*?(\n    <\/div>\s*\n\s*<div class="rail-nav")/;
    for (const f of ['index.html', 'about.html', 'services.html']) edit(page(f), (s) => s.replace(RAIL_RE, (_, a, b) => `${a}\n${cards}${b}`));
  } catch (e) { warn(`reviews not updated: ${e.message}`); }
}

// ---- Phone number and hours (every page, the schema data and the form script) ----------
const biz = readJson('business.json');
const swaps = [];
if (biz) {
  const digits = (s) => String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const d = digits(biz.phone), o = digits(ORIGINAL.phone);
  if (d.length !== 10) warn(`phone "${biz.phone}" is not a 10-digit US number; keeping ${ORIGINAL.phone}`);
  else if (d !== o) {
    const fmt = (x) => ({ paren: `(${x.slice(0, 3)}) ${x.slice(3, 6)}-${x.slice(6)}`, tel: `+1${x}`, dash: `${x.slice(0, 3)}-${x.slice(3, 6)}-${x.slice(6)}` });
    const a = fmt(o), b = fmt(d);
    swaps.push([a.paren, b.paren], [a.tel, b.tel], [a.dash, b.dash]);
  }
  // "7 AM", "7:30 am", "5pm" -> { label: "7 AM", h24: "07:00" }
  const time = (s) => {
    const m = String(s || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
    if (!m || +m[1] < 1 || +m[1] > 12 || (m[2] && +m[2] > 59)) return null;
    const ap = m[3].toUpperCase() + 'M';
    const h = (+m[1] % 12) + (ap === 'PM' ? 12 : 0);
    return { label: `${+m[1]}${m[2] && m[2] !== '00' ? ':' + m[2] : ''} ${ap}`, h24: `${String(h).padStart(2, '0')}:${m[2] || '00'}` };
  };
  const [no, nc, oo, oc] = [time(biz.opens), time(biz.closes), time(ORIGINAL.opens), time(ORIGINAL.closes)];
  if (!no || !nc) warn(`hours "${biz.opens}" to "${biz.closes}" not understood (use a format like 7 AM or 5:30 PM); keeping 7 AM to 5 PM`);
  else if (no.label !== oo.label || nc.label !== oc.label) {
    swaps.push([`${oo.label} to ${oc.label}`, `${no.label} to ${nc.label}`],
      [`"opens":"${oo.h24}","closes":"${oc.h24}"`, `"opens":"${no.h24}","closes":"${nc.h24}"`]);
  }
}

// ---- Apply phone/hours swaps and the real domain ----------------------------------------
let n = 0;
for (const p of files) {
  const s = readFileSync(p, 'utf8');
  let t = s;
  for (const [from, to] of swaps) t = t.split(from).join(to);
  if (extname(p) !== '.js') t = t.split('__DOMAIN__').join(domain);
  if (t !== s) { writeFileSync(p, t); n++; }
}

console.log(`Built dist/ for https://${domain}/ (${n} files updated${swaps.length ? `, ${swaps.length} phone/hours swaps` : ''})`);
