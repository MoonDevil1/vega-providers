/**
 * LiveTGTV V1 companion DASH->HLS converter (SERVER-SIDE ONLY).
 *
 * Run this on a computer/server with Node >=18 and FFmpeg installed:
 *   CONVERTER_TOKEN=<long-random-secret> node providers/livetgtv/converter-server.cjs
 *
 * This is not a Vega provider module. It cannot execute inside the app.
 * It supports unencrypted MPEG-DASH inputs only. It does not circumvent DRM.
 * Set ALLOWED_HOST_SUFFIXES to comma-separated trusted MPD origin suffixes.
 */
"use strict";
const http = require("node:http");
const {spawn} = require("node:child_process");
const {randomUUID, timingSafeEqual} = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const PORT = Number(process.env.PORT || 8890);
const TOKEN = process.env.CONVERTER_TOKEN || "";
const ALLOWED = (process.env.ALLOWED_HOST_SUFFIXES || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
if (TOKEN.length < 24 || ALLOWED.length === 0) {
  console.error("Set CONVERTER_TOKEN (>=24 chars) and ALLOWED_HOST_SUFFIXES");
  process.exit(1);
}
const jobs = new Map();
const root = fs.mkdtempSync(path.join(os.tmpdir(), "livetgtv-v1-hls-"));
const equal = (a,b) => {
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
};
const allowedUrl = value => {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password) throw Error("HTTPS source required");
  const hostname=u.hostname.toLowerCase();
  if (!ALLOWED.some(x=>hostname===x || hostname.endsWith("."+x))) throw Error("Source host not allowed");
  return u.toString();
};
function startJob(url) {
  const id=randomUUID();
  const dir=path.join(root,id);
  fs.mkdirSync(dir,{recursive:true});
  const output=path.join(dir,"index.m3u8");
  const args=["-hide_banner","-loglevel","warning","-nostdin","-i",url,
    "-map","0:v:0?","-map","0:a:0?","-c","copy",
    "-f","hls","-hls_time","4","-hls_list_size","6",
    "-hls_flags","delete_segments+omit_endlist",
    "-hls_segment_filename",path.join(dir,"segment%05d.ts"),output];
  const proc=spawn("ffmpeg",args,{stdio:"ignore"});
  const job={id,dir,proc,started:Date.now(),done:false};
  jobs.set(id,job);
  proc.on("exit",()=>{job.done=true;setTimeout(()=>{jobs.delete(id);fs.rmSync(dir,{recursive:true,force:true});},120000);});
  proc.on("error",()=>{job.done=true;});
  return job;
}
const send=(res,status,body,type="text/plain")=>{
  res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"});
  res.end(body);
};
http.createServer((req,res)=>{
  try {
    const request=new URL(req.url,"http://localhost");
    if(!equal(request.searchParams.get("token")||"",TOKEN)) return send(res,401,"Unauthorized");
    if(request.pathname==="/convert"){
      const mpd=allowedUrl(request.searchParams.get("url")||"");
      const job=startJob(mpd);
      return send(res,200,JSON.stringify({playlist:"/hls/"+job.id+"/index.m3u8?token="+encodeURIComponent(TOKEN)}),"application/json");
    }
    const match=request.pathname.match(/^\/hls\/([0-9a-f-]+)\/(index\.m3u8|segment[0-9]+\.ts)$/);
    if(!match)return send(res,404,"Not found");
    const job=jobs.get(match[1]);
    if(!job)return send(res,404,"Expired");
    const file=path.join(job.dir,match[2]);
    if(!fs.existsSync(file))return send(res,503,job.done?"Conversion failed or ended":"Buffering");
    const body=fs.readFileSync(file);
    if(match[2]==="index.m3u8"){
      const playlist=body.toString("utf8").replace(/^(segment[0-9]+\.ts)$/gm,"$1?token="+encodeURIComponent(TOKEN));
      return send(res,200,playlist,"application/vnd.apple.mpegurl");
    }
    return send(res,200,body,"video/mp2t");
  }catch(e){send(res,400,"Request invalid");}
}).listen(PORT,"0.0.0.0",()=>console.log("V1 converter listening on",PORT));
