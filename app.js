(() => {
"use strict";
const $ = id => document.getElementById(id);
const state = { assets: [], allAssets: [], news: [], filter: "all", search: "", showAll: false, selected: null, cash: 100, positions: {}, sourceHealth: {dex:false,gecko:false,news:false}, majors:[], candleData:[], candleSymbol:"BTCUSDT", lang:"ru" };
const STORE = "catalyst_radar_paper_v2";
const SOURCES = {
  dexProfiles: "https://api.dexscreener.com/token-profiles/latest/v1",
  dexBoosts: "https://api.dexscreener.com/token-boosts/latest/v1",
  gecko: n => "https://api.geckoterminal.com/api/v2/networks/"+n+"/new_pools?page=1",
  news: q => "https://api.gdeltproject.org/api/v2/doc/doc?query="+encodeURIComponent(q)+"&mode=ArtList&format=json&maxrecords=12&sort=DateDesc"
};
const networks = ["solana","base","eth","bsc","arbitrum"];
const $safe = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function fmt(n, d=2) { const x=Number(n); if(!Number.isFinite(x)) return "—"; return x.toLocaleString("en-US",{maximumFractionDigits:d,minimumFractionDigits:d}); }
function money(n,d=2){const x=Number(n);if(!Number.isFinite(x))return "—";return (x<0?"-$":"$")+fmt(Math.abs(x),d);}
function short(n){n=Number(n);if(!Number.isFinite(n))return "—";if(n>=1e9)return "$"+fmt(n/1e9,1)+"B";if(n>=1e6)return "$"+fmt(n/1e6,1)+"M";if(n>=1e3)return "$"+fmt(n/1e3,1)+"K";return "$"+fmt(n,0);}
function ago(date){if(!date)return "time unavailable";const sec=Math.max(0,(Date.now()-new Date(date).getTime())/1000);if(!Number.isFinite(sec))return "time unavailable";if(sec<60)return Math.floor(sec)+"s ago";if(sec<3600)return Math.floor(sec/60)+"m ago";if(sec<86400)return Math.floor(sec/3600)+"h ago";return Math.floor(sec/86400)+"d ago";}
function toast(msg){const el=$("toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("show"),3200);}
function setHealth(key, ok, label){state.sourceHealth[key]=ok;const status=$("health-"+key),dot=$("dot-"+key),row=$("row-"+key);if(status)status.textContent=label || (ok?"LIVE":"UNAVAILABLE");if(dot)dot.className="feed-dot"+(ok?"":" bad");if(row){row.className="source-health"+(ok?"":" pending");row.innerHTML="<i></i> "+(ok?"Live / fetched":"Unavailable");}updateSourceCount();}
function updateSourceCount(){const n=Object.values(state.sourceHealth).filter(Boolean).length;const el=$("source-live-count");if(el)el.textContent=n+" live connector"+(n===1?"":"s");}
function parseNum(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function normalizeGecko(item, network){
 const a=item.attributes||{}, rel=item.relationships||{}, tokenRel=rel.base_token&&rel.base_token.data?rel.base_token.data.id:"";
 const tokenAddress=tokenRel.includes("_")?tokenRel.split("_").slice(1).join("_"):"";
 const price=parseNum(a.base_token_price_usd), ch1=parseNum(a.price_change_percentage&&a.price_change_percentage.h1), ch24=parseNum(a.price_change_percentage&&a.price_change_percentage.h24);
 const liq=parseNum(a.reserve_in_usd), vol=parseNum(a.volume_usd&&a.volume_usd.h24), fdv=parseNum(a.fdv_usd)||parseNum(a.market_cap_usd);
 const tx=a.transactions&&a.transactions.h24||{}, buys=Number(tx.buys)||0, sells=Number(tx.sells)||0;
 const age=a.pool_created_at?Math.max(0,(Date.now()-new Date(a.pool_created_at).getTime())/3600000):null;
 const symbol=(a.name||"New pool").split(" / ")[0].slice(0,30);
 return {id:network+":"+tokenAddress+":"+item.id, address:tokenAddress, chain:network, name:symbol, symbol:symbol.split(" ")[0].toUpperCase().slice(0,12), price, change1h:ch1, change24:ch24, liquidity:liq, volume:vol, fdv, buys, sells, age, createdAt:a.pool_created_at, url:"https://www.geckoterminal.com/"+network+"/pools/"+item.id, image:null, kind:"new", boosted:false, source:"GeckoTerminal", flags:[], score:0};
}
function scoreAsset(a){
 const liq=Number(a.liquidity)||0, vol=Number(a.volume)||0, ch=Math.abs(Number(a.change24)||0), age=Number(a.age);
 let score=0;
 if(liq>=100000)score+=15;else if(liq>=25000)score+=12;else if(liq>=5000)score+=8;else if(liq>=1000)score+=4;
 if(vol>=500000)score+=22;else if(vol>=100000)score+=18;else if(vol>=25000)score+=13;else if(vol>=5000)score+=7;
 score+=Math.min(20,ch*1.7);
 if(a.boosted)score+=8;
 if(Number.isFinite(age)){if(age<24)score+=12;else if(age<72)score+=7;else if(age<168)score+=3;}
 const total=Number(a.buys||0)+Number(a.sells||0);if(total>0){const imbalance=Math.abs(Number(a.buys||0)-Number(a.sells||0))/total;score+=Math.round(imbalance*8);}
 if(liq<1000)score-=18;if(liq>0&&vol/liq>25)score-=12;
 return Math.max(0,Math.min(99,Math.round(score)));
}
function flags(a){
 const out=[];if((a.liquidity||0)<5000)out.push("THIN LIQ");if((a.liquidity||0)>0&&(a.volume||0)/(a.liquidity||1)>15)out.push("VOL/LIQ");if(Math.abs(a.change24||0)>100)out.push("EXTREME MOVE");if(a.boosted)out.push("PROMOTED");if(a.age!==null&&a.age<24)out.push("VERY NEW");if(!a.liquidity)out.push("LIQ N/A");return out.slice(0,2);
}
async function fetchJson(url, timeout=9000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const res=await fetch(url,{signal:controller.signal,cache:"no-store"});if(!res.ok)throw new Error("HTTP "+res.status);return await res.json();}finally{clearTimeout(timer);}
}
async function fetchGecko(){
 const results=await Promise.allSettled(networks.map(async network=>{const data=await fetchJson(SOURCES.gecko(network));return (data.data||[]).map(x=>normalizeGecko(x,network));}));
 const out=[];results.forEach((r,i)=>{if(r.status==="fulfilled")out.push(...r.value);});
 if(!out.length)throw new Error("No new-pool responses");
 return out;
}
async function fetchDex(){
 const [profiles,boosts]=await Promise.all([fetchJson(SOURCES.dexProfiles),fetchJson(SOURCES.dexBoosts)]);
 const boostSet=new Set((Array.isArray(boosts)?boosts:[]).map(x=>(x.chainId+":"+x.tokenAddress).toLowerCase()));
 const rows=(Array.isArray(profiles)?profiles:[]).slice(0,80).map(p=>({id:(p.chainId||"unknown")+":"+(p.tokenAddress||""),address:p.tokenAddress||"",chain:p.chainId||"unknown",name:p.description||p.tokenAddress||"Token profile",symbol:"TOKEN",price:null,change1h:null,change24:null,liquidity:null,volume:null,fdv:null,age:null,createdAt:null,url:p.url||("https://dexscreener.com/"+p.chainId+"/"+p.tokenAddress),image:p.icon||null,kind:"profile",boosted:boostSet.has(((p.chainId||"")+" :"+(p.tokenAddress||"")).toLowerCase())||boostSet.has(((p.chainId||"")+":"+(p.tokenAddress||"")).toLowerCase()),source:"DEX Screener",flags:[],score:0}));
 return {rows,boosts:Array.isArray(boosts)?boosts:[]};
}
function mergeAssets(gecko,dex){
 const map=new Map();
 gecko.forEach(a=>{const key=(a.chain+":"+a.address).toLowerCase();map.set(key,a);});
 dex.rows.forEach(d=>{
   const key=(d.chain+":"+d.address).toLowerCase(),existing=map.get(key);
   if(existing){existing.image=d.image||existing.image;existing.boosted=existing.boosted||d.boosted;existing.dexUrl=d.url;existing.profileName=d.name;}
   else map.set(key,d);
 });
 const boosts=dex.boosts||[];
 boosts.forEach(b=>{const key=((b.chainId||"")+":"+(b.tokenAddress||"")).toLowerCase();const item=map.get(key);if(item){item.boosted=true;item.boostAmount=b.totalAmount||b.amount||null;}else map.set(key,{id:key,address:b.tokenAddress,chain:b.chainId||"unknown",name:"Boosted token",symbol:"TOKEN",price:null,change1h:null,change24:null,liquidity:null,volume:null,fdv:null,age:null,url:"https://dexscreener.com/"+b.chainId+"/"+b.tokenAddress,image:null,kind:"boost",boosted:true,source:"DEX Screener",flags:["PROMOTED"],score:8});});
 const arr=[...map.values()];
 arr.forEach(a=>{a.flags=flags(a);a.score=scoreAsset(a);});
 return arr.sort((a,b)=>b.score-a.score);
}

function renderOverview(){
 const all=state.allAssets||[],known=all.filter(a=>a.price!=null),liq=all.reduce((n,a)=>n+(Number(a.liquidity)||0),0);
 const high=all.filter(a=>a.flags.some(x=>["THIN LIQ","VOL/LIQ","EXTREME MOVE"].includes(x))).length;
 const promoted=all.filter(a=>a.boosted).length;
 if($("ov-candidates"))$("ov-candidates").textContent=all.length.toLocaleString("en-US");
 if($("ov-candidate-note"))$("ov-candidate-note").textContent=known.length+" активов с ценой в данных";
 if($("ov-liquidity"))$("ov-liquidity").textContent=short(liq);
 if($("ov-highrisk"))$("ov-highrisk").textContent=high.toLocaleString("en-US");
 if($("ov-risk-note"))$("ov-risk-note").textContent=(all.length?Math.round(high/all.length*100):0)+"% текущей выборки";
 if($("ov-promoted"))$("ov-promoted").textContent=promoted.toLocaleString("en-US");
 const mom=$("momentum-chart");
 if(mom){
  const rows=all.filter(a=>a.change24!=null&&Number.isFinite(Number(a.change24))).sort((a,b)=>Math.abs(b.change24)-Math.abs(a.change24)).slice(0,8);
  if(!rows.length)mom.innerHTML='<div class="chart-empty">24h изменения не пришли от источника. Нет подставных значений.</div>';
  else {const max=Math.max(1,...rows.map(a=>Math.abs(Number(a.change24))));mom.innerHTML='<div class="momentum-list">'+rows.map(a=>{const v=Number(a.change24),w=Math.max(2,Math.abs(v)/max*100),cl=v>=0?"up":"down";return '<div class="momentum-row"><div class="momentum-name"><b>'+ $safe(a.symbol||a.name||"Asset")+'</b><small>'+ $safe(a.chain||"—")+'</small></div><div class="momentum-track"><span class="'+cl+'" style="width:'+w+'%"></span></div><strong class="'+cl+'">'+(v>0?"+":"")+fmt(v,1)+'%</strong></div>';}).join("")+'</div>';}
 }
 const risk=$("risk-chart");
 if(risk){
  const n=all.length||0,low=all.filter(a=>!a.flags.length&&a.liquidity>=5000&&a.change24!=null).length;
  const highN=high,caution=Math.max(0,n-low-highN),pct=x=>n?Math.round(x/n*100):0;
  risk.innerHTML=n?'<div class="risk-total"><b>'+n+'</b><span>активов в выборке</span></div><div class="risk-bar"><span class="risk-seg low" style="width:'+pct(low)+'%"></span><span class="risk-seg caution" style="width:'+pct(caution)+'%"></span><span class="risk-seg high" style="width:'+pct(highN)+'%"></span></div><div class="risk-rows"><div><i class="legend-dot green"></i><span>Меньше флагов</span><b>'+low+' <small>'+pct(low)+'%</small></b></div><div><i class="legend-dot amber"></i><span>Требует проверки</span><b>'+caution+' <small>'+pct(caution)+'%</small></b></div><div><i class="legend-dot red"></i><span>Повышенный риск</span><b>'+highN+' <small>'+pct(highN)+'%</small></b></div></div>':'<div class="chart-empty">Нет активов для оценки риска.</div>';
 }
 const scat=$("liquidity-chart");
 if(scat){
  const pts=all.filter(a=>Number(a.liquidity)>0&&Number(a.volume)>0).sort((a,b)=>b.volume-a.volume).slice(0,60);
  if(!pts.length)scat.innerHTML='<div class="chart-empty">Для графика нужны одновременно ликвидность и объём. Пока этих данных нет.</div>';
  else {
   const W=540,H=230,L=48,R=14,T=14,B=34,pw=W-L-R,ph=H-T-B,maxL=Math.max(1,...pts.map(a=>Number(a.liquidity))),maxV=Math.max(1,...pts.map(a=>Number(a.volume)));
   const sx=v=>L+(Math.log10(Math.max(1,v))/Math.log10(maxL))*pw,sy=v=>T+ph-(Math.log10(Math.max(1,v))/Math.log10(maxV))*ph;
   let grid='';[0.25,0.5,0.75,1].forEach(t=>{const y=T+ph-t*ph,x=L+t*pw;grid+='<line x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'" class="chart-gridline"/><line x1="'+x+'" y1="'+T+'" x2="'+x+'" y2="'+(T+ph)+'" class="chart-gridline"/>';});
   const circles=pts.map(a=>'<circle cx="'+sx(a.liquidity).toFixed(1)+'" cy="'+sy(a.volume).toFixed(1)+'" r="'+(3+Math.min(5,Math.sqrt(Number(a.volume)/maxV)*5)).toFixed(1)+'" class="'+(a.flags.some(x=>["THIN LIQ","VOL/LIQ","EXTREME MOVE"].includes(x))?"scatter-high":a.flags.length?"scatter-warn":"scatter-low")+'"><title>'+$safe(a.symbol||a.name)+' · liquidity '+short(a.liquidity)+' · 24h volume '+short(a.volume)+'</title></circle>').join("");
   scat.innerHTML='<svg class="scatter-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Liquidity versus 24-hour volume scatter plot">'+grid+circles+'<text x="'+L+'" y="'+(H-9)+'" class="chart-axis">LOW LIQUIDITY</text><text x="'+(W-R)+'" y="'+(H-9)+'" text-anchor="end" class="chart-axis">HIGH LIQUIDITY →</text><text x="12" y="'+(T+ph/2)+'" transform="rotate(-90 12 '+(T+ph/2)+')" text-anchor="middle" class="chart-axis">24H VOLUME →</text></svg><div class="scatter-legend"><span><i class="legend-dot green"></i> fewer flags</span><span><i class="legend-dot amber"></i> check</span><span><i class="legend-dot red"></i> risk flags</span></div>';
  }
 }
}
function renderAssets(){
 renderOverview();
 const body=$("asset-rows");if(!body)return;
 let list=state.allAssets.filter(a=>{
  if(state.filter==="new"&&a.kind!=="new")return false;
  if(state.filter==="meme"&&!/meme|doge|shib|pepe|bonk|wif|cat|inu/i.test((a.name||"")+" "+(a.symbol||"")))return false;
  if(state.filter==="boost"&&!a.boosted)return false;
  if(state.filter==="highrisk"&&!a.flags.some(x=>["THIN LIQ","VOL/LIQ","EXTREME MOVE","VERY NEW"].includes(x)))return false;
  if(state.search&&!((a.name+" "+a.symbol+" "+a.chain+" "+a.address).toLowerCase().includes(state.search)))return false;
  return true;
 });
 state.assets=list;
 $("candidate-count").textContent=list.length+" candidates";
 const show=state.showAll?list:list.slice(0,12);
 if(!show.length){body.innerHTML='<tr><td colspan="9" class="empty-cell">No matching assets. If feeds are blocked, try refresh later.</td></tr>';return;}
 body.innerHTML=show.map(a=>{
  const price=a.price==null?"—":money(a.price,a.price<0.01?8:a.price<1?5:3);
  const ch1=a.change1h==null?"—":(a.change1h>=0?"+":"")+fmt(a.change1h,1)+"%";
  const ch24=a.change24==null?"—":(a.change24>=0?"+":"")+fmt(a.change24,1)+"%";
  const flagsText=a.flags.length?a.flags.slice(0,2).join(" · "):((a.liquidity!=null&&a.price!=null)?"LOW FLAGS*":"DATA GAP");
  const avatar=a.image?'<img src="'+$safe(a.image)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':$safe((a.symbol||a.name||"?").slice(0,2));
  const hasScenario=a.change24!=null&&Number.isFinite(Number(a.change24));
  const scenarioValue=hasScenario?Math.max(0,1*(1+Number(a.change24)/100)):null;
  const scenarioDelta=hasScenario?scenarioValue-1:null;
  const scenarioClass=!hasScenario?"scenario-na":scenarioDelta>0.00001?"scenario-up":scenarioDelta< -0.00001?"scenario-down":"scenario-flat";
  const scenarioHtml=hasScenario?'<span class="scenario-value">'+money(scenarioValue,3)+'</span><small class="'+scenarioClass+'">'+(scenarioDelta>0?"+":"")+money(scenarioDelta,3)+'</small><em>если повторится 24h move</em>':'<span class="scenario-value">—</span><small class="scenario-na">нет данных</small>';
  return '<tr class="asset-row" data-row-asset="'+$safe(a.id)+'"><td><div class="asset-cell"><span class="token-avatar">'+avatar+'</span><span class="asset-meta"><b>'+$safe(a.symbol==="TOKEN"?(a.profileName||a.name).slice(0,24):a.symbol)+'</b><small>'+$safe(a.chain.toUpperCase())+' · '+$safe(a.source)+'</small></span></div></td><td class="number">'+price+'</td><td class="number"><span class="'+(a.change1h>=0?"pos":a.change1h<0?"neg":"dim")+'">'+ch1+'</span><br><span class="'+(a.change24>=0?"pos":a.change24<0?"neg":"dim")+'">'+ch24+'</span></td><td class="number">'+short(a.liquidity)+'</td><td class="number">'+short(a.volume)+'</td><td><div class="score-cell"><span class="score-number">'+a.score+'</span><span class="score-meter"><span style="width:'+a.score+'%"></span></span></div></td><td><span class="'+(a.flags.some(x=>["THIN LIQ","VOL/LIQ","EXTREME MOVE"].includes(x))?"risk-tag":(a.flags.length||a.price==null||a.liquidity==null?"mini-tag":"safe-tag"))+'">'+$safe(flagsText)+'</span></td><td><div class="scenario-cell '+scenarioClass+'">'+scenarioHtml+'</div></td><td><button class="row-select '+(state.selected&&state.selected.id===a.id?"selected":"")+'" data-pick="'+$safe(a.id)+'" aria-label="Подробнее об активе">Подробнее ↗</button></td></tr>';
 }).join("");
 body.querySelectorAll("[data-pick]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const a=state.assets.find(x=>x.id===btn.dataset.pick);if(a){selectAsset(a);showAssetDetails(a);}}));
 body.querySelectorAll("[data-row-asset]").forEach(row=>row.addEventListener("click",e=>{if(e.target.closest("button,a"))return;const a=state.assets.find(x=>x.id===row.dataset.rowAsset);if(a){selectAsset(a);showAssetDetails(a);}}));
 $("asset-footnote").textContent="Live endpoints: GeckoTerminal new pools + DEX Screener profiles/boosts. Score = discovery heuristic, not probability of profit.";
 const tokens=state.allAssets.length;const pools=state.allAssets.filter(a=>a.kind==="new").length;
 $("metric-tokens").textContent=tokens||"—";$("metric-pools").textContent=pools||"—";
}
function selectAsset(a){state.selected=a;renderAssets();renderPortfolio();toast((a.symbol||a.name)+" selected. "+(a.price==null?"No live quote available; trading disabled.":"Live quote loaded from "+a.source+"."));$("paper-buy").disabled=a.price==null;$("paper-sell").disabled=a.price==null;}
function showAssetDetails(a){
 if(!a)return;
 let dlg=$("asset-detail-dialog");
 if(!dlg){dlg=document.createElement("dialog");dlg.id="asset-detail-dialog";dlg.className="asset-detail-dialog";document.body.appendChild(dlg);
  dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close();});
  dlg.addEventListener("click",e=>{if(e.target.closest("[data-close-detail]"))dlg.close();});
 }
 const isMajor=!!a.pair||a.type==="Stablecoin";
 const assetType=isMajor?(a.type==="Stablecoin"?"Стейблкоин":"Крупный криптоактив"):(a.kind==="new"?"Токен в новом пуле":"Криптотокен");
 const price=isMajor?(a.peg?1:Number(a.lastPrice)):a.price;
 const change=isMajor?(a.peg?0:Number(a.priceChangePercent)):a.change24;
 const riskFlags=a.flags||[];
 const riskLevel=isMajor?"Риск не рассчитан":riskFlags.some(x=>["THIN LIQ","VOL/LIQ","EXTREME MOVE"].includes(x))?"Высокий":riskFlags.length||price==null||(!isMajor&&a.liquidity==null)?"Требует проверки":"Меньше явных флагов";
 const riskClass=riskLevel==="Высокий"?"red":riskLevel==="Требует проверки"||riskLevel==="Риск не рассчитан"?"amber":"green";
 const scenario=change==null||!Number.isFinite(Number(change))?null:Math.max(0,1+Number(change)/100);
 const listing=isMajor?(a.peg?"Ориентир привязки к $1; не самостоятельная биржевая котировка.":("Торговая пара "+a.pair+" доступна в публичном рыночном потоке Binance Spot; это не подтверждает будущие листинги.")):(a.kind==="new"?"Обнаружен пул в DEX-источнике. Это не означает листинг на централизованной бирже.":"Обнаружен публичный профиль/упоминание DEX. Дата и статус листинга не подтверждены подключёнными источниками.");
 const ageText=a.createdAt?new Date(a.createdAt).toLocaleString():(a.age!=null&&Number.isFinite(Number(a.age))?"Примерно "+fmt(a.age,1)+" ч":"Источник не передал дату создания");
 const address=a.address||"Не предоставлен источником";
 const source=a.source||(isMajor?"Binance public market API":"Источник не указан");
 const href=a.url||(isMajor&&a.pair?"https://www.binance.com/en/trade/"+a.pair:"");
 const priceText=price==null||!Number.isFinite(Number(price))?"Нет проверенной цены":money(Number(price),Number(price)<0.01?8:Number(price)<1?5:3);
 const changeText=change==null||!Number.isFinite(Number(change))?"Нет данных":(Number(change)>0?"+":"")+fmt(change,2)+"% за 24 ч";
 const flagsHtml=riskFlags.length?riskFlags.map(f=>'<span class="detail-flag">'+$safe(f)+'</span>').join(""):'<span class="detail-flag safe">Нет явных флагов в доступных данных</span>';
 dlg.innerHTML='<div class="detail-head"><div><div class="eyebrow">ASSET INTELLIGENCE / DETAILS</div><h2>'+$safe(a.symbol||a.name||"Актив")+' <small>'+$safe(a.name||a.profileName||"")+'</small></h2></div><button class="detail-close" data-close-detail aria-label="Закрыть">×</button></div><div class="detail-summary"><div><span>Тип актива</span><b>'+$safe(assetType)+'</b></div><div><span>Текущая цена</span><b>'+priceText+'</b></div><div><span>Изменение 24 ч</span><b class="'+(change==null?"":Number(change)>=0?"pos":"neg")+'">'+changeText+'</b></div><div><span>Уровень риска</span><b class="risk-text '+riskClass+'">'+riskLevel+'</b></div></div><section class="detail-block"><h3>Листинг и состояние</h3><p>'+$safe(listing)+'</p><div class="detail-state"><span>Источник: <b>'+$safe(source)+'</b></span><span>Возраст пула: <b>'+$safe(ageText)+'</b></span><span>Сеть: <b>'+$safe(a.chain||"—")+'</b></span></div><div class="detail-flags">'+flagsHtml+'</div></section><section class="detail-block"><h3>Сценарий для $1 на следующие 24 часа</h3>'+(scenario==null?'<p>Нельзя рассчитать сценарий: источник не передал изменение цены за 24 часа.</p>':'<div class="detail-scenario"><div><span>Если изменение последних 24 ч повторится</span><b>'+money(scenario,3)+'</b><small class="'+(scenario>=1?"pos":"neg")+'">Результат: '+(scenario>=1?"+":"")+money(scenario-1,3)+'</small></div><div><span>Если цена не изменится</span><b>$1.000</b><small>$0.000 · без прибыли/убытка</small></div></div>')+'<p class="detail-disclaimer">Это условный расчёт на основе прошлого движения, не модель предсказания. Он не учитывает комиссии, проскальзывание, ликвидность, налоги и риск полной потери средств.</p></section><section class="detail-block"><h3>Проверка риска</h3><p>Оценка обнаружения: <b>'+(a.score==null?"—":$safe(a.score)+"/99")+'</b>. Это эвристический discovery score, а не вероятность роста.</p><p>Контракт / адрес: <code>'+$safe(address)+'</code></p><div class="detail-state"><span>Ликвидность: <b>'+(isMajor?"—":short(a.liquidity)) +'</b></span><span>Объём за 24 ч: <b>'+(isMajor?short(a.quoteVolume):short(a.volume))+'</b></span><span>FDV / капитализация: <b>'+(isMajor?"—":short(a.fdv))+'</b></span></div>'+(isMajor?'<p>Риск не рассчитан в этой карточке: для оценки нужны отдельные данные о волатильности, глубине рынка и ликвидности.</p>':"")+'</section><div class="detail-actions">'+(href?'<a href="'+$safe(href)+'" target="_blank" rel="noopener">Открыть источник ↗</a>':"")+'<button class="btn btn-small btn-outline" data-close-detail>Закрыть</button></div>';
 if(typeof dlg.showModal==="function"){if(!dlg.open)dlg.showModal();}else{dlg.setAttribute("open","");}
}
async function loadAssets(){
 $("scan-state").textContent="Scanning public endpoints";$("scan-progress").style.width="22%";$("scan-substate").textContent="Reading DEX profiles, boosts and new pools";
 const [geckoRes,dexRes]=await Promise.allSettled([fetchGecko(),fetchDex()]);
 const gecko=geckoRes.status==="fulfilled"?geckoRes.value:[];const dex=dexRes.status==="fulfilled"?dexRes.value:{rows:[],boosts:[]};
 setHealth("gecko",gecko.length>0,gecko.length?"LIVE · "+gecko.length+" pools":"UNAVAILABLE");
 setHealth("dex",dex.rows.length>0||dex.boosts.length>0,(dex.rows.length||dex.boosts.length)?"LIVE · DEX data":"UNAVAILABLE");
 const merged=mergeAssets(gecko,dex);
 if(merged.length){state.allAssets=merged;renderAssets();if(!state.selected){const first=merged.find(a=>a.price!=null);if(first)selectAsset(first);}else{const newer=merged.find(a=>a.id===state.selected.id);if(newer)state.selected=newer;}renderPortfolio();}
 $("scan-progress").style.width="70%";
 $("scan-state").textContent=merged.length?"Discovery scan complete":"Partial feed failure";
 $("scan-substate").textContent=merged.length+" unique candidates assembled from public DEX endpoints";
 $("scan-updated").textContent="Last scan: "+new Date().toISOString().slice(11,19)+" UTC";
 $("last-updated").textContent="Updated "+new Date().toLocaleTimeString();
 $("scan-progress").style.width="100%";
}

const CORE_MARKETS=[
 {symbol:"BTC",pair:"BTCUSDT",name:"Bitcoin",type:"Core"},
 {symbol:"ETH",pair:"ETHUSDT",name:"Ethereum",type:"Core"},
 {symbol:"XRP",pair:"XRPUSDT",name:"XRP",type:"Core"},
 {symbol:"BNB",pair:"BNBUSDT",name:"BNB",type:"Core"},
 {symbol:"SOL",pair:"SOLUSDT",name:"Solana",type:"Core"},
 {symbol:"DOGE",pair:"DOGEUSDT",name:"Dogecoin",type:"Core"},
 {symbol:"ADA",pair:"ADAUSDT",name:"Cardano",type:"Core"},
 {symbol:"TRX",pair:"TRXUSDT",name:"TRON",type:"Core"},
 {symbol:"LINK",pair:"LINKUSDT",name:"Chainlink",type:"Core"},
 {symbol:"AVAX",pair:"AVAXUSDT",name:"Avalanche",type:"Core"},
 {symbol:"USDC",pair:"USDCUSDT",name:"USD Coin",type:"Stablecoin"},
 {symbol:"USDT",pair:null,name:"Tether USD",type:"Stablecoin",peg:true}
];
const BINANCE="https://api.binance.com/api/v3";
function renderMajorTickers(){
 const el=$("major-tickers");if(!el)return;
 if(!state.majors.length){el.innerHTML='<div class="chart-empty">Котировки не загружены. Проверь соединение и попробуй обновить.</div>';return;}
 el.innerHTML=state.majors.map(a=>{
  const price=a.peg?1:Number(a.lastPrice),chg=a.peg?0:Number(a.priceChangePercent),vol=Number(a.quoteVolume)||0;
  const cl=a.peg?"flat":chg>=0?"up":"down";
  return '<button class="major-ticker '+(a.pair===state.candleSymbol?"selected":"")+'" data-major="'+$safe(a.pair||"")+'"><span class="major-top"><span class="major-symbol">'+$safe(a.symbol)+'</span><span class="major-type '+(a.type==="Stablecoin"?"stable":"core")+'">'+(a.type==="Stablecoin"?"STABLE":"CORE")+'</span></span><span class="major-name">'+$safe(a.name)+'</span><strong class="major-price">'+(a.peg?"~$1.00":money(price,price<1?5:2))+'</strong><span class="major-change '+cl+'">'+(a.peg?"PEG REFERENCE":(chg>=0?"+":"")+fmt(chg,2)+"% / 24H")+'</span><span class="major-meta">'+(a.peg?"Peg reference · not a live quote":"24h vol "+short(vol))+'</span></button>';
 }).join("");
 el.querySelectorAll("[data-major]").forEach((btn,i)=>btn.addEventListener("click",()=>{const a=state.majors[i];if(btn.dataset.major){state.candleSymbol=btn.dataset.major;renderMajorTickers();loadCandles();}showAssetDetails(a);}));
}
async function loadMajors(){
 const el=$("major-tickers");if(el&&!state.majors.length)el.innerHTML='<div class="chart-empty">Загружаем котировки…</div>';
 const pairs=CORE_MARKETS.filter(a=>a.pair).map(a=>a.pair);
 try{
  const raw=await fetchJson(BINANCE+"/ticker/24hr?symbols="+encodeURIComponent(JSON.stringify(pairs)),10000);
  const byPair=new Map((Array.isArray(raw)?raw:[]).map(x=>[x.symbol,x]));
  state.majors=CORE_MARKETS.map(a=>a.peg?{...a,lastPrice:1,priceChangePercent:0,quoteVolume:0}:byPair.has(a.pair)?{...a,...byPair.get(a.pair)}:null).filter(Boolean);
  renderMajorTickers();renderBreadth();renderMajorVolumes();renderAssetMix();
  const btc=state.majors.find(a=>a.pair===state.candleSymbol);
  if(btc)$("candle-last-price").textContent="Последняя цена: "+money(Number(btc.lastPrice),2);
 }catch(e){
  if(el)el.innerHTML='<div class="chart-empty">Не удалось получить публичные котировки. Данные не подменены. Попробуй обновить или проверь доступ к Binance API.</div>';
  ["breadth-chart","major-volume-chart","asset-mix-chart"].forEach(id=>{const x=$(id);if(x)x.innerHTML='<div class="chart-empty">Нет доступных рыночных данных.</div>';});
 }
}
async function loadCandles(){
 const el=$("candle-chart");if(!el)return;
 const interval=$("candle-interval")?.value||"1h";
 const subtitle=$("candle-subtitle");if(subtitle)subtitle.textContent=interval==="1h"?"Часовые свечи · публичный рынок":interval==="4h"?"4-часовые свечи · публичный рынок":"Дневные свечи · публичный рынок";
 el.innerHTML='<div class="chart-empty">Загружаем свечи '+$safe(state.candleSymbol)+'…</div>';
 try{
  const data=await fetchJson(BINANCE+"/klines?symbol="+encodeURIComponent(state.candleSymbol)+"&interval="+encodeURIComponent(interval)+"&limit=42",10000);
  if(!Array.isArray(data)||!data.length)throw new Error("No candles");
  state.candleData=data.map(k=>({time:Number(k[0]),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
  renderCandles();
  const m=state.majors.find(a=>a.pair===state.candleSymbol);
  if(m)$("candle-last-price").textContent="Последняя цена: "+money(Number(m.lastPrice),2);
 }catch(e){el.innerHTML='<div class="chart-empty">Свечные данные недоступны для этой пары. Выбери другой актив или попробуй позже.</div>';}
}
function renderCandles(){
 const el=$("candle-chart"),data=state.candleData;if(!el||!data.length)return;
 const W=920,H=330,L=66,R=18,T=18,priceBottom=230,volTop=250,volBottom=292,B=24,pw=W-L-R,ph=priceBottom-T;
 const min=Math.min(...data.map(x=>x.low)),max=Math.max(...data.map(x=>x.high)),span=max-min||1,maxVol=Math.max(1,...data.map(x=>x.volume));
 const y=v=>T+(max-v)/span*ph,step=pw/data.length,cw=Math.max(3,Math.min(12,step*.58));
 let grid="",candles="",vols="";
 for(let i=0;i<5;i++){const val=max-(span*i/4),yy=y(val);grid+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" class="candle-grid"/><text x="'+(L-8)+'" y="'+(yy+3)+'" text-anchor="end" class="candle-axis">'+$safe(fmt(val,val<1?5:2))+'</text>';}
 data.forEach((c,i)=>{const x=L+step*(i+.5),up=c.close>=c.open,cl=up?"bull":"bear",yo=y(Math.max(c.open,c.close)),yc=y(Math.min(c.open,c.close)),body=Math.max(1,yc-yo),vh=c.volume/maxVol*(volBottom-volTop);candles+='<line x1="'+x+'" y1="'+y(c.high)+'" x2="'+x+'" y2="'+y(c.low)+'" class="candle-wick '+cl+'"/><rect x="'+(x-cw/2)+'" y="'+yo+'" width="'+cw+'" height="'+body+'" class="candle-body '+cl+'"><title>'+new Date(c.time).toLocaleString()+' · O '+c.open+' H '+c.high+' L '+c.low+' C '+c.close+'</title></rect>';vols+='<rect x="'+(x-cw/2)+'" y="'+(volBottom-vh)+'" width="'+cw+'" height="'+Math.max(1,vh)+'" class="volume-bar '+cl+'"/>';});
 const first=data[0],last=data[data.length-1],change=(last.close-first.open)/first.open*100;
 let labels="";[0,Math.floor(data.length/3),Math.floor(data.length*2/3),data.length-1].forEach(i=>{const x=L+step*(i+.5);labels+='<text x="'+x+'" y="'+(H-5)+'" text-anchor="middle" class="candle-axis">'+new Date(data[i].time).toLocaleDateString(undefined,{month:"short",day:"numeric",hour:interval==="1d"?undefined:"2-digit"})+'</text>';});
 el.innerHTML='<div class="candle-summary"><span>Диапазон '+money(min,min<1?5:2)+' — '+money(max,max<1?5:2)+'</span><span class="'+(change>=0?"up":"down")+'">'+(change>=0?"+":"")+fmt(change,2)+'% за показанный период</span></div><svg class="candles-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Candlestick chart for '+$safe(state.candleSymbol)+'">'+grid+'<text x="8" y="14" class="candle-axis">PRICE</text>'+candles+'<line x1="'+L+'" y1="'+volTop+'" x2="'+(W-R)+'" y2="'+volTop+'" class="candle-separator"/><text x="8" y="'+(volTop+12)+'" class="candle-axis">VOLUME</text>'+vols+labels+'</svg>';
}
function renderBreadth(){
 const el=$("breadth-chart");if(!el)return;const a=state.majors.filter(x=>!x.peg&&x.priceChangePercent!=null),up=a.filter(x=>Number(x.priceChangePercent)>0).length,down=a.filter(x=>Number(x.priceChangePercent)<0).length,flat=a.length-up-down,total=a.length||1;
 el.innerHTML='<div class="breadth-number"><b>'+up+'</b><span>растут</span><b>'+down+'</b><span>падают</span></div><div class="breadth-bar"><span class="bull" style="width:'+(up/total*100)+'%"></span><span class="flat" style="width:'+(flat/total*100)+'%"></span><span class="bear" style="width:'+(down/total*100)+'%"></span></div><div class="breadth-legend"><span><i class="legend-dot green"></i> Рост '+up+'</span><span><i class="legend-dot gray"></i> Без изменения '+flat+'</span><span><i class="legend-dot red"></i> Падение '+down+'</span></div><div class="breadth-list">'+a.slice().sort((x,y)=>Number(y.priceChangePercent)-Number(x.priceChangePercent)).map(x=>'<div><span>'+x.symbol+'</span><b class="'+(Number(x.priceChangePercent)>=0?"up":"down")+'">'+(Number(x.priceChangePercent)>0?"+":"")+fmt(x.priceChangePercent,2)+'%</b></div>').join("")+'</div>';
}
function renderMajorVolumes(){
 const el=$("major-volume-chart");if(!el)return;const rows=state.majors.filter(x=>!x.peg&&Number(x.quoteVolume)>0).sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume)).slice(0,8);if(!rows.length){el.innerHTML='<div class="chart-empty">Нет объёмов.</div>';return;}
 const max=Math.max(...rows.map(x=>Number(x.quoteVolume)));
 el.innerHTML='<div class="major-vol-list">'+rows.map(x=>'<div class="major-vol-row"><span>'+x.symbol+'</span><div class="major-vol-track"><i style="width:'+(Number(x.quoteVolume)/max*100)+'%"></i></div><b>'+short(x.quoteVolume)+'</b></div>').join("")+'</div>';
}
function renderAssetMix(){
 const el=$("asset-mix-chart");if(!el)return;const core=state.majors.filter(x=>x.type==="Core").length,stable=state.majors.filter(x=>x.type==="Stablecoin").length,total=core+stable||1;
 el.innerHTML='<div class="mix-visual"><div class="mix-ring" style="--core:'+Math.round(core/total*100)+'%"><div><b>'+total+'</b><small>активов</small></div></div><div class="mix-legend"><div><i class="legend-dot cyan"></i><span>Крупные криптоактивы</span><b>'+core+'</b></div><div><i class="legend-dot green"></i><span>Стейблкоины</span><b>'+stable+'</b></div></div></div><div class="chart-footnote">USDT показан как ориентир привязки к $1; USDC оценивается по паре USDC/USDT.</div>';
}

function classifyNews(item){
 const text=((item.title||"")+" "+(item.domain||"")).toLowerCase();
 const official=/sec\.gov|fda\.gov|nasdaq\.com|nyse\.com|binance\.com|coinbase\.com|kraken\.com/.test(text);
 const rumor=/rumou?r|leak|unconfirmed|alleged|insider|listing|list on|will list|reportedly/.test(text);
 return {label:official?"PRIMARY SOURCE":rumor?"VERIFY CLAIM":"NEWS DISCOVERY",cls:official?"primary":""};
}
async function loadGeoNews(){
 const list=$("geo-news-list"),status=$("geo-news-status");if(!list)return;
 list.innerHTML='<div class="chart-empty"><span class="loader"></span> Ищем свежие геополитические заголовки…</div>';if(status)status.textContent="ЗАПРОС";
 const q='(Ukraine OR Iran OR Israel OR Netanyahu OR Zelenskyy OR Putin OR Trump OR ceasefire OR sanctions) (defense OR defence OR military OR reconstruction OR infrastructure OR contract OR budget OR missile OR construction OR cement OR steel)';
 try{
  const data=await fetchJson(SOURCES.news(q),12000),items=Array.isArray(data.articles)?data.articles:[];
  const seen=new Set();const rows=items.filter(x=>x.title&&x.url).filter(x=>{const k=x.url;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,10);
  if(!rows.length)throw new Error("No matching headlines");
  list.innerHTML=rows.map(item=>{
   const date=item.seendate?new Date(item.seendate):null;
   const title=(item.title||"").toLowerCase();
   const defence=/defen[cs]|military|missile|weapon|munition|air.?defen|budget|contract/.test(title);
   const rebuild=/reconstruct|infrastructure|construction|cement|steel|rebuild|tender/.test(title);
   const tag=defence?"DEFENCE / ORDERS":rebuild?"RECONSTRUCTION":"GEOPOLITICS";
   return '<article class="geo-news-item"><div class="geo-news-meta"><span class="geo-news-tag '+(defence?"defence":rebuild?"build":"")+'">'+tag+'</span><span>'+$safe(item.domain||"Источник не указан")+'</span><span>·</span><span>'+(date&&!isNaN(date)?$safe(date.toLocaleString()):"время не предоставлено")+'</span></div><a href="'+$safe(item.url)+'" target="_blank" rel="noopener">'+$safe(item.title)+' ↗</a><small>Индекс GDELT · проверь первоисточник</small></article>';
  }).join("");
  if(status)status.textContent=rows.length+" ЗАГОЛОВКОВ";
 }catch(e){
  list.innerHTML='<div class="chart-empty">Публичный новостной индекс сейчас недоступен или не вернул подходящих заголовков. Список акций остаётся доступен; попробуй обновить позже.</div>';
  if(status)status.textContent="НЕДОСТУПНО";
 }
}
async function loadNews(){
 $("news-list").innerHTML='<div class="empty-cell"><span class="loader"></span> Fetching public headlines…</div>';
 const q='(cryptocurrency OR crypto OR token OR bitcoin OR biotech OR IPO OR "small cap") (listing OR launch OR rumor OR leak OR filing OR approval OR contract OR partnership)';
 try{
  const data=await fetchJson(SOURCES.news(q),11000),items=Array.isArray(data.articles)?data.articles:[];
  state.news=items.filter(x=>x.title&&x.url).slice(0,12);
  setHealth("news",state.news.length>0,state.news.length?"LIVE · "+state.news.length+" headlines":"NO RESULTS");
  renderNews();
 }catch(e){
  setHealth("news",false,"UNAVAILABLE");
  $("news-list").innerHTML='<div class="empty-cell">GDELT is unavailable from this browser right now. Use direct research links: <a href="https://www.google.com/search?q=crypto+token+listing+rumor" target="_blank" rel="noopener" style="color:var(--lav)">crypto listing search ↗</a> · <a href="https://www.google.com/search?q=small+cap+stock+FDA+filing+news" target="_blank" rel="noopener" style="color:var(--lav)">small-cap catalyst search ↗</a>. No synthetic headlines are shown.</div>';
  $("news-count").textContent="0 stories";
 }
}
function renderNews(){
 const el=$("news-list");if(!state.news.length){el.innerHTML='<div class="empty-cell">No current headlines returned by the public index.</div>';return;}
 el.innerHTML=state.news.map(item=>{
  const c=classifyNews(item),date=item.seendate?new Date(item.seendate):null;
  return '<article class="news-item"><div><div class="news-meta"><span class="news-label '+c.cls+'">'+c.label+'</span><span>'+$safe(item.domain||"Publisher unknown")+'</span><span>·</span><span>'+(date&&!isNaN(date)?ago(date.toISOString()):"time not supplied")+'</span></div><h3><a href="'+$safe(item.url)+'" target="_blank" rel="noopener">'+$safe(item.title)+'</a></h3><div class="news-meta"><span>GDELT public news index</span><span>·</span><span>Verify original source before acting</span></div></div><a class="news-open" href="'+$safe(item.url)+'" target="_blank" rel="noopener" aria-label="Open source">↗</a></article>';
 }).join("");
 $("news-count").textContent=state.news.length+" stories";$("metric-news").textContent=state.news.length;
}
function loadPaper(){
 try{const data=JSON.parse(localStorage.getItem(STORE)||"{}");if(Number.isFinite(data.cash))state.cash=data.cash;if(data.positions&&typeof data.positions==="object")state.positions=data.positions;}catch(e){}
}
function savePaper(){try{localStorage.setItem(STORE,JSON.stringify({cash:state.cash,positions:state.positions}));}catch(e){}}
function renderPortfolio(){
 let equity=0,pnl=0;Object.values(state.positions).forEach(p=>{const a=state.allAssets.find(x=>x.id===p.id);if(a&&a.price!=null)p.price=a.price;const val=(p.price||0)*p.qty;equity+=val;pnl+=val-p.qty*p.avg;});
 $("paper-cash").textContent=money(state.cash);$("paper-total").textContent=money(state.cash+equity);$("paper-pnl").textContent=(pnl>=0?"+":"")+money(pnl);$("paper-pnl").className=pnl>=0?"pos":"neg";
 const positions=Object.values(state.positions);$("position-count").textContent=positions.length;
 if(!positions.length){$("positions-list").className="positions-empty";$("positions-list").textContent="Select a token from the discovery radar to begin.";return;}
 $("positions-list").className="";
 $("positions-list").innerHTML=positions.map(p=>{const val=(p.price||0)*p.qty,pl=val-p.qty*p.avg;return '<div class="position-row"><div><b>'+$safe(p.symbol||p.name)+'</b><small>'+fmt(p.qty,6)+' units · avg '+money(p.avg,6)+'</small></div><div class="position-value">'+money(val)+'<br><span class="'+(pl>=0?"pos":"neg")+'">'+(pl>=0?"+":"")+money(pl)+'</span></div></div>';}).join("");
}
function trade(side){
 const a=state.selected;if(!a)return toast("Select an asset first.");
 if(a.price==null||!Number.isFinite(Number(a.price)))return toast("No verified live price for this asset. Trade disabled.");
 const usd=Number($("paper-amount").value);if(!Number.isFinite(usd)||usd<=0)return toast("Enter a positive USD amount.");
 if(side==="buy"){
  if(usd>state.cash)return toast("Not enough virtual cash.");
  const qty=usd/a.price,p=state.positions[a.id];
  if(p){p.avg=(p.avg*p.qty+a.price*qty)/(p.qty+qty);p.qty+=qty;p.price=a.price;}
  else state.positions[a.id]={id:a.id,symbol:a.symbol,name:a.name,qty,avg:a.price,price:a.price};
  state.cash-=usd;
 }else{
  const p=state.positions[a.id];if(!p)return toast("No open position for this asset.");
  const qty=Math.min(p.qty,usd/a.price),proceeds=qty*a.price;state.cash+=proceeds;p.qty-=qty;p.price=a.price;if(p.qty<1e-10)delete state.positions[a.id];
 }
 savePaper();renderPortfolio();toast(side==="buy"?"Virtual buy recorded.":"Virtual sell recorded.");
}
function exportCsv(){
 const rows=[["symbol","name","chain","price_usd","change_1h_pct","change_24h_pct","liquidity_usd","volume_24h_usd","fdv_usd","discovery_score","risk_flags","source","url"],...state.assets.map(a=>[a.symbol,a.name,a.chain,a.price,a.change1h,a.change24,a.liquidity,a.volume,a.fdv,a.score,a.flags.join("|"),a.source,a.url])];
 const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="catalyst-radar-discovery.csv";a.click();URL.revokeObjectURL(url);
}
function bind(){
 $("asset-filters").querySelectorAll("[data-filter]").forEach(btn=>btn.addEventListener("click",()=>{$("asset-filters").querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));btn.classList.add("active");state.filter=btn.dataset.filter;renderAssets();}));
 $("asset-search").addEventListener("input",e=>{state.search=e.target.value.toLowerCase().trim();renderAssets();});
 $("show-more").addEventListener("click",()=>{state.showAll=!state.showAll;$("show-more").textContent=state.showAll?"Show less ↑":"Show more ↓";renderAssets();});
 $("refresh-btn").addEventListener("click",refreshAll);if($("geo-refresh"))$("geo-refresh").addEventListener("click",loadGeoNews);$("majors-refresh").addEventListener("click",()=>{loadMajors();loadCandles();});$("candle-interval").addEventListener("change",loadCandles);$("news-refresh").addEventListener("click",loadNews);$("export-btn").addEventListener("click",exportCsv);
 $("paper-buy").addEventListener("click",()=>trade("buy"));$("paper-sell").addEventListener("click",()=>trade("sell"));
 $("paper-reset").addEventListener("click",()=>{if(confirm("Reset the virtual account to $100 and close all positions?")){state.cash=100;state.positions={};savePaper();renderPortfolio();toast("Virtual account reset.");}});
 $("lang-btn").addEventListener("click",()=>toast("English UI labels are being prepared; data and source labels are shown as returned by providers."));
}
async function refreshAll(){await Promise.allSettled([loadAssets(),loadNews(),loadMajors(),loadCandles(),loadGeoNews()]);}
function tick(){const now=new Date();$("utc-clock").textContent=now.toISOString().slice(11,19)+" UTC";}
function init(){loadPaper();bind();tick();setInterval(tick,1000);refreshAll();loadMajors();loadCandles();setInterval(loadMajors,60000);setInterval(loadCandles,60000);setInterval(loadAssets,90000);setInterval(loadNews,300000);setInterval(loadGeoNews,300000);window.addEventListener("online",()=>refreshAll());}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();