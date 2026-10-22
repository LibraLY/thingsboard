import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {client,dir} from './api.mjs';
const {api,config}=await client();
const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
let dashboard;
if(manifest.dashboardId) {
 try { dashboard=await api('/api/dashboard/'+manifest.dashboardId); }
 catch(error) { if(error.status!==404)throw error; }
}
if(!dashboard) {
 const template=JSON.parse(await fs.readFile(path.join(dir,'dashboard.json'),'utf8'));
 const candidates=(await api('/api/tenant/dashboards?pageSize=100&page=0&textSearch='+encodeURIComponent(template.title))).data;
 const existing=candidates.find(item=>item.title===template.title);
 dashboard=existing?await api('/api/dashboard/'+existing.id.id):{title:template.title,name:template.name,configuration:template.configuration};
}
const c=dashboard.configuration,layout=c.states.default.layouts.main;
// Keep the native dashboard scrollable. Fit-to-screen compresses the table body
// behind its header and paginator as more widgets are added.
layout.gridSettings.autoFillHeight=false;
layout.gridSettings.mobileAutoFillHeight=false;
const sourceRoots=[process.env.THINGSBOARD_SOURCE_DIR,path.resolve(dir,'../../../..'),path.resolve(dir,'../../thingsboard')].filter(Boolean);
const defaults=async name=>{
 for(const sourceRoot of sourceRoots) {
  try { return JSON.parse(JSON.parse(await fs.readFile(path.join(sourceRoot,'application/src/main/data/json/system/widget_types',name+'.json'),'utf8')).descriptor.defaultConfig); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
 }
 throw new Error('缺少 ThingsBoard 原生组件源码，请将 THINGSBOARD_SOURCE_DIR 指向 ThingsBoard 仓库根目录。');
};
const ids=Object.values(config.devices).map(d=>d.id);
for(const key of ['warehouse','soil'])if(c.entityAliases[key])c.entityAliases[key].alias=config.devices[key].label;
// Imported templates contain instance-specific UUIDs. Rebind their single-device
// aliases when restoring into a fresh database; retain every widget reference.
for(const alias of Object.values(c.entityAliases)) {
 if(alias.filter?.type!=='singleEntity'||alias.filter.singleEntity?.entityType!=='DEVICE')continue;
 const key=/仓/.test(alias.alias)?'warehouse':/地块/.test(alias.alias)?'soil':null;
 if(key) { alias.alias=config.devices[key].label;alias.filter.singleEntity.id=config.devices[key].id; }
}
c.entityAliases.fleet={id:'fleet',alias:'燕麦产业现场设备',filter:{type:'entityList',entityType:'DEVICE',entityList:ids,resolveMultiple:true}};
for(const [kind,alias] of [['water','A–D地块灌溉水表'],['weather','基地气象站']])c.entityAliases[kind]={id:kind,alias,filter:{type:'entityList',entityType:'DEVICE',entityList:Object.values(config.devices).filter(d=>d.kind===kind).map(d=>d.id),resolveMultiple:true}};
function add(config,typeFullFqn,type,row,sizeY,sizeX=24,col=0){const id=randomUUID();c.widgets[id]={id,typeFullFqn,type,sizeX,sizeY,config};layout.widgets[id]={sizeX,sizeY,row,col,mobileOrder:row+1+(col?1:0),mobileHeight:sizeY};}
// Remove only widgets installed by this script so repeated initialization is idempotent.
for(const [id,w] of Object.entries(c.widgets))if(w.config?.digitalGreenFleet){delete c.widgets[id];delete layout.widgets[id];}
for(const [id,w] of Object.entries(c.widgets)) {
 if(w.config.settings?.markdownTextPattern?.includes('一块地，一季生产，一批入库粮')||/\d+ 台设备，4 个地块/.test(w.config.settings?.markdownTextPattern||''))w.config.settings.markdownTextPattern='<div class="dg"><div class="eyebrow">三产融合（内蒙古）高新科技股份有限公司 · 燕麦产业现场感知</div><div class="title">34 台设备，4 个地块，4 座仓库</div><div class="sub">种植地块 → 原粮批次 → 仓储环境<br>16 个土壤探头 · 8 个仓内温湿度 · 4 个粮堆/粮粒探头 · A/B/C/D四地块灌溉水表 · 2 个独立气象站<br>每 30 秒采集 88 项数值指标 → 每分钟去重入湖 → 质量检查 → 业务与 AI 查询</div></div>';
 if(w.config.settings?.markdownTextFunction?.includes('65%RH 仅为演示阈值'))w.config.settings.markdownTextFunction='var d=data[0]||{};return `<div class="dg"><div class="label">A仓空气相对湿度</div><div class="kpi">${d.humidity??"—"}<span class="unit">%RH</span></div><div class="small">65%RH为工程辅助提醒；不是粮粒水分</div></div>`;';
 if(w.config.settings?.markdownTextFunction?.includes('仅演示提醒流程')) {
  w.config.settings.useMarkdownTextFunction=false;w.config.settings.markdownTextFunction='';
  w.config.settings.markdownTextPattern='<div class="dg"><div class="label">原生告警规则 · 下方可确认和查看历史</div><div class="small">墒情相对含水量：&lt;60%不足、&lt;50%干旱。<br>燕麦粮粒湿基水分：≥13.6%参考风险线。<br>粮堆单点温度：&gt;25℃人工核查线。<br>以上持续60秒触发；恢复采用迟滞与持续60秒。量程错误立即告警。</div></div>';
 }
 if(w.config.settings?.markdownTextPattern?.includes('本机采集桥')||w.config.settings?.markdownTextPattern?.includes('从现场感知到数据应用'))w.config.settings.markdownTextPattern='<div class="dg"><div class="label">从现场感知到数据应用</div><div style="font-size:17px;font-weight:600;line-height:1.5">34台设备 → Airflow分钟工作流 → Iceberg数据湖 → 按账号授权查询</div><div class="small">设备、指标、告警、基地、地块和批次编号同步纳管。设备告警由ThingsBoard原生规则产生，可确认与自动恢复。阈值依据和工程设置见告警详情，粮粒水分与空气湿度严格区分。</div></div>';
}
const key=(name,label,type='timeseries')=>({name,label,type,settings:name==='kind'?{useCellContentFunction:true,cellContentFunction:"return ({soil:'土壤探头',warehouse:'仓内环境',grain:'粮堆与粮粒',weather:'气象站',water:'灌溉水表'})[value] || value;"}:name==='plot_id'?{useCellContentFunction:true,cellContentFunction:"return value ? value.replace('DEMO-PLOT-','')+'地块' : '—';"}:name==='warehouse_id'?{useCellContentFunction:true,cellContentFunction:"return value ? value.replace('DEMO-WH-','')+'仓' : '—';"}:{},color:'#19745a'});
for(const [kind,title,keys,col] of [['water','四地块用水 · A / B / C / D',[key('device_code','水表编号'),key('plot_id','地块'),key('water_flow','流量 m³/h'),key('water_total','累计用水 m³'),key('updated_at','上报时间')],0],['weather','农业气象 · 两个独立气象站',[key('device_code','气象站编号'),key('air_temperature','气温 ℃'),key('air_humidity','湿度 %RH'),key('rainfall','本次降雨 mm'),key('wind_speed','风速 m/s'),key('updated_at','上报时间')],12]]){const group=await defaults('entities_table');group.digitalGreenFleet=true;group.title=title;group.dropShadow=false;group.borderRadius='16px';group.settings={...group.settings,entitiesTitle:kind==='water'?'四地块水表':'基地气象站',displayEntityLabel:true,displayEntityName:false,defaultPageSize:5,defaultSortOrder:'device_code'};group.datasources=[{type:'entity',entityAliasId:kind,name:group.settings.entitiesTitle,dataKeys:keys}];add(group,'system.cards.entities_table','latest',19,10,12,col);}
const table=await defaults('entities_table');table.digitalGreenFleet=true;table.title='34 台设备 · 最新采样与资产标识';table.dropShadow=false;table.borderRadius='16px';table.settings={...table.settings,entitiesTitle:'设备',displayEntityLabel:true,displayEntityName:false,defaultPageSize:10,defaultSortOrder:'device_code'};table.datasources=[{type:'entity',entityAliasId:'fleet',name:'设备',dataKeys:[key('device_code','设备编号'),key('kind','设备类型'),key('plot_id','地块'),key('warehouse_id','仓库'),key('soil_relative_moisture','相对墒情 %'),key('humidity','空气 %RH'),key('grain_moisture','粮粒湿基 %'),key('grain_temperature','粮温 ℃'),key('updated_at','上报时间')]}];add(table,'system.cards.entities_table','latest',29,12);
const alarms=await defaults('alarms_table');alarms.digitalGreenFleet=true;alarms.title='原生告警 · 自动触发、确认与恢复';alarms.dropShadow=false;alarms.borderRadius='16px';alarms.alarmSource={...alarms.alarmSource,type:'entity',entityAliasId:'fleet',name:'34台设备',dataKeys:alarms.alarmSource.dataKeys.filter(k=>k.name!=='assignee')};alarms.settings={...alarms.settings,alarmsTitle:'设备原生告警',allowAcknowledgment:true,allowClear:false,allowAssign:false,displayDetails:true,defaultPageSize:10};alarms.alarmSearchStatus='ANY';alarms.alarmsPollingInterval=5;add(alarms,'system.alarm_widgets.alarms_table','alarm',41,12);
dashboard.title='三产融合 · 燕麦产业现场感知';dashboard.name=dashboard.title;
dashboard.configuration.description='三产融合（内蒙古）高新科技股份有限公司燕麦产业场景的现场感知展示。后台保留模拟来源，现有台账不应自动认定为公司实测；不代表加工线或真实硬件已接入。';
for(const w of Object.values(c.widgets)) {
 if(w.config.title)w.config.title=w.config.title.replaceAll(' · 模拟','');
 for(const k of ['markdownTextPattern','markdownTextFunction'])if(w.config.settings?.[k])w.config.settings[k]=w.config.settings[k].replaceAll('每 30 秒模拟上报 · 非真实传感器','每 30 秒自动上报').replaceAll('数值由模拟器生成','持续监测土壤变化').replaceAll('模拟演示数据，非客户实测','').replaceAll('演示仓库','A仓').replaceAll('演示地块','A地块');
}
const saved=await api('/api/dashboard','POST',dashboard);
await fs.writeFile(path.join(dir,'dashboard.json'),JSON.stringify(saved,null,2));
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({...manifest,dashboardId:saved.id.id,dashboardUrl:(config.baseUrl||'http://localhost:8080')+'/dashboards/'+saved.id.id},null,2));
console.log(JSON.stringify({dashboardId:saved.id.id,widgets:Object.keys(saved.configuration.widgets).length,deviceAliasCount:ids.length}));
