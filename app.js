(() => {
'use strict';

/* ---------- setup ---------- */
const CFG = window.APP_CONFIG || {};
const remote = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
const sb = remote ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

let user = null;
let state = { clients: [] };           // { id, name, t, reels:[{id,title,url,done,t}], topics:[{id,title,done,t}] }
let ui = { active: null, tab: 'reels', mode: 'edit' };
const openStruct = new Set();
const draft = { reelUrl: '', reelTitle: '', topic: '' };

/* ---------- utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));

const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/></svg>',
  out: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 7l4-4M3.5 3H7v3.5"/></svg>'
};
const icon = n => { const s = document.createElement('span'); s.innerHTML = ICON[n]; s.style.display = 'contents'; return s; };

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 3200);
}

function platform(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes('tiktok')) return ['tiktok', 'TikTok'];
    if (host.includes('instagram')) return ['instagram', 'Instagram'];
  } catch {}
  return ['link', 'Link'];
}
const normUrl = u => { u = u.trim(); return /^https?:\/\//i.test(u) ? u : 'https://' + u; };
const sortItems = a => [...a].sort((x, y) => (x.done - y.done) || ((!!y.picked) - (!!x.picked)) || (y.t - x.t));

/* ---------- persistence ---------- */
const cacheKey = () => 'cd2:' + (user ? user.id : 'local');
const persist = () => { LS.set(cacheKey(), state); LS.set('cd2:ui', ui); };

function migrateV1() {
  const old = LS.get('content-desk-v1');
  if (!old || !Array.isArray(old.clients)) return null;
  let n = Date.now();
  return { clients: old.clients.map(c => ({
    id: uuid(), name: c.name, t: n++,
    reels: (c.reels || []).map(r => ({ id: uuid(), title: r.title, url: r.url, done: !!r.done, t: n++ })),
    topics: (c.topics || []).map(r => ({ id: uuid(), title: r.title, done: !!r.done, t: n++ }))
  })) };
}

/* ---------- remote ---------- */
async function load() {
  if (!remote || !user) return;
  try {
    const [c, i] = await Promise.all([
      sb.from('clients').select('*').order('created_at'),
      sb.from('items').select('*').order('created_at')
    ]);
    if (c.error) throw c.error; if (i.error) throw i.error;
    const map = new Map();
    state = { clients: c.data.map(r => {
      const o = { id: r.id, name: r.name, t: Date.parse(r.created_at), reels: [], topics: [], scripts: [] };
      map.set(r.id, o); return o;
    }) };
    i.data.forEach(r => {
      const o = map.get(r.client_id); if (!o) return;
      const it = { id: r.id, title: r.title, done: r.done, picked: !!r.picked, t: Date.parse(r.created_at) };
      if (r.kind === 'reel') { it.url = r.url; o.reels.push(it); }
      else if (r.kind === 'script') { it.subtitle = r.subtitle || ''; it.body = r.body || ''; o.scripts.push(it); }
      else o.topics.push(it);
    });
    persist(); render();
  } catch (e) { toast('Offline: uso i dati salvati'); }
}

let rt, rtTimer;
function subscribe() {
  if (!remote || rt) return;
  const again = () => { clearTimeout(rtTimer); rtTimer = setTimeout(load, 350); };
  rt = sb.channel('cd-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, again)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, again)
    .subscribe();
}
function unsubscribe() { if (rt) { sb.removeChannel(rt); rt = null; } }

function mut(local, rem) {
  local(); persist(); render();
  if (remote && rem) {
    Promise.resolve(rem()).then(r => { if (r && r.error) throw r.error; })
      .catch(e => toast('Sync non riuscita: ' + (e.message || e)));
  }
}

/* ---------- actions ---------- */
const cur = () => state.clients.find(c => c.id === ui.active);
const norm = () => state.clients.forEach(c => { c.reels = c.reels || []; c.topics = c.topics || []; c.scripts = c.scripts || []; });

function addClient(name) {
  const c = { id: uuid(), name, t: Date.now(), reels: [], topics: [], scripts: [] };
  mut(() => { state.clients.push(c); ui.active = c.id; },
      () => sb.from('clients').insert({ id: c.id, name, created_at: new Date(c.t).toISOString() }));
}
function delClient(c) {
  if (!confirm('Eliminare "' + c.name + '" e tutto il suo contenuto?')) return;
  mut(() => { state.clients = state.clients.filter(x => x.id !== c.id); },
      () => sb.from('clients').delete().eq('id', c.id));
}
function addItem(c, kind, item) {
  const list = kind === 'reel' ? c.reels : c.topics;
  mut(() => list.unshift(item),
      () => sb.from('items').insert({
        id: item.id, client_id: c.id, kind, title: item.title, url: item.url || null,
        done: false, created_at: new Date(item.t).toISOString()
      }));
}
const URL_RE = /https?:\/\/[^\s<>"]+/i;
function cleanUrl(u) {
  try {
    const x = new URL(u); x.hash = '';
    if (/(^|\.)(instagram|tiktok)\.com$/.test(x.hostname)) x.search = '';
    return x.toString();
  } catch { return u; }
}
// "Titolo\nlink\n\nTitolo\nlink" oppure "Titolo link" oppure solo link
function parseNotes(text) {
  const out = []; let pending = null;
  text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
    const m = line.match(URL_RE);
    if (!m) { pending = line; return; }
    const inline = line.replace(m[0], '').replace(/^[\s:\-|,]+|[\s:\-|,]+$/g, '');
    const url = cleanUrl(m[0]);
    out.push({ url, title: inline || pending || ('Reel ' + platform(url)[1]) });
    pending = null;
  });
  return out;
}
function importNotes(text) {
  const c = cur(); if (!c) return toast('Crea prima un cliente');
  const have = new Set(c.reels.map(r => r.url));
  const seen = new Set();
  const found = parseNotes(text).filter(r => !have.has(r.url) && !seen.has(r.url) && seen.add(r.url));
  if (!found.length) return toast('Nessun link nuovo trovato');
  const base = Date.now();
  const items = found.map((r, i) => ({ id: uuid(), title: r.title, url: r.url, done: false, t: base + (found.length - i) }));
  mut(() => c.reels.push(...items),
      () => sb.from('items').insert(items.map(it => ({
        id: it.id, client_id: c.id, kind: 'reel', title: it.title, url: it.url, done: false,
        created_at: new Date(it.t).toISOString() }))));
  toast(items.length + (items.length === 1 ? ' reel aggiunto' : ' reel aggiunti'));
}

function toggle(it) {
  mut(() => { it.done = !it.done; }, () => sb.from('items').update({ done: it.done }).eq('id', it.id));
}
function parseScripts(text) {
  const out = []; let cur = null;
  const flush = () => { if (cur) { cur.body = cur.body.join('\n').trim(); out.push(cur); cur = null; } };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const hm = line.match(/^###\s+(.+)$/);
    if (hm) { flush(); cur = { title: hm[1].replace(/^\d+[.)]\s*/, '').trim(), subtitle: '', body: [] }; continue; }
    if (!cur) continue;
    if (/^-{3,}$/.test(line)) continue;
    if (/^#{1,2}\s/.test(line)) { flush(); continue; }
    const sm = line.match(/^\*\*sottotitolo:?\*\*:?\s*(.*)$/i);
    if (sm && !cur.subtitle) { cur.subtitle = sm[1].trim(); continue; }
    cur.body.push(raw.trimEnd());
  }
  flush();
  return out.filter(s => s.title);
}
const scriptRow = (c, it) => ({
  id: it.id, client_id: c.id, kind: 'script', title: it.title, subtitle: it.subtitle || null, body: it.body || null,
  done: !!it.done, picked: !!it.picked, created_at: new Date(it.t).toISOString()
});
function importScripts(text) {
  const c = cur(); if (!c) return toast('Crea prima un cliente');
  const have = new Set(c.scripts.map(s => s.title.toLowerCase()));
  const found = parseScripts(text).filter(s => !have.has(s.title.toLowerCase()) && have.add(s.title.toLowerCase()));
  if (!found.length) return toast('Nessuna scaletta nuova trovata');
  const base = Date.now();
  const items = found.map((s, i) => ({ id: uuid(), title: s.title, subtitle: s.subtitle, body: s.body, done: false, picked: false, t: base + (found.length - i) }));
  mut(() => c.scripts.push(...items), () => sb.from('items').insert(items.map(it => scriptRow(c, it))));
  toast(items.length + (items.length === 1 ? ' scaletta aggiunta' : ' scalette aggiunte'));
}
function addScript(c, f) {
  const it = { id: uuid(), title: f.title, subtitle: f.subtitle, body: f.body, done: false, picked: false, t: Date.now() };
  mut(() => c.scripts.unshift(it), () => sb.from('items').insert(scriptRow(c, it)));
}
function structView(body) {
  const para = t => t.trim().replace(/^["“”«]+|["“”»]+$/g, '').replace(/\*\*/g, '').trim();
  const parts = body.split(/^\*\*(.+?)\*\*[ \t]*$/m);
  const wrap = h('div', { class: 'struct' });
  if (parts[0].trim()) wrap.append(h('p', {}, para(parts[0])));
  for (let i = 1; i < parts.length; i += 2)
    wrap.append(h('div', { class: 'sect' }, h('span', { class: 'lab' }, parts[i]), h('p', {}, para(parts[i + 1] || ''))));
  return wrap;
}

function togglePick(it) {
  mut(() => { it.picked = !it.picked; }, () => sb.from('items').update({ picked: it.picked }).eq('id', it.id));
}
function editItem(it, fields) {
  mut(() => Object.assign(it, fields), () => sb.from('items').update(fields).eq('id', it.id));
}
function parseTopics(text) {
  return text.split(/\r?\n/).map(l => l.trim().replace(/^([-*•–]|\d+[.)])\s+/, '').trim()).filter(Boolean);
}
function importTopics(text) {
  const c = cur(); if (!c) return toast('Crea prima un cliente');
  const have = new Set(c.topics.map(t => t.title.toLowerCase()));
  const found = parseTopics(text).filter(t => !have.has(t.toLowerCase()) && have.add(t.toLowerCase()));
  if (!found.length) return toast('Nessun topic nuovo trovato');
  const base = Date.now();
  const items = found.map((t, i) => ({ id: uuid(), title: t, done: false, picked: false, t: base + (found.length - i) }));
  mut(() => c.topics.push(...items),
      () => sb.from('items').insert(items.map(it => ({
        id: it.id, client_id: c.id, kind: 'topic', title: it.title, done: false,
        created_at: new Date(it.t).toISOString() }))));
  toast(items.length + (items.length === 1 ? ' topic aggiunto' : ' topic aggiunti'));
}
function delItem(list, it) {
  mut(() => { list.splice(list.indexOf(it), 1); }, () => sb.from('items').delete().eq('id', it.id));
}

/* ---------- views ---------- */
function render() {
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.f : null;
  const app = $('#app'); app.replaceChildren();
  if (remote && !user) { app.append(loginView()); return; }
  norm();
  if (!state.clients.find(c => c.id === ui.active)) ui.active = state.clients[0] ? state.clients[0].id : null;

  app.append(h('div', { class: 'shell' }, topbar(), pills(), body()));
  if (focusKey) { const n = $('[data-f="' + focusKey + '"]'); if (n) n.focus(); }
}

const topbar = () => h('div', { class: 'topbar' },
  h('div', { class: 'brand' }, h('i', {}, icon('check')), 'Content Desk'),
  h('button', { class: 'round', 'aria-label': 'Impostazioni', onclick: openMenu }, icon('gear'))
);

function pills() {
  const row = h('div', { class: 'pills' });
  state.clients.forEach(c => {
    const left = [...c.reels, ...c.topics, ...c.scripts].filter(x => !x.done).length;
    row.append(h('button', { class: 'pill' + (c.id === ui.active ? ' on' : ''),
      onclick: () => { ui.active = c.id; persist(); render(); } }, c.name, h('span', { class: 'n' }, left)));
  });
  row.append(h('button', { class: 'pill add', onclick: openClientDialog }, icon('plus'), 'Cliente'));
  return row;
}

function body() {
  const c = cur();
  if (!c) return h('div', { class: 'splash' },
    h('h1', {}, 'Nessun cliente'), h('p', {}, 'Crea il primo cliente e inizia a raccogliere idee.'),
    h('button', { class: 'btn', onclick: openClientDialog }, 'Aggiungi cliente'));

  const client = ui.mode === 'client';
  const vis = a => client ? a.filter(x => x.picked) : a;
  const left = a => a.filter(x => !x.done).length;
  const all = [c.reels, c.topics, c.scripts];
  const picked = all.reduce((n, l) => n + l.filter(x => x.picked).length, 0);
  const todo = all.reduce((n, l) => n + left(vis(l)), 0);
  const wrap = h('div', { class: client ? 'mode-client' : 'mode-edit' });
  wrap.append(
    h('div', { class: 'hero' },
      h('div', {}, h('h1', {}, c.name),
        h('div', { class: 'sub' }, client
          ? [h('b', {}, todo), ' da fare con il cliente']
          : [h('b', {}, todo), ' da fare · ', h('b', {}, picked), ' scelti'])),
      client ? null : h('button', { class: 'link-danger', onclick: () => delClient(c) }, 'Elimina cliente')),
    h('div', { class: 'modesw' },
      h('button', { class: client ? '' : 'on', onclick: () => setMode('edit') }, 'Modifica'),
      h('button', { class: client ? 'on' : '', onclick: () => setMode('client') }, 'Cliente' + (picked ? ' (' + picked + ')' : ''))),
    h('div', { class: 'seg' },
      h('button', { class: ui.tab === 'reels' ? 'on' : '', onclick: () => setTab('reels') }, 'Reel ' + left(vis(c.reels))),
      h('button', { class: ui.tab === 'topics' ? 'on' : '', onclick: () => setTab('topics') }, 'Contenuti ' + left(vis(c.topics))),
      h('button', { class: ui.tab === 'scripts' ? 'on' : '', onclick: () => setTab('scripts') }, 'Scalette ' + left(vis(c.scripts)))),
    h('div', { class: 'cols', 'data-tab': ui.tab }, reelsCard(c, client), topicsCard(c, client), scriptsCard(c, client))
  );
  return wrap;
}
const setTab = t => { ui.tab = t; persist(); render(); };
const setMode = m => { ui.mode = m; persist(); render(); window.scrollTo({ top: 0 }); };

function cardHead(title, list) {
  return h('div', { class: 'card-h' }, h('h2', {}, title),
    h('span', { class: 'count' }, list.filter(x => !x.done).length + ' / ' + list.length));
}

function scriptsCard(c, client) {
  const shown = client ? c.scripts.filter(x => x.picked) : c.scripts;
  const bar = h('div', { class: 'composer' },
    h('button', { type: 'button', class: 'btn', onclick: () => openNotes('script') }, 'Incolla scalette'),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => openEdit(null, 'script') }, 'Nuova scaletta a mano'));
  const list = h('div', { class: 'list' });
  if (!shown.length) list.append(h('div', { class: 'empty' }, client ? 'Nessuna scaletta scelta. Passa a Modifica e premi la stella.' : 'Incolla il piano editoriale qui sopra'));
  sortItems(shown).forEach(it => {
    const open = openStruct.has(it.id);
    const struct = it.body ? structView(it.body) : null;
    if (struct && !open) struct.hidden = true;
    const btn = it.body ? h('button', { class: 'struct-btn' + (open ? ' on' : ''), onclick: e => {
      const now = !openStruct.has(it.id);
      now ? openStruct.add(it.id) : openStruct.delete(it.id);
      struct.hidden = !now; e.currentTarget.classList.toggle('on', now);
      e.currentTarget.textContent = now ? 'Nascondi struttura' : 'Vedi struttura';
    } }, open ? 'Nascondi struttura' : 'Vedi struttura') : null;
    list.append(row(it, c.scripts, client, 'script',
      h('span', { class: 'ttl script-t' }, it.title),
      it.subtitle ? h('span', { class: 'subt' }, it.subtitle) : null,
      btn, struct));
  });
  return h('section', { class: 'card scripts' }, cardHead(client ? 'Scalette scelte' : 'Scalette video', shown), client ? null : bar, list);
}

function reelsCard(c, client) {
  const url = h('input', { 'data-f': 'reelUrl', placeholder: 'Incolla il link TikTok o Instagram', inputmode: 'url',
    autocapitalize: 'none', autocorrect: 'off', value: draft.reelUrl, oninput: e => draft.reelUrl = e.target.value,
    onpaste: e => {
      const t = (e.clipboardData && e.clipboardData.getData('text')) || '';
      if (t.trim().includes('\n')) { e.preventDefault(); importNotes(t); }
    } });
  const ttl = h('input', { 'data-f': 'reelTitle', placeholder: 'Titolo', value: draft.reelTitle,
    oninput: e => draft.reelTitle = e.target.value });
  const form = h('form', { class: 'composer', onsubmit: e => {
    e.preventDefault();
    const u = draft.reelUrl.trim(); if (!u) return url.focus();
    const full = normUrl(u);
    addItem(c, 'reel', { id: uuid(), title: draft.reelTitle.trim() || ('Reel ' + platform(full)[1]), url: full, done: false, t: Date.now() });
    draft.reelUrl = draft.reelTitle = '';
    render(); const n = $('[data-f="reelUrl"]'); if (n) n.focus();
  } }, url, h('div', { class: 'row2' }, ttl, h('button', { class: 'btn' }, 'Aggiungi')),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => openNotes('reel') }, 'Incolla note (pi\u00f9 reel insieme)'));

  const shown = client ? c.reels.filter(x => x.picked) : c.reels;
  const list = h('div', { class: 'list' });
  if (!shown.length) list.append(h('div', { class: 'empty' }, client ? 'Nessun reel scelto. Passa a Modifica e premi la stella.' : 'Incolla il primo link qui sopra'));
  sortItems(shown).forEach(it => {
    const [k, name] = platform(it.url);
    list.append(row(it, c.reels, client, 'reel',
      h('a', { class: 'ttl', href: it.url, target: '_blank', rel: 'noopener' }, it.title),
      h('span', { class: 'chip ' + k }, name, icon('out'))));
  });
  return h('section', { class: 'card reels' }, cardHead(client ? 'Reel scelti' : 'Ispirazione reel', shown), client ? null : form, list);
}

function topicsCard(c, client) {
  const inp = h('input', { 'data-f': 'topic', placeholder: 'Nuovo topic o idea', value: draft.topic,
    oninput: e => draft.topic = e.target.value,
    onpaste: e => {
      const t = (e.clipboardData && e.clipboardData.getData('text')) || '';
      if (t.trim().includes('\n')) { e.preventDefault(); importTopics(t); }
    } });
  const form = h('form', { class: 'composer', onsubmit: e => {
    e.preventDefault();
    const t = draft.topic.trim(); if (!t) return;
    addItem(c, 'topic', { id: uuid(), title: t, done: false, t: Date.now() });
    draft.topic = ''; render(); const n = $('[data-f="topic"]'); if (n) n.focus();
  } }, h('div', { class: 'row2' }, inp, h('button', { class: 'btn' }, 'Aggiungi')),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => openNotes('topic') }, 'Incolla note (pi\u00f9 topic insieme)'));

  const shown = client ? c.topics.filter(x => x.picked) : c.topics;
  const list = h('div', { class: 'list' });
  if (!shown.length) list.append(h('div', { class: 'empty' }, client ? 'Nessun contenuto scelto. Passa a Modifica e premi la stella.' : 'Scrivi il primo topic qui sopra'));
  sortItems(shown).forEach(it => list.append(row(it, c.topics, client, 'topic', h('span', { class: 'ttl topic-t' }, it.title))));
  return h('section', { class: 'card topics' }, cardHead(client ? 'Contenuti scelti' : 'Altri contenuti', shown), client ? null : form, list);
}

function row(it, list, client, kind, ...content) {
  return h('div', { class: 'item' + (it.done ? ' done' : '') + (it.picked ? ' picked' : '') + (kind === 'script' ? ' is-script' : '') },
    h('button', { class: 'chk', 'aria-label': 'Segna come fatto', onclick: () => toggle(it) }, icon('check')),
    h('div', { class: 'body' }, ...content),
    client ? null : h('div', { class: 'acts' },
      h('button', { class: 'ib star' + (it.picked ? ' on' : ''), 'aria-label': 'Scegli per il cliente', onclick: () => togglePick(it) }, icon('star')),
      h('button', { class: 'ib', 'aria-label': 'Modifica', onclick: () => openEdit(it, kind) }, icon('pen')),
      h('button', { class: 'ib x', 'aria-label': 'Elimina', onclick: () => delItem(list, it) }, icon('x'))));
}

/* ---------- login ---------- */
function loginView() {
  let signup = false, busy = false;
  const email = h('input', { type: 'email', placeholder: 'Email', autocomplete: 'email', autocapitalize: 'none', required: true });
  const pass = h('input', { type: 'password', placeholder: 'Password (min 6 caratteri)', autocomplete: 'current-password', required: true, minlength: 6 });
  const msg = h('div', { class: 'msg' });
  const title = h('h2', {}, 'Accedi');
  const btn = h('button', { class: 'btn block' }, 'Accedi');
  const sw = h('button', { type: 'button', class: 'switch' });
  const paint = () => {
    title.textContent = signup ? 'Crea account' : 'Accedi';
    btn.textContent = signup ? 'Crea account' : 'Accedi';
    sw.replaceChildren(signup ? 'Hai gia un account? ' : 'Prima volta? ', h('b', {}, signup ? 'Accedi' : 'Crea account'));
    pass.autocomplete = signup ? 'new-password' : 'current-password';
  };
  sw.onclick = () => { signup = !signup; msg.textContent = ''; paint(); };
  paint();

  const form = h('form', { class: 'card', onsubmit: async e => {
    e.preventDefault(); if (busy) return; busy = true; btn.style.opacity = .6; msg.className = 'msg'; msg.textContent = '';
    const creds = { email: email.value.trim(), password: pass.value };
    const { data, error } = signup ? await sb.auth.signUp(creds) : await sb.auth.signInWithPassword(creds);
    busy = false; btn.style.opacity = 1;
    if (error) { msg.className = 'msg err'; msg.textContent = error.message; return; }
    if (signup && !data.session) msg.textContent = 'Account creato. Controlla la mail per confermare, poi accedi.';
  } }, title, email, pass, btn, msg, sw);

  const wrap = h('div', { class: 'auth shell' },
    h('div', { class: 'brand' }, h('i', {}, icon('check')), 'Content Desk'), form);
  wrap.querySelectorAll('input').forEach(i => { i.style.cssText = ''; });
  const style = h('style', {}, '.auth input{width:100%;padding:15px 18px;border-radius:18px;border:2px solid transparent;background:var(--soft);outline:none;font-size:16px;font-weight:600}.auth input:focus{border-color:var(--y);background:#000}');
  wrap.append(style);
  return wrap;
}

/* ---------- dialogs ---------- */
const dlgClient = $('#dlgClient'), dlgMenu = $('#dlgMenu');
[dlgClient, dlgMenu].forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
dlgClient.querySelectorAll('[data-close]').forEach(b => b.onclick = () => dlgClient.close());

function openClientDialog() {
  $('#clientName').value = ''; dlgClient.showModal(); setTimeout(() => $('#clientName').focus(), 50);
}
$('#formClient').addEventListener('submit', () => {
  const n = $('#clientName').value.trim(); if (n) addClient(n);
});

const dlgNotes = $('#dlgNotes');
dlgNotes.addEventListener('click', e => { if (e.target === dlgNotes) dlgNotes.close(); });
dlgNotes.querySelector('[data-close]').onclick = () => dlgNotes.close();
let notesKind = 'reel';
const NOTES = {
  reel: ['Incolla note reel', 'Una coppia titolo + link per volta. Aggiungo tutto in un colpo.', 'Titolo\nlink\n\nTitolo\nlink'],
  topic: ['Incolla note contenuti', 'Un topic per riga. Elenchi puntati e numerati vanno bene.', 'Topic uno\nTopic due\nTopic tre'],
  script: ['Incolla scalette', 'Incolla l\'intero piano editoriale: riconosco "### titolo", "Sottotitolo" e la struttura del video.', '### 01. TITOLO\n**Sottotitolo:** ...\n\n**HOOK**\n"..."\n\n**TESTO PARLATO**\n"..."']
};
function openNotes(kind) {
  notesKind = kind;
  const [t, tip, ph] = NOTES[kind];
  $('#notesTitle').textContent = t; $('#notesTip').textContent = tip; $('#notesText').placeholder = ph;
  $('#notesText').value = ''; dlgNotes.showModal(); setTimeout(() => $('#notesText').focus(), 50);
}
$('#formNotes').addEventListener('submit', () => ({ reel: importNotes, topic: importTopics, script: importScripts })[notesKind]($('#notesText').value));

const dlgEdit = $('#dlgEdit');
let editCtx = null;
dlgEdit.addEventListener('click', e => { if (e.target === dlgEdit) dlgEdit.close(); });
dlgEdit.querySelector('[data-close]').onclick = () => dlgEdit.close();
function openEdit(it, kind) {
  editCtx = { it, kind };
  $('#editHead').textContent = it ? 'Modifica' : 'Nuova scaletta';
  $('#editTitle').value = it ? it.title : '';
  $('#editUrlWrap').hidden = kind !== 'reel';
  $('#editSubWrap').hidden = kind !== 'script';
  $('#editBodyWrap').hidden = kind !== 'script';
  $('#editUrl').value = (it && it.url) || '';
  $('#editSub').value = (it && it.subtitle) || '';
  $('#editBody').value = (it && it.body) || '';
  dlgEdit.showModal();
}
$('#formEdit').addEventListener('submit', () => {
  const { it, kind } = editCtx || {}; if (!kind) return;
  const title = $('#editTitle').value.trim();
  if (kind === 'script') {
    const f = { title: title || (it ? it.title : 'Scaletta'), subtitle: $('#editSub').value.trim(), body: $('#editBody').value.trim() };
    return it ? editItem(it, f) : addScript(cur(), f);
  }
  const fields = { title: title || it.title };
  if (kind === 'reel' && $('#editUrl').value.trim()) fields.url = normUrl($('#editUrl').value);
  editItem(it, fields);
});

function openMenu() {
  const m = $('#menuBody'); m.replaceChildren(
    h('h3', {}, 'Impostazioni'),
    h('div', { class: 'menu-who' }, remote ? (user ? user.email : '') : 'Modalita locale (dati solo su questo dispositivo)'),
    h('div', { class: 'menu-list' },
      h('button', { class: 'btn ghost block', onclick: exportData }, 'Esporta backup'),
      h('button', { class: 'btn ghost block', onclick: () => $('#file').click() }, 'Importa backup'),
      remote && user ? h('button', { class: 'btn danger-soft block', onclick: async () => { dlgMenu.close(); await sb.auth.signOut(); } }, 'Esci') : null,
      h('button', { class: 'btn ghost block', onclick: () => dlgMenu.close() }, 'Chiudi')),
    h('div', { class: 'tip' }, 'iPhone: apri il sito in Safari, tocca Condividi e poi "Aggiungi a Home" per averla come app.'));
  dlgMenu.showModal();
}

function exportData() {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })),
    download: 'content-desk-backup.json' });
  a.click();
}

$('#file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.clients)) throw new Error('formato');
    const have = new Set(state.clients.map(c => c.id));
    const add = d.clients.filter(c => !have.has(c.id));
    mut(() => { state.clients.push(...add); }, async () => {
      if (!add.length) return;
      const cr = add.map(c => ({ id: c.id, name: c.name, created_at: new Date(c.t || Date.now()).toISOString() }));
      const ir = add.flatMap(c => [
        ...c.reels.map(r => ({ id: r.id, client_id: c.id, kind: 'reel', title: r.title, url: r.url, done: !!r.done, created_at: new Date(r.t || Date.now()).toISOString() })),
        ...c.topics.map(r => ({ id: r.id, client_id: c.id, kind: 'topic', title: r.title, done: !!r.done, created_at: new Date(r.t || Date.now()).toISOString() })),
        ...(c.scripts || []).map(r => scriptRow(c, Object.assign({ t: Date.now() }, r)))
      ]);
      const a = await sb.from('clients').upsert(cr); if (a.error) return a;
      return ir.length ? sb.from('items').upsert(ir) : a;
    });
    dlgMenu.close(); toast('Backup importato');
  } catch { toast('File non valido'); }
});

/* ---------- boot ---------- */
async function onUser() {
  if (!remote) return;
  if (!user) { unsubscribe(); state = { clients: [] }; render(); return; }
  state = LS.get(cacheKey()) || { clients: [] };
  render(); subscribe(); await load();
}

async function boot() {
  const saved = LS.get('cd2:ui'); if (saved) ui = Object.assign(ui, saved);
  if (!remote) {
    state = LS.get('cd2:local') || migrateV1() || { clients: [] };
    render(); return;
  }
  const { data } = await sb.auth.getSession();
  user = data.session ? data.session.user : null;
  sb.auth.onAuthStateChange((_e, s) => {
    const u = s ? s.user : null;
    if ((u && u.id) !== (user && user.id)) { user = u; onUser(); }
  });
  await onUser();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}

boot();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
