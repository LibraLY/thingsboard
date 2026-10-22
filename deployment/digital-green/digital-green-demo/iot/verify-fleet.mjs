import fs from 'node:fs/promises';
import path from 'node:path';
import {client,dir} from './api.mjs';
import {sampleValues} from './fleet.mjs';
if(!process.argv.includes('--run'))throw new Error('使用 --run 显式执行本机模拟设备告警验收。执行时应先停止本次模拟器，随后恢复。');
const {api,config}=await client();
const report={checkedAt:new Date().toISOString(),notice:'只操作本项目模拟设备；不控制真实硬件；原生规则持续时间与迟滞不改动。',checks:[],alarmTransitions:[],qualityExample:null};
const check=(name,pass,details)=>{report.checks.push({name,pass,...(details?{details}:{})});if(!pass)throw new Error(name);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function send(key,overrides={}){const d=config.devices[key],ts=Date.now(),values={...sampleValues(ts,key,d),...overrides};const r=await fetch(config.baseUrl+'/api/v1/'+encodeURIComponent(d.accessToken)+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ts,values}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`模拟设备 ${key} 上报验收失败 HTTP${r.status}`);return ts;}
async function alarms(key){const d=config.devices[key];return(await api(`/api/alarm/DEVICE/${d.id}?pageSize=100&page=0&searchStatus=ANY`)).data;}
async function waitUntil(fn,label,timeout=95000){const start=Date.now();while(Date.now()-start<timeout){const result=await fn();if(result)return result;await pause(3000);}throw new Error(label+' 超时');}
const cases=[{key:'soil',type:'土壤墒情干旱',bad:{soil_moisture:13,soil_relative_moisture:43.3,data_valid:true},good:{soil_moisture:23,soil_relative_moisture:76.7,data_valid:true}},{key:'grain_a',type:'燕麦粮粒水分偏高',bad:{grain_moisture:14,grain_temperature:20,data_valid:true},good:{grain_moisture:12.5,grain_temperature:20,data_valid:true}},{key:'grain_b',type:'粮堆单点温度关注',bad:{grain_temperature:27,grain_moisture:12.5,data_valid:true},good:{grain_temperature:22,grain_moisture:12.5,data_valid:true}}];
try {
 const fleet=Object.values(config.devices);
 check('34 registered device contracts',fleet.length===34);
 check('five device kinds',new Set(fleet.map(d=>d.kind)).size===5);
 const missing=[];for(const d of fleet){const v=await api(`/api/plugins/telemetry/DEVICE/${d.id}/values/timeseries?keys=${Object.keys(d.metrics).join(',')}`);if(Object.keys(d.metrics).some(k=>!v[k]?.length))missing.push(d.device_code);}
 check('all 88 numeric metrics have actual ThingsBoard telemetry',missing.length===0,missing);
 console.log('设备及88指标已核实，开始验证历史补点门控。');
 for(const c of cases)await send(c.key,{...c.bad,eligible_for_alarm:false,historical_seed:true});
 await pause(3000);
 for(const c of cases)check(c.type+' historical gate does not create active alarm',!(await alarms(c.key)).some(a=>a.type===c.type&&a.status.startsWith('ACTIVE')));
 console.log('历史补点门控已验证，开始三类原生告警60秒持续验证。');
 for(const c of cases)await send(c.key,c.bad);
 await pause(3000);
 for(const c of cases)check(c.type+' not created before 60 seconds',!(await alarms(c.key)).some(a=>a.type===c.type&&a.status.startsWith('ACTIVE')));
 await pause(31000);for(const c of cases)await send(c.key,c.bad);
 await pause(31000);for(const c of cases)await send(c.key,c.bad);
 for(const c of cases){const alarm=await waitUntil(async()=>(await alarms(c.key)).find(a=>a.type===c.type&&a.status==='ACTIVE_UNACK'),c.type+' ACTIVE');check(c.type+' native ACTIVE_UNACK',true);await api('/api/alarm/'+alarm.id.id+'/ack','POST',{});const ack=await api('/api/alarm/'+alarm.id.id);check(c.type+' native ACTIVE_ACK',ack.status==='ACTIVE_ACK');c.alarmId=alarm.id.id;report.alarmTransitions.push({deviceKey:c.key,deviceId:config.devices[c.key].id,type:c.type,alarmId:alarm.id.id,active:alarm.status,acknowledged:ack.status,details:alarm.details});}
 console.log('三类原生告警已触发并确认，开始60秒迟滞恢复。');
 for(const c of cases)await send(c.key,c.good);
 await pause(31000);for(const c of cases)await send(c.key,c.good);
 await pause(31000);for(const c of cases)await send(c.key,c.good);
 for(const c of cases){const cleared=await waitUntil(async()=>{const a=await api('/api/alarm/'+c.alarmId);return a.status==='CLEARED_ACK'?a:null;},c.type+' CLEAR');check(c.type+' native CLEARED_ACK',true);report.alarmTransitions.find(a=>a.alarmId===c.alarmId).cleared=cleared.status;}
 const badAt=await send('soil_b1',{soil_moisture:-1,soil_relative_moisture:-3.3,data_valid:false,quality_test:true});
 const quality=await waitUntil(async()=>(await alarms('soil_b1')).find(a=>a.type==='设备数据无效'&&a.status==='ACTIVE_UNACK'),'质量告警');
 check('invalid numeric sample creates native quality alarm',true);
 const invalidAgronomy=(await alarms('soil_b1')).some(a=>a.type.startsWith('土壤墒情')&&a.status.startsWith('ACTIVE'));
 check('invalid sample does not create agronomic drought alert',!invalidAgronomy);
 await send('soil_b1');
 const recovered=await waitUntil(async()=>{const a=await api('/api/alarm/'+quality.id.id);return a.status.startsWith('CLEARED')?a:null;},'质量恢复');
 check('valid sample automatically clears native quality alarm',true);
 report.qualityExample={deviceKey:'soil_b1',deviceId:config.devices.soil_b1.id,timestamp:badAt,invalidValues:{soil_moisture:-1,soil_relative_moisture:-3.3},alarmId:quality.id.id,active:quality.status,cleared:recovered.status,expectedLakeHandling:'invalid values quarantined; historical test sample retained with explicit quality_test=true'};
 report.passed=true;
}catch(error){report.passed=false;report.error=error.message;process.exitCode=1;}
finally {for(const c of cases)await send(c.key,c.good).catch(()=>{});await send('soil_b1').catch(()=>{});await fs.writeFile(path.join(dir,'fleet-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,error:report.error||null,report:'iot/fleet-acceptance.json'}));}
