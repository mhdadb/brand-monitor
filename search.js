// جست‌وجو، فیلتر، بررسی صفحه و تحلیل لحن — همه در GitHub؛ فقط نتیجه‌ی نهایی به n8n می‌رود
const fs = require('fs');
const jobs = require('./jobs.json');
const { names, shortNames } = require('./names.json');
const env = process.env;
const BASE = 'http://localhost:8080';
const TG_CHANNELS = (env.TG_CHANNELS || '').split(',').map(s => s.trim().replace(/^@/,'')).filter(Boolean);
const LLM_URL = env.LLM_BASE_URL || 'https://openrouter.ai/api/v1';
const LLM_MODEL = env.LLM_MODEL || 'openrouter/free';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const host = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return 'web'; } };
const pool = async (items, n, fn) => { const q=[...items]; await Promise.all(Array.from({length:n}, async()=>{ while(q.length) await fn(q.shift()); })); };
const UA = { 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36' };
const stats = { _stats:true, searxOk:0, searxFail:0, serperUsed:0, jobs:jobs.length };

// ---------- ۱) جست‌وجو ----------
const raw = [];
async function searx(q, categories, pageno) {
  const u = new URL(BASE + '/search');
  Object.entries({ q, format:'json', categories, pageno, language:'all', safesearch:0 }).forEach(([k,v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(r.status);
  return (await r.json()).results || [];
}
async function serper(q) {
  const r = await fetch('https://google.serper.dev/search', { method:'POST', headers:{ 'X-API-KEY':env.SERPER_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({ q, gl:'ir', hl:'fa', num:10 }) });
  return ((await r.json()).organic || []).map(x => ({ url:x.link, title:x.title, content:x.snippet, publishedDate:x.date, engines:['serper(google)'] }));
}
async function runJob(job) {
  for (let p = 1; p <= job.pages; p++) {
    let res = [];
    try { res = await searx(job.q, job.categories, p); stats.searxOk++; } catch (e) { stats.searxFail++; }
    if (!res.length && p === 1 && env.SERPER_KEY && job.categories === 'general') { try { res = await serper(job.q); stats.serperUsed++; } catch (e) {} }
    for (const x of res) if (x.url) raw.push({ source:host(x.url), channel:'search:'+job.categories, engines:(x.engines||[x.engine]).filter(Boolean).join(', '),
      query:job.q, title:x.title||'', text:x.content||'', url:x.url, date:x.publishedDate||'' });
    await sleep(1500);
    if (res.length < 5) break;
  }
}
const decode = s => s.replace(/<br\s*\/?>/g,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
async function telegram() {
  for (const ch of TG_CHANNELS) for (const n of shortNames) {
    try {
      const html = await (await fetch(`https://t.me/s/${ch}?q=${encodeURIComponent(n)}`, { headers:UA, signal:AbortSignal.timeout(20000) })).text();
      for (const block of html.split('tgme_widget_message_wrap').slice(1)) {
        const post = (block.match(/data-post="([^"]+)"/)||[])[1], txt = (block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)||[])[1], dt = (block.match(/datetime="([^"]+)"/)||[])[1];
        if (post && txt) raw.push({ source:'telegram/'+ch, channel:'telegram', engines:'t.me', query:n, title:'', text:decode(txt).slice(0,1500), url:'https://t.me/'+post, date:dt||'' });
      }
    } catch (e) {}
    await sleep(800);
  }
}
async function aparat() {
  for (const n of shortNames) {
    try {
      const r = await (await fetch(`https://www.aparat.com/etc/api/videoBySearch/text/${encodeURIComponent(n)}/perpage/50`, { headers:UA, signal:AbortSignal.timeout(20000) })).json();
      for (const v of r.videobysearch || []) raw.push({ source:'aparat', channel:'aparat', engines:'aparat api', query:n, title:v.title||'', text:(v.description||'')+' — '+(v.sender_name||v.username||''), url:'https://www.aparat.com/v/'+v.uid, date:v.sdate||v.create_date||'' });
    } catch (e) {}
  }
}

// ---------- ۲) فیلتر نام برند (سریع) ----------
const norm = s => String(s||'').toLowerCase().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[ۀة]/g,'ه').replace(/[أإآ]/g,'ا').replace(/[ً-ْ]/g,'').replace(/[\s‌‏\-_.\/@#]+/g,'');
const exact = [...new Set(names.map(norm))].filter(v => v.length >= 7);
const cores = ['behzadecom','بهزادایکام','بهزاداکام','بهزادکام','بهزادیکام'];
const lev = (a,b) => { let prev=Array.from({length:b.length+1},(_,i)=>i); for (let i=1;i<=a.length;i++){ const cur=[i]; for (let j=1;j<=b.length;j++) cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1)); prev=cur; } return prev[b.length]; };
function matches(text) {
  const t = norm(text);
  if (exact.some(v => t.includes(v))) return true;
  // فقط اطراف جاهایی که شبیه شروع نام است بررسی تقریبی می‌شود
  for (const anchor of ['بهز','بهر','بز','beh','bhz','bez','bahz']) {
    let i = t.indexOf(anchor);
    while (i !== -1) {
      for (const core of cores) { const L = core.length, tol = L > 8 ? 2 : 1;
        for (let w = L-1; w <= L+1; w++) if (lev(core, t.slice(i, i+w)) <= tol) return true; }
      i = t.indexOf(anchor, i + 1);
    }
  }
  return false;
}

// ---------- ۳) ادغام، فیلتر و بررسی خود صفحه ----------
const seenFile = 'cache/seen.json';
const seen = new Set(fs.existsSync(seenFile) ? JSON.parse(fs.readFileSync(seenFile,'utf8')) : []);
const strip = h => String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const metaDate = h => (String(h).match(/(?:article:published_time|datePublished|og:updated_time|pubdate)["']?\s*(?:content=|:)\s*["']([^"']{8,30})/i)||[])[1] || '';
const around = t => { for (const k of ['بهزاد','behzad']) { const i = t.toLowerCase().indexOf(k); if (i >= 0) return t.slice(Math.max(0,i-300), i+500).trim(); } return t.slice(0,600); };

async function main() {
  const queue = [...jobs];
  await Promise.all([ ...Array.from({ length: 4 }, async () => { while (queue.length) await runJob(queue.shift()); }), telegram(), aparat() ]);
  stats.rawResults = raw.length;

  const byUrl = new Map();
  for (const j of raw) {
    const key = j.url.replace(/#.*$/,'').replace(/\/$/,'');
    const p = byUrl.get(key);
    if (p) { p.engines = [...new Set((p.engines+', '+j.engines).split(/,\s*/).filter(Boolean))].join(', '); if (!p.date && j.date) p.date = j.date; if ((j.text||'').length > (p.text||'').length) p.text = j.text; }
    else byUrl.set(key, { ...j, key });
  }
  stats.candidates = byUrl.size;
  const fresh = [...byUrl.values()].filter(j => !seen.has(j.key));
  stats.newCandidates = fresh.length;

  const matched = [], needPage = [];
  for (const j of fresh) (matches(j.title+' '+j.text+' '+j.url) ? matched : needPage).push(j);
  matched.forEach(j => j.verified = 'snippet');
  stats.pageChecks = 0; stats.verifiedByPage = 0;
  await pool([...needPage, ...matched.filter(j => !j.date)].slice(0, 2500), 10, async (j) => {
    stats.pageChecks++;
    try {
      const r = await fetch(j.url, { headers:UA, signal:AbortSignal.timeout(12000), redirect:'follow' });
      const html = await r.text(); const txt = strip(html);
      if (!j.verified && matches(txt)) { j.verified = 'page'; j.text = around(txt); matched.push(j); stats.verifiedByPage++; }
      if (!j.date) j.date = metaDate(html);
    } catch (e) {}
  });
  stats.matched = matched.length;

  // ---------- ۴) دسته‌بندی و تحلیل لحن با AI ----------
  const rows = [];
  const sys = `تو تحلیل‌گر پایش برند «بهزادایکام» (behzadecom.ir، آموزش آنلاین‌شاپ و دراپ‌شیپینگ، مدرس: بهزاد آذریان) هستی. برای هر مورد فقط یک آرایه‌ی JSON برگردان با فیلدهای:
id، category (یکی از: people_opinion | official | job_ad | irrelevant)، sentiment (positive | negative | neutral؛ فقط برای people_opinion)، summary (خلاصه‌ی یک‌جمله‌ای فارسی)، reply_draft.
official = محتوایی که خود مجموعه منتشر کرده. job_ad = آگهی استخدام. اگر نام به شخص یا برند دیگری اشاره دارد irrelevant بگذار.
reply_draft فقط برای نظر منفی: پاسخی کوتاه، محترمانه و شفاف از طرف «پشتیبانی بهزادایکام» که مشکل را می‌پذیرد و راه پیگیری می‌دهد؛ برای بقیه رشته‌ی خالی.`;
  const items = matched.map((x,i) => ({ ...x, id:i }));
  const batches = []; for (let i = 0; i < items.length; i += 15) batches.push(items.slice(i, i+15));
  stats.llmFail = 0;
  await pool(batches, 3, async (batch) => {
    let parsed = null;
    for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
      try {
        const r = await fetch(LLM_URL + '/chat/completions', { method:'POST', signal:AbortSignal.timeout(120000),
          headers:{ Authorization:'Bearer '+env.LLM_KEY, 'Content-Type':'application/json' },
          body:JSON.stringify({ model:LLM_MODEL, temperature:0, messages:[{ role:'system', content:sys }, { role:'user', content:JSON.stringify(batch.map(x => ({ id:x.id, source:x.source, title:x.title, text:String(x.text).slice(0,800), url:x.url }))) }] }) });
        const txt = (await r.json()).choices[0].message.content;
        parsed = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']')+1));
      } catch (e) { await sleep(5000 * (attempt+1)); }
    }
    if (!parsed) { stats.llmFail++; parsed = batch.map(x => ({ id:x.id, category:'people_opinion', sentiment:'neutral', summary:'(تحلیل AI انجام نشد) '+(x.title||String(x.text).slice(0,100)), reply_draft:'' })); }
    for (const p of parsed) {
      const s = items.find(x => x.id === p.id); if (!s || p.category === 'irrelevant') continue;
      rows.push({ found_at:new Date().toISOString(), date:s.date, source:s.source, channel:s.channel, engines:s.engines, query:s.query, verified:s.verified,
        category:p.category, sentiment:p.category==='people_opinion'?(p.sentiment||'neutral'):'', title:s.title, summary:p.summary||'', url:s.url, reply_draft:p.reply_draft||'' });
    }
  });
  stats.reported = rows.length;

  // همه‌ی کاندیداهای بررسی‌شده «دیده‌شده» ثبت می‌شوند تا فردا دوباره تحلیل نشوند
  fresh.forEach(j => seen.add(j.key));
  fs.mkdirSync('cache', { recursive:true }); fs.writeFileSync(seenFile, JSON.stringify([...seen]));
  fs.writeFileSync('results.json', JSON.stringify({ stats, results:rows }, null, 1));
  console.log(stats);

  const r = await fetch(env.N8N_WEBHOOK, { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Webhook-Secret':env.WEBHOOK_SECRET }, body:JSON.stringify({ stats, results:rows }) });
  console.log('n8n:', r.status);
  if (!r.ok) process.exit(1);
}
main();
