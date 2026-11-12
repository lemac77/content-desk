(() => {
'use strict';

/* ---------- setup ---------- */
const CFG = window.APP_CONFIG || {};
const remote = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
const sb = remote ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

let user = null;
let state = { clients: [] };           // { id, name, t, reels:[{id,title,url,done,t}], topics:[{id,title,done,t}] }
let ui = { active: null, tab: 'reels' };
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
const sortItems = a => [...a].sort((x, y) => (x.done - y.done) || (y.t - x.t));

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
      const o = { id: r.id, name: r.name, t: Date.parse(r.created_at), reels: [], topics: [] };
      map.set(r.id, o); return o;
    }) };
    i.data.forEach(r => {
      const o = map.get(r.client_id); if (!o) return;
      const it = { id: r.id, title: r.title, done: r.done, t: Date.parse(r.created_at) };
      if (r.kind === 'reel') { it.url = r.url; o.reels.push(it); } else o.topics.push(it);
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

function addClient(name) {
  const c = { id: uuid(), name, t: Date.now(), reels: [], topics: [] };
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
function toggle(it) {
  mut(() => { it.done = !it.done; }, () => sb.from('items').update({ done: it.done }).eq('id', it.id));
}
function delItem(list, it) {
  mut(() => { list.splice(list.indexOf(it), 1); }, () => sb.from('items').delete().eq('id', it.id));
}

/* ---------- views ---------- */
function render() {
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.f : null;
  const app = $('#app'); app.replaceChildren();
  if (remote && !user) { app.append(loginView()); return; }
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
    const left = c.reels.filter(x => !x.done).length + c.topics.filter(x => !x.done).length;
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

  const left = a => a.filter(x => !x.done).length;
  const wrap = h('div', {});
  wrap.append(
    h('div', { class: 'hero' },
      h('div', {}, h('h1', {}, c.name),
        h('div', { class: 'sub' }, h('b', {}, left(c.reels) + left(c.topics)), ' da fare')),
      h('button', { class: 'link-danger', onclick: () => delClient(c) }, 'Elimina cliente')),
    h('div', { class: 'seg' },
      h('button', { class: ui.tab === 'reels' ? 'on' : '', onclick: () => setTab('reels') }, 'Reel (' + left(c.reels) + ')'),
      h('button', { class: ui.tab === 'topics' ? 'on' : '', onclick: () => setTab('topics') }, 'Contenuti (' + left(c.topics) + ')')),
    h('div', { class: 'cols', 'data-tab': ui.tab }, reelsCard(c), topicsCard(c))
  );
  return wrap;
}
const setTab = t => { ui.tab = t; persist(); render(); };

function cardHead(title, list) {
  return h('div', { class: 'card-h' }, h('h2', {}, title),
    h('span', { class: 'count' }, list.filter(x => !x.done).length + ' / ' + list.length));
}

function reelsCard(c) {
  const url = h('input', { 'data-f': 'reelUrl', placeholder: 'Incolla il link TikTok o Instagram', inputmode: 'url',
    autocapitalize: 'none', autocorrect: 'off', value: draft.reelUrl, oninput: e => draft.reelUrl = e.target.value });
  const ttl = h('input', { 'data-f': 'reelTitle', placeholder: 'Titolo', value: draft.reelTitle,
    oninput: e => draft.reelTitle = e.target.value });
  const form = h('form', { class: 'composer', onsubmit: e => {
    e.preventDefault();
    const u = draft.reelUrl.trim(); if (!u) return url.focus();
    const full = normUrl(u);
    addItem(c, 'reel', { id: uuid(), title: draft.reelTitle.trim() || ('Reel ' + platform(full)[1]), url: full, done: false, t: Date.now() });
    draft.reelUrl = draft.reelTitle = '';
    render(); const n = $('[data-f="reelUrl"]'); if (n) n.focus();
  } }, url, h('div', { class: 'row2' }, ttl, h('button', { class: 'btn' }, 'Aggiungi')));

  const list = h('div', { class: 'list' });
  if (!c.reels.length) list.append(h('div', { class: 'empty' }, 'Incolla il primo link qui sopra'));
  sortItems(c.reels).forEach(it => {
    const [k, name] = platform(it.url);
    list.append(row(it, c.reels,
      h('a', { class: 'ttl', href: it.url, target: '_blank', rel: 'noopener' }, it.title),
      h('span', { class: 'chip ' + k }, name, icon('out'))));
  });
  return h('section', { class: 'card reels' }, cardHead('Ispirazione reel', c.reels), form, list);
}

function topicsCard(c) {
  const inp = h('input', { 'data-f': 'topic', placeholder: 'Nuovo topic o idea', value: draft.topic,
    oninput: e => draft.topic = e.target.value });
  const form = h('form', { class: 'composer', onsubmit: e => {
    e.preventDefault();
    const t = draft.topic.trim(); if (!t) return;
    addItem(c, 'topic', { id: uuid(), title: t, done: false, t: Date.now() });
    draft.topic = ''; render(); const n = $('[data-f="topic"]'); if (n) n.focus();
  } }, h('div', { class: 'row2' }, inp, h('button', { class: 'btn' }, 'Aggiungi')));

  const list = h('div', { class: 'list' });
  if (!c.topics.length) list.append(h('div', { class: 'empty' }, 'Scrivi il primo topic qui sopra'));
  sortItems(c.topics).forEach(it => list.append(row(it, c.topics, h('span', { class: 'ttl topic-t' }, it.title))));
  return h('section', { class: 'card topics' }, cardHead('Altri contenuti', c.topics), form, list);
}

function row(it, list, ...content) {
  return h('div', { class: 'item' + (it.done ? ' done' : '') },
    h('button', { class: 'chk', 'aria-label': 'Segna come fatto', onclick: () => toggle(it) }, icon('check')),
    h('div', { class: 'body' }, ...content),
    h('button', { class: 'x', 'aria-label': 'Elimina', onclick: () => delItem(list, it) }, icon('x')));
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
        ...c.topics.map(r => ({ id: r.id, client_id: c.id, kind: 'topic', title: r.title, done: !!r.done, created_at: new Date(r.t || Date.now()).toISOString() }))
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
