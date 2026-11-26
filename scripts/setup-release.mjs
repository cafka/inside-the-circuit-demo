import {spawnSync} from 'node:child_process';
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{stdio:'inherit',shell:process.platform==='win32'&&cmd==='npm',windowsHide:true});if(r.status!==0)process.exit(r.status||1);};
run('npm',['ci']);
// Python installation is explicit: no AI weights or cloud services are installed.
if(process.argv.includes('--python')){
 run('python',['-m','venv','.local/venv']);
 run(process.platform==='win32'?'.local/venv/Scripts/python.exe':'.local/venv/bin/python',['-m','pip','install','-r','requirements-release.txt']);
}
run('npm',['run','build']);
run('npm',['run','library:sync']);
console.log('Build ready. Activate .local/venv before catalog:restore or new CAD preparation. Then npm start.');
