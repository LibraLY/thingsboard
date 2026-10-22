import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const sourceDirectory=path.dirname(fileURLToPath(import.meta.url));
async function fixture(t,missingStatus) {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'digital-green-dashboard-'));
 const posted=[];
 const template={
  title:'Fixture dashboard',
  configuration:{
   widgets:{},
   entityAliases:{
    warehouse:{alias:'演示仓库',filter:{type:'singleEntity',singleEntity:{entityType:'DEVICE',id:'old-warehouse'}}},
    soil:{alias:'演示地块',filter:{type:'singleEntity',singleEntity:{entityType:'DEVICE',id:'old-soil'}}},
   },
   states:{default:{layouts:{main:{gridSettings:{},widgets:{}}}}},
  },
 };
 const server=createServer(async (request,response)=>{
  const chunks=[];for await(const chunk of request)chunks.push(chunk);
  const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined;
  response.setHeader('Content-Type','application/json');
  if(request.url==='/api/auth/login'){response.end(JSON.stringify({token:'fixture-only'}));return;}
  if(request.url==='/api/dashboard/old-dashboard'){response.statusCode=missingStatus;response.end('{}');return;}
  if(request.url.startsWith('/api/tenant/dashboards?')){response.end(JSON.stringify({data:[]}));return;}
  if(request.url==='/api/dashboard'&&request.method==='POST'){posted.push(body);response.end(JSON.stringify({...body,id:{id:'new-dashboard'}}));return;}
  response.statusCode=500;response.end('{}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('digital-green-dashboard-'));
  await fs.rm(directory,{recursive:true,force:true});
 });
 const baseUrl=`http://127.0.0.1:${server.address().port}`;
 const devices={warehouse:{id:'new-warehouse',label:'A仓',kind:'warehouse'},soil:{id:'new-soil',label:'A地块',kind:'soil'},water:{id:'new-water',kind:'water'},weather:{id:'new-weather',kind:'weather'}};
 for(const name of ['api.mjs','fleet-dashboard.mjs'])await fs.copyFile(path.join(sourceDirectory,name),path.join(directory,name));
 await fs.writeFile(path.join(directory,'private.json'),JSON.stringify({baseUrl,devices}));
 await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify({dashboardId:'old-dashboard'}));
 await fs.writeFile(path.join(directory,'dashboard.json'),JSON.stringify(template));
 const widgetDirectory=path.join(directory,'source/application/src/main/data/json/system/widget_types');
 await fs.mkdir(widgetDirectory,{recursive:true});
 for(const name of ['entities_table','alarms_table'])await fs.writeFile(path.join(widgetDirectory,name+'.json'),JSON.stringify({descriptor:{defaultConfig:JSON.stringify({settings:{},alarmSource:{dataKeys:[]}})}}));
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(directory,'fleet-dashboard.mjs')],{env:{...process.env,THINGSBOARD_URL:baseUrl,THINGSBOARD_USERNAME:'fixture-user',THINGSBOARD_PASSWORD:'fixture-only',THINGSBOARD_SOURCE_DIR:path.join(directory,'source')},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('exit',code=>resolve({code,stderr}));
 });
 return {directory,posted,result};
}

test('fresh database restores dashboard template and rebinds saved device IDs',async t=>{
 const {directory,posted,result}=await fixture(t,404);
 assert.equal(result.code,0,result.stderr);
 assert.equal(posted.length,1);
 assert.equal(posted[0].id,undefined);
 assert.equal(posted[0].configuration.entityAliases.soil.filter.singleEntity.id,'new-soil');
 assert.equal(posted[0].configuration.entityAliases.warehouse.filter.singleEntity.id,'new-warehouse');
 assert.deepEqual(posted[0].configuration.entityAliases.fleet.filter.entityList,['new-warehouse','new-soil','new-water','new-weather']);
 const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
 assert.equal(manifest.dashboardId,'new-dashboard');
});

test('authorization errors cannot trigger dashboard creation',async t=>{
 const {posted,result}=await fixture(t,403);
 assert.notEqual(result.code,0);
 assert.equal(posted.length,0);
 assert.match(result.stderr,/: 403/);
});
