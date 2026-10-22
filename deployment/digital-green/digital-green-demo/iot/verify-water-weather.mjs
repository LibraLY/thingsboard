import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {client,dir} from './api.mjs';
import {buildFleet} from './fleet.mjs';

// Read-only ThingsBoard checks; never injects samples, changes rules or exposes tokens.
const {api,config}=await client();
const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
const definitions=buildFleet(),report={checkedAt:new Date().toISOString(),checks:[],devices:[]};
function check(name,condition){assert.ok(condition,name);report.checks.push({name,passed:true});}
check('34 registered devices and 88 numeric metrics',Object.keys(config.devices).length===34&&Object.values(config.devices).reduce((sum,d)=>sum+Object.keys(d.metrics).length,0)===88);
const six=Object.entries(definitions).filter(([,d])=>['water','weather'].includes(d.kind));
for(const [key,definition] of six){
 const device=config.devices[key];
 check(`${key} manifest identity matches saved device`,!!device&&device.id===manifest.devices[key].id&&device.device_code===definition.device_code&&device.plot_id===definition.plot_id);
 const saved=await api('/api/device/'+device.id);
 check(`${definition.device_code} name and label updated`,saved.name===definition.name&&saved.label===definition.label);
 const values=await api(`/api/plugins/telemetry/DEVICE/${device.id}/values/timeseries?keys=${Object.keys(definition.metrics).join(',')},device_code,kind,plot_id`);
 const now=Date.now();
 check(`${definition.device_code} all numeric telemetry fresh and finite`,Object.keys(definition.metrics).every(metric=>values[metric]?.length&&now-values[metric][0].ts<120000&&Number.isFinite(Number(values[metric][0].value))));
 check(`${definition.device_code} telemetry identity correct`,values.device_code?.[0]?.value===definition.device_code&&values.kind?.[0]?.value===definition.kind&&(!definition.plot_id||values.plot_id?.[0]?.value===definition.plot_id));
 let historicalSampleBeforeMigration=null;
 if(key==='water_1'||key==='water_2'){
  const past=await api(`/api/plugins/telemetry/DEVICE/${device.id}/values/timeseries?keys=water_total&startTs=0&endTs=${now-600000}&limit=1&agg=NONE&orderBy=ASC`);
  historicalSampleBeforeMigration=past.water_total?.[0]?.ts??null;
  check(`${definition.device_code} retains telemetry older than migration`,Number.isFinite(historicalSampleBeforeMigration));
 }
 report.devices.push({key,id:device.id,device_code:definition.device_code,kind:definition.kind,plot_id:definition.plot_id,metrics:Object.keys(definition.metrics),latestSampleAt:new Date(Math.min(...Object.keys(definition.metrics).map(metric=>values[metric][0].ts))).toISOString(),...(historicalSampleBeforeMigration?{historicalSampleAt:new Date(historicalSampleBeforeMigration).toISOString()}:{})});
}
const dashboard=await api('/api/dashboard/'+manifest.dashboardId),c=dashboard.configuration,widgets=Object.values(c.widgets),placements=c.states.default.layouts.main.widgets;
for(const [kind,count]of [['water',4],['weather',2]]){
 const expected=Object.values(config.devices).filter(d=>d.kind===kind).map(d=>d.id).sort();
 check(`${kind} dashboard alias includes exactly ${count} matching devices`,c.entityAliases[kind]?.filter.entityList.length===count&&JSON.stringify([...c.entityAliases[kind].filter.entityList].sort())===JSON.stringify(expected));
 check(`${kind} has a separate native telemetry table`,widgets.some(w=>w.typeFullFqn==='system.cards.entities_table'&&w.config.digitalGreenFleet&&w.config.datasources?.[0]?.entityAliasId===kind&&placements[w.id]?.sizeX===12));
}
check('all-device dashboard alias includes 34 devices',c.entityAliases.fleet.filter.entityList.length===34);
report.dashboard={id:dashboard.id.id,widgetCount:widgets.length,waterDeviceCount:4,weatherDeviceCount:2};
report.passed=true;
await fs.writeFile(path.join(dir,'water-weather-acceptance.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,devices:report.devices,dashboard:report.dashboard,report:'iot/water-weather-acceptance.json'}));
