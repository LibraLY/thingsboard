# 数字绿色农业 · ThingsBoard 部署与物联网源码

本目录保存本机 ThingsBoard 定制部署、34 台演示设备的初始化与数据模拟、原生仪表盘，以及云 Supabase ES256 OIDC 兼容扩展。ThingsBoard 上游源码仍在仓库根目录。

此归档不包含密码、设备访问令牌、认证私钥、用户会话、数据库、遥测历史或 Docker 镜像。它保留可重建的源码；本机现有数据库和私有配置应继续保存在本机。

## 与另外两个项目配合恢复

本工作区的三个项目分别为 `LibraLY/thingsboard`（物联网）、`LibraLY/Snowflake`（大数据平台）和 `LibraLY/Walden`（农业 AI）。共享业务展示、数据初始化和认证部署源码归档在 Snowflake 仓库的 `deploy/digital-green-demo`，本仓库只保存物联网部分，避免出现两份维护来源。

恢复原来的工作区目录关系：

```text
workspace/
  thingsboard/                 # 本 Git 仓库
  Snowflake/                   # 大数据平台仓库
  Walden/                      # 农业 AI 仓库
  thingsboard-local/           # 复制本目录同名子目录
  digital-green-demo/          # 合并两份源码归档
    iot/                       # 来自本目录
    auth-migration/
      thingsboard-cloud-sso/   # 来自本目录
      ...                      # 来自 Snowflake 的 deploy/digital-green-demo
    data/                      # 来自 Snowflake
    portal/                    # 来自 Snowflake
```

将本目录下 `thingsboard-local` 和 `digital-green-demo` 复制到工作区，再将 Snowflake 的 `deploy/digital-green-demo` 合并到同名目录。只复制缺少的源码；保留目标已有的 `.env`、`private.json` 和 `auth-migration/private`，不要用源码模板覆盖这些本机文件。原本机运行路径中的文件没有被此次源码归档修改。

也可以直接在本归档目录运行 ThingsBoard 和设备模拟器；`compose.yaml` 的相对构建路径在两种布局下均有效。仪表盘生成脚本支持当前仓库布局、恢复后的兄弟目录布局，以及通过 `THINGSBOARD_SOURCE_DIR` 指定源码根目录。

## 恢复现有本机实例

1. 在 `thingsboard-local` 中保留原 `.env`；新电脑另从 `.env.example` 创建自己的配置，填入独立数据库密码。
2. 保留 Docker 命名卷 `thingsboard-local_postgres-data`。Compose 项目名称仍为 `thingsboard-local`，重建容器会接回同一数据库。
3. 从 `thingsboard-local` 执行 `docker compose build thingsboard-ce`，再执行 `docker compose up -d --no-build`。
4. 保留 `digital-green-demo/iot/private.json`，随后从 `iot` 运行 `Start-Simulator.ps1`。需要初始化演示设备时，先设置自己的 `THINGSBOARD_USERNAME` 和 `THINGSBOARD_PASSWORD`，再运行 `node init.mjs`；私有配置由初始化生成，不能上传。

删除容器与镜像后，上述命名卷和本机私有配置仍是原账号、设备 UUID、遥测历史及 OAuth 映射的恢复依据。此源码归档不包含数据库备份；全新空数据库需要按对应 ThingsBoard 版本完成数据库安装和管理员初始化，不能把原数据库密码或设备 token 从 GitHub 找回。

## 账号与业务运行边界

云 Supabase OIDC 兼容扩展固定校验已登记的 issuer、客户端和端点，源码中仅有公开配置。客户端密钥、桥接密钥、显式用户映射和 ThingsBoard 原生 OAuth 配置由私有配置及数据库保存。要连接另一 Supabase 项目，应同步修改固定 issuer、注册客户端与对应测试，并在共享认证部署工具中明确配置，不能只改一个 URL。

设备模拟器只负责产生现场样本；正式采集、质量校验和业务视图代码在 Snowflake **开发工作台**维护、发布和运行。恢复后需要接回平台数据卷中的已发布工作流，不能把旧后台演示脚本作为正式采集入口。

## 离线检查

安装 Node.js 20 或更高版本后，在 `digital-green-demo/iot` 执行：

```powershell
node --test fleet.test.mjs fleet-dashboard.test.mjs
```

Java OIDC 扩展的签名回归在 Docker 构建阶段执行，见其目录中的 README。设备与告警规则、演示数据来源和约束详见 [iot/README.md](digital-green-demo/iot/README.md)。
