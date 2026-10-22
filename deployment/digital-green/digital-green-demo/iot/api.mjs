import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const dir = path.dirname(fileURLToPath(import.meta.url));
export async function client() {
  let config;
  try { config = JSON.parse(await fs.readFile(path.join(dir,'private.json'),'utf8')); } catch { config = {}; }
  const baseUrl = process.env.THINGSBOARD_URL || config.baseUrl || 'http://localhost:8080';
  let username = process.env.THINGSBOARD_USERNAME || config.username;
  let password = process.env.THINGSBOARD_PASSWORD || config.password;
  if (!username || !password) throw new Error('请通过 THINGSBOARD_USERNAME / THINGSBOARD_PASSWORD 或本机 private.json 配置租户维护账号。');
  async function request(route, method='GET', body, token) {
    const response = await fetch(baseUrl+route,{method,headers:{'Content-Type':'application/json',...(token?{'X-Authorization':'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
    if (!response.ok) { const error = new Error(`ThingsBoard ${method} ${route.split('?')[0]}: ${response.status}`); error.status = response.status; throw error; }
    const raw = await response.text(); return raw ? JSON.parse(raw) : null;
  }
  const login = await request('/api/auth/login','POST',{username,password});
  return {baseUrl,username,password,config,api:(route,method,body)=>request(route,method,body,login.token)};
}
