# 数字绿色农业 · 现场感知

本机演示使用34台程序产生数据的设备，尚未接入真实客户现场，也不控制水泵、通风等硬件。根据展示要求，业务页面使用正式业务名称；`simulation`、`sample_source`、告警详情和本说明保留来源性质。

## 入口与设备

[ThingsBoard原生仪表盘](http://localhost:8080/dashboards/da423a00-ca4a-11f1-88a2-4f0a77358a9e)。仪表盘UUID和原有soil/warehouse设备UUID保持不变。

| 类别 | 数量 | 数值指标 |
|---|---:|---|
| A–D地块土壤探头 | 16 | 体积含水率、土温、相对田间持水量 |
| A–D仓空气探头 | 8 | 空气温度、空气相对湿度 |
| A–D仓粮堆/粮粒探头 | 4 | 粮堆单点温度、粮粒湿基水分 |
| 气象站 | 2 | 气温、空气湿度、本次累计降雨、风速 |
| A–D地块灌溉水表 | 4 | 瞬时流量、累计用水量 |

每30秒每台上报一次，合计88项数值指标，即每小时约10560个数值点。使用Start-Simulator.ps1 -SeedHistory可显式补每台最近6小时73组样本，常规重启不重复补历史。历史样本eligible_for_alarm=false，实时样本true，原生告警的产生和恢复均检查实时门控，不能用集中历史补点冒充持续60秒。不是每秒或百万级压力测试。D地块两探头、C仓粮温与D仓粮水分设置可持续复现的异常场景，其他设备作为对照。

## 原生告警依据与设置

告警通过ThingsBoard4.3原生 `/api/alarm/rule` 绑定5类专属Device Profile，而非前端比较后着色。当前11条profile规则覆盖对应34台设备。

| 规则 | 产生条件 | 自动恢复条件 | 依据 |
|---|---|---|---|
| 土壤墒情不足 | 相对含水量<60%，持续60秒 | >=65%，持续60秒 | 农业部墒情方案通常60–80%适宜，50–60%不足 |
| 土壤墒情干旱 | 相对含水量<50%，持续60秒 | >=55%，持续60秒 | 同方案通常<50%为干旱 |
| 燕麦粮粒水分关注 | 湿基水分>13.5%，持续60秒 | <=13.0%，持续60秒 | 项目保守工程预警线 |
| 燕麦粮粒水分偏高 | 湿基水分>=13.6%，持续60秒 | <=13.0%，持续60秒 | 加拿大粮委燕麦储存参考<13.6%，非中国强标 |
| 粮堆单点温度关注 | >25℃，持续60秒 | <=23℃，持续60秒 | 参考准低温储粮最高单点25℃，用于人工核查 |
| 仓内空气湿度关注 | >65%RH，持续60秒 | <=62%RH，持续60秒 | 工程辅助提醒，不能等同粮粒水分 |
| 设备数据无效 | 本采集器data_valid=false，或任一数值超设备量程，立即 | data_valid=true且指标均回到量程内，立即 | 项目设备数据契约；设备静默缺测需另看时效 |

60秒持续、55/65%、13.0%、23℃、62%RH恢复线为项目工程参数，用于迟滞和避免抖动，不是引用资料的农业标准。每个30秒上报点会触发计算，实际出现通常要等待60秒及后续样本。每条原生告警的详情都带来源链接和用途限制；可在原生表中查看、确认，恢复由规则自动处理。

土壤相对含水量 = 土壤体积含水率 ÷ 同体积口径田间持水量 ×100。当前田间持水量30%是模拟参数；不能把15%体积含水率直接与60%相对墒情线比较，也没有采用无依据的40%严重旱情线。真实部署须按土壤和作物生育期校准。

空气相对湿度%RH、粮粒湿基水分%是不同量。FAO约65%平衡相对湿度的表述有平衡条件，不能用仓内某空气测点推定粮粒水分或安全结论。单点粮温也不能代替整仓平均粮温。当前没有声称已配置离线原生告警；可由采集时效和数据质量检查发现失联，需要原生离线策略时另行按上报周期配置并验证。

资料：

- [农业部《全国土壤墒情监测工作方案》](https://zzys.moa.gov.cn/tzgg/201204/t20120406_6310434.htm)
- [加拿大粮委：防范赭曲霉毒素及各粮种安全水分](https://www.canada.ca/en/grain-commission/services/grain-quality/manage-stored-grain/prevent-ochratoxin-a.html)
- [国家粮储局：准低温储粮介绍](https://www.lswz.gov.cn/html/zmhd/jzxx/2022-08/23/content_271689.shtml)
- [FAO粮食储存环境与水分](https://www.fao.org/4/t1838e/T1838E1a.htm)
- [ThingsBoard原生告警规则](https://thingsboard.io/docs/user-guide/alarm-rules/)

## 日常运行与安全维护

```powershell
node .\init.mjs
& .\Start-Simulator.ps1
& .\Stop-Simulator.ps1
node --test .\fleet.test.mjs
node .\verify-water-weather.mjs
```

初始化查找已保存UUID，可重复更新34设备、专属profile和原仪表盘；不改其他设备或账号。模拟器每30秒实际写入ThingsBoard HTTP Telemetry API；Airflow按分钟读取并纳管入湖。

`private.json`保存现有本机租户维护配置与设备访问令牌，仅由本机脚本和只读挂载的采集工作进程使用，由.gitignore排除。禁止打印、提交或转发。`manifest.json`是无令牌的公开设备契约，`dashboard.json`是原生仪表盘导出。`fleet-acceptance.json`记录原生实际告警状态转换，不含凭据。

四地块水表分别为 `WATER-A/B/C/D`，一表明确关联一地块。原 `water_1`（A）、`water_2`（C）内部键与设备 UUID 保持不变，编码由 `WATER-1/2` 更新为 `WATER-A/C`，历史遥测保留；新增内部键为 `water_b`、`water_d`。两个基地气象站仍为 `WEATHER-1/2`，不作为水表、不虚构地块关联。原生仪表盘将四水表和两气象站分表显示。

原生仪表盘采用纵向滚动布局，关闭 ThingsBoard 的 `autoFillHeight`，避免将全部组件压进一屏。水表和气象分表各留10个网格行高，设备总表和告警表各12行；保留原生分页和表格内部滚动。手机保持独立纵向排列。

`verify-water-weather.mjs` 只读检查六设备身份、最新数值遥测、A/C 历史保留及原生分表，结果写入不含凭据的 `water-weather-acceptance.json`；不注入遥测、不等待60秒告警、不修改规则。B/D水表从创建后正常采样，不自动伪造此前历史。初始化以临时文件重命名方式更新私有配置和公开契约，避免采集工作进程读到半份 JSON。

每设备包含`id/name/label/kind/device_code/farm_id/plot_id/warehouse_id/batch_id/season/metrics/alarm_rules/thresholds`；土壤设备另有`field_capacity_pct`。`metrics`为指标键到`{unit,label,min,max}`的映射。保留`soil`和`warehouse`旧字典键；不对应地块或批次的设备该字段为空，不伪造关联。

真实告警验收会暂时停止本次模拟器，使用原有60秒持续/恢复规则，向3台设备注入受控值并确认后恢复，另注入一次明确`quality_test=true`的-1%体积含水率供隔离验证：

```powershell
& .\Stop-Simulator.ps1
node .\verify-fleet.mjs --run
& .\Start-Simulator.ps1
```

验收不改变阈值、不删除历史、不调用真实硬件控制接口。脚本异常也会尽力恢复4台被测设备数据，随后仍需恢复模拟器。

仅需再次演示数据质量隔离时，可执行 `node .\inject-quality-demo.mjs --run`。它只注入soil_b1一次-1%体积含水率和-3.3%相对墒情，25秒后恢复有效数据；历史测试点保留quality_test标识，供采集工作流分流到质量隔离表。正常上报模拟器可以继续运行。原生告警出现与恢复以及业务质量问题均为实际存储状态，不是前端硬编码数字。

## 统一账号

现有Supabase授权码、PKCE与nonce登录继续使用，issuer+subject经显式绑定关联原ThingsBoard用户。未绑定普通账号拒绝进入，不自动获得租户管理员权限。内部维护登录与原账户不变；配置及验收见本目录上级的 Supabase OIDC 扩展说明，以及 Snowflake 仓库中的共享认证部署工具；云客户端配置和显式身份映射仍由本机私有配置与现有数据库保管。


## GitHub 源码布局与迁移

本目录是原 `digital-green-demo/iot` 的无凭据源码副本。运行命令前先切换到本目录。`api.mjs` 不再从旧电脑的使用说明提取密码，首次运行请在当前终端设置 `THINGSBOARD_USERNAME`、`THINGSBOARD_PASSWORD`；可选 `THINGSBOARD_URL` 默认为 `http://localhost:8080`。初始化生成的 `private.json`、设备 token 和运行日志全部由忽略规则排除。

`manifest.json` 与 `dashboard.json` 为无 token 的演示设备契约及原生仪表盘模板。保留原数据库卷时继续使用原 UUID。连接新数据库时初始化会按设备名称查找或新建设备，并从模板重建仪表盘及更新实体引用；不会导入原实例的遥测历史。只在明确准备创建演示设备时执行初始化。源码归档不包含数据库备份。
