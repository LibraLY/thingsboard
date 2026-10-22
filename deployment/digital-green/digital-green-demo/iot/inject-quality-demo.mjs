import fs from 'node:fs/promises';
import path from 'node:path';
import {client,dir} from './api.mjs';
import {sampleValues} from './fleet.mjs';
if(!process.argv.includes('--run'))throw new Error('使用 --run 显式向本机soil_b1模拟设备注入一次质量测试样本；25秒后自动恢复。');
const {api,config}=await client(),key='soil_b1',device=config.devices[key];
if(!device||device.kind!=='soil'||!device.device_code.startsWith('SOIL-'))throw new Error('本次模拟设备身份不符，已停止。');
async function send(values){const ts=Date.now();const r=await fetch(config.baseUrl+'/api/v1/'+encodeURIComponent(device.accessToken)+'/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ts,values}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('模拟设备质量验收上报失败 HTTP'+r.status);return ts;}
const report={notice:'只向本项目soil_b1模拟设备注入一次数值越界样本，不控制硬件。',deviceKey:key,deviceId:device.id,checkedAt:new Date().toISOString()};
try {
 const ts=Date.now();report.timestamp=await send({...sampleValues(ts,key,device),soil_moisture:-1,soil_relative_moisture:-3.3,data_valid:false,quality_test:true,eligible_for_alarm:true});
 report.invalidValues={soil_moisture:-1,soil_relative_moisture:-3.3};
 console.log(JSON.stringify({device:key,timestamp:report.timestamp,message:'一次质量测试样本已上报；25秒后恢复有效值。正常模拟器如正在运行也会恢复有效值。'}));
 await new Promise(r=>setTimeout(r,3000));
 const alarms=(await api(`/api/alarm/DEVICE/${device.id}?pageSize=100&page=0&searchStatus=ANY`)).data;
 const quality=alarms.find(a=>a.type==='设备数据无效'&&a.status.startsWith('ACTIVE'));
 report.qualityAlarm=quality?{id:quality.id.id,type:quality.type,status:quality.status}:null;
 report.noAgronomicAlarm=!alarms.some(a=>a.type.startsWith('土壤墒情')&&a.status.startsWith('ACTIVE'));
 await new Promise(r=>setTimeout(r,22000));
}finally {
 await send({...sampleValues(Date.now(),key,device),quality_test:false});
 report.restored=true;
 await fs.writeFile(path.join(dir,'quality-injection.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({restored:true,report:'iot/quality-injection.json'}));
}
