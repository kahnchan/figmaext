# Confluence Wiki 集成配置指南

本插件支持将生成的 PRD 文档自动同步到 Atlassian Confluence Wiki。

## 功能特性

### 1. 多Frame产品流程分析
- ✅ 支持同时选择多个 Frame（按住 Shift/Cmd 多选）
- ✅ AI 会理解完整的产品流程，生成包含用户旅程的 PRD
- ✅ 自动识别屏幕顺序和流程关系

### 2. Confluence Wiki 集成
- ✅ 配置 Wiki URL 后自动获取现有文档
- ✅ AI 智能合并新旧内容
- ✅ 保留重要的历史信息
- ✅ 高亮显示变更内容

### 3. 文档比较和更新
- ✅ 自动检测文档变化
- ✅ 生成变更摘要
- ✅ 智能合并策略

## 使用方法

### 基础用法（无需 Confluence）

1. 在 Figma 中选择一个或多个 Frame
2. 打开插件，切换到 "PRD" 标签
3. 点击 "生成产品流程 PRD" 或 "Sync PRD"
4. 查看生成的 PRD 文档
5. 点击 "Copy" 按钮复制到剪贴板

### 高级用法（Confluence 集成）

#### 步骤 1: 配置 Confluence Wiki URL

1. 打开插件设置（点击右上角齿轮图标）
2. 在 "Confluence Wiki URL" 字段输入你的 Wiki 页面链接
   ```
   https://your-company.atlassian.net/wiki/spaces/SPACE/pages/123456/Page+Title
   ```
3. 保存设置

#### 步骤 2: 生成 PRD

1. 选择 Frame（单个或多个）
2. 点击 "生成产品流程 PRD"
3. 插件会自动：
   - 生成新的 PRD 内容
   - 从 Confluence 获取现有文档（如果有）
   - 使用 AI 智能合并内容
   - 显示合并后的结果

#### 步骤 3: 同步到 Confluence（可选）

目前 Confluence 同步功能需要配置 Atlassian MCP Server。

## Atlassian MCP Server 配置（高级）

### 什么是 MCP？

MCP (Model Context Protocol) 是一个标准协议，允许 AI 应用与外部服务（如 Confluence）进行集成。

### 配置步骤

#### 1. 安装 Atlassian MCP Server

```bash
# 使用 npm 安装
npm install -g @modelcontextprotocol/server-atlassian

# 或使用 npx 运行
npx @modelcontextprotocol/server-atlassian
```

#### 2. 获取 Atlassian API Token

1. 访问 [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. 点击 "Create API token"
3. 复制生成的 token

#### 3. 配置环境变量

创建 `.env` 文件：

```bash
ATLASSIAN_CLOUD_ID=your-cloud-id
ATLASSIAN_EMAIL=your-email@company.com
ATLASSIAN_API_TOKEN=your-api-token
```

#### 4. 启动 MCP Server

```bash
# 启动服务器
mcp-server-atlassian --port 3000
```

#### 5. 在插件中配置

目前插件已预留 MCP 集成接口，完整集成需要：

1. 修改 `src/plugin/confluence.ts` 中的 `syncToConfluence` 函数
2. 添加 MCP 客户端调用逻辑
3. 实现认证和 API 调用

### 手动同步方案（推荐）

如果暂时不想配置 MCP Server，可以使用以下方案：

1. 使用插件生成 PRD
2. 点击 "Copy" 按钮复制内容
3. 手动粘贴到 Confluence Wiki
4. 下次生成时，插件会自动与现有内容合并

## PRD 文档格式

### 单个 Frame PRD

生成的 PRD 包含：
- **Feature Name**: 功能名称
- **Background**: 背景信息
- **Business Logic**: 业务逻辑
- **Acceptance Criteria**: 验收标准

### 多 Frame 产品流程 PRD

生成的 PRD 包含：
- **Feature Overview**: 功能概述
- **User Story**: 用户故事
- **User Flow**: 用户流程（Screen 1 → Screen 2 → Screen 3...）
- **Business Logic**: 每个步骤的业务逻辑
- **Acceptance Criteria**: 每个屏幕/步骤的验收标准
- **Edge Cases**: 边界情况和错误处理

## 最佳实践

### 1. Frame 命名规范

为了让 AI 更好地理解流程，建议使用清晰的 Frame 命名：

```
✅ GOOD:
- "01_Swap_Token_Selection"
- "02_Swap_Amount_Input"
- "03_Swap_Confirmation"
- "04_Swap_Success"

❌ BAD:
- "Frame 123"
- "Copy of Frame"
- "Untitled"
```

### 2. 选择顺序

按照用户流程的顺序选择 Frame：
1. 先选择第一个屏幕
2. 按住 Shift，依次点击后续屏幕
3. 确保选择顺序与实际流程一致

### 3. 内容完整性

确保每个 Frame 包含：
- 清晰的文本标签
- 完整的 UI 组件
- 必要的交互元素

### 4. 文档更新

定期更新 Confluence Wiki URL：
- 每次创建新的 Wiki 页面后更新 URL
- 使用同一个 Wiki 页面追踪版本变化
- 利用 AI 合并功能保持文档连贯性

## 故障排查

### 问题：无法获取 Confluence 内容

**原因**：
- Wiki URL 格式不正确
- 页面不存在或无权限访问
- MCP Server 未配置

**解决方案**：
1. 检查 URL 格式是否正确
2. 确认有页面访问权限
3. 暂时使用手动复制粘贴方案

### 问题：合并结果不理想

**原因**：
- 新旧文档差异太大
- AI 模型选择不当

**解决方案**：
1. 在设置中切换到更强大的模型（如 Claude 3.5 Sonnet）
2. 手动调整合并后的内容
3. 提供更清晰的 Frame 命名和内容

### 问题：生成的 PRD 不够详细

**原因**：
- Frame 内容不完整
- 缺少关键信息

**解决方案**：
1. 确保 Frame 包含所有必要的文本和组件
2. 选择完整的流程（不要遗漏中间步骤）
3. 使用更强大的 AI 模型

## 未来计划

- [ ] 完整的 Atlassian MCP 集成
- [ ] 自动版本控制
- [ ] 变更历史追踪
- [ ] 多人协作支持
- [ ] Jira Issue 关联
- [ ] 自动生成测试用例

## 技术支持

如有问题或建议，请联系开发团队。
