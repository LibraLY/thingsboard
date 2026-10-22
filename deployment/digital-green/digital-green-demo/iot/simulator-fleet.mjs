import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NOTICE,sampleValues} from './fleet.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(await fs.readFile(path.join(dir,'private.json'),'utf8'));
const once=process.argv.includes('--once');
const devices=Object.entries(config.devices);
async function send(key,device,samples) {
 const response=await fetch(config.baseUrl+'/api/v1/'+encodeURIComponent(device.accessToken)+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(samples),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`模拟设备 ${key} 遥测上报失败（HTTP ${response.status}）`);
}
async function parallel(items,fn,width=4) {
 for(let i=0;i<items.length;i+=width)await Promise.all(items.slice(i,i+width).map(fn));
}
if(process.argv.includes('--seed')) {
 const now=Date.now();
 await parallel(devices,async([key,device])=>{
  const samples=Array.from({length:73},(_,i)=>{const ts=now-(72-i)*300000;return{ts,values:{...sampleValues(ts,key,device),eligible_for_alarm:false,historical_seed:true}};});
  await send(key,device,samples);
 });
 console.log(`已补入 ${devices.length} 台模拟设备最近6小时73组/台历史样本；${NOTICE}。`);
}
let running=true;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{running=false;});
do {
 const ts=Date.now();
 try {
  await parallel(devices,async([key,device])=>send(key,device,{ts,values:sampleValues(ts,key,device)}));
  const metricCount=devices.reduce((sum,[,d])=>sum+Object.keys(d.metrics).length,0);
  await fs.writeFile(path.join(dir,'simulator-status.json'),JSON.stringify({running:true,updatedAt:new Date(ts).toISOString(),intervalSeconds:30,deviceCount:devices.length,metricCount,notice:NOTICE,scenario:'D地块两探头缺墒、C仓粮温、D仓粮粒水分持续异常，其他设备为对照模拟样本'},null,2));
  console.log(`${new Date(ts).toISOString()} ${devices.length}台设备/${metricCount}项数值指标模拟遥测已上报。`);
 }catch(error){console.error(new Date().toISOString()+' '+error.message);}
 if(!once&&running)await new Promise(resolve=>setTimeout(resolve,30000));
}while(!once&&running);
