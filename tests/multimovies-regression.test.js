const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const cheerio = require('cheerio');

const BASE = 'https://multimovies.garden';
const challenge = '<title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/a"></script>';
const card = (name = 'Example', img = '/poster.jpg') => `<article class="poster-card"><a href="/movie/${name}"><img src="${img}" alt="${name}"></a><button data-save-title='${JSON.stringify({title:name,url:'/movie/'+name,poster:img})}'></button></article>`;
const ep = (s, e) => `<article class="cinejoy-ep-card" id="ep-item-${s}-${e}"><a class="cinejoy-ep-thumb-link" href="/series/show/season/${s}/episode/${e}"></a><span class="cinejoy-ep-name">Episode ${e}</span></article>`;
const config = servers => `<script>let watchConfig={"initialServers":${JSON.stringify(servers)}};</script>`;
function context(get) {
  const data = new Map();
  return { cheerio, commonHeaders: {'User-Agent':'test-UA'},
    axios: {get, post: async () => {throw Error('Unexpected POST');}},
    kvStore: {get:async k=>data.get(k),set:async(k,v)=>data.set(k,v)},
    openWebView:async()=>{throw Error('Unexpected verification');} };
}
// A fresh module realm on every invocation, matching Vega's worker lifetime.
function load(name) {
  const exports = {};
  const scope = {exports,module:{exports},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/multimovies',name+'.js'),'utf8'),scope);
  return scope.module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const posts = (ctx, filter = '/movies', page = 1) => load('posts').getPosts({filter,page,providerContext:ctx});

test('stream module returns the array Vega consumes, including subtitles',async()=>{
  const result = await load('stream').getStream({link:'https://cdn.example/a.mp4',type:'movie',providerContext:context()});
  assert.ok(Array.isArray(result)); assert.equal(result[0].type,'mp4'); assert.ok(Array.isArray(result[0].subtitles));
});
test('posters remain associated with the correct title and absolute detail URL',async()=>{
  const ctx=context(async()=>({data:card('One')+card('Two','https://images.example/two.jpg')+card('One')}));
  const result=await posts(ctx);
  assert.equal(result.length,2); assert.equal(result[1].title,'Two');
  assert.equal(result[1].image,'https://images.example/two.jpg'); assert.equal(result[0].link,BASE+'/movie/One');
});
test('empty search does not become a site logo/ad card or verification prompt',async()=>{
  const ctx=context(async()=>({data:'<a href="/"><img src="/logo.png" alt="Site"></a><p>No results</p>'}));
  assert.deepEqual(plain(await load('posts').getSearchPosts({searchQuery:'missing',page:1,providerContext:ctx})),[]);
});
test('catalog pagination retains filters; search encodes the query and page',async()=>{
  const urls=[]; const ctx=context(async u=>{urls.push(new URL(u));return {data:card()};});
  await posts(ctx,'/catalog?type=movie&genre=action',2);
  await load('posts').getSearchPosts({searchQuery:' A & B ',page:3,providerContext:ctx});
  assert.equal(urls[0].searchParams.get('type'),'movie'); assert.equal(urls[0].searchParams.get('page'),'2');
  assert.equal(urls[1].pathname,'/search'); assert.equal(urls[1].searchParams.get('q'),'A & B'); assert.equal(urls[1].searchParams.get('page'),'3');
});
test('transport errors propagate without requesting verification',async()=>{
  const ctx=context(async()=>{throw Error('Network offline');});
  await assert.rejects(()=>posts(ctx),/Network offline/);
});
test('a solved session survives fresh post, metadata, episode and stream modules',async()=>{
  let prompts=0;
  const content='<h1>Show</h1>'+card()+ep(1,1)+'<video src="https://cdn.example/video.mp4"></video>';
  const ctx=context(async(u,o)=>o.headers.Cookie==='cf_clearance=ok' && o.headers['User-Agent']==='verified-UA' ? {data:content} : {data:challenge});
  ctx.openWebView=async url=>{prompts++; return {url,data:content,cookies:'cf_clearance=ok',cookieMap:{},userAgent:'verified-UA'};};
  await posts(ctx);
  await posts(ctx,'/movies',2);
  await load('meta').getMeta({link:BASE+'/series/show',providerContext:ctx});
  assert.equal((await load('episodes').getEpisodes({url:BASE+'/series/show?season=1',providerContext:ctx})).length,1);
  assert.equal((await load('stream').getStream({link:BASE+'/movie/show',type:'movie',providerContext:ctx})).length,1);
  assert.equal(prompts,1);
});
test('coalesced verification HTML is never reused for another category',async()=>{
  let calls=0; const ctx=context(async()=>({data:++calls===1?challenge:card('Correct')}));
  ctx.openWebView=async()=>({url:BASE+'/movies',data:card('Wrong'),cookies:'cf_clearance=ok',cookieMap:{},userAgent:'test-UA'});
  const result=await posts(ctx,'/series');
  assert.equal(result[0].title,'Correct'); assert.equal(calls,2);
});
test('cookie-only verification results retry the requested page',async()=>{
  let calls=0; const ctx=context(async()=>({data:++calls===1?challenge:card()}));
  ctx.openWebView=async url=>({url,data:'',cookies:'cf_clearance=ok',cookieMap:{},userAgent:'test-UA'});
  assert.equal((await posts(ctx)).length,1); assert.equal(calls,2);
});
test('concurrent workers wait for the same persisted verification attempt',async()=>{
  let prompts=0, unblock, entered;
  const started=new Promise(r=>entered=r);
  const ctx=context(async(u,o)=>({data:o.headers.Cookie?card(new URL(u).pathname.slice(1)):challenge}));
  ctx.openWebView=async url=>{prompts++; entered(); await new Promise(r=>unblock=r);return {url,data:card('movies'),cookies:'cf_clearance=ok',cookieMap:{},userAgent:'test-UA'};};
  const first=posts(ctx); await started; const second=posts(ctx,'/series'); setTimeout(()=>unblock(),20);
  const [,result]=await Promise.all([first,second]); assert.equal(prompts,1); assert.equal(result[0].title,'series');
});
test('cancellation does not trigger repeated dialogs on subsequent fresh calls',async()=>{
  let prompts=0; const ctx=context(async()=>({data:challenge}));
  ctx.openWebView=async()=>{prompts++;throw Error('WAF_DIALOG_CANCELLED');};
  await assert.rejects(()=>posts(ctx),/CANCELLED/);
  await assert.rejects(()=>posts(ctx),/retry shortly/); assert.equal(prompts,1);
});
test('403 challenge body triggers verification; plain 403 does not',async()=>{
  let prompts=0;
  const ctx=context(async()=>{throw {response:{status:403,data:challenge}};});
  ctx.openWebView=async url=>{prompts++;return {url,data:card(),cookies:'ok',cookieMap:{},userAgent:'test-UA'};};
  assert.equal((await posts(ctx)).length,1); assert.equal(prompts,1);
  await assert.rejects(()=>posts(context(async()=>{throw Error('HTTP 403 forbidden');})),/403/);
});
test('seasons are separate dynamic links with no misleading empty directLinks',async()=>{
  const html='<h1>Show</h1><div class="cinejoy-season-pill-dropdown"><select><option value="2">Season 2</option><option value="1">Season 1</option></select></div>';
  const result=await load('meta').getMeta({link:BASE+'/series/show',providerContext:context(async()=>({data:html}))});
  assert.deepEqual(plain(result.linkList.map(x=>x.title)),['Season 1','Season 2']);
  assert.ok(!('directLinks' in result.linkList[0])); assert.match(result.linkList[1].episodesLink,/season=2/);
});
test('metadata uses structured poster data instead of the first site-logo image',async()=>{
  const html='<img src="/logo.png"><script type="application/ld+json">'+JSON.stringify({'@type':'Movie',name:'Example',description:'Plot',image:'/movie-poster.jpg'})+'</script>';
  const result=await load('meta').getMeta({link:BASE+'/movie/example',providerContext:context(async()=>({data:html}))});
  assert.equal(result.title,'Example'); assert.equal(result.image,BASE+'/movie-poster.jpg');
});
test('expired sessions can be renewed after the prompt cooldown',async()=>{
  const ctx=context(async()=>({data:challenge})); let prompts=0;
  await ctx.kvStore.set('multimovies.session.v2'+BASE,{origin:BASE,cookies:'cf_clearance=old',userAgent:'old-UA'});
  await ctx.kvStore.set('multimovies.verification.v2'+BASE,{at:Date.now()-31000,pending:false});
  ctx.openWebView=async url=>{prompts++;return {url,data:card(),cookies:'cf_clearance=new',cookieMap:{},userAgent:'new-UA'};};
  await posts(ctx); assert.equal(prompts,1);
  assert.equal((await ctx.kvStore.get('multimovies.session.v2'+BASE)).cookies,'cf_clearance=new');
});
test('episode ranges use the selected option, include zero and filter other seasons',async()=>{
  const urls=[];
  const ctx=context(async u=>{urls.push(u);return {data:urls.length===1?ep(2,25)+ep(1,1)+'<select class="episode-range-select"><option value="0">1-24</option><option value="24" selected>25-48</option></select>':ep(2,1)+ep(2,25)};});
  const result=await load('episodes').getEpisodes({url:BASE+'/series/show?season=2',providerContext:ctx});
  assert.deepEqual(plain(result.map(x=>x.description)),['S2E1','S2E25']); assert.equal(urls.length,2); assert.match(urls[1],/ep_range=0/);
});
test('failed episode ranges report failure instead of silently truncating a season',async()=>{
  const ctx=context(async u=>{if(u.includes('ep_range')) throw Error('Range failed');return {data:ep(1,1)+'<select class="episode-range-select"><option value="1" selected>1</option><option value="2">2</option></select>'};});
  await assert.rejects(()=>load('episodes').getEpisodes({url:BASE+'/series/show?season=1',providerContext:ctx}),/Range failed/);
});
test('each server resolves independently and results keep source order',async()=>{
  const servers=[{name:'First',url:'https://one.example/embed'},{name:'Second',url:'https://two.example/embed'}];
  const ctx=context(async u=>({data:u.startsWith(BASE)?config(servers):`<video src="https://${new URL(u).hostname}/video.mp4"></video>`}));
  const result=await load('stream').getStream({link:BASE+'/movie/show',type:'movie',providerContext:ctx});
  assert.deepEqual(plain(result.map(s=>s.server)),['First','Second']);
});
test('direct watchConfig media is returned without fetching binary video as HTML',async()=>{
  let calls=0;const ctx=context(async()=>{calls++;return {data:config([{name:'Media',url:'https://cdn.example/video.mp4'}])};});
  const result=await load('stream').getStream({link:BASE+'/movie/show',type:'movie',providerContext:ctx});
  assert.equal(calls,1);assert.equal(result[0].type,'mp4');
});
test('an HTML embed without playable media fails clearly',async()=>{
  const ctx=context(async u=>({data:u.startsWith(BASE)?config([{name:'Embed',url:'https://embed.example/player'}]):'<html>Player</html>'}));
  await assert.rejects(()=>load('stream').getStream({link:BASE+'/movie/show',type:'movie',providerContext:ctx}),/No supported/);
});
