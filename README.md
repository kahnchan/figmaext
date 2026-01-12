# OneKey Figma Plugin - PRD Sync & Tracker Pro

专业的 Figma 插件，用于生成产品需求文档（PRD）和埋点追踪事件。

## 🎯 核心功能

### 1. PRD 同步（PRD Sync）
- ✅ **单Frame模式**：为单个设计稿生成专业PRD文档
- ✅ **多Frame产品流程模式**：理解完整用户旅程，生成包含完整流程的PRD
- ✅ **AI智能分析**：深度理解业务场景，生成指导开发的专业文档
- ✅ **Confluence集成**：支持与现有Wiki文档智能合并
- ✅ **专业文档结构**：包含Executive Summary、Business Context、Technical Requirements等完整章节

### 2. 埋点追踪（Tracker Pro）
- ✅ **智能元素识别**：AI自动识别页面中的可交互元素
- ✅ **批量生成埋点**：一键扫描整个页面并生成埋点方案
- ✅ **业务场景理解**：深入分析用户意图和业务逻辑
- ✅ **灵活导出**：支持CSV、JSON格式导出
- ✅ **Figma表格生成**：直接在画布上创建可视化埋点表格

## 📋 PRD 文档特点

### 生成的PRD文档包含：

1. **📊 Document Information**
   - Version, Status, Stakeholders
   - 文档元数据和版本控制

2. **🎯 Executive Summary**
   - 3-4句话说明WHAT、WHY、IMPACT
   - 高管一眼理解功能价值

3. **📊 Background & Business Context**
   - Problem Statement（用户痛点）
   - Market Opportunity（市场机会）
   - Success Metrics（成功指标和KPI）

4. **👥 User Personas & Scenarios**
   - 详细的用户画像
   - 真实使用场景
   - 具体的Use Cases

5. **💡 Product Requirements**
   - 功能需求（FR-001, FR-002...）
   - 非功能需求（性能、安全、可扩展性）
   - 每个需求包含详细的AC（Acceptance Criteria）

6. **🔄 User Flow & Interaction Design**
   - 每个屏幕的详细交互说明
   - 验证规则和边界情况
   - 状态管理和数据流转

7. **🔧 Technical Requirements**
   - Frontend技术栈和组件
   - Backend API端点
   - 数据库Schema
   - 第三方集成

8. **📊 Analytics & Tracking**
   - 关键事件定义
   - 数据埋点方案
   - Dashboard需求

9. **✅ Acceptance Criteria**
   - 详细的测试用例
   - Given-When-Then格式
   - 边界情况处理

10. **🚨 Risks & Dependencies**
    - 技术风险和缓解方案
    - 依赖关系
    - 安全考虑

11. **📅 Implementation Plan**
    - 分阶段实施计划
    - 里程碑和交付物
    - 未来迭代

## 🚀 快速开始

### 安装

1. 在 Figma 中打开插件面板
2. 搜索 "OneKey PRD Sync"
3. 点击安装

### 配置

1. 打开插件设置（点击⚙️图标）
2. 输入 OpenRouter API Key（从 openrouter.ai/keys 获取）
3. 选择 AI 模型（推荐：Claude 3.5 Sonnet 或 GPT-4o）
4. （可选）配置 Confluence Wiki URL

### 使用 PRD 同步

#### 单Frame模式
```
1. 选择一个 Frame
2. 切换到 "PRD" 标签
3. 点击 "Sync PRD"
4. 查看生成的专业PRD文档
5. 点击 "Copy" 复制到剪贴板
```

#### 多Frame产品流程模式
```
1. 按住 Shift/Cmd 选择多个 Frame（按流程顺序）
2. 插件会显示完整的流程列表
3. 点击 "生成产品流程 PRD"
4. AI 生成包含完整用户旅程的PRD
5. 文档包含：
   - Feature Overview（功能概述）
   - User Story（用户故事）
   - User Flow（用户流程：Screen 1 → Screen 2...）
   - Business Logic（每步的业务逻辑）
   - Acceptance Criteria（验收标准）
   - Edge Cases（边界情况）
```

### 使用埋点追踪

#### 扫描整个页面
```
1. 选择一个 Frame（整个页面）
2. 切换到 "Tracker" 标签
3. 点击 "Scan Page"
4. AI 自动识别所有交互元素
5. 复核并选择需要的埋点
6. 导出为 CSV 或 JSON
```

#### 生成单个元素埋点
```
1. 选择一个或多个按钮/输入框等元素
2. 点击 "Generate Selected"
3. AI 生成详细的埋点方案
4. 包含事件名称、属性、触发时机等
```

## 📖 PRD 文档示例

查看 [PRD_TEMPLATE_EXAMPLE.md](./PRD_TEMPLATE_EXAMPLE.md) 了解完整的PRD文档示例。

示例展示了一个真实的 "Token Swap" 功能PRD，包含：
- 13,000+ 字的详细内容
- 50+ 个具体需求
- 30+ 个测试用例
- 完整的技术方案
- 实施计划和风险评估

## 🔧 Confluence 集成

详细配置指南请查看 [CONFLUENCE_SETUP.md](./CONFLUENCE_SETUP.md)

### 基础功能（无需配置）
- ✅ 生成专业PRD文档
- ✅ 复制到剪贴板
- ✅ 手动粘贴到Confluence

### 高级功能（需配置）
- ✅ 自动获取现有Wiki文档
- ✅ AI智能合并新旧内容
- ✅ 变更摘要和高亮
- ⏳ 自动同步到Wiki（需Atlassian MCP）

## 💡 最佳实践

### Frame 命名规范
```
✅ GOOD:
- "01_Swap_Token_Selection"
- "02_Swap_Amount_Input"
- "03_Swap_Confirmation"

❌ BAD:
- "Frame 123"
- "Copy of Frame"
```

### 提高PRD质量的技巧
1. **清晰的Frame命名**：帮助AI理解功能目的
2. **完整的UI元素**：确保所有按钮、文本都可见
3. **按流程顺序选择**：多Frame模式下保持正确顺序
4. **使用更强的模型**：Claude 3.5 Sonnet > GPT-4o > Gemini 2.0 Flash

### 埋点生成技巧
1. **完整页面扫描**：使用"Scan Page"获得最全面的结果
2. **业务上下文**：确保Frame中包含足够的业务信息
3. **复核AI建议**：AI生成后人工复核，调整分类和命名
4. **避免通用分类**：AI会避免"Navigation"等无意义分类

## 📊 支持的AI模型

### 推荐模型

**Claude 3.5 Sonnet** ⭐⭐⭐⭐⭐
- 最强的理解能力
- 生成的PRD最专业
- 推荐用于重要项目

**GPT-4o** ⭐⭐⭐⭐
- 速度快
- 质量稳定
- 适合日常使用

**Gemini 2.0 Flash** ⭐⭐⭐
- 速度最快
- 成本最低
- 适合快速迭代

## 🎨 生成文档类型对比

| 场景 | 单Frame模式 | 多Frame模式 |
|------|------------|------------|
| **适用于** | 单个功能点 | 完整产品流程 |
| **文档长度** | 800-1500字 | 1500-3000字 |
| **包含章节** | 9个核心章节 | 12个完整章节 |
| **用户流程** | 单屏幕交互 | 多屏幕旅程 |
| **业务分析** | 功能级别 | 流程级别 |
| **技术方案** | 组件级别 | 系统级别 |

## 🛠 技术栈

- **Frontend**: React, TypeScript
- **AI**: OpenRouter API
- **Vision Models**: Claude 3.5 Sonnet, GPT-4o, Gemini 2.0
- **Integration**: Atlassian Confluence API (MCP)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 📞 支持

- 问题反馈：[GitHub Issues]
- 功能建议：[GitHub Discussions]
- 企业咨询：contact@onekey.so

---

Made with ❤️ by OneKey Team
