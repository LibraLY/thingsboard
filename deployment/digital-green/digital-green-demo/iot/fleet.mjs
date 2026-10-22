export const NOTICE = '模拟演示数据，非客户实测';
export const SOIL_SOURCE = 'https://zzys.moa.gov.cn/tzgg/201204/t20120406_6310434.htm';
export const GRAIN_SOURCE = 'https://www.canada.ca/en/grain-commission/services/grain-quality/manage-stored-grain/prevent-ochratoxin-a.html';
export const TEMP_SOURCE = 'https://www.lswz.gov.cn/html/zmhd/jzxx/2022-08/23/content_271689.shtml';
export const RH_SOURCE = 'https://www.fao.org/4/t1838e/T1838E1a.htm';
const metric = (unit,label,min,max) => ({unit,label,min,max});
export const METRICS = {
 soil:{soil_moisture:metric('%体积','土壤体积含水率',0,100),soil_temperature:metric('℃','土壤温度',-40,80),soil_relative_moisture:metric('%田间持水量','土壤相对含水量',0,333.4)},
 warehouse:{temperature:metric('℃','仓内空气温度',-40,80),humidity:metric('%RH','仓内空气相对湿度',0,100)},
 grain:{grain_temperature:metric('℃','粮堆单点温度',-40,80),grain_moisture:metric('%湿基','燕麦粮粒湿基水分',0,60)},
 weather:{air_temperature:metric('℃','气温',-50,60),air_humidity:metric('%RH','空气相对湿度',0,100),rainfall:metric('mm','本次累计降雨',0,1000),wind_speed:metric('m/s','风速',0,80)},
 water:{water_flow:metric('m³/h','灌溉瞬时流量',0,1000),water_total:metric('m³','水表累计用水量',0,1e9)}
};
export function alarmRules(kind) {
 const common = [{type:'设备数据无效',metric:'data_valid',threshold:'false/超量程',basis:'项目数据质量规则：本采集器发现指标缺失或非数值时上报data_valid=false；标志无效或数值超量程立即告警；恢复需有效数据。未上报/离线另由时效检查处理。',source_url:'',duration_seconds:0,clear_duration_seconds:0}];
 if(kind==='soil') return [...common,
  {type:'土壤墒情不足',metric:'soil_relative_moisture',threshold:'<60%',clear_threshold:'>=65%',duration_seconds:60,clear_duration_seconds:60,basis:'农业部2012土壤墒情方案：通常60–80%适宜，50–60%不足；65%恢复线和持续60秒为演示工程参数。田间持水量30%为模拟参数，非实测。',source_url:SOIL_SOURCE},
  {type:'土壤墒情干旱',metric:'soil_relative_moisture',threshold:'<50%',clear_threshold:'>=55%',duration_seconds:60,clear_duration_seconds:60,basis:'农业部2012方案通常<50%为干旱；55%恢复线和持续60秒为演示工程参数，需按土壤/生育期校准。',source_url:SOIL_SOURCE}];
 if(kind==='grain') return [...common,
  {type:'燕麦粮粒水分关注',metric:'grain_moisture',threshold:'>13.5%',clear_threshold:'<=13.0%',duration_seconds:60,clear_duration_seconds:60,basis:'加拿大粮委燕麦安全储存参考为<13.6%湿基；13.5%预警及13.0%恢复为项目保守工程线，非中国强标。',source_url:GRAIN_SOURCE},
  {type:'燕麦粮粒水分偏高',metric:'grain_moisture',threshold:'>=13.6%',clear_threshold:'<=13.0%',duration_seconds:60,clear_duration_seconds:60,basis:'加拿大粮委参考燕麦安全储存<13.6%湿基；适用当地条件，非中国强标，须结合储期、品质复核。',source_url:GRAIN_SOURCE},
  {type:'粮堆单点温度关注',metric:'grain_temperature',threshold:'>25℃',clear_threshold:'<=23℃',duration_seconds:60,clear_duration_seconds:60,basis:'国家粮储局准低温储粮介绍单点最高25℃。本项目>25℃为人工核查工程线；不凭单点判断整仓平均温度或储粮安全。',source_url:TEMP_SOURCE}];
 if(kind==='warehouse') return [...common,{type:'仓内空气湿度关注',metric:'humidity',threshold:'>65%RH',clear_threshold:'<=62%RH',duration_seconds:60,clear_duration_seconds:60,basis:'工程辅助提醒。FAO所述约65%平衡相对湿度是粮食平衡条件，不能等同任意仓内空气测点，更不能换算粮粒水分。',source_url:RH_SOURCE}];
 return common;
}
export function buildFleet() {
 const out={};
 function add(key,kind,device_code,label,{plot='',warehouse='',batch='',name}={}) {
  out[key]={kind,device_code,name:name||`数字绿色农业·${label} ${device_code}`,label,farm_id:'DEMO-WC-01',plot_id:plot,warehouse_id:warehouse,batch_id:batch,season:2026,metrics:METRICS[kind],...(kind==='soil'?{field_capacity_pct:30}:{}),thresholds:Object.fromEntries(alarmRules(kind).map(r=>[r.type,{create:r.threshold,clear:r.clear_threshold||'true',duration_seconds:r.duration_seconds,clear_duration_seconds:r.clear_duration_seconds}])),alarm_rules:alarmRules(kind),telemetryKeys:[...Object.keys(METRICS[kind]),'data_valid','updated_at','sample_source','device_code','kind']};
 }
 for(let p=0;p<4;p++)for(let s=0;s<4;s++) {
  const plot=`DEMO-PLOT-${'ABCD'[p]}`,code=`SOIL-${'ABCD'[p]}${String(s+1).padStart(2,'0')}`;
  add(p===0&&s===0?'soil':`soil_${'abcd'[p]}${s+1}`,'soil',code,`${'ABCD'[p]}地块土壤探头${s+1}`,{plot,batch:p===0?'DEMO-OAT-2026-001':''});
 }
 for(let w=0;w<4;w++)for(let s=0;s<2;s++) {
  const warehouse=`DEMO-WH-${'ABCD'[w]}`,batch=`DEMO-OAT-2026-${String(w+1).padStart(3,'0')}`;
  add(w===0&&s===0?'warehouse':`warehouse_${'abcd'[w]}${s+1}`,'warehouse',`AIR-${'ABCD'[w]}${s+1}`,`${'ABCD'[w]}仓空气温湿度${s+1}`,{warehouse,batch,plot:w===0?'DEMO-PLOT-A':''});
 }
 for(let w=0;w<4;w++)add(`grain_${'abcd'[w]}`,'grain',`GRAIN-${'ABCD'[w]}1`,`${'ABCD'[w]}仓粮堆温度与粮粒水分`,{warehouse:`DEMO-WH-${'ABCD'[w]}`,batch:`DEMO-OAT-2026-${String(w+1).padStart(3,'0')}`});
 for(let n=1;n<=2;n++)add(`weather_${n}`,'weather',`WEATHER-${n}`,`基地气象站${n}`);
 // Keep the original A/C integration keys so stored UUIDs and telemetry remain attached.
 for(const [key,plot] of [['water_1','A'],['water_b','B'],['water_2','C'],['water_d','D']])add(key,'water',`WATER-${plot}`,`${plot}地块灌溉水表`,{plot:`DEMO-PLOT-${plot}`});
 return out;
}
const round=n=>Math.round(n*10)/10;
export function relativeMoisture(volume,fieldCapacity) {
 if(!Number.isFinite(volume)||!Number.isFinite(fieldCapacity)||fieldCapacity<=0)throw new Error('田间持水量必须为正数，且与体积含水率同口径。');
 return round(volume/fieldCapacity*100);
}
export function validateValues(device,values) {
 return Object.entries(device.metrics).every(([key,m])=>Number.isFinite(values[key])&&values[key]>=m.min&&values[key]<=m.max);
}
const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
export function sampleValues(time,key,device) {
 const phase=time/1000/600,index=Object.keys(buildFleet()).indexOf(key),wave=Math.sin(phase+index*.7);
 const common={updated_at:stamp.format(new Date(time)),sample_source:NOTICE,farm_id:device.farm_id,plot_id:device.plot_id,batch_id:device.batch_id,warehouse_id:device.warehouse_id,device_code:device.device_code,kind:device.kind,season:2026,eligible_for_alarm:true,historical_seed:false,quality_test:false};
 let v={};
 if(device.kind==='soil') {const dry=key==='soil_d3'||key==='soil_d4';v={soil_moisture:round((dry?13.8:22.5)+1.5*wave),soil_temperature:round(13+3*wave)};v.soil_relative_moisture=relativeMoisture(v.soil_moisture,device.field_capacity_pct);}
 if(device.kind==='warehouse')v={temperature:round(20.5+2*wave),humidity:round((key==='warehouse_c2'?68:60)+3*wave)};
 if(device.kind==='grain')v={grain_temperature:round((key==='grain_c'?26.5:19)+wave),grain_moisture:round((key==='grain_d'?14.1:12.3)+.2*wave)};
 if(device.kind==='weather')v={air_temperature:round(14+5*wave),air_humidity:round(45+10*wave),rainfall:round(1+Math.max(0,wave)*3),wind_speed:round(2.5+1.5*wave)};
 if(device.kind==='water')v={water_flow:round(8+2*wave),water_total:round(1000+(time-Date.UTC(2026,9,17))/3600000*(key==='water_1'?8:6))};
 return {...common,...v,data_valid:validateValues(device,v),...(key==='warehouse'?{warehouse_status:v.humidity>65?'工程辅助提醒':'工程参考线内'}:{})};
}
