const cors = { "access-control-allow-origin":"https://alexberik.github.io", "access-control-allow-methods":"GET,OPTIONS", "access-control-allow-headers":"content-type", "cache-control":"no-store", "vary":"Origin" };
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json; charset=utf-8"}});
const get=async(url,headers={})=>{const r=await fetch(url,{headers:{accept:"application/json",...headers}});if(!r.ok)throw new Error("HTTP "+r.status+" "+new URL(url).hostname);return r.json()};
const safe=async(fn)=>{try{return {ok:true,data:await fn()}}catch(e){return {ok:false,error:String(e.message||e)}}};
async function scan(env){
 const [profiles,boosts,newPools,gecko,rumors]=await Promise.all([
  safe(()=>get("https://api.dexscreener.com/token-profiles/latest/v1")),
  safe(()=>get("https://api.dexscreener.com/token-boosts/latest/v1")),
  safe(()=>get("https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1")),
  safe(()=>get("https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1")),
  safe(()=>get("https://www.reddit.com/search.json?q=solana%20memecoin&sort=new&limit=20&t=day"))
 ]);
 const tokens=new Map();
 for(const src of [profiles,boosts])if(src.ok&&Array.isArray(src.data))for(const x of src.data)if(x.chainId==="solana"&&x.tokenAddress)tokens.set(x.tokenAddress,{address:x.tokenAddress,discovery:"DexScreener"});
 const poolRows=[];
 for(const src of [newPools,gecko])if(src.ok&&Array.isArray(src.data?.data))for(const x of src.data.data){const a=x.relationships?.base_token?.data?.id||"";const addr=a.split("_").slice(1).join("_");if(addr)tokens.set(addr,{address:addr,discovery:"GeckoTerminal"});poolRows.push(x)}
 const addresses=[...tokens.keys()].slice(0,60);
 const [dex,gtDetails]=await Promise.all([
  safe(async()=>{if(!addresses.length)return [];const out=[];for(let i=0;i<addresses.length;i+=30)out.push(...await get("https://api.dexscreener.com/tokens/v1/solana/"+addresses.slice(i,i+30).join(",")));return out}),
  safe(async()=>poolRows.slice(0,25))
 ]);
 const pairs=dex.ok?dex.data:[];
 const enriched=await Promise.all(pairs.slice(0,50).map(async p=>{
  const addr=p.baseToken?.address;const [rug,bird,sol]=await Promise.all([
   safe(()=>get("https://api.rugcheck.xyz/v1/tokens/"+addr+"/report/summary")),
   env.BIRDEYE_API_KEY?safe(()=>get("https://public-api.birdeye.so/defi/token_overview?address="+addr+"&frames=1h,24h",{"X-API-KEY":env.BIRDEYE_API_KEY,"x-chain":"solana"})):Promise.resolve({ok:false,error:"API key not configured"}),
   env.SOLSCAN_API_KEY?safe(()=>get("https://pro-api.solscan.io/v2.0/token/meta?address="+addr,{"token":env.SOLSCAN_API_KEY})):Promise.resolve({ok:false,error:"API key not configured"})
  ]);
  return {pair:p,rugcheck:rug,birdeye:bird,solscan:sol};
 }));
 const posts=rumors.ok?(rumors.data.data?.children||[]).map(x=>({title:x.data.title,url:"https://reddit.com"+x.data.permalink,created:x.data.created_utc,score:x.data.score,subreddit:x.data.subreddit,source:"Reddit",label:"UNVERIFIED SOCIAL SIGNAL"})): [];
 return {generatedAt:new Date().toISOString(),chain:"solana",sources:{
  dexscreener:profiles.ok||boosts.ok,geckoterminal:newPools.ok||gecko.ok,rugcheck:"per-token",birdeye:!!env.BIRDEYE_API_KEY,solscan:!!env.SOLSCAN_API_KEY,reddit:rumors.ok,
  note:"Birdeye and Solscan require user-provided API secrets. Reddit items are unverified chatter, not facts. X/Telegram not queried without authorized API/feed."
 },discovery:{tokenCandidates:addresses.length,geckoPools:poolRows.length},pairs:enriched,rumors:posts};
}
export default {async fetch(request,env){
 const u=new URL(request.url);if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(u.pathname==="/health")return reply({ok:true,service:"MAGIC Extreme Move Scanner",mode:"read-only"});
 if(u.pathname!=="/scan"||request.method!=="GET")return reply({error:"Not found"},404);
 if(u.searchParams.get("confirm")!=="read-only")return reply({error:"Use ?confirm=read-only"},400);
 try{return reply(await scan(env))}catch(e){return reply({error:String(e.message||e)},502)}
}};
