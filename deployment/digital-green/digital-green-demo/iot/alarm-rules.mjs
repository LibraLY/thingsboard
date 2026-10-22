import {alarmRules,METRICS} from './fleet.mjs';
const predicate=(argument,operation,value,valueType='NUMERIC')=>({argument,valueType,operation:'AND',predicates:[{type:valueType,operation,value:{staticValue:value,dynamicValueArgument:null}}]});
function condition(filters,duration=60,operation='AND') {
 return {type:duration?'DURATION':'SIMPLE',expression:{type:'SIMPLE',operation,filters},schedule:null,...(duration?{unit:'SECONDS',value:{staticValue:duration,dynamicValueArgument:null}}:{})};
}
export function ruleDefinitions(kind,profileId) {
 const rules=alarmRules(kind);
 return rules.map(meta=>{
  const key=meta.metric,quality=key==='data_valid';
  let create,clear,severity='WARNING';
  if(quality){create=predicate(key,'EQUAL',false,'BOOLEAN');clear=predicate(key,'EQUAL',true,'BOOLEAN');severity='MAJOR';}
  if(meta.type==='土壤墒情不足'){create=predicate(key,'LESS',60);clear=predicate(key,'GREATER_OR_EQUAL',65);}
  if(meta.type==='土壤墒情干旱'){create=predicate(key,'LESS',50);clear=predicate(key,'GREATER_OR_EQUAL',55);severity='MAJOR';}
  if(meta.type==='燕麦粮粒水分关注'){create=predicate(key,'GREATER',13.5);clear=predicate(key,'LESS_OR_EQUAL',13);}
  if(meta.type==='燕麦粮粒水分偏高'){create=predicate(key,'GREATER_OR_EQUAL',13.6);clear=predicate(key,'LESS_OR_EQUAL',13);severity='MAJOR';}
  if(meta.type==='粮堆单点温度关注'){create=predicate(key,'GREATER',25);clear=predicate(key,'LESS_OR_EQUAL',23);severity='MAJOR';}
  if(meta.type==='仓内空气湿度关注'){create=predicate(key,'GREATER',65);clear=predicate(key,'LESS_OR_EQUAL',62);}
  const argumentsConfig={ [key]:{refEntityKey:{key,type:'TS_LATEST'}} };
  argumentsConfig.eligible_for_alarm={refEntityKey:{key:'eligible_for_alarm',type:'TS_LATEST'},defaultValue:'false'};
  if(!quality)argumentsConfig.data_valid={refEntityKey:{key:'data_valid',type:'TS_LATEST'}};
  const metrics=METRICS[kind];
  const validRanges=Object.entries(metrics).flatMap(([name,m])=>[predicate(name,'GREATER_OR_EQUAL',m.min),predicate(name,'LESS_OR_EQUAL',m.max)]);
  const invalidRanges=Object.entries(metrics).flatMap(([name,m])=>[predicate(name,'LESS',m.min),predicate(name,'GREATER',m.max)]);
  for(const name of Object.keys(metrics))argumentsConfig[name]={refEntityKey:{key:name,type:'TS_LATEST'}};
  const eligible=predicate('eligible_for_alarm','EQUAL',true,'BOOLEAN');
  const filters=quality?[create,...invalidRanges]:[predicate('data_valid','EQUAL',true,'BOOLEAN'),create,...validRanges,eligible];
  const createCondition=condition(filters,meta.duration_seconds,quality?'OR':'AND');
  if(quality)createCondition.expression={type:'TBEL',expression:'return eligible_for_alarm == true && (data_valid == false || '+Object.entries(metrics).map(([name,m])=>`(${name} < ${m.min} || ${name} > ${m.max})`).join(' || ')+');'};
  return {entityId:{entityType:'DEVICE_PROFILE',id:profileId},name:meta.type,configurationVersion:0,debugSettings:{failuresEnabled:true,allEnabled:false,allEnabledUntil:0},additionalInfo:{description:meta.basis+' '+meta.source_url},configuration:{type:'ALARM',arguments:argumentsConfig,createRules:{[severity]:{condition:createCondition,alarmDetails:`模拟演示，非客户实测。指标 ${key} = \${${key}}。${meta.basis} 来源：${meta.source_url||'本项目设备数据质量契约'}`,dashboardId:null}},clearRule:{condition:condition(quality?[clear,...validRanges,eligible]:[clear,predicate('data_valid','EQUAL',true,'BOOLEAN'),...validRanges,eligible],meta.clear_duration_seconds),alarmDetails:meta.basis,dashboardId:null},propagate:false,propagateToOwner:false,propagateToTenant:false,propagateRelationTypes:[]}};
 });
}
