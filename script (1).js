// ---------- Data ----------
const KEY = '3m-entry-book-v1';
const DEFAULTS = [
  {id:'daily', name:'Daily Entry', icon:'📒', cols:['Entry','Sent to books']},
  {id:'attendance', name:'Attendance', icon:'🕘', cols:['Employee','Action','Punch time']},
  {id:'vehicles', name:'Vehicles', icon:'🚗', cols:['Vehicle','Treatment','Status']},
  {id:'supply', name:'Material Supply', icon:'📤', cols:['Material','Quantity','Store']},
  {id:'received', name:'Material Received', icon:'📥', cols:['Material','Quantity','Supplier']},
  {id:'petty', name:'Petty Cash', icon:'💰', cols:['Name','Type','Amount','Reason']},
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
      if (!d.v) {   // one-time update of older saved data: new columns and new books
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
      if ((d.v || 0) < 3) {   // v3: Name column in Petty Cash, no Direction in Material Supply
        const pc = d.books.find(x => x.id === 'petty'), sp = d.books.find(x => x.id === 'supply');
        if (pc && !pc.cols.includes('Name')) pc.cols.unshift('Name');
        if (sp) sp.cols = sp.cols.filter(c => c !== 'Direction');
        d.v = 3;
      }
      return d;
    }
  } catch (e) {}
  return {v: 3, books: JSON.parse(JSON.stringify(DEFAULTS)), rows: {}};
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
// Columns can be renamed, so values are matched through the column's original name
function origName(b, c) { return (b.map && b.map[c]) || c; }
function fit(b, v) {
  const o = {};
  b.cols.forEach(c => { const x = v[origName(b, c)]; o[c] = x == null ? '' : x; });
  return o;
}

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
  const add = (id, v) => { const b = db.books.find(x => x.id === id); if (b) out.push({id:b.id, name:b.name, icon:b.icon, cols:b.cols, v:fit(b, v)}); };
  const tm = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\b/);
  const time = tm ? (+tm[1]) + ':' + (tm[2] || '00') + ' ' + tm[3].toUpperCase() + 'M' : '';
  const noPhone = t.replace(/\b\d{10}\b/g, ' ').replace(tm ? tm[0] : '', ' ');
  const amt = ((noPhone.match(/\d[\d,]*/) || [''])[0]).replace(/,/g, '');
  const isBill = /bill\s*tracker|billing/.test(t);
  const NUM = {one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10};
  const qm = text.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(rolls?|roles?|bottles?|pcs|pieces?|liters?|litres?|ltr|kgs?|boxes|box|packs?|cans?|nos)\b/i);
  const qty = qm ? (NUM[qm[1].toLowerCase()] || qm[1]) + ' ' + qm[2] : '';
  const rest = tidy(qm ? text.replace(qm[0], ' ') : text);
  const stuff = qm || /material|stock|goods|roll|role|film|polish|liquid/.test(t);
  const isEnq = /\b(enquiry|inquiry|enquiries)\b/.test(t);
  const isSupply = !isEnq && /\b(inward|outward|dispatch\w*|transfer\w*|sent|send)\b/.test(t) && (stuff || /\b(inward|outward)\b/.test(t));
  const matIn = !isSupply && !isEnq && ((/\b(got|received|receive)\b/.test(t) && stuff) || (qm && /\b(from|form)\b/.test(t)));
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
    const mat = (at >= 0 ? rest.slice(0, at) : rest).replace(/\b(inward|outward|material|sent|send|dispatch\w*|transfer\w*|from|form|to|our|store|is|this|the|we|i|a|an|stock)\b/gi, ' ');
    add('supply', {'Material': up(tidy(mat)), 'Quantity': qty, 'Store': cap(store || '')});
    used = true;
  }
  if (matIn) {
    const sup = tidy((rest.match(/\b(?:from|form)\s+(.+?)\s*$/i) || [])[1] || '');
    const mat = up(tidy(rest.split(/\b(?:from|form)\b/i)[0].replace(/\b(i|we|got|received|receive|some|the|new|material|stock)\b/gi, ' ').replace(/[()]/g, '')));
    add('received', {'Material': mat, 'Quantity': qty, 'Supplier': cap(sup)});
    if (sup) {
      const slug = 'sup-' + sup.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const ex = db.books.find(b => b.id === slug || b.name.toLowerCase() === sup.toLowerCase());
      const book = ex || {cols: ['Material', 'Quantity', 'Note']};
      out.push({id: ex ? ex.id : slug, name: ex ? ex.name : cap(sup), icon: ex ? ex.icon : '👤', cols: book.cols, isNew: !ex,
        v: fit(book, {'Material': mat, 'Quantity': qty, 'Note': 'Received', 'Entry': 'Received ' + qty + ' ' + mat})});
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
    const type = /\bout\b|spent|paid|expense|\bgave\b|\bgiven\b/.test(t) ? 'Out' : 'In';
    const reason = (text.match(/\b(?:for|of|because(?: of)?)\s+(.+)$/i) || [])[1] || '';
    const first = text.search(/\bcash\s*(?:in|out)\b|\b(?:rs\.?|rupees?)?\s*\d/i);
    let who = tidy((first > 0 ? text.slice(0, first) : '').replace(/\b(petty|pety|cash|entry|add|do|in|out|rs|rupees?)\b/gi, ' ').replace(/[,.]/g, ' '));
    if (!who) who = (text.match(/\b(?:to|by|from)\s+([a-z ]+?)(?=\s*(?:for\b|because\b|\d|$))/i) || [])[1] || '';
    add('petty', {'Name': cap(who), 'Type': type, 'Amount': amt, 'Reason': up(tidy(reason))});
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
    out.push({id:b.id, name:b.name, icon:b.icon, cols:b.cols, v:fit(b, {'Entry': text})});
  });
  return out;
}

// ---------- Optional AI understanding (needs the helper from worker.js) ----------
let AI = {mode: 'gemini', url: '', token: '', key: '', model: 'gemini-3.8-flash'};
try {
  const saved = JSON.parse(localStorage.getItem(KEY + '-ai')) || {};
  if (saved.model === 'gemini-2.5-flash') delete saved.model;   // that model was retired
  if (!saved.mode && saved.url) saved.mode = 'worker';   // settings saved by an older version
  AI = Object.assign(AI, saved);
} catch (e) {}
const aiOn = () => AI.mode === 'gemini' ? !!AI.key : AI.mode === 'worker' ? !!AI.url : false;

// Instructions given to the AI (the Cloudflare helper has the same copy)
const AI_GUIDE = `You are the data-entry assistant for 3M Car Care Studio, a car detailing and paint protection business in Pune, India.
The owner dictates entries in everyday English or Hinglish. The text comes from speech-to-text, so it can have mistakes.
Decide which books the entry belongs to and fill in each book's columns.

Input JSON: {"entry": "<what the owner said>", "books": [{"id","name","cols":[column names],"words":[trigger words]}]}
Reply with ONLY this JSON and nothing else: {"entries":[{"book":"<book id>","values":{"<column name>":"<value>"}}]}

Rules:
- Use only the book ids and exact column names given. Never include the Daily Entry book; the app adds it.
- One entry can belong to several books. If nothing fits, reply {"entries":[]}.
- Leave a value as "" if it was not said. Never invent details.
- Fix obvious speech mistakes when confident (PPA/CPA/PPE -> PPF, "form" -> "from", "role" -> "roll").
- Names and vehicles in Title Case. Amounts: digits only. Times like 9:00 AM. Mobile: digits only.
- Quantity includes the unit, like "1 roll" or "2 bottles".

Standard books (by id):
- attendance: staff punch in / punch out / absent. Employee, Action (Punch in, Punch out, Absent / Leave), Punch time.
- vehicles: a customer vehicle coming in or going out for a treatment. Vehicle, Treatment, Status (In, Out, Delivered, Ready).
- supply: material moved between our own stores ("inward from <store>" or "outward to <store>"). Material, Quantity, Store (the other store).
- received: material received from a supplier. Material, Quantity, Supplier. ALSO add a second entry for the supplier's own book: id "sup-<supplier name, lowercase, hyphens>", a "name" field with the supplier name, values Material, Quantity, Note="Received". If that supplier's book is already in the list, use its id.
- petty: small cash paid out or taken in. Name (the person), Type (In or Out), Amount, Reason.
- bill: customer bill. Customer, Mobile, Vehicle, Treatment, Amount, Payment mode.
- advance: advance money to an employee. Name, Amount, Note.
- fine: fine charged to an employee. Name, Amount, Reason.
- enquiry: customer enquiry. Name, Vehicle, Treatment, Mobile no.
- Books made by the owner: decide from the book name and its trigger words.

Examples (assuming those books and columns):
"saurabh sir cash out rupees 500 for uber" -> {"entries":[{"book":"petty","values":{"Name":"Saurabh Sir","Type":"Out","Amount":"500","Reason":"Uber"}}]}
"ppa 50 gloss one roll received form hakim" -> {"entries":[{"book":"received","values":{"Material":"PPF 50 gloss","Quantity":"1 roll","Supplier":"Hakim"}},{"book":"sup-hakim","name":"Hakim","values":{"Material":"PPF 50 gloss","Quantity":"1 roll","Note":"Received"}}]}
"apc one bottle inward from sb road store" -> {"entries":[{"book":"supply","values":{"Material":"APC","Quantity":"1 bottle","Store":"SB Road Store"}}]}
"dinesh came at nine thirty" -> {"entries":[{"book":"attendance","values":{"Employee":"Dinesh","Action":"Punch in","Punch time":"9:30 AM"}}]}`;

// Google Gemini, called straight from the browser with your own free key
async function geminiCall(text, books) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(AI.model || 'gemini-3.8-flash') + ':generateContent', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': AI.key},
    body: JSON.stringify({
      systemInstruction: {parts: [{text: AI_GUIDE}]},
      contents: [{role: 'user', parts: [{text: JSON.stringify({entry: text, books: books})}]}],
      generationConfig: {temperature: 0, responseMimeType: 'application/json'}
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + r.status));
  const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const raw = parts.map(p => p.text || '').join('');
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
}

async function aiParse(text) {
  const books = db.books.filter(b => b.id !== 'daily').map(b => ({id: b.id, name: b.name, cols: b.cols, words: b.keys || []}));
  let d;
  if (AI.mode === 'gemini') d = await geminiCall(text, books);
  else {
    const r = await fetch(AI.url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-App-Token': AI.token},
      body: JSON.stringify({text: text, books: books})
    });
    d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
  }
  const out = [];
  (d.entries || []).forEach(e => {
    if (!e || !e.book || out.some(o => o.id === e.book)) return;
    let b = db.books.find(x => x.id === e.book), isNew = false;
    if (!b && /^sup-/.test(e.book)) {   // a new supplier's own book
      b = {id: e.book, name: cap(e.name || e.book.slice(4).replace(/-/g, ' ')), icon: '👤', cols: ['Material', 'Quantity', 'Note']};
      isNew = true;
    }
    if (!b) return;
    const v = {};
    b.cols.forEach(c => v[c] = String((e.values || {})[c] == null ? '' : e.values[c]));
    out.push({id: b.id, name: b.name, icon: b.icon, cols: b.cols, v: v, isNew: isNew});
  });
  return out;
}

// ---------- Speak screen ----------
let pending = [];
async function understand() {
  const text = $('#txt').value.trim();
  if (!text) { toast('Speak or type an entry first'); return; }
  let ai = false;
  pending = null;
  if (aiOn()) {
    $('#micHint').textContent = '🤖 Understanding…';
    try { pending = await aiParse(text); ai = true; }
    catch (e) { toast('AI not available (' + e.message + ') — used basic matching'); }
    $('#micHint').textContent = 'Tap the mic and speak';
  }
  if (!pending) pending = parse(text);
  let h = '<div class="card"><b>Check &amp; save' + (ai ? ' 🤖' : '') + '</b><p class="mute" style="margin:2px 0">Daily Entry always gets a copy. Fix any field if the app heard it wrong.</p>';
  pending.forEach((p, i) => {
    h += '<div class="bk" data-i="' + i + '"><label class="bh"><input type="checkbox" checked><span>' + p.icon + ' ' + esc(p.name) + '</span>' +
      (p.isNew ? '<em>new book</em>' : '') + '</label><div class="fields">' +
      p.cols.map(c => '<label>' + esc(c) + '<input data-c="' + esc(c) + '" value="' + esc(p.v[c]) + '"></label>').join('') + '</div></div>';
  });
  if (!pending.length) h += '<p class="mute">No other book matched, so this will go to Daily Entry only. Try words like “bill tracker”, “petty cash”, “outward”, “punch in”.</p>';
  h += '<div class="savebar"><button class="btn" id="saveBtn">✅ Save entry</button></div></div>';
  $('#preview').innerHTML = h;
  $('#saveBtn').onclick = saveEntry;
  $('#preview').scrollIntoView({block: 'nearest', behavior: 'smooth'});
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
  const dBook = db.books.find(b => b.id === 'daily');
  if (dBook) addRow('daily', fit(dBook, {'Entry': text, 'Sent to books': names.join(', ')}));
  save();
  $('#txt').value = ''; $('#preview').innerHTML = '';
  toast('Saved in ' + (names.length + 1) + ' book(s) ✔');
  renderRecent(); renderBooks();
}
function renderRecent() {
  const rows = (db.rows.daily || []).slice(-5).reverse();
  const dc = (db.books.find(b => b.id === 'daily') || {cols: []}).cols, c1 = dc[0], c2 = dc[1];
  $('#recent').innerHTML = rows.length ? rows.map(r => '<li><span class="mute">' + esc(r.date) + ' ' + esc(r.time) + '</span><br>' +
    esc(r.v[c1]) + ' <span class="mute">→ ' + esc(r.v[c2]) + '</span></li>').join('') : '<li class="mute">Nothing yet — your first entry will show here.</li>';
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
  if (!db.books.find(b => b.id === sel) && db.books.length) sel = db.books[0].id;
  $('#bookChips').innerHTML = db.books.map(b => '<button class="chip ' + (b.id === sel ? 'on' : '') + '" data-b="' + esc(b.id) + '">' +
    b.icon + ' ' + esc(b.name) + '<small>' + (db.rows[b.id] || []).length + '</small></button>').join('');
  const b = db.books.find(x => x.id === sel);
  if (!b) { $('#tbl').innerHTML = '<p class="mute" style="padding:14px">No books yet — add one below.</p>'; $('#manage').innerHTML = ''; return; }
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
  if (!b) return;
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
// ---------- Manage a book: rename, trigger words, columns, delete ----------
const cur = () => db.books.find(b => b.id === sel);
function renderManage() {
  const b = cur(); b.keys = b.keys || [];
  const words = b.keys.map((w, i) => '<button class="chip" data-kd="' + i + '" title="Remove this word">' + esc(w) + ' ✕</button>').join('') ||
    '<span class="mute">No extra words yet.</span>';
  const cols = b.cols.map((c, i) => '<div class="colrow"><input data-ci="' + i + '" value="' + esc(c) + '" aria-label="Column name"><button class="btn alt" data-cd="' + i + '" title="Delete column">✕</button></div>').join('');
  $('#manage').innerHTML = '<b>⚙️ Manage this book</b>' +
    '<div class="tools" style="grid-template-columns:1fr 70px auto"><input id="mName" value="' + esc(b.name) + '" aria-label="Book name"><input id="mIcon" value="' + esc(b.icon) + '" aria-label="Icon"><button class="btn" id="mSave">Save</button></div>' +
    '<p class="mute" style="margin:14px 0 6px">Trigger words: when an entry contains any of these, it is also filed in this book.</p><div class="chips">' + words + '</div>' +
    '<div class="tools" style="grid-template-columns:1fr auto"><input id="mWord" placeholder="Add words (comma separated)"><button class="btn" id="mAddWord">Add</button></div>' +
    '<p class="mute" style="margin:14px 0 6px">Columns (rename or delete):</p>' + cols +
    '<div class="tools" style="grid-template-columns:1fr auto"><input id="mCol" placeholder="New column name"><button class="btn" id="mAddCol">Add column</button></div>' +
    '<div class="row"><button class="btn alt" id="mDel" style="color:var(--danger)">🗑 Delete this book</button></div>';
}
$('#manage').onclick = e => {
  const b = cur(); if (!b) return;
  b.keys = b.keys || [];
  const cd = e.target.closest('[data-cd]');
  if (cd) {
    if (b.cols.length <= 1) { toast('A book needs at least one column'); return; }
    b.cols.splice(+cd.dataset.cd, 1); save(); renderBooks(); return;
  }
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
$('#manage').addEventListener('change', e => {
  const inp = e.target.closest('input[data-ci]'), b = cur();
  if (!inp || !b) return;
  const i = +inp.dataset.ci, old = b.cols[i], nu = tidy(inp.value);
  if (!nu || (nu !== old && b.cols.some(c => c.toLowerCase() === nu.toLowerCase()))) { toast('Column name is empty or already used'); renderBooks(); return; }
  if (nu === old) return;
  b.map = b.map || {}; b.map[nu] = origName(b, old); delete b.map[old];
  b.cols[i] = nu;
  (db.rows[b.id] || []).forEach(r => { if (old in r.v) { r.v[nu] = r.v[old]; delete r.v[old]; } });
  save(); renderBooks(); toast('Column renamed ✔');
});
function syncAiUi() {
  const m = $('#aiMode').value;
  $('#aiGem').classList.toggle('hide', m !== 'gemini');
  $('#aiWrk').classList.toggle('hide', m !== 'worker');
}
$('#aiMode').value = AI.mode; $('#aiKey').value = AI.key; $('#aiModel').value = AI.model;
$('#aiUrl').value = AI.url; $('#aiToken').value = AI.token;
syncAiUi();
$('#aiMode').onchange = syncAiUi;
$('#aiSave').onclick = async () => {
  AI = {mode: $('#aiMode').value, key: tidy($('#aiKey').value), model: tidy($('#aiModel').value) || 'gemini-3.8-flash',
        url: tidy($('#aiUrl').value), token: tidy($('#aiToken').value)};
  try { localStorage.setItem(KEY + '-ai', JSON.stringify(AI)); } catch (e) {}
  if (!aiOn()) { $('#aiStatus').textContent = 'AI is off — basic matching is used.'; return; }
  $('#aiStatus').textContent = 'Testing…';
  try {
    const r = await aiParse('Dinesh came at nine thirty in the morning');
    $('#aiStatus').textContent = r.length ? 'Connected ✔ — AI is on. Try speaking normally.' : 'Connected, but the test entry was not understood.';
  } catch (e) { $('#aiStatus').textContent = 'Could not connect: ' + e.message; }
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
