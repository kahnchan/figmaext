# Confluence 自动同步 - 快速使用指南

## ✅ 已实现功能

插件现已支持通过 **Confluence REST API** 实现真正的自动同步！

### 核心功能
- ✅ 自动创建新的 Confluence 页面
- ✅ 自动更新现有的 Confluence 页面
- ✅ 智能版本管理（自动递增版本号）
- ✅ Markdown 自动转换为 Confluence Storage Format
- ✅ 嵌入 Figma 截图（Base64）
- ✅ 支持表格、代码块、引用块等富文本

## 🚀 5 分钟快速开始

### 第 1 步：获取 Confluence API Token

1. 访问 [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. 点击 **Create API token**
3. 输入名称：`Figma PRD Plugin`
4. 点击创建，**复制** Token（只显示一次）

### 第 2 步：在插件中配置

1. 打开 Figma 插件
2. 点击 **⚙️ Settings**
3. 在 "Confluence 集成" 部分填写：
   ```
   Confluence URL: https://your-company.atlassian.net
   Confluence Email: your-email@company.com
   Confluence API Token: [粘贴刚才的 Token]
   ```
4. 点击 **Save Settings**

### 第 3 步：使用自动同步

#### 场景 A：更新现有页面

1. 在 Confluence 中打开要更新的页面
2. 复制完整的页面 URL（例如：`https://your-company.atlassian.net/wiki/spaces/MYSPACE/pages/123456/My-PRD`）
3. 在 Figma 中选择设计稿（单个或多个 Frame）
4. 在插件的 **Confluence Wiki URL** 输入框中粘贴 URL
5. 点击 **🔄 同步** 按钮
6. ✅ 完成！页面会自动更新，版本 +1

#### 场景 B：创建新页面

1. 复制你的 Confluence Space URL（例如：`https://your-company.atlassian.net/wiki/spaces/MYSPACE`）
2. 在 Figma 中选择设计稿
3. 在插件的 **Confluence Wiki URL** 输入框中粘贴 Space URL
4. 点击 **🔄 同步** 按钮
5. ✅ 完成！新页面会自动创建在该 Space 中

## 💡 工作原理

### 技术流程

```
1. 插件扫描 Figma 设计稿
   ↓
2. 导出设计稿截图（PNG，Base64）
   ↓
3. AI 生成 PRD（Markdown 格式）
   ↓
4. 检查 URL 类型：
   - 包含 /pages/123456/ → 更新现有页面
   - 只有 /spaces/SPACE/ → 创建新页面
   ↓
5. 如果是更新：
   - 调用 GET /wiki/api/v2/pages/{id} 获取当前版本号
   - 调用 PUT /wiki/api/v2/pages/{id} 更新内容
   - 版本号 = 当前版本 + 1
   ↓
6. 如果是创建：
   - 调用 POST /wiki/api/v2/pages 创建新页面
   - 自动设置标题和内容
   ↓
7. 返回页面 URL，在浏览器中打开
```

### 认证机制

使用 **Basic Authentication**（Confluence Cloud 推荐方式）：
```
Authorization: Basic base64(email:apiToken)
```

## 📝 支持的 Markdown 格式

插件会自动转换以下 Markdown 格式到 Confluence Storage Format：

| Markdown | Confluence | 示例 |
|----------|-----------|------|
| `# 标题` | `<h1>` | 一级标题 |
| `## 标题` | `<h2>` | 二级标题 |
| `**粗体**` | `<strong>` | 强调文本 |
| `*斜体*` | `<em>` | 斜体文本 |
| ` ```代码块``` ` | `<ac:structured-macro>` | 代码高亮 |
| `[链接](url)` | `<a href>` | 超链接 |
| `![图片](url)` | `<ac:image>` | 图片嵌入 |
| `- 列表项` | `<li>` | 无序列表 |
| `> 引用` | Blockquote | 引用块（Info Panel） |

## 🔍 调试和排错

### 如何确认配置成功？

1. 配置完成后，尝试同步一个测试 PRD
2. 如果看到 `✅ PRD successfully created/updated in Confluence!`，说明成功
3. 如果看到错误提示，根据提示检查配置

### 常见错误和解决方法

| 错误信息 | 原因 | 解决方法 |
|---------|------|---------|
| `⚠️ 请先在设置中配置 Confluence 认证信息` | 未配置 API Token | 在设置中填写完整的认证信息 |
| `Invalid Confluence URL format` | URL 格式不正确 | 确保使用完整的 URL，包含 `/wiki/spaces/` 或 `/wiki/spaces/.../pages/` |
| `Confluence API error: 401` | 认证失败 | 检查 Email 和 API Token 是否正确 |
| `Confluence API error: 403` | 权限不足 | 确保你有该 Space 的写入权限 |
| `Confluence API error: 404` | 页面不存在 | 页面可能已被删除，尝试创建新页面 |

### 查看详细日志

1. 打开 Figma 的开发者控制台：`Plugins → Development → Open Console`
2. 查看以 `[Confluence]` 开头的日志信息
3. 检查 API 请求和响应

## 🎯 最佳实践

### 1. 页面命名规范

建议使用清晰的页面命名：
```
✅ GOOD:
- "PRD: Token Swap Feature"
- "PRD: User Profile Settings"
- "Product Requirements: Payment Flow"

❌ BAD:
- "Untitled Page"
- "Copy of Copy of PRD"
```

### 2. Space 组织结构

建议创建专门的 Space 存放 PRD：
```
📁 Product Specs (SPEC)
  └─ 📄 PRD: Feature A
  └─ 📄 PRD: Feature B
  └─ 📄 PRD: Feature C
```

### 3. 版本管理

- ✅ 每次同步会自动创建新版本
- ✅ 可以在 Confluence 中查看历史版本
- ✅ 可以回滚到之前的版本

### 4. 团队协作

同步后，你可以：
- 💬 在 Confluence 中添加评论
- ✏️ 继续编辑和补充内容
- 👥 @mention 团队成员
- 📊 创建 Dashboard 统计

## 🔐 安全性说明

### 数据安全
- API Token 以加密方式存储在 Figma 本地缓存
- 所有 API 请求使用 HTTPS 加密
- Token 不会发送到任何第三方服务器

### 权限管理
- API Token 只能访问你有权限的 Space 和 Page
- 建议为插件创建专用的 API Token，方便管理和撤销
- 定期更新 API Token（建议每 90 天）

### 最小权限原则
创建 API Token 时，确保只授予必要的权限：
- ✅ Read Confluence pages
- ✅ Write Confluence pages
- ❌ 不需要 Admin 权限

## 📚 更多资源

- **详细配置指南**：[CONFLUENCE_API_SETUP.md](./CONFLUENCE_API_SETUP.md)
- **PRD 文档示例**：[PRD_TEMPLATE_EXAMPLE.md](./PRD_TEMPLATE_EXAMPLE.md)
- **Confluence REST API 文档**：[developer.atlassian.com/cloud/confluence/rest/v2](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- **API Token 管理**：[id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

## 🎉 开始使用

现在你已经了解了如何使用 Confluence 自动同步功能！

**推荐流程**：
1. ✅ 配置 API Token（5 分钟）
2. ✅ 创建测试 Space（可选）
3. ✅ 同步第一个 PRD（1 分钟）
4. ✅ 在 Confluence 中查看结果
5. 🚀 开始高效工作！

---

有问题或建议？欢迎反馈！
