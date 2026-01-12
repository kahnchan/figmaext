# Confluence 自动同步配置指南

本插件现已支持通过 Confluence REST API 实现真正的自动同步功能！

## 🚀 快速开始

### 1. 获取 Confluence API Token

1. 访问 [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. 点击 **Create API token**
3. 输入一个名称（例如：Figma PRD Plugin）
4. 点击创建
5. **复制并保存** 生成的 API Token（只会显示一次）

### 2. 在插件中配置认证信息

1. 打开 Figma 插件
2. 点击 **⚙️ Settings** 按钮
3. 在 "Confluence 集成" 部分填写：
   - **Confluence URL**: 你的 Atlassian 域名（例如：`https://your-company.atlassian.net`）
   - **Confluence Email**: 你的 Atlassian 账号邮箱
   - **Confluence API Token**: 刚才获取的 API Token
4. 点击 **Save Settings**

### 3. 使用自动同步

#### 方式 A：更新现有页面

1. 在 Confluence 中创建或打开一个 Wiki 页面
2. 复制页面 URL（例如：`https://your-company.atlassian.net/wiki/spaces/MYSPACE/pages/123456/My-PRD-Page`）
3. 在 Figma 中框选设计稿
4. 在插件的 "Confluence Wiki URL" 输入框中粘贴 URL
5. 点击 **🔄 同步** 按钮
6. 插件会自动更新该页面内容

#### 方式 B：创建新页面

1. 复制 Confluence Space URL（例如：`https://your-company.atlassian.net/wiki/spaces/MYSPACE`）
2. 在 Figma 中框选设计稿
3. 在插件的 "Confluence Wiki URL" 输入框中粘贴 Space URL
4. 点击 **🔄 同步** 按钮
5. 插件会自动在该 Space 中创建新页面

## 🔧 技术细节

### API 权限

API Token 需要以下权限：
- **Read** Confluence pages
- **Write** Confluence pages

这些权限在创建 API Token 时会自动包含。

### 支持的功能

✅ **已实现**：
- 创建新的 Confluence 页面
- 更新现有的 Confluence 页面
- 自动版本管理
- Markdown 转 Confluence Storage Format
- 嵌入 Figma 截图（Base64）

⏳ **计划中**：
- 智能合并（AI 辅助比较和合并）
- 页面模板支持
- 批量同步多个 PRD

### Markdown 支持

插件会自动将 Markdown 转换为 Confluence Storage Format，支持：

- ✅ 标题（H1-H6）
- ✅ 粗体、斜体
- ✅ 代码块（带语法高亮）
- ✅ 行内代码
- ✅ 链接
- ✅ 图片（包括 Base64 截图）
- ✅ 列表
- ✅ 表格（通过 HTML）
- ✅ 引用块（Info Panel）
- ✅ 分隔线

## 🔐 安全性

- API Token 以加密方式存储在 Figma 本地缓存中
- 所有 API 请求使用 HTTPS 加密传输
- 使用 Basic Authentication（推荐的 Confluence Cloud 认证方式）

## ❓ 常见问题

### Q: 为什么同步失败？

**可能的原因**：

1. **认证信息错误**：检查 Confluence URL、Email 和 API Token 是否正确
2. **权限不足**：确保你有该 Space 的写入权限
3. **URL 格式错误**：确保使用完整的 Confluence URL
4. **网络问题**：检查网络连接

### Q: 如何验证配置是否正确？

在配置完成后，尝试同步一个测试 PRD：
1. 如果看到 "✅ PRD successfully created/updated in Confluence!"，说明配置成功
2. 如果看到错误消息，根据提示检查配置

### Q: 可以同步到 Confluence Server 吗？

目前仅支持 **Confluence Cloud**。如果你使用 Confluence Server/Data Center，请联系管理员升级到 Cloud 版本，或使用手动复制粘贴的方式。

### Q: Figma 截图会上传到 Confluence 吗？

是的！插件会自动：
1. 导出 Figma 设计稿为 PNG 截图
2. 转换为 Base64 编码
3. 嵌入到 Confluence 页面中

这样你的 PRD 文档会包含可视化的设计稿参考。

## 📚 参考资料

- [Confluence Cloud REST API 文档](https://developer.atlassian.com/cloud/confluence/rest/v2/intro/)
- [Atlassian API Token 管理](https://id.atlassian.com/manage-profile/security/api-tokens)
- [Confluence Storage Format](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html)

## 💡 提示

- 建议在同步前先在 Confluence 中创建一个测试页面
- 可以在 PRD 文档中使用丰富的 Markdown 格式
- 同步后可以在 Confluence 中继续编辑和协作
- API Token 请妥善保管，不要分享给他人

---

如有问题或建议，欢迎反馈！🎉
