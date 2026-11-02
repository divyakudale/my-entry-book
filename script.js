// ---------- Data ----------
const KEY = '3m-entry-book-v1';
const DEFAULTS = [
  {id:'daily', name:'Daily Entry', icon:'📒', cols:['Entry','Sent to books']},
  {id:'attendance', name:'Attendance', icon:'🕘', cols:['Employee','Action','Punch time']},
  {id:'vehicles', name:'Vehicles', icon:'🚗', cols:['Vehicle','Treatment','Status']},
  {id:'supply', name:'Material Supply', icon:'📤', cols:['Direction','Material','Quantity','Store']},
  {id:'received', name:'Material Received', icon:'📥', cols:['Material','Quantity','Supplier']},
  {id:'petty', name:'Petty Cash', icon:'💰', cols:['Type','Amount','Reason']},
  {id:'bill', name:'Bill Tracker', icon:'🧾', cols:['Customer','Mobile','Vehicle','Treatment','Amount','Payment mode']},
  {id:'advance', name:'Advance Payment', icon:'💳', cols:['Name','Amount','Note']},
  {id:'fine', name:'Fine', icon:'⚠️', cols:['Name','Amount','Reason']},
  {id:'enquiry', name:'Enquiry', icon:'📞', cols:['Name','Vehicle','Treatment','Mobile no']}
];
const BUILT_IN = DEFAULTS.map(b => b.id);
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tidy = s => (s || '').replace(/\s+/g, ' ').trim();
const up = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const cap = s => tidy(s).replace(/\b\w/g, c => c.toUpperCase());

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.books) {
      d.rows = d.rows || {};
      if (d.v !== 2) {   // one-time update of older saved data: new columns and new books
        DEFAULTS.forEach(def => {
          const b = d.books.find(x => x.id === def.id);
          if (b) b.cols = def.cols; else d.books.push(JSON.parse(JSON.stringify(def)));
        });
        (d.rows.supply || []).forEach(r => {
          if (r.v['Sent to'] && !r.v.Store) r.v.Store = r.v['Sent to'];
          if (!r.v.Direction) r.v.Direction = 'Outward';
        });
        d.v = 2;
      }
      return d;
    }
  } catch (e) {}
  return {v: 2, books: JSON.parse(JSON.stringify(DEFAULTS)), rows: {}};
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
let db = load();

function addRow(bookId, v) {
  const now = new Date();
  (db.rows[bookId] = db.rows[bookId] || []).push({
    id: Date.now() + '' + Math.random(),
    date: now.toLocaleDateString('en-CA'),
    time: now.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}),
    v: v
  });
}

// ---------- Understanding the spoken text ----------
function labelParse(text) {
  const map = {'customer name':'Customer','customer':'Customer','name':'Customer','mobile number':'Mobile','mobile':'Mobile',
    'phone':'Mobile','vehicle':'Vehicle','treatment':'Treatment','amount':'Amount','payment mode':'Payment mode','payment':'Payment mode'};
  const parts = text.split(new RegExp('\\b(' + Object.keys(map).join('|') + ')\\b', 'i'));
  const out = {};
  for (let i = 1; i < parts.length; i += 2) {
    const key = map[parts[i].toLowerCase()];
    const val = (parts[i + 1] || '').replace(/^[\s:,-]+/, '').replace(/^(is|as)\s+/i, '').replace(/[\s,.]+$/, '');
    if (val && !out[key]) out[key] = val;
  }
  return out;
}

// finds the person's name: the words before the keyword, or after to/on/of...
function nameFor(text, kw, preps) {
  const filler = /\b(employee|the|staff|please|enter|entry|add|give|given|gave|paid|payment|rs|rupees|rupee|cash|of)\b|\d[\d,]*/gi;
  const before = tidy(text.split(new RegExp('\\b(?:' + kw + ')\\b', 'i'))[0].replace(filler, ' '));
  if (before) return cap(before);
  const m = text.match(new RegExp('\\b(?:' + preps + ')\\s+([a-z ]+?)(?=\\s*(?:\\d|rs\\b|rupees|for\\b|because\\b|$))', 'i'));
  return m ? cap(m[1]) : '';
}

function parse(text) {
  const t = text.toLowerCase(), out = [];
  const add = (id, v) => { const b = db.books.find(x => x.id === id); if (b) out.push({id:b.id, name:b.name, icon:b.icon, cols:b.cols, v:v}); };
  const tm = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\b/);
  const time = tm ? (+tm[1]) + ':' + (tm[2] || '00') + ' ' + tm[3].toUpperCase() + 'M' : '';
  const noPhone = t.replace(/\b\d{10}\b/g, ' ').replace(tm ? tm[0] : '', ' ');
  const amt = ((noPhone.match(/\d[\d,]*/) || [''])[0]).replace(/,/g, '');
  const isBill = /bill\s*tracker|billing/.test(t);
  const qm = text.match(/(\d+(?:\.\d+)?)\s*(rolls?|roles?|bottles?|pcs|pieces?|liters?|litres?|ltr|kgs?|boxes|box|packs?|cans?|nos)\b/i);
  const qty = qm ? qm[0] : '';
  const rest = tidy(qm ? text.replace(qm[0], ' ') : text);
  const stuff = qm || /material|stock|goods|roll|role|film|polish|liquid/.test(t);
  const isEnq = /\b(enquiry|inquiry|enquiries)\b/.test(t);
  const isSupply = !isEnq && /\b(inward|outward|dispatch\w*|transfer\w*|sent|send)\b/.test(t) && stuff;
  const matIn = !isSupply && !isEnq && /\b(got|received|receive)\b/.test(t) && stuff;
  let used = false;

  if (isBill) {
    const f = labelParse(text);
    const pm = t.match(/\b(cash|upi|gpay|google pay|phonepe|card|cheque|online|bank transfer)\b/);
    add('bill', {
      'Customer': cap(f.Customer || ''),
      'Mobile': (f.Mobile || (text.match(/\b\d{10}\b/) || [''])[0]).replace(/\D/g, ''),
      'Vehicle': cap(f.Vehicle || ''),
      'Treatment': up(f.Treatment || ''),
      'Amount': (f.Amount || '').replace(/[^\d.]/g, '') || amt,
      'Payment mode': f['Payment mode'] ? cap(f['Payment mode']) : (pm ? cap(pm[1]) : '')
    });
    used = true;
  }
  if (isEnq) {
    const f = labelParse(text);
    const phone = (f.Mobile || (text.match(/\b\d{10}\b/) || [''])[0]).replace(/\D/g, '');
    let name = f.Customer || '', veh = f.Vehicle || '', tr = f.Treatment || '';
    if (!name && !veh && !tr) {   // no labels spoken: read as name, vehicle, treatment
      const w = tidy(text.replace(/\b\d{10}\b/g, ' ').replace(/\b(enquiry|inquiry|enquiries|entry|do|in|for|of|the|new|a|mobile|number|no)\b/gi, ' ')).split(' ').filter(Boolean);
      name = w[0] || ''; veh = w[1] || ''; tr = w.slice(2).join(' ');
    }
    add('enquiry', {'Name': cap(name), 'Vehicle': cap(veh), 'Treatment': up(tr), 'Mobile no': phone});
    used = true;
  }
  if (isSupply) {
    const inward = /\binward\b/.test(t);
    const at = rest.search(inward ? /\b(?:from|form)\b/i : /\bto\b/i);
    const store = at >= 0 ? (rest.slice(at).match(/\b(?:from|form|to)\s+(?:the\s+)?(.+)$/i) || [])[1] : '';
    const mat = (at >= 0 ? rest.slice(0, at) : rest).replace(/\b(inward|outward|material|sent|send|dispatch\w*|transfer\w*|from|form|to|our|store|is|this|the|we|i|stock)\b/gi, ' ');
    add('supply', {'Direction': inward ? 'Inward' : 'Outward', 'Material': up(tidy(mat)), 'Quantity': qty, 'Store': cap(store || '')});
    used = true;
  }
  if (matIn) {
    const sup = tidy((rest.match(/\b(?:from|form)\s+(.+?)\s*$/i) || [])[1] || '');
    const mat = up(tidy(rest.split(/\b(?:from|form)\b/i)[0].replace(/\b(i|we|got|received|receive|some|the|new|material|stock)\b/gi, ' ').replace(/[()]/g, '')));
    add('received', {'Material': mat, 'Quantity': qty, 'Supplier': cap(sup)});
    if (sup) {
      const slug = 'sup-' + sup.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const ex = db.books.find(b => b.id === slug || b.name.toLowerCase() === sup.toLowerCase());
      const cols = ex ? ex.cols : ['Material', 'Quantity', 'Note'];
      out.push({id: ex ? ex.id : slug, name: ex ? ex.name : cap(sup), icon: ex ? ex.icon : '👤', cols: cols, isNew: !ex,
        v: cols.includes('Material') ? {'Material': mat, 'Quantity': qty, 'Note': 'Received'} : {'Entry': 'Received ' + qty + ' ' + mat}});
    }
    used = true;
  }
  const att = !used && t.match(/\bpunch(?:ed)?\s*(in|out)\b|\b(came|arrived|reached|left|absent|leave)\b/);
  if (att) {
    const w = att[0];
    const action = /absent|leave/.test(w) ? 'Absent / Leave' : /out|left/.test(w) ? 'Punch out' : 'Punch in';
    const emp = text.slice(0, att.index).replace(/\b(employee|the|staff|please|enter|entry)\b/gi, '');
    add('attendance', {'Employee': cap(emp), 'Action': action, 'Punch time': time});
    used = true;
  }
  const vm = !used && text.match(/^(.*?)\s+(in|out|delivered|ready)\s+for\s+(.+)$/i);
  if (vm && !/\d|cash/i.test(vm[1])) {
    add('vehicles', {
      'Vehicle': cap(vm[1].replace(/\b(vehicle|car|the)\b/gi, '')),
      'Treatment': up(tidy(vm[3])),
      'Status': {in:'In', out:'Out', delivered:'Delivered', ready:'Ready'}[vm[2].toLowerCase()]
    });
    used = true;
  }
  if (!used && /petty|pety|\b\d[\d,]*\s*(?:rs|rupees?)?\s*(?:cash\s*)?(?:in|out)\b|cash\s*(?:in|out)/.test(t)) {
    const type = /\bout\b|spent|paid|expense/.test(t) ? 'Out' : 'In';
    const reason = (text.match(/\b(?:for|of)\s+(.+)$/i) || [])[1] || '';
    add('petty', {'Type': type, 'Amount': amt, 'Reason': up(tidy(reason))});
    used = true;
  }
  if (/\badvance\b/.test(t) && !isBill) {
    add('advance', {'Name': nameFor(text, 'advance', 'to|for|of|from'), 'Amount': amt, 'Note': ''});
  }
  if (/\b(fine|penalty)\b/.test(t) && !isBill) {
    add('fine', {'Name': nameFor(text, 'fine|penalty', 'to|on|of|against'), 'Amount': amt,
      'Reason': up(tidy((text.match(/\b(?:for|because|due to)\s+(.+)$/i) || [])[1] || ''))});
  }
  // any book: match by its name or its own trigger words (editable in the Books tab)
  db.books.forEach(b => {
    if (b.id === 'daily' || out.some(o => o.id === b.id)) return;
    const keys = (b.id.indexOf('sup-') === 0 ? [] : [b.name.toLowerCase()]).concat(b.keys || []);
    if (!keys.some(k => k && t.includes(k))) return;
    const v = {}; b.cols.forEach(c => v[c] = c === 'Entry' ? text : '');
    out.push({id:b.id, name:b.name, icon:b.icon, cols:b.cols, v:v});
  });
  return out;
}

// ---------- Speak screen ----------
let pending = [];
function understand() {
  const text = $('#txt').value.trim();
  if (!text) { toast('Speak or type an entry first'); return; }
  pending = parse(text);
  let h = '<div class="card"><b>Check &amp; save</b><p class="mute" style="margin:2px 0">Daily Entry always gets a copy. Fix any field if the app heard it wrong.</p>';
  pending.forEach((p, i) => {
    h += '<div class="bk" data-i="' + i + '"><label class="bh"><input type="checkbox" checked><span>' + p.icon + ' ' + esc(p.name) + '</span>' +
      (p.isNew ? '<em>new book</em>' : '') + '</label><div class="fields">' +
      p.cols.map(c => '<label>' + esc(c) + '<input data-c="' + esc(c) + '" value="' + esc(p.v[c]) + '"></label>').join('') + '</div></div>';
  });
  if (!pending.length) h += '<p class="mute">No other book matched, so this will go to Daily Entry only. Try words like “bill tracker”, “petty cash”, “outward”, “punch in”.</p>';
  h += '<button class="btn" id="saveBtn">✅ Save entry</button></div>';
  $('#preview').innerHTML = h;
  $('#saveBtn').onclick = saveEntry;
}
function saveEntry() {
  const text = $('#txt').value.trim(), names = [];
  $('#preview').querySelectorAll('.bk').forEach(el => {
    if (!el.querySelector('input[type=checkbox]').checked) return;
    const p = pending[el.dataset.i], v = {};
    el.querySelectorAll('input[data-c]').forEach(i => v[i.dataset.c] = i.value.trim());
    if (!db.books.find(b => b.id === p.id)) db.books.push({id:p.id, name:p.name, icon:p.icon, cols:p.cols, keys:[]});
    addRow(p.id, v);
    names.push(p.name);
  });
  addRow('daily', {'Entry': text, 'Sent to books': names.join(', ')});
  save();
  $('#txt').value = ''; $('#preview').innerHTML = '';
  toast('Saved in ' + (names.length + 1) + ' book(s) ✔');
  renderRecent(); renderBooks();
}
function renderRecent() {
  const rows = (db.rows.daily || []).slice(-5).reverse();
  $('#recent').innerHTML = rows.length ? rows.map(r => '<li><span class="mute">' + esc(r.date) + ' ' + esc(r.time) + '</span><br>' +
    esc(r.v.Entry) + ' <span class="mute">→ ' + esc(r.v['Sent to books']) + '</span></li>').join('') : '<li class="mute">Nothing yet — your first entry will show here.</li>';
}

// ---------- Voice ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
function toggleMic() {
  if (!SR) { toast('Voice typing needs Chrome or Edge. You can still type the entry.'); return; }
  if (listening) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'en-IN'; rec.interimResults = true; rec.continuous = false;
  const base = $('#txt').value.trim();
  rec.onstart = () => { listening = true; $('#mic').classList.add('live'); $('#micHint').textContent = 'Listening… tap to stop'; };
  rec.onresult = e => {
    let s = ''; for (const r of e.results) s += r[0].transcript;
    $('#txt').value = (base ? base + ' ' : '') + s;
  };
  rec.onerror = e => toast(e.error === 'not-allowed' ? 'Microphone is blocked — allow mic access, or open this page directly in Chrome' : 'Voice error: ' + e.error);
  rec.onend = () => {
    listening = false; $('#mic').classList.remove('live'); $('#micHint').textContent = 'Tap the mic and speak your entry';
    if ($('#txt').value.trim()) understand();
  };
  try { rec.start(); } catch (e) {}
}

// ---------- Books screen ----------
let sel = 'daily', newestFirst = true, lastShown = [];
function renderBooks() {
  if (!db.books.find(b => b.id === sel)) sel = 'daily';
  $('#bookChips').innerHTML = db.books.map(b => '<button class="chip ' + (b.id === sel ? 'on' : '') + '" data-b="' + esc(b.id) + '">' +
    b.icon + ' ' + esc(b.name) + '<small>' + (db.rows[b.id] || []).length + '</small></button>').join('');
  const b = db.books.find(x => x.id === sel);
  const q = $('#q').value.toLowerCase(), from = $('#from').value, to = $('#to').value;
  let rows = (db.rows[b.id] || []).filter(r =>
    (!from || r.date >= from) && (!to || r.date <= to) && (!q || JSON.stringify(r.v).toLowerCase().includes(q)));
  if (newestFirst) rows = rows.slice().reverse();
  lastShown = rows;
  $('#sort').textContent = newestFirst ? 'Newest first ↓' : 'Oldest first ↑';
  $('#tbl').innerHTML = rows.length
    ? '<table><thead><tr><th>Date</th><th>Time</th>' + b.cols.map(c => '<th>' + esc(c) + '</th>').join('') + '<th></th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.time) + '</td>' + b.cols.map(c => '<td contenteditable="true" data-r="' + esc(r.id) + '" data-c="' + esc(c) + '">' + esc(r.v[c]) + '</td>').join('') +
        '<td><button class="del" data-d="' + esc(r.id) + '" title="Delete">🗑</button></td></tr>').join('') + '</tbody></table>'
    : '<p class="mute" style="padding:14px">No entries to show.</p>';
  renderManage();
}
function deleteRow(id) {
  const list = db.rows[sel] || [], idx = list.findIndex(r => r.id === id);
  if (idx < 0) return;
  const removed = list.splice(idx, 1)[0];
  save(); renderBooks();
  toast('Entry deleted', () => { list.splice(idx, 0, removed); save(); renderBooks(); });
}
function copyTable() {
  const b = db.books.find(x => x.id === sel);
  const text = ['Date', 'Time'].concat(b.cols).join('\t') + '\n' +
    lastShown.map(r => [r.date, r.time].concat(b.cols.map(c => r.v[c] || '')).join('\t')).join('\n');
  const done = () => toast('Copied — paste into Excel or Google Sheets');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  function fallback() {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Copy not allowed in this browser'); }
    ta.remove();
  }
}
function addBook() {
  const name = tidy($('#nbName').value);
  if (!name) { toast('Give the book a name'); return; }
  const id = 'b-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (db.books.find(b => b.id === id)) { toast('That book already exists'); return; }
  db.books.push({id:id, name:name, icon:'📘', cols:['Entry'], keys:$('#nbKeys').value.toLowerCase().split(',').map(tidy).filter(Boolean)});
  $('#nbName').value = ''; $('#nbKeys').value = '';
  save(); sel = id; renderBooks(); toast('Book added ✔');
}

// ---------- Small helpers ----------
let toastTimer;
function toast(msg, undo) {
  const el = $('#toast'); el.textContent = msg; el.style.display = 'block';
  if (undo) { const b = document.createElement('button'); b.textContent = 'Undo'; b.onclick = () => { undo(); el.style.display = 'none'; }; el.appendChild(b); }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.style.display = 'none', undo ? 5000 : 3000);
}
function showTab(name) {
  $('#viewSpeak').classList.toggle('hide', name !== 'speak');
  $('#viewBooks').classList.toggle('hide', name !== 'books');
  $('#tabSpeak').classList.toggle('on', name === 'speak');
  $('#tabBooks').classList.toggle('on', name === 'books');
  if (name === 'books') renderBooks();
}

// ---------- Wire up ----------
$('#mic').onclick = toggleMic;
$('#understand').onclick = understand;
$('#clear').onclick = () => { $('#txt').value = ''; $('#preview').innerHTML = ''; };
$('#tabSpeak').onclick = () => showTab('speak');
$('#tabBooks').onclick = () => showTab('books');
$('#bookChips').onclick = e => { const b = e.target.closest('[data-b]'); if (b) { sel = b.dataset.b; renderBooks(); } };
$('#tbl').onclick = e => { const d = e.target.closest('[data-d]'); if (d) deleteRow(d.dataset.d); };
['#q', '#from', '#to'].forEach(s => $(s).oninput = renderBooks);
$('#sort').onclick = () => { newestFirst = !newestFirst; renderBooks(); };
$('#copy').onclick = copyTable;
$('#nbAdd').onclick = addBook;
['Dinesh punch in at 9:00 am', 'Fortuner in for graphene', 'Ppf 2 roll outward to Wakad store', '199 out for snacks',
 '1000 cash in petty cash of 2 vehicle wash sale', 'Ppf 50 gloss 1 roll received from Hakkim',
 'Glass polish inward from SB Road 1 bottle', 'Vishal advance payment 500', 'Tofik fine 200 for late',
 'Enquiry name Rahul vehicle Creta treatment ceramic mobile 9876543210',
 'Do entry in bill tracker customer name Rahul mobile 9876543210 vehicle Creta treatment ceramic amount 15000 payment UPI'
].forEach(s => {
  const b = document.createElement('button'); b.className = 'chip'; b.textContent = s.length > 38 ? s.slice(0, 36) + '…' : s;
  b.onclick = () => { $('#txt').value = s; understand(); };
  $('#examples').appendChild(b);
});
// ---------- Manage a book: rename, trigger words, columns, delete ----------
const cur = () => db.books.find(b => b.id === sel);
function renderManage() {
  const b = cur(); b.keys = b.keys || [];
  const words = b.keys.map((w, i) => '<button class="chip" data-kd="' + i + '" title="Remove this word">' + esc(w) + ' ✕</button>').join('') ||
    '<span class="mute">No extra words yet.</span>';
  const cols = b.cols.map(c => '<span class="chip">' + esc(c) + '</span>').join('');
  $('#manage').innerHTML = '<b>⚙️ Manage this book</b>' +
    '<div class="tools" style="grid-template-columns:1fr 70px auto"><input id="mName" value="' + esc(b.name) + '" aria-label="Book name"><input id="mIcon" value="' + esc(b.icon) + '" aria-label="Icon"><button class="btn" id="mSave">Save</button></div>' +
    '<p class="mute" style="margin:14px 0 6px">Trigger words: when an entry contains any of these, it is also filed in this book.</p><div class="chips">' + words + '</div>' +
    '<div class="tools" style="grid-template-columns:1fr auto"><input id="mWord" placeholder="Add words (comma separated)"><button class="btn" id="mAddWord">Add</button></div>' +
    '<p class="mute" style="margin:14px 0 6px">Columns:</p><div class="chips">' + cols + '</div>' +
    '<div class="tools" style="grid-template-columns:1fr auto"><input id="mCol" placeholder="New column name"><button class="btn" id="mAddCol">Add column</button></div>' +
    (b.id !== 'daily' ? '<div class="row"><button class="btn alt" id="mDel" style="color:var(--danger)">🗑 Delete this book</button></div>' : '');
}
$('#manage').onclick = e => {
  const b = cur(); b.keys = b.keys || [];
  const kd = e.target.closest('[data-kd]');
  if (kd) { b.keys.splice(+kd.dataset.kd, 1); save(); renderBooks(); return; }
  const btn = e.target.closest('button'); if (!btn) return;
  if (btn.id === 'mSave') {
    const name = tidy($('#mName').value);
    if (!name) { toast('Name can’t be empty'); return; }
    if (db.books.some(x => x.id !== b.id && x.name.toLowerCase() === name.toLowerCase())) { toast('Another book already has that name'); return; }
    b.name = name; b.icon = tidy($('#mIcon').value) || b.icon;
    save(); renderBooks(); toast('Book updated ✔');
  } else if (btn.id === 'mAddWord') {
    $('#mWord').value.toLowerCase().split(',').map(tidy).filter(Boolean).forEach(w => { if (!b.keys.includes(w)) b.keys.push(w); });
    save(); renderBooks();
  } else if (btn.id === 'mAddCol') {
    const c = tidy($('#mCol').value);
    if (!c) return;
    if (b.cols.some(x => x.toLowerCase() === c.toLowerCase())) { toast('That column already exists'); return; }
    b.cols.push(c); save(); renderBooks(); toast('Column added ✔');
  } else if (btn.id === 'mDel') {
    const idx = db.books.indexOf(b), rows = db.rows[b.id];
    db.books.splice(idx, 1); delete db.rows[b.id]; sel = 'daily';
    save(); renderBooks();
    toast('Book deleted', () => { db.books.splice(idx, 0, b); if (rows) db.rows[b.id] = rows; sel = b.id; save(); renderBooks(); });
  }
};
// edit any cell directly in the table
$('#tbl').addEventListener('focusout', e => {
  const td = e.target.closest('td[data-r]'); if (!td) return;
  const row = (db.rows[sel] || []).find(r => r.id === td.dataset.r);
  if (row) { row.v[td.dataset.c] = td.textContent.trim(); save(); }
});
$('#tbl').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('td[data-r]')) { e.preventDefault(); e.target.blur(); }
});

renderRecent(); renderBooks();
