// Authenticated, temporary Google Cloud Shell preview. Not a public production backend.
import {spawn} from 'node:child_process';
const host=process.env.WEB_HOST;
if(!host||!/^cs-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.cloudshell\.dev$/.test(host))throw Error('Cloud_Shell_WEB_HOST_required');
const port=8080,origin=`https://${port}-${host}`;
const child=spawn(process.execPath,['experiments/board-library/server.mjs'],{stdio:'inherit',env:{...process.env,PORT:String(port),ITC_TRUSTED_PROXY_ORIGIN:origin}});
console.log(`HTTPS preview (same Google account; session-limited): ${origin}`);
const timer=setTimeout(()=>child.kill('SIGTERM'),2*60*60*1000);
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>child.kill('SIGTERM'));
child.on('exit',code=>{clearTimeout(timer);process.exitCode=code??1;});
