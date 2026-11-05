// Cloudflare Worker: a small private "helper" that lets the Entry Book understand normal language.
// It uses Cloudflare's own free AI (Workers AI), so there is NO API key and NO payment needed.
//
// Setup in Cloudflare:
//   1. Settings -> Bindings -> Add -> Workers AI, variable name:  AI
//   2. Settings -> Variables and Secrets -> add
//        APP_TOKEN       (Secret) any access code you invent; type the same code in the app
//        ALLOWED_ORIGIN  (Text)   e.g. https://your-username.github.io   (recommended)

const GUIDE = `You are the data-entry assistant for 3M Car Care Studio, a car detailing and paint protection business in Pune, India.
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

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {status, headers: {...cors, 'Content-Type': 'application/json'}});

    if (request.method === 'OPTIONS') return new Response(null, {headers: cors});
    if (request.method !== 'POST') return reply({error: 'POST only'}, 405);
    if (env.APP_TOKEN && request.headers.get('X-App-Token') !== env.APP_TOKEN) return reply({error: 'Wrong access code'}, 401);

    let body;
    try { body = await request.json(); } catch (e) { return reply({error: 'Bad request'}, 400); }
    const text = String(body.text || '').slice(0, 1000);
    if (!text) return reply({error: 'No text'}, 400);
    const books = (Array.isArray(body.books) ? body.books : []).slice(0, 60);

    let result;
    try {
      result = await env.AI.run(env.MODEL || '@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {role: 'system', content: GUIDE},
          {role: 'user', content: JSON.stringify({entry: text, books: books})}
        ],
        max_tokens: 700,
        temperature: 0
      });
    } catch (e) {
      return reply({error: 'AI busy, or today\u2019s free limit is used up'}, 503);
    }

    let out = result && result.response;
    try {
      if (typeof out === 'string') out = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
      return reply({entries: out && Array.isArray(out.entries) ? out.entries : []});
    } catch (e) {
      return reply({error: 'AI reply was not understood'}, 502);
    }
  }
};
