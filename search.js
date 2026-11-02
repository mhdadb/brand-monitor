// اجرای همه‌ی جست‌وجوها روی SearXNG محلی و ارسال نتیجه به n8n
const jobs = require('./jobs.json');
const BASE = 'http://localhost:8080';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const host = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return 'web'; } };
const out = []; let ok = 0, fail = 0, serperUsed = 0;

async function searx(q, categories, pageno) {
  const u = new URL(BASE + '/search');
  Object.entries({ q, format:'json', categories, pageno, language:'all', safesearch:0 }).forEach(([k,v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(r.status);
  return (await r.json()).results || [];
}
async function serper(q) {
  const r = await fetch('https://google.serper.dev/search', { method:'POST',
    headers:{ 'X-API-KEY':process.env.SERPER_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({ q, gl:'ir', hl:'fa', num:10 }) });
  return ((await r.json()).organic || []).map(x => ({ url:x.link, title:x.title, content:x.snippet, publishedDate:x.date, engines:['serper(google)'] }));
}
async function runJob(job) {
  for (let p = 1; p <= job.pages; p++) {
    let res = [];
    try { res = await searx(job.q, job.categories, p); ok++; } catch (e) { fail++; }
    if (!res.length && p === 1 && process.env.SERPER_KEY && job.categories === 'general') {
      try { res = await serper(job.q); serperUsed++; } catch (e) {}
    }
    for (const x of res) if (x.url) out.push({ source:host(x.url), channel:'search:'+job.categories,
      engines:(x.engines || [x.engine]).filter(Boolean).join(', '), query:job.q, title:x.title||'', text:x.content||'', url:x.url, date:x.publishedDate||'' });
    await sleep(1500);
    if (res.length < 5) break;
  }
}
(async () => {
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await runJob(queue.shift()); }));
  const stats = { _stats:true, searxOk:ok, searxFail:fail, serperUsed, jobs:jobs.length };
  console.log(stats, 'results:', out.length);
  const r = await fetch(process.env.N8N_WEBHOOK, { method:'POST',
    headers:{ 'Content-Type':'application/json', 'X-Webhook-Secret':process.env.WEBHOOK_SECRET },
    body: JSON.stringify({ stats, results: out }) });
  console.log('n8n:', r.status);
  if (!r.ok) process.exit(1);
})();
