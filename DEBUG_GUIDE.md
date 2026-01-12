# 🔍 Confluence 同步调试指南

## 已添加的调试功能

### 1️⃣ 详细的控制台日志

所有 Confluence API 调用现在都会输出详细的调试信息。

**如何查看日志**：
1. 在 Figma 中打开开发者控制台
   - Mac: `Cmd + Option + I`
   - Windows: `Ctrl + Shift + I`
2. 或者：`Plugins → Development → Open Console`
3. 查看以 `[Confluence Debug]` 开头的日志

**日志包含的信息**：
- ✅ API 请求 URL
- ✅ 请求参数（pageId, spaceKey, title）
- ✅ 认证信息（URL, email, 隐藏 token）
- ✅ 响应状态码（status, statusText）
- ✅ 错误详情（完整的错误响应）
- ✅ 成功信息（pageId, pageUrl）

### 2️⃣ 测试连接功能

在设置面板中添加了"🔍 测试 Confluence 连接"按钮。

**使用方法**：
1. 打开插件设置（点击 ⚙️）
2. 填写 Confluence 认证信息
3. 点击"🔍 测试 Confluence 连接"
4. 等待测试结果

**可能的结果**：
- ✅ `连接成功！找到 X 个 Space` - 认证信息正确
- ❌ `认证失败：请检查 Email 和 API Token 是否正确` - 401 错误
- ❌ `Confluence URL 不正确：无法访问该地址` - 404 错误
- ❌ `网络错误：无法连接到 Confluence` - CORS 或网络问题
- ❌ `连接失败 (状态码): 详细信息` - 其他错误

### 3️⃣ 增强的错误提示

所有错误现在都会显示：
- ✅ HTTP 状态码
- ✅ 错误消息
- ✅ 完整的错误响应（在控制台）
- ✅ Stack trace（在控制台）

## 🐛 常见问题排查

### 问题 1: "Failed to fetch"

**可能原因**：
1. **CORS 错误**：Figma plugin 无法直接访问外部 API
2. **网络问题**：无法连接到 Confluence
3. **URL 错误**：Confluence URL 格式不正确

**排查步骤**：

```bash
# 1. 在控制台查看详细错误
[Confluence Debug] Test connection error: TypeError: Failed to fetch

# 2. 检查 Confluence URL 是否正确
✅ 正确: https://your-company.atlassian.net
❌ 错误: https://your-company.atlassian.net/
❌ 错误: your-company.atlassian.net
❌ 错误: https://your-company.atlassian.com
```

**解决方案**：

如果是 CORS 问题，Figma plugin 环境可能无法直接调用 Confluence API。你可以：

**选项 A**：使用浏览器插件代理（推荐）
- 安装一个 CORS 代理浏览器插件
- 临时允许跨域请求

**选项 B**：使用中间服务器
- 创建一个简单的代理服务器
- Figma plugin → 你的服务器 → Confluence

**选项 C**：手动复制粘贴（当前默认降级方案）
- 插件会自动复制 PRD 到剪贴板
- 手动粘贴到 Confluence

### 问题 2: "401 认证失败"

**可能原因**：
- Email 不正确
- API Token 不正确
- API Token 已过期

**排查步骤**：

```bash
# 在控制台查看认证信息
[Confluence Debug] Testing connection: {
  url: "https://your-company.atlassian.net",
  email: "your-email@company.com"
}

# 检查响应
[Confluence Debug] Test response: {
  status: 401,
  statusText: "Unauthorized",
  ok: false
}
```

**解决方案**：
1. 确认 Email 是你的 Atlassian 账号邮箱
2. 重新生成 API Token：
   - 访问：https://id.atlassian.com/manage-profile/security/api-tokens
   - 删除旧的 Token
   - 创建新的 Token
   - 复制并粘贴到插件设置

### 问题 3: "404 页面不存在"

**可能原因**：
- Confluence URL 错误
- Space 不存在
- 页面 ID 不正确

**排查步骤**：

```bash
# 检查 URL 解析
[Confluence Debug] Parsed URL: {
  pageId: "123456",  # 或 null
  spaceKey: "MYSPACE"  # 或 null
}
```

**解决方案**：
1. 确认 Confluence URL 格式：
   - 创建新页面：`https://your-company.atlassian.net/wiki/spaces/MYSPACE`
   - 更新现有页面：`https://your-company.atlassian.net/wiki/spaces/MYSPACE/pages/123456/Page-Title`
2. 确认你有该 Space 的访问权限

### 问题 4: "生成 PRD 时报错"

**排查步骤**：

```bash
# 查看生成流程的日志
[Confluence Debug] Starting sync: {
  wikiUrl: "...",
  title: "...",
  contentLength: 12345
}

# 查看 Markdown 转换
[Confluence Debug] Converted to storage format, length: 15678

# 查看最终结果
[Confluence Debug] Sync result: {
  success: true/false,
  message: "...",
  url: "..."
}
```

## 📋 完整的调试流程

### 第一步：测试连接

```
1. 打开插件设置
2. 填写认证信息
3. 点击"测试连接"
4. 查看控制台日志
```

**控制台输出示例（成功）**：
```
[Confluence Debug] Testing connection: {
  url: "https://company.atlassian.net",
  email: "user@company.com"
}
[Confluence Debug] Test API URL: https://company.atlassian.net/wiki/api/v2/spaces?limit=1
[Confluence Debug] Test response: {
  status: 200,
  statusText: "OK",
  ok: true
}
[Confluence Debug] Test successful, spaces found: 5
```

### 第二步：生成 PRD

```
1. 在 Figma 中选择设计稿
2. 生成 PRD
3. 查看控制台日志
```

**控制台输出示例**：
```
[Confluence Debug] Starting sync: {
  wikiUrl: "https://company.atlassian.net/wiki/spaces/PROD/pages/123456",
  title: "Token Swap Feature",
  contentLength: 12345,
  authUrl: "https://company.atlassian.net",
  authEmail: "user@company.com"
}
[Confluence Debug] Parsed URL: { pageId: "123456", spaceKey: "PROD" }
[Confluence Debug] Converted to storage format, length: 15678
[Confluence Debug] Updating existing page: 123456
```

### 第三步：同步到 Confluence

```
1. 填写 Confluence URL
2. 点击"同步"按钮
3. 查看控制台日志
```

**控制台输出示例（更新页面）**：
```
[Confluence Debug] Fetching current page version...
[Confluence Debug] Fetching page: {
  url: "https://company.atlassian.net/wiki/api/v2/pages/123456?body-format=storage",
  pageId: "123456",
  authUrl: "https://company.atlassian.net",
  authEmail: "user@company.com"
}
[Confluence Debug] Response: { status: 200, statusText: "OK", ok: true }
[Confluence Debug] Page fetched successfully: { id: "123456", title: "Token Swap Feature" }
[Confluence Debug] Current version: 5
[Confluence Debug] Updating page: {
  apiUrl: "https://company.atlassian.net/wiki/api/v2/pages/123456",
  pageId: "123456",
  title: "Token Swap Feature",
  newVersion: 6,
  contentLength: 15678
}
[Confluence Debug] Update response: { status: 200, statusText: "OK", ok: true }
[Confluence Debug] Page updated successfully: {
  pageId: "123456",
  pageUrl: "https://company.atlassian.net/wiki/spaces/PROD/pages/123456",
  newVersion: 6
}
```

## 🔧 高级调试

### 查看完整的请求/响应

在控制台中，你可以看到：
- 请求 URL
- 请求方法（GET/POST/PUT）
- 请求头（隐藏敏感信息）
- 响应状态
- 响应数据（成功时）
- 错误详情（失败时）

### 手动测试 API

如果需要手动测试 Confluence API，可以使用 curl：

```bash
# 测试连接
curl -u "your-email@company.com:YOUR_API_TOKEN" \
  -H "Accept: application/json" \
  "https://your-company.atlassian.net/wiki/api/v2/spaces?limit=1"

# 获取页面
curl -u "your-email@company.com:YOUR_API_TOKEN" \
  -H "Accept: application/json" \
  "https://your-company.atlassian.net/wiki/api/v2/pages/123456?body-format=storage"
```

## 📞 需要帮助？

如果以上方法都无法解决问题，请提供以下信息：

1. **完整的控制台日志**（包含所有 `[Confluence Debug]` 输出）
2. **错误截图**
3. **Confluence URL 格式**（隐藏敏感信息）
4. **操作步骤**

---

祝你调试顺利！🎉
