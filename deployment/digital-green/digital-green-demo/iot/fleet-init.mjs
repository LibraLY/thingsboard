import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {client,dir} from './api.mjs';
import {buildFleet,NOTICE} from './fleet.mjs';
import {ruleDefinitions} from './alarm-rules.mjs';

const {api,config,baseUrl,username,password}=await client();
const definitions=buildFleet(),devices={},profiles={},savedRules=[];
const knownProfiles=(await api('/api/deviceProfiles?pageSize=100&page=0')).data;
for(const kind of [...new Set(Object.values(definitions).map(d=>d.kind))]) {
 const name='DIGITAL_GREEN_'+kind.toUpperCase();
 let profile=knownProfiles.find(p=>p.name===name);
 if(!profile)profile=await api('/api/deviceProfile','POST',{name,description:'数字绿色农业模拟演示专属设备类型；阈值依据见原生告警规则',type:'DEFAULT',transportType:'DEFAULT',provisionType:'DISABLED',default:false,profileData:{configuration:{type:'DEFAULT'},transportConfiguration:{type:'DEFAULT'},provisionConfiguration:{type:'DISABLED'}}});
 profiles[kind]=profile.id.id;
 const existing=(await api(`/api/alarm/rules/DEVICE_PROFILE/${profile.id.id}?pageSize=100&page=0`)).data;
 for(const desired of ruleDefinitions(kind,profile.id.id)) {
  const old=existing.find(r=>r.name===desired.name||(desired.name==='设备数据无效'&&r.name==='模拟设备数据无效'));
  const saved=await api('/api/alarm/rule','POST',{...(old||{}),...desired,configurationVersion:old?old.configurationVersion+1:0});
  savedRules.push({id:saved.id.id,kind,name:saved.name,profileId:profile.id.id});
 }
}
for(const [key,definition] of Object.entries(definitions)) {
 let device;
 if(config.devices?.[key]?.id)device=await api('/api/device/'+config.devices[key].id);
 else device=(await api('/api/tenant/devices?pageSize=100&page=0&textSearch='+encodeURIComponent(definition.name))).data.find(d=>d.name===definition.name);
 if(device) {
  if(!device.name.startsWith('数字绿色农业·'))throw new Error('拒绝修改非本次模拟演示设备');
  device=await api('/api/device','POST',{...device,name:definition.name,label:definition.label,type:'DIGITAL_GREEN_'+definition.kind.toUpperCase(),deviceProfileId:{entityType:'DEVICE_PROFILE',id:profiles[definition.kind]}});
 } else device=await api('/api/device','POST',{name:definition.name,label:definition.label,type:'DIGITAL_GREEN_'+definition.kind.toUpperCase(),deviceProfileId:{entityType:'DEVICE_PROFILE',id:profiles[definition.kind]},additionalInfo:{description:NOTICE+'；阈值基于参考资料及工程演示参数，不自动控制设备'}});
 await api(`/api/plugins/telemetry/DEVICE/${device.id.id}/SERVER_SCOPE`,'POST',{...definition,simulation:true,sample_source:NOTICE,project:'数字绿色农业',alarm_rules:JSON.stringify(definition.alarm_rules),thresholds:JSON.stringify(definition.thresholds),metrics:JSON.stringify(definition.metrics),deviceProfileId:profiles[definition.kind]});
 const credentials=await api(`/api/device/${device.id.id}/credentials`);
 devices[key]={...definition,id:device.id.id,profileId:profiles[definition.kind],accessToken:credentials.credentialsId};
}
async function atomicJson(name,value) {
 const destination=path.join(dir,name),temporary=destination+'.'+randomUUID()+'.tmp';
 try { await fs.writeFile(temporary,JSON.stringify(value,null,2),{flag:'wx'}); await fs.rename(temporary,destination); }
 finally { await fs.rm(temporary,{force:true}); }
}
await atomicJson('private.json',{...config,baseUrl,username,password,devices});
let manifest={};try{manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));}catch{}
manifest={...manifest,project:'数字绿色农业',notice:NOTICE,baseUrl,fleetCount:Object.keys(devices).length,profiles,alarmRuleDefinitions:savedRules,devices:Object.fromEntries(Object.entries(devices).map(([key,{accessToken,...device}])=>[key,{...device,url:baseUrl+'/entities/devices/'+device.id}])),thresholdNotice:'农业资料参考线与项目工程参数已在每条原生告警中分别说明；空气相对湿度不等于粮粒水分；田间持水量30%为模拟参数。'};
await atomicJson('manifest.json',manifest);
console.log(JSON.stringify({devices:manifest.fleetCount,profiles:Object.keys(profiles).length,profileAlarmRules:savedRules.length,originalDeviceIds:{warehouse:devices.warehouse.id,soil:devices.soil.id},notice:NOTICE}));
