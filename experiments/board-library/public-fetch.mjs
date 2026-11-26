import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hash} from './glb.mjs';

export function publicAddress(address){
  if(net.isIP(address)!==4)return false; // Explicitly bounded transport; no IPv6 fallback.
  const [a,b]=address.split('.').map(Number);
  return ![0,10,127].includes(a)&&a<224&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));
}
export function publicURL(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||net.isIP(u.hostname)||!u.hostname.includes('.')||/\.(local|localhost|internal|test|invalid)$/.test(u.hostname))throw Error('non_public_https_url');
  u.hash='';return u;
}
export function createPublicFetcher(directory,policy){
  fs.mkdirSync(path.join(directory,'http'),{recursive:true});const log=[],started=performance.now();let total=0;
  async function get(value,maxBytes=policy.maxAssetBytes,depth=0){
    const url=publicURL(value);
    if(depth>4||log.length>=policy.maxRequests||performance.now()-started>policy.maxRunMs)throw Error('discovery_budget_exhausted');
    const row={url:url.href,startedAt:new Date().toISOString()};log.push(row);const start=performance.now();
    try{
      const addresses=await dns.lookup(url.hostname,{all:true,family:4});if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw Error('non_public_dns');
      const response=url.hostname==='api.github.com'&&process.env.ITC_GITHUB_CLI==='1'
      ? await (async()=>{
          if(!/^\/(search\/repositories|repos\/[^/]+\/[^/]+(?:\/readme|\/git\/trees\/[^/]+|\/commits\/[^/]+)?|users\/[^/]+)$/.test(url.pathname))throw Error('github_endpoint_not_permitted');
          const {stdout}=await promisify(execFile)('gh',['api','--hostname','github.com',url.pathname+url.search],{windowsHide:true,timeout:policy.requestTimeoutMs,maxBuffer:maxBytes});
          total+=Buffer.byteLength(stdout);if(total>policy.maxTotalBytes)throw Error('download_size_limit');row.transport='existing_gh_session';return {status:200,headers:{'content-type':'application/json'},bytes:Buffer.from(stdout)};
        })()
      : await new Promise((resolve,reject)=>{
        // Pin the validated DNS address for this connection (including every redirect).
        const req=https.get(url,{headers:{'User-Agent':'InsideTheCircuit-LocalResearch/1','Accept-Encoding':'identity'},lookup:(_h,opts,cb)=>opts.all?cb(null,[addresses[0]]):cb(null,addresses[0].address,4)},res=>{
          const chunks=[];let bytes=0;
          res.on('data',chunk=>{bytes+=chunk.length;total+=chunk.length;if(bytes>maxBytes||total>policy.maxTotalBytes){res.destroy(Error('download_size_limit'));return;}chunks.push(chunk);});
          res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));
        });
        const timer=setTimeout(()=>req.destroy(Error('request_timeout')),policy.requestTimeoutMs);req.on('close',()=>clearTimeout(timer));req.on('error',reject);
      });
      row.status=response.status;row.transferBytes=response.bytes.length;row.ms=performance.now()-start;
      if(response.status>=300&&response.status<400){row.redirect=new URL(response.headers.location,url).href;return get(row.redirect,maxBytes,depth+1);}
      if(response.status!==200)throw Error('http_'+response.status);
      const encoding=response.headers['content-encoding'];
      if(encoding==='gzip')response.bytes=zlib.gunzipSync(response.bytes,{maxOutputLength:maxBytes});
      else if(encoding==='br')response.bytes=zlib.brotliDecompressSync(response.bytes,{maxOutputLength:maxBytes});
      else if(encoding==='deflate')response.bytes=zlib.inflateSync(response.bytes,{maxOutputLength:maxBytes});
      else if(encoding&&encoding!=='identity')throw Error('unsupported_content_encoding');
      row.bytes=response.bytes.length;row.contentType=response.headers['content-type'];row.contentEncoding=encoding||'identity';
      row.sha256=hash(response.bytes);row.file='http/'+row.sha256+'.bin';fs.writeFileSync(path.join(directory,row.file),response.bytes);
      return {...response,url:url.href,sha256:row.sha256,file:row.file};
    }catch(error){row.error=error.message;row.ms=performance.now()-start;throw error;}
  }
  return {get,log,stats:()=>({requests:log.length,bytes:total,elapsedMs:performance.now()-started})};
}
