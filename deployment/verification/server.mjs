import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAppCheck} from 'firebase-admin/app-check';
import {verifyPhotoProposals} from '../../experiments/board-library/photo-verification-server.mjs';
const project=process.env.GOOGLE_CLOUD_PROJECT,appId=process.env.ITC_FIREBASE_APP_ID,origin=process.env.ITC_PUBLIC_ORIGIN;
if(!project||!appId||!/^https:\/\/[^/]+$/.test(origin||''))throw Error('deployment_configuration_required');
initializeApp({projectId:project,credential:applicationDefault()});
const root=fileURLToPath(new URL('../../',import.meta.url));
const reply=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
let inFlight=false,lastAccepted=0;
http.createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health')return reply(res,200,{service:'photo-verification',cloudInference:false});
 if(req.method!=='POST'||req.url!=='/api/photo/verify')return reply(res,404,{error:'not_found'});
 if(req.headers.origin!==origin)return reply(res,403,{error:'same_origin_required'});
 if(Number(req.headers['content-length'])>12*1024*1024)return reply(res,413,{error:'photo_size'});
 if(inFlight||Date.now()-lastAccepted<2000)return reply(res,429,{error:'local_verification_busy'});
 let owned=false;
 try{
  const token=req.headers['x-firebase-appcheck'];if(typeof token!=='string'||token.length>8192)return reply(res,401,{error:'app_check_required'});
  let claims;try{claims=await getAppCheck().verifyToken(token);}catch{return reply(res,401,{error:'app_check_failed'});}
  if(claims.appId!==appId)return reply(res,403,{error:'unexpected_app'});
  if(inFlight)return reply(res,429,{error:'local_verification_busy'});inFlight=true;owned=true;lastAccepted=Date.now();
  const chunks=[];let size=0;
  for await(const b of req){size+=b.length;if(size>12*1024*1024)throw Error('photo_size');chunks.push(b);}
  const result=await verifyPhotoProposals(JSON.parse(Buffer.concat(chunks)),{root,store:'/tmp/itc-photo-verification'});
  reply(res,200,result);
 }catch(e){reply(res,400,{error:['photo_size','capture_hash_mismatch','invalid_photo_verification','invalid_proposal','local_verification_timeout'].includes(e.message)?e.message:'local_verifier_failed'});}
 finally{if(owned)inFlight=false;}
}).listen(Number(process.env.PORT||8080),'0.0.0.0');
