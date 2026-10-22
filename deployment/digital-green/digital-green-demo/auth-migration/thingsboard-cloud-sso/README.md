# ThingsBoard 云 Supabase OIDC 兼容扩展

ThingsBoard `4.3.1.6` 中 Spring Security `6.5.11` 的原生 OIDC ID token 解码器默认接受 RS256。当前云 Supabase 使用 ES256 签名，因此只修改授权地址会出现 `invalid_id_token` 和 `Another algorithm expected`。

本扩展通过 Spring 官方 `JwtDecoderFactory<ClientRegistration>` 扩展点为明确登记的云客户端选择 ES256，保留默认的 OIDC claims 验证和 JWKS 签名校验。注册实体 ID、客户端 ID、授权、换码、UserInfo、JWKS 地址必须全部匹配固定云项目；任何指定客户端配置不匹配直接失败。补充受信任的 `issuerUri` 使默认验证器严格检查 issuer。其他客户端继续使用 Spring 默认的 RS256 解码器。

现有 ThingsBoard 授权请求、PKCE、nonce、会话和自定义用户映射逻辑保持原生流程，不绕过验签、不改变云签名密钥、不将云邮箱自动映射为本机管理员。

## 可重复构建

基础镜像固定为 `thingsboard/tb-node:4.3.1.6@sha256:36ffc61305a5d811e167c95bdb1ae452e55588e43bfdce7040467a8c25f3ef5a`，从同一镜像中的真实依赖编译扩展。构建阶段自动运行真实 EC/RSA 签名与本地 JWKS 回归，不需下载 Maven 依赖。

```powershell
# 从 deployment/digital-green 或恢复后的 workspace 根目录执行
Push-Location './digital-green-demo/auth-migration/thingsboard-cloud-sso'
docker build --pull=false -t thingsboard-cloud-sso:4.3.1.6 .
Pop-Location
# 使用本机 ThingsBoard 的持久 compose 配置，仅重建应用容器：
Push-Location './thingsboard-local'
docker compose up -d --no-deps --no-build --pull never thingsboard-ce
Pop-Location
```

构建后的扩展 jar 为 `/usr/share/thingsboard/extensions/cloud-sso.jar`，由官方启动脚本中的 Spring Boot `PropertiesLauncher` 通过 `LOADER_PATH` 加载，未修改 ThingsBoard 原始 jar。

`thingsboard-local/compose.yaml` 固定派生镜像 `thingsboard-cloud-sso:4.3.1.6` 及 build context，同时配置公开参数：`TB_SUPABASE_OAUTH_ENABLED=true`、`TB_SUPABASE_OAUTH_CLIENT_ID`、`TB_SUPABASE_OAUTH_REGISTRATION_ID` 和 `LOADER_PATH`。不在镜像中保存客户端密钥、桥密钥、用户 token 或数据库密码。

## 验证

构建时 10 项断言覆盖：云 ES256 成功；错误 issuer、audience、签名、过期 token、配置端点、client ID、注册实体 ID 拒绝；其他客户端 RS256 成功且 ES256 拒绝。生产启动日志包含固定消息 `Pinned Supabase ES256 OIDC decoder registered`，用于确认扩展实际加载。

2026-10-19 22:34（上海时间）已由根线程在真实用户浏览器验收：从 ThingsBoard“统一账号登录”入口重新授权，无需再次输入密码，最终进入 `/home` 并显示已明确绑定的租户管理员、34 台既有设备与原仪表板；ES256 解码错误消失。生产派生镜像已启动，固定 decoder bean 加载日志与 `/login` HTTP 200 均通过。原本机验收记录不随源码归档上传。

后续复测仍应从 ThingsBoard 登录入口发起新的授权，过期或已经消费的回调代码不能重放。

官方依据：[Spring ID Token Signature Verification](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/advanced.html#oauth2login-advanced-idtoken-decoding)、[6.5.11 OidcIdTokenDecoderFactory](https://github.com/spring-projects/spring-security/blob/6.5.11/oauth2/oauth2-client/src/main/java/org/springframework/security/oauth2/client/oidc/authentication/OidcIdTokenDecoderFactory.java)、[ThingsBoard 4.3.1.6 客户端注册实现](https://github.com/thingsboard/thingsboard/blob/v4.3.1.6/dao/src/main/java/org/thingsboard/server/dao/oauth2/HybridClientRegistrationRepository.java)。


源码归档与恢复目录关系见 [部署说明](../../../README.md)。本目录只包含扩展和构建测试；原生 OAuth 客户端注册、账号映射和桥接配置继续由本机数据库及共享认证部署工具管理。
