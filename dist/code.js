/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

;// ./src/plugin/scan.ts
function isFrame(node) {
    return node.type === 'FRAME';
}
function uniq(arr) {
    return Array.from(new Set(arr)).filter(Boolean);
}
function scanSelectedFrame() {
    var _a, _b;
    const selection = figma.currentPage.selection;
    if (selection.length !== 1)
        return null;
    const node = selection[0];
    if (!isFrame(node))
        return null;
    const texts = [];
    const componentNames = [];
    const descendants = node.findAll(() => true);
    for (const d of descendants) {
        if (d.type === 'TEXT') {
            const t = (_a = d.characters) === null || _a === void 0 ? void 0 : _a.trim();
            if (t)
                texts.push(t);
        }
        if (d.type === 'INSTANCE') {
            const inst = d;
            componentNames.push(((_b = inst.mainComponent) === null || _b === void 0 ? void 0 : _b.name) || inst.name);
        }
        if (d.type === 'COMPONENT') {
            componentNames.push(d.name);
        }
    }
    return {
        frameId: node.id,
        frameName: node.name,
        texts: uniq(texts).slice(0, 120),
        componentNames: uniq(componentNames).slice(0, 120),
    };
}
/** Get all text content from a node and its descendants */
function collectTextsFromNode(node) {
    var _a, _b;
    const texts = [];
    if (node.type === 'TEXT') {
        const t = (_a = node.characters) === null || _a === void 0 ? void 0 : _a.trim();
        if (t)
            texts.push(t);
    }
    if ('findAll' in node) {
        const descendants = node.findAll(() => true);
        for (const d of descendants) {
            if (d.type === 'TEXT') {
                const t = (_b = d.characters) === null || _b === void 0 ? void 0 : _b.trim();
                if (t)
                    texts.push(t);
            }
        }
    }
    return uniq(texts);
}
/** Get sibling texts near a node (for context) */
function getSiblingTexts(node) {
    var _a;
    const parent = node.parent;
    if (!parent || !('children' in parent))
        return [];
    const texts = [];
    for (const sibling of parent.children) {
        if (sibling.type === 'TEXT') {
            const t = (_a = sibling.characters) === null || _a === void 0 ? void 0 : _a.trim();
            if (t)
                texts.push(t);
        }
    }
    return texts.slice(0, 10);
}
/** Get ALL texts from the nearest parent Frame (page context) */
function getPageContextTexts(node) {
    var _a;
    let p = node.parent;
    // Find the root-level frame (the "page" or "screen")
    let rootFrame = null;
    while (p) {
        if (p.type === 'FRAME') {
            rootFrame = p;
        }
        p = p.parent;
    }
    if (!rootFrame)
        return [];
    const texts = [];
    const descendants = rootFrame.findAll(() => true);
    for (const d of descendants) {
        if (d.type === 'TEXT') {
            const t = (_a = d.characters) === null || _a === void 0 ? void 0 : _a.trim();
            if (t && t.length < 100)
                texts.push(t); // Skip very long texts
        }
    }
    return uniq(texts).slice(0, 50); // Limit to 50 texts for context
}
function scanSelectedInteractiveNodes() {
    const selection = figma.currentPage.selection;
    const nodes = selection.length > 0 ? selection : [];
    function nearestFrameName(n) {
        let p = n;
        while (p) {
            if (p.type === 'FRAME')
                return p.name;
            p = p.parent;
        }
        return 'UnknownPage';
    }
    function inferType(n) {
        var _a;
        const name = (n.name || '').toLowerCase();
        if (n.type === 'TEXT')
            return 'Text';
        if (name.includes('button') || name.includes('btn'))
            return 'Button';
        if (name.includes('tab'))
            return 'Tab';
        if (name.includes('input') || name.includes('textfield') || name.includes('text field'))
            return 'Input';
        if (name.includes('toggle') || name.includes('switch'))
            return 'Toggle';
        if (name.includes('checkbox'))
            return 'Checkbox';
        if (name.includes('radio'))
            return 'Radio';
        if (name.includes('card') || name.includes('item') || name.includes('row'))
            return 'ListItem';
        if (n.type === 'INSTANCE') {
            const inst = n;
            const compName = (((_a = inst.mainComponent) === null || _a === void 0 ? void 0 : _a.name) || inst.name || '').toLowerCase();
            if (compName.includes('button') || compName.includes('btn'))
                return 'Button';
            if (compName.includes('tab'))
                return 'Tab';
            if (compName.includes('input'))
                return 'Input';
            if (compName.includes('card') || compName.includes('item'))
                return 'ListItem';
        }
        return n.type;
    }
    function getComponentName(n) {
        var _a;
        if (n.type === 'INSTANCE') {
            const inst = n;
            return ((_a = inst.mainComponent) === null || _a === void 0 ? void 0 : _a.name) || inst.name;
        }
        if (n.type === 'COMPONENT') {
            return n.name;
        }
        return undefined;
    }
    const results = [];
    for (const n of nodes) {
        const frameName = nearestFrameName(n);
        const elementType = inferType(n);
        // Get text content from this element
        let text;
        if (n.type === 'TEXT') {
            text = n.characters;
        }
        else {
            // Try to get text from inside the element
            const innerTexts = collectTextsFromNode(n);
            if (innerTexts.length > 0) {
                text = innerTexts.slice(0, 3).join(' | ');
            }
        }
        // Get surrounding context
        const siblingTexts = getSiblingTexts(n);
        const pageContextTexts = getPageContextTexts(n);
        const componentName = getComponentName(n);
        results.push({
            nodeId: n.id,
            nodeName: n.name,
            parentFrameName: frameName,
            elementType,
            text,
            siblingTexts,
            pageContextTexts,
            componentName,
        });
    }
    return results;
}
/** Export a node as base64 PNG screenshot */
async function exportNodeAsBase64(nodeId, maxSize = 512) {
    try {
        const node = figma.getNodeById(nodeId);
        if (!node || !('exportAsync' in node))
            return null;
        const exportNode = node;
        // Calculate scale to fit within maxSize while preserving aspect ratio
        let scale = 1;
        if ('width' in exportNode && 'height' in exportNode) {
            const maxDim = Math.max(exportNode.width, exportNode.height);
            if (maxDim > maxSize) {
                scale = maxSize / maxDim;
            }
        }
        const bytes = await exportNode.exportAsync({
            format: 'PNG',
            constraint: { type: 'SCALE', value: scale },
        });
        // Convert Uint8Array to base64
        const base64 = figma.base64Encode(bytes);
        return base64;
    }
    catch (e) {
        console.error('Failed to export node:', e);
        return null;
    }
}
/** Get the root frame (page/screen) containing a node */
function getRootFrame(nodeId) {
    const node = figma.getNodeById(nodeId);
    if (!node)
        return null;
    let p = node;
    let rootFrame = null;
    while (p) {
        if (p.type === 'FRAME') {
            rootFrame = p;
        }
        p = p.parent;
    }
    return rootFrame;
}
/** Check if a node is likely interactive (button, tab, input, etc.) */
function isInteractiveNode(node) {
    const name = (node.name || '').toLowerCase();
    // Check by name patterns (English and Chinese common patterns)
    const interactivePatterns = [
        'button', 'btn', 'tab', 'input', 'toggle', 'switch',
        'checkbox', 'radio', 'link', 'action', 'cta', 'submit',
        'cancel', 'confirm', 'close', 'menu', 'dropdown', 'select',
        'icon-button', 'fab', 'chip', 'click', 'tap', 'press',
        // Chinese patterns
        '按钮', '取消', '确认', '确定', '提交', '返回', '关闭', '删除', '添加', '编辑',
        '保存', '发送', '接收', '搜索', '筛选', '排序', '刷新', '更多', '详情', '查看'
    ];
    if (interactivePatterns.some(p => name.includes(p))) {
        return true;
    }
    // ALL component instances are potentially interactive
    if (node.type === 'INSTANCE') {
        return true;
    }
    // Check for click reactions (if available)
    if ('reactions' in node && Array.isArray(node.reactions)) {
        const reactions = node.reactions;
        if (reactions.length > 0) {
            return true;
        }
    }
    return false;
}
/** Check if node is a meaningful container (card, list item, etc.) */
function isInteractiveContainer(node) {
    const name = (node.name || '').toLowerCase();
    const containerPatterns = ['card', 'item', 'row', 'cell', 'tile', 'list-item', 'order'];
    if (containerPatterns.some(p => name.includes(p))) {
        // Must be a frame/group with children
        if ((node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'INSTANCE') &&
            'children' in node && node.children.length > 0) {
            return true;
        }
    }
    return false;
}
/** Scan a Frame and find all interactive elements (legacy - no longer primary method) */
function scanFrameForInteractiveElements() {
    var _a;
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
        return null;
    }
    const selectedNode = selection[0];
    // Find the frame to scan
    let frameToScan = null;
    if (selectedNode.type === 'FRAME') {
        frameToScan = selectedNode;
    }
    else {
        // Find parent frame
        let p = selectedNode.parent;
        while (p) {
            if (p.type === 'FRAME') {
                frameToScan = p;
                break;
            }
            p = p.parent;
        }
    }
    if (!frameToScan) {
        return null;
    }
    // Collect all texts for context
    const pageContextTexts = [];
    const descendants = frameToScan.findAll(() => true);
    for (const d of descendants) {
        if (d.type === 'TEXT') {
            const t = (_a = d.characters) === null || _a === void 0 ? void 0 : _a.trim();
            if (t && t.length < 100) {
                pageContextTexts.push(t);
            }
        }
    }
    // Find interactive elements
    const interactiveElements = [];
    const processedIds = new Set();
    function getDepth(node) {
        let depth = 0;
        let p = node.parent;
        while (p && p.id !== frameToScan.id) {
            depth++;
            p = p.parent;
        }
        return depth;
    }
    function getTextFromNode(node) {
        var _a;
        if (node.type === 'TEXT') {
            return (_a = node.characters) === null || _a === void 0 ? void 0 : _a.trim();
        }
        if ('findAll' in node) {
            const textNodes = node.findAll(n => n.type === 'TEXT');
            const texts = textNodes
                .map(t => { var _a; return (_a = t.characters) === null || _a === void 0 ? void 0 : _a.trim(); })
                .filter(Boolean)
                .slice(0, 3);
            return texts.length > 0 ? texts.join(' | ') : undefined;
        }
        return undefined;
    }
    function getElementType(node) {
        var _a;
        const name = (node.name || '').toLowerCase();
        if (name.includes('button') || name.includes('btn'))
            return 'Button';
        if (name.includes('tab'))
            return 'Tab';
        if (name.includes('input') || name.includes('textfield'))
            return 'Input';
        if (name.includes('toggle') || name.includes('switch'))
            return 'Toggle';
        if (name.includes('checkbox'))
            return 'Checkbox';
        if (name.includes('radio'))
            return 'Radio';
        if (name.includes('card') || name.includes('item') || name.includes('row'))
            return 'ListItem';
        if (name.includes('link'))
            return 'Link';
        if (name.includes('icon') && (name.includes('button') || name.includes('btn')))
            return 'IconButton';
        if (node.type === 'INSTANCE') {
            const inst = node;
            const compName = (((_a = inst.mainComponent) === null || _a === void 0 ? void 0 : _a.name) || '').toLowerCase();
            if (compName.includes('button') || compName.includes('btn'))
                return 'Button';
            if (compName.includes('tab'))
                return 'Tab';
            if (compName.includes('input'))
                return 'Input';
            if (compName.includes('toggle'))
                return 'Toggle';
        }
        return node.type;
    }
    function getComponentName(node) {
        var _a;
        if (node.type === 'INSTANCE') {
            const inst = node;
            return ((_a = inst.mainComponent) === null || _a === void 0 ? void 0 : _a.name) || inst.name;
        }
        if (node.type === 'COMPONENT') {
            return node.name;
        }
        return undefined;
    }
    // Process all descendants
    for (const node of descendants) {
        // Skip if already processed (avoid duplicates from nested structures)
        if (processedIds.has(node.id))
            continue;
        // Check if interactive
        if (isInteractiveNode(node) || isInteractiveContainer(node)) {
            processedIds.add(node.id);
            // Skip if parent is already in the list (avoid double-counting)
            let skipDueToParent = false;
            let p = node.parent;
            while (p && p.id !== frameToScan.id) {
                if (processedIds.has(p.id)) {
                    // Parent is already interactive, but we might still want to track this
                    // Only skip if it's a deeply nested button inside a card that's already tracked
                    const parentDepth = getDepth(p);
                    const nodeDepth = getDepth(node);
                    if (nodeDepth - parentDepth > 2) {
                        skipDueToParent = true;
                        break;
                    }
                }
                p = p.parent;
            }
            if (skipDueToParent)
                continue;
            interactiveElements.push({
                nodeId: node.id,
                nodeName: node.name,
                elementType: getElementType(node),
                text: getTextFromNode(node),
                componentName: getComponentName(node),
                depth: getDepth(node),
            });
        }
    }
    // Sort by depth (shallower first) and then by position
    interactiveElements.sort((a, b) => a.depth - b.depth);
    return {
        frameId: frameToScan.id,
        frameName: frameToScan.name,
        pageContextTexts: uniq(pageContextTexts).slice(0, 60),
        interactiveElements,
    };
}

;// ./src/shared/prd_kb.json
const prd_kb_namespaceObject = /*#__PURE__*/JSON.parse('[{"feature":"收藏代币","background":"用户需要快速访问常用交易对，提高交易效率。","logic":"用户可在市场列表对交易对进行收藏/取消收藏；收藏列表只展示收藏项；收藏状态在页面切换时保持。","ac":"- 在市场列表页可收藏/取消收藏\\n- 收藏Tab只显示已收藏交易对\\n- 收藏为空时展示空态提示\\n- 收藏状态跨会话持久化（如本地/服务端）","keywords":["收藏","市场","交易对","tab","星标"]},{"feature":"价格提醒","background":"用户希望在价格达到阈值时收到提醒。","logic":"支持设置上/下穿阈值；提醒触发后可查看详情并关闭。","ac":"- 支持新增/删除提醒\\n- 支持上穿/下穿\\n- 触发后可跳转到交易页","keywords":["提醒","阈值","通知"]}]');
;// ./src/plugin/openrouter.ts
async function openRouterChat(settings, messages) {
    var _a, _b, _c;
    if (!settings.openRouterApiKey) {
        throw new Error('Missing OpenRouter API Key. Please set it in Settings.');
    }
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${settings.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://figma.com',
            'X-Title': 'OneKey PRD Sync',
        },
        body: JSON.stringify({
            model: settings.model || 'anthropic/claude-3.5-sonnet',
            messages,
            temperature: 0.2,
            max_tokens: 2000,
        }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter error ${response.status}: ${text}`);
    }
    const data = await response.json();
    const content = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
    if (!content || typeof content !== 'string') {
        throw new Error('OpenRouter returned empty response');
    }
    return content;
}
/** Check if the model supports vision */
function isVisionModel(model) {
    const visionModels = [
        'openai/gpt-4o',
        'openai/gpt-4-vision',
        'openai/gpt-4-turbo',
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-sonnet',
        'anthropic/claude-3-opus',
        'anthropic/claude-3-haiku',
        'google/gemini-2.0-flash',
        'google/gemini-2.5-pro',
        'google/gemini-pro-vision',
    ];
    return visionModels.some(v => model.includes(v.split('/')[1]));
}

;// ./src/plugin/prd.ts


function normalize(s) {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function scoreSection(section, q) {
    const hay = normalize([section.feature, section.background, section.logic, section.ac, ...(section.keywords || [])].join(' '));
    let score = 0;
    for (const token of q.split(' ').filter(Boolean)) {
        if (hay.includes(token))
            score += 2;
    }
    if (hay.includes(q))
        score += 5;
    return score;
}
function pickCandidates(sections, context) {
    const q = normalize([context.frameName, ...context.componentNames, ...context.texts].join(' ')).slice(0, 5000);
    const scored = sections
        .map((s) => ({ s, score: scoreSection(s, q) }))
        .sort((a, b) => b.score - a.score);
    const top = scored.filter((x) => x.score > 0).slice(0, 6).map((x) => x.s);
    return top.length > 0 ? top : sections.slice(0, Math.min(6, sections.length));
}
async function loadKB(settings) {
    if (!settings.prdEndpointUrl)
        return prd_kb_namespaceObject;
    const res = await fetch(settings.prdEndpointUrl, { method: 'GET' });
    if (!res.ok) {
        throw new Error(`KB endpoint error ${res.status}`);
    }
    const json = await res.json();
    if (!Array.isArray(json)) {
        throw new Error('KB endpoint must return a JSON array');
    }
    return json;
}
async function syncPRD(settings, context) {
    const sections = await loadKB(settings);
    const candidates = pickCandidates(sections, context);
    const systemPrompt = "You are a PM Assistant. I will provide you with text elements from a Figma design. " +
        "Your task is to identify the feature name and retrieve the corresponding Background, Business Logic and Acceptance Criteria from the provided documentation context. " +
        "If no exact match is found, summarize the likely logic based on the UI elements.";
    const userPrompt = JSON.stringify({
        figma: {
            frameName: context.frameName,
            componentNames: context.componentNames,
            texts: context.texts,
        },
        documentationContext: candidates,
        requiredSections: ['Background', 'Logic', 'AC'],
        output: {
            format: 'json',
            schema: {
                featureName: 'string',
                markdown: 'string (markdown)',
                matchedSections: 'string[] (candidate feature names used)',
            },
        },
    }, null, 2);
    const raw = await openRouterChat(settings, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ]);
    // Extract JSON object from raw (models sometimes wrap)
    const match = raw.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : raw;
    try {
        const parsed = JSON.parse(jsonText);
        return {
            featureName: String(parsed.featureName || context.frameName || 'Unknown Feature'),
            markdown: String(parsed.markdown || raw),
            matchedSections: Array.isArray(parsed.matchedSections) ? parsed.matchedSections.map(String) : [],
        };
    }
    catch (_a) {
        return {
            featureName: context.frameName || 'Unknown Feature',
            markdown: raw,
            matchedSections: candidates.map((c) => c.feature),
        };
    }
}

;// ./src/plugin/tracker.ts

const VISION_SYSTEM_PROMPT = `You are an expert Product Manager analyzing a **Web3 Wallet App** UI to generate precise tracking events.

I will show you:
1. A screenshot of the FULL PAGE/SCREEN for business context
2. A screenshot of the SPECIFIC ELEMENT the user wants to track

Your task:
1. **Deeply understand the BUSINESS SCENARIO** - What is the user trying to accomplish?
2. **Identify the USER'S INTENT** - Why would they interact with this element?
3. Generate a tracking event that captures business value

---

## EVENT NAMING CONVENTION (CRITICAL)

Format: \`{module}_{action}_{element}\` in **snake_case**

### Structure:
1. **module**: Business feature/function (identify from WHAT THE USER IS DOING)
2. **action**: User behavior (tap, view, submit, toggle, select, input, scroll)
3. **element**: UI element type (confirm, cancel, tab, token, card, button, input)

### Module Examples - Understand from business context:
| What user is doing | Module prefix | Example Events |
|-------------------|---------------|----------------|
| Swapping/exchanging tokens | \`swap_\` | \`swap_tap_confirm\`, \`swap_select_token\` |
| Managing open orders | \`order_\` | \`order_tap_cancel\`, \`order_view_detail\` |
| Browsing market prices | \`market_\` | \`market_tap_token\`, \`market_toggle_watchlist\` |
| Sending cryptocurrency | \`send_\` | \`send_input_address\`, \`send_submit_transfer\` |
| Viewing portfolio | \`wallet_\` | \`wallet_tap_asset\`, \`wallet_view_balance\` |
| Staking/earning yield | \`earn_\` | \`earn_tap_stake\`, \`earn_tap_claim\` |

**Key principle**: Module reflects the **business function**, not just page name.

### ⚠️ Avoid generic/meaningless modules:
❌ BAD: \`navigation_\`, \`page_\`, \`screen_\`, \`app_\` (too generic)
❌ BAD: \`tap_confirm\`, \`click_button\` (no business context)
✅ GOOD: \`swap_tap_confirm\`, \`order_tap_cancel\` (clear business intent)

---

## ⚠️ MERGE SIMILAR ELEMENTS (Use properties to distinguish)

**Same type of UI elements → ONE event + property, NOT separate events.**

### Example - Trading page tabs:
❌ BAD: \`trading_tap_swap\`, \`trading_tap_bridge\`, \`trading_tap_limit\` (3 events)
✅ GOOD: \`trading_tap_tab\` + \`tab_name\` = "swap" | "bridge" | "limit" (1 event)

### Merge patterns:

| Module | UI Element | Event Name | Key Property |
|--------|------------|------------|--------------|
| trading | Tab bar | \`trading_tap_tab\` | \`tab_name\`: swap, bridge, limit |
| main | Bottom nav | \`main_tap_tab\` | \`tab_name\`: home, market, swap, earn |
| market | Token row | \`market_tap_token\` | \`token_symbol\`: BTC, ETH |
| order | Order card | \`order_tap_card\` | \`order_id\`, \`order_status\` |
| home | Banner | \`home_tap_banner\` | \`banner_id\`, \`position\` |
| market | Filter chip | \`market_tap_filter\` | \`filter_type\`, \`filter_value\` |

---

## 🎯 WHAT TO TRACK (Product Expert Guidelines)

### ✅ MUST TRACK - High business value:
| Element Type | Why Track | Example |
|--------------|-----------|---------|
| **核心转化按钮** | 漏斗分析关键节点 | Swap确认、发送确认、下单 |
| **功能入口** | 用户路径分析 | 点击进入Swap、进入订单详情 |
| **关键选择** | 用户决策分析 | 选择代币、选择网络、选择订单类型 |
| **Tab切换** | 功能使用分布 | 交易类型Tab、底部导航 |
| **列表项点击** | 内容热度分析 | 点击代币行、点击订单卡片 |
| **收藏/关注** | 用户偏好 | 添加收藏、设置价格提醒 |
| **搜索** | 用户需求洞察 | 搜索代币、搜索DApp |
| **筛选/排序** | 使用习惯分析 | 按价格排序、按网络筛选 |

### ❌ DO NOT TRACK - Low/no value:
| Element Type | Why Skip |
|--------------|----------|
| **返回/关闭按钮** | 通用导航，无业务意义 (除非是放弃流程的关键节点) |
| **纯展示文本** | 静态内容，无交互 |
| **Loading状态** | 系统状态，非用户行为 |
| **错误弹窗关闭** | 被动操作，无分析价值 |
| **键盘收起** | 系统行为 |
| **下拉刷新** | 太频繁，无业务洞察 |
| **滚动浏览** | 除非是关键内容曝光 |
| **复制成功Toast** | 结果反馈，不是决策点 |
| **重复导航** | 已在其他地方埋点 |
| **装饰性图标** | 无交互功能 |

### 🤔 CONDITIONAL - Depends on context:
| Element | Track If... | Skip If... |
|---------|-------------|------------|
| 取消按钮 | 放弃核心流程(如取消交易) | 只是关闭弹窗 |
| 帮助/FAQ | 是业务相关帮助 | 是通用说明 |
| 分享按钮 | 分享业务内容(如分享收款码) | 分享App本身 |
| 设置项 | 影响核心功能(如滑点设置) | 是UI偏好(如暗色模式) |

---

## CATEGORY - Business function categorization

**Don't use pre-defined lists. Understand the BUSINESS FUNCTION.**

✅ GOOD categories (business-focused):
- Transaction (交易) - for swap/send/receive actions
- Portfolio (资产) - for wallet/balance views
- Order Management (订单) - for order operations
- Market Research (行情) - for price/chart viewing
- DeFi (DeFi) - for staking/lending
- Account (账户) - for settings/security

❌ BAD categories (generic/meaningless):
- Navigation (导航) - too generic
- Page (页面) - not business-focused
- Button (按钮) - describes UI, not function
- General (通用) - meaningless

**Key**: Category should answer "What business goal is this supporting?"

---

## TRIGGER CONDITION - Business scenario analysis

**Don't just say "用户点击时" - explain the BUSINESS SCENARIO!**

### Framework: When + Why + What happens
1. **When**: In what business situation does this happen?
2. **Why**: What is the user's goal/intent?
3. **What**: What business outcome does this trigger?

### Examples:

❌ BAD (shallow): "用户点击确认按钮时"
✅ GOOD (business): "用户确认Swap交易参数（代币、数量、滑点）后，点击确认按钮提交链上交易"

❌ BAD: "用户点击取消"
✅ GOOD: "用户在订单详情页查看未完成订单时，决定取消该订单并释放保证金"

❌ BAD: "用户切换Tab"
✅ GOOD: "用户在交易页面切换交易类型（Swap/Bridge/Limit）以使用不同的交易功能"

❌ BAD: "用户选择代币"
✅ GOOD: "用户在Swap页面选择要兑换的目标代币，用于确定兑换方向"

### Template:
"当用户[业务场景]时，[用户意图]，通过[操作]来[业务结果]"

---

## OUTPUT FORMAT

\`\`\`json
{
  "eventName": "snake_case_event_name",
  "eventDisplayName": "中文事件描述",
  "category": "业务功能分类（理解业务本质，不要用预设列表）",
  "triggerCondition": "详细的业务触发场景（包含：何时发生、用户意图、业务结果）",
  "properties": [
    {
      "key": "snake_case_key",
      "displayName": "中文属性名",
      "description": "属性的业务用途说明",
      "possibleValues": "可选值列表（如适用）"
    }
  ]
}
\`\`\`

REMEMBER: 
- Understand the BUSINESS CONTEXT deeply, not just UI elements
- Category = business function, not page name
- Trigger condition = business scenario with user intent
- **Focus on WHY users do this, not just WHAT they click**`;
const TEXT_SYSTEM_PROMPT = `You are a Product Manager analyzing a **Web3 Wallet App** to generate precise tracking events.

Deeply understand the business context from element texts and page context.

---

## EVENT NAMING: \`{module}_{action}_{element}\` in **snake_case**

### Structure: module (business function) + action + element

Module = **business function**, not page name. Ask: "What is the user trying to accomplish?"

Examples:
- User swapping tokens → \`swap_tap_confirm\`, \`swap_select_token\`
- User managing orders → \`order_tap_cancel\`, \`order_view_detail\`
- User browsing market → \`market_tap_token\`, \`market_toggle_watchlist\`
- User sending crypto → \`send_input_address\`, \`send_submit_transfer\`
- User viewing portfolio → \`wallet_tap_asset\`, \`wallet_view_balance\`

---

## ⚠️ MERGE SIMILAR ELEMENTS

Same-type elements → ONE event + property:
- ❌ \`tap_tab\` → ✅ \`trading_tap_tab\` + \`tab_name\`
- ❌ \`tap_token_btc\` → ✅ \`market_tap_token\` + \`token_symbol\`

---

## CATEGORY - Business function

**Understand business essence, don't use generic labels.**

✅ GOOD: Transaction, Portfolio, Order Management, Market Research, DeFi, Account
❌ BAD: Navigation, Page, Button, General (too generic)

Category should answer: "What business goal does this support?"

---

## TRIGGER CONDITION - Business scenario

**Explain the business scenario, not just "用户点击"!**

Framework: When + Why + What
- When: In what business situation?
- Why: User's goal/intent?
- What: Business outcome?

Examples:
- ❌ BAD: "用户点击确认"
- ✅ GOOD: "用户确认Swap交易参数后，点击确认提交链上交易"

- ❌ BAD: "用户选择Tab"
- ✅ GOOD: "用户在交易页面切换交易类型（Swap/Bridge/Limit）以使用不同功能"

---

## OUTPUT:

\`\`\`json
{
  "eventName": "snake_case_event",
  "eventDisplayName": "中文描述",
  "category": "业务功能分类（深入理解业务本质）",
  "triggerCondition": "详细业务场景（包含何时、为何、结果）",
  "properties": [{"key": "snake_case", "displayName": "中文", "description": "业务用途", "possibleValues": "可选值"}]
}
\`\`\`

**Focus on business understanding over UI description.**`;
async function generateTrackingForNode(settings, input) {
    const useVision = isVisionModel(settings.model) && input.pageScreenshotBase64;
    let messages;
    if (useVision && input.pageScreenshotBase64) {
        // Build multimodal message with screenshots
        const contentParts = [];
        // Add page screenshot for context
        contentParts.push({
            type: 'text',
            text: '## Full Page Screenshot (for context):',
        });
        contentParts.push({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${input.pageScreenshotBase64}` },
        });
        // Add element screenshot if available
        if (input.screenshotBase64) {
            contentParts.push({
                type: 'text',
                text: '## Element to Track:',
            });
            contentParts.push({
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${input.screenshotBase64}` },
            });
        }
        // Add text context as backup
        contentParts.push({
            type: 'text',
            text: `
## Element Info:
- Name: ${input.nodeName}
- Type: ${input.elementType}
- Text: ${input.text || '(no text)'}
- Component: ${input.componentName || 'N/A'}
- Page: ${input.parentFrameName}

## Page Texts (for reference):
${input.pageContextTexts.slice(0, 30).join(', ')}

Generate a tracking event based on what you SEE in the screenshots.`,
        });
        messages = [
            { role: 'system', content: VISION_SYSTEM_PROMPT },
            { role: 'user', content: contentParts },
        ];
    }
    else {
        // Text-only fallback
        const userPrompt = JSON.stringify({
            element: {
                name: input.nodeName,
                type: input.elementType,
                text: input.text || '(no text)',
                componentName: input.componentName,
            },
            siblingTexts: input.siblingTexts,
            pageContextTexts: input.pageContextTexts,
            pageName: input.parentFrameName,
        }, null, 2);
        messages = [
            { role: 'system', content: TEXT_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ];
    }
    const raw = await openRouterChat(settings, messages);
    // Extract JSON
    const jsonText = extractJsonArray(raw) || extractJsonObject(raw);
    try {
        const parsed = JSON.parse(jsonText);
        const eventName = String(parsed.eventName || 'unknown_event');
        const eventDisplayName = String(parsed.eventDisplayName || parsed.eventName || '未知事件');
        // Let AI decide category, only use inference as last resort
        let category = String(parsed.category || '');
        if (!category || category === 'General' || category === 'Navigation') {
            category = inferCategoryFromContext(input.pageContextTexts);
        }
        // Trigger condition should have business context
        let triggerCondition = String(parsed.triggerCondition || '');
        if (!triggerCondition || triggerCondition.length < 10) {
            // Generate a better default with element context
            triggerCondition = `用户在${input.parentFrameName}页面与"${input.text || input.nodeName}"交互时触发`;
        }
        const propsRaw = Array.isArray(parsed.properties) ? parsed.properties : [];
        const properties = propsRaw
            .filter((p) => p && typeof p === 'object' && p.key)
            .slice(0, 6)
            .map((p) => ({
            key: toSnakeCase(String(p.key)),
            displayName: String(p.displayName || p.key),
            description: String(p.description || ''),
            possibleValues: p.possibleValues ? String(p.possibleValues) : undefined,
        }));
        if (properties.length === 0) {
            properties.push(...inferPropertiesFromContext(input.pageContextTexts));
        }
        return {
            elementType: input.elementType,
            eventName,
            eventDisplayName,
            category,
            triggerCondition,
            properties,
            verified: false,
        };
    }
    catch (_a) {
        const category = inferCategoryFromContext(input.pageContextTexts);
        const eventName = inferEventNameFromContext(input.nodeName, input.text, input.pageContextTexts);
        return {
            elementType: input.elementType,
            eventName,
            eventDisplayName: `${input.text || input.nodeName}点击`,
            category,
            triggerCondition: `用户在${input.parentFrameName}页面点击"${input.text || input.nodeName}"时触发`,
            properties: [
                { key: 'source_page', displayName: '来源页面', description: '用户从哪个页面触发该操作' },
                { key: 'element_name', displayName: '元素名称', description: '被点击元素的名称' },
            ],
            verified: false,
        };
    }
}
function toSnakeCase(s) {
    return s
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .toLowerCase()
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
}
/**
 * Extract JSON array from AI response with balanced bracket matching.
 */
function extractJsonArray(raw) {
    const codeBlockMatch = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (codeBlockMatch)
        return codeBlockMatch[1];
    const startIdx = raw.indexOf('[');
    if (startIdx === -1)
        return '';
    // Simple extraction for now, balanced matching is better but complex to inline perfectly without helper
    // Fallback to last closing bracket
    const lastIdx = raw.lastIndexOf(']');
    if (lastIdx > startIdx)
        return raw.slice(startIdx, lastIdx + 1);
    return '';
}
function extractJsonObject(raw) {
    const codeBlockMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch)
        return codeBlockMatch[1];
    const startIdx = raw.indexOf('{');
    if (startIdx === -1)
        return '{}';
    const lastIdx = raw.lastIndexOf('}');
    if (lastIdx > startIdx)
        return raw.slice(startIdx, lastIdx + 1);
    return '{}';
}
function inferCategoryFromContext(texts) {
    const joined = texts.join(' ').toLowerCase();
    // Only infer for very clear business contexts
    // Order management
    if (joined.includes('order') && (joined.includes('cancel') || joined.includes('limit') || joined.includes('open')))
        return 'Order Management';
    // Transaction-related (swap/send)
    if (joined.includes('swap') || joined.includes('exchange') || joined.includes('slippage'))
        return 'Transaction';
    if (joined.includes('send') && (joined.includes('address') || joined.includes('recipient')))
        return 'Transaction';
    if (joined.includes('receive') || joined.includes('deposit'))
        return 'Transaction';
    // Market/Research
    if (joined.includes('market') || joined.includes('price') || joined.includes('chart') || joined.includes('watchlist'))
        return 'Market Research';
    // DeFi
    if (joined.includes('stake') || joined.includes('apy') || joined.includes('earn') || joined.includes('yield'))
        return 'DeFi';
    // Account/Settings
    if (joined.includes('setting') || joined.includes('security') || joined.includes('backup') || joined.includes('biometric'))
        return 'Account';
    // Portfolio/Assets
    if (joined.includes('balance') || joined.includes('asset') || joined.includes('portfolio') || joined.includes('wallet'))
        return 'Portfolio';
    // Default: let AI decide, don't force a generic category
    return 'General';
}
function inferEventNameFromContext(nodeName, text, pageTexts) {
    const name = (text || nodeName).toLowerCase();
    const context = pageTexts.join(' ').toLowerCase();
    let module = 'app';
    if (context.includes('order'))
        module = 'order';
    else if (context.includes('swap'))
        module = 'swap';
    else if (context.includes('market'))
        module = 'market';
    else if (context.includes('send'))
        module = 'send';
    // Fallback construction
    const cleaned = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return `${module}_tap_${cleaned || 'element'}`;
}
function inferPropertiesFromContext(texts) {
    const joined = texts.join(' ').toLowerCase();
    const props = [];
    // Always add source_page as base property
    props.push({ key: 'source_page', displayName: '来源页面', description: '用户从哪个页面触发' });
    // Order-related properties
    if (joined.includes('order') || joined.includes('limit')) {
        props.push({ key: 'order_id', displayName: '订单ID', description: '订单唯一标识' }, { key: 'order_type', displayName: '订单类型', description: '订单类型', possibleValues: 'limit, market' }, { key: 'order_side', displayName: '订单方向', description: '买入或卖出', possibleValues: 'buy, sell' }, { key: 'order_status', displayName: '订单状态', description: '当前状态', possibleValues: 'open, filled, cancelled, expired' });
    }
    // Swap-related properties
    if (joined.includes('swap') || joined.includes('exchange')) {
        props.push({ key: 'token_from', displayName: '源代币', description: '兑换的源代币符号' }, { key: 'token_to', displayName: '目标代币', description: '兑换的目标代币符号' }, { key: 'amount_from', displayName: '源数量', description: '兑换的源代币数量' }, { key: 'slippage', displayName: '滑点', description: '设置的滑点百分比' });
    }
    return props.slice(0, 5);
}
function attachTrackingToLayer(nodeId, event) {
    const node = figma.getNodeById(nodeId);
    if (!node)
        throw new Error('Node not found');
    if (!('setPluginData' in node))
        throw new Error('Node does not support pluginData');
    node.setPluginData('onekey_tracking_event', JSON.stringify({
        eventName: event.eventName,
        eventDisplayName: event.eventDisplayName,
        category: event.category,
        triggerCondition: event.triggerCondition,
        properties: event.properties,
        verified: event.verified,
    }));
}
function readTrackingFromLayer(nodeId) {
    const node = figma.getNodeById(nodeId);
    if (!node)
        return null;
    if (!('getPluginData' in node))
        return null;
    const raw = node.getPluginData('onekey_tracking_event');
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        return {
            eventName: String(parsed.eventName || ''),
            eventDisplayName: String(parsed.eventDisplayName || ''),
            category: String(parsed.category || ''),
            triggerCondition: String(parsed.triggerCondition || ''),
            properties: Array.isArray(parsed.properties) ? parsed.properties : [],
            verified: !!parsed.verified,
        };
    }
    catch (_a) {
        return null;
    }
}
// ============ VISION-BASED PAGE ANALYSIS ============
const VISION_PAGE_ANALYSIS_PROMPT = `You are an expert at analyzing **Web3 Wallet App** UI screenshots to identify ALL interactive elements that need tracking.

---

## 🎯 WHAT TO TRACK (Product Expert Guidelines)

### ✅ MUST TRACK - Business value:
| Element | Why | Example Event |
|---------|-----|---------------|
| 核心转化按钮 | 漏斗关键节点 | \`swap_tap_confirm\`, \`send_submit_transfer\` |
| 功能Tab切换 | 功能使用分布 | \`trading_tap_tab\` + tab_name |
| 代币/订单列表项 | 内容热度 | \`market_tap_token\`, \`order_tap_card\` |
| 关键选择器 | 用户决策 | \`swap_select_token\`, \`send_select_network\` |
| 收藏/关注 | 用户偏好 | \`market_toggle_watchlist\` |
| 搜索操作 | 需求洞察 | \`market_tap_search\` |
| 筛选/排序 | 习惯分析 | \`order_tap_filter\` |
| 功能入口 | 路径分析 | \`wallet_tap_swap_entry\` |

### ❌ SKIP - No business value:
| Element | Why Skip |
|---------|----------|
| 返回按钮 / 关闭X | 通用导航，无业务意义 |
| Loading / 加载中 | 系统状态 |
| 错误弹窗关闭 | 被动操作 |
| 下拉刷新 | 太频繁 |
| Toast提示 | 结果反馈 |
| 纯展示文本 | 无交互 |
| 装饰图标 | 无功能 |

---

## EVENT NAMING CONVENTION

Format: \`{module}_{action}_{element}\` in **snake_case**

### Structure:
1. **module**: Business context - identify from screenshot (swap, trading, order, market, wallet, send)
2. **action**: User action (tap, view, submit, toggle, select, input)
3. **element**: UI element (confirm, cancel, tab, token, card, button)

### Examples:
| Module | Action | Element | Full Event Name |
|--------|--------|---------|-----------------|
| swap | tap | confirm | \`swap_tap_confirm\` |
| trading | tap | tab | \`trading_tap_tab\` |
| order | tap | cancel | \`order_tap_cancel\` |
| market | tap | token | \`market_tap_token\` |
| swap | select | token | \`swap_select_token\` |
| send | input | address | \`send_input_address\` |
| market | toggle | watchlist | \`market_toggle_watchlist\` |
| send | submit | transfer | \`send_submit_transfer\` |

---

## ⚠️ MERGE SIMILAR ELEMENTS

**Same-type elements → ONE event + property to distinguish**

❌ BAD: \`trading_tap_swap\`, \`trading_tap_bridge\` (separate events)
✅ GOOD: \`trading_tap_tab\` + \`tab_name\` = "swap" | "bridge" | "limit"

| Module | UI Element | Event Name | Key Property |
|--------|------------|------------|--------------|
| trading | Tab bar | \`trading_tap_tab\` | \`tab_name\` |
| main | Bottom nav | \`main_tap_tab\` | \`tab_name\` |
| market | Token row | \`market_tap_token\` | \`token_symbol\` |
| order | Order card | \`order_tap_card\` | \`order_id\` |
| home | Banner | \`home_tap_banner\` | \`banner_id\` |

---

## CATEGORY & TRIGGER CONDITION (CRITICAL)

### Category - Business function, not page name
**Understand business essence:**
✅ GOOD: Transaction, Portfolio, Order Management, Market Research, DeFi, Account
❌ BAD: Navigation, Page, Button, General, Screen

Ask: "What business goal does this support?"

### Trigger Condition - Business scenario with intent
**Framework: When + Why + What**

Examples:
- ❌ BAD: "用户点击取消"
- ✅ GOOD: "用户在订单详情页决定取消未完成订单以释放保证金"

- ❌ BAD: "用户切换Tab"
- ✅ GOOD: "用户在交易页面切换交易类型（Swap/Bridge/Limit）以使用不同功能"

---

## OUTPUT FORMAT

\`\`\`json
[
  {
    "elementDescription": "元素位置和外观描述 (e.g., '右上角红色Cancel按钮')",
    "eventName": "snake_case_event_name",
    "eventDisplayName": "中文事件描述",
    "category": "业务功能分类（理解业务本质，避免Navigation等通用词）",
    "triggerCondition": "业务场景描述（包含何时发生、用户意图、业务结果）",
    "properties": [
      {"key": "snake_case", "displayName": "中文", "description": "业务用途说明", "possibleValues": "可选值"}
    ]
  }
]
\`\`\`

**Remember: Deep business understanding > Surface UI description**
`;
/**
 * Analyze a page screenshot with AI Vision to identify all interactive elements
 * and generate tracking events. Element names are provided as hints (low weight).
 */
async function analyzePageWithVision(settings, input) {
    if (!isVisionModel(settings.model)) {
        throw new Error('请使用支持 Vision 的模型（如 Claude 3.5 Sonnet, GPT-4o, Gemini）');
    }
    if (!input.pageScreenshotBase64) {
        throw new Error('需要页面截图');
    }
    // Build element hints list (as low-weight reference)
    const hintsText = input.elementHints.length > 0
        ? `\n\n## Element Names from Design File (HINTS ONLY - may be inaccurate):
${input.elementHints.slice(0, 50).map((h, i) => `${i + 1}. ${h.nodeName} (${h.nodeType})${h.text ? ` - "${h.text}"` : ''}`).join('\n')}

Note: These names are just hints. Many may be generic like "Frame 123". Trust what you SEE in the screenshot.`
        : '';
    const contentParts = [
        {
            type: 'text',
            text: '## Page Screenshot (ANALYZE THIS):',
        },
        {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${input.pageScreenshotBase64}` },
        },
        {
            type: 'text',
            text: `## Page Context:
- Frame Name: ${input.frameName} (may not be meaningful)
- Visible Text on Page: ${input.pageTexts.slice(0, 40).join(', ')}
${hintsText}

**YOUR TASK:**
1. LOOK at the screenshot and identify the PAGE TYPE (Orders? Trading? Settings?)
2. Find ALL interactive elements (buttons, tabs, cards, inputs, toggles, etc.)
3. Generate a tracking event for EACH interactive element

Output JSON array. Be comprehensive - identify ALL clickable/interactive elements.`,
        },
    ];
    const messages = [
        { role: 'system', content: VISION_PAGE_ANALYSIS_PROMPT },
        { role: 'user', content: contentParts },
    ];
    const raw = await openRouterChat(settings, messages);
    console.log('[Vision Analysis] Raw AI response length:', raw.length);
    const jsonText = extractJsonArray(raw);
    if (!jsonText) {
        console.error('[Vision Analysis] Could not find JSON array in response:', raw);
        throw new Error('AI 未返回有效的 JSON 数组，请重试或更换模型');
    }
    try {
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) {
            console.error('[Vision Analysis] Parsed result is not array:', typeof parsed);
            throw new Error('AI 返回的不是数组格式');
        }
        if (parsed.length === 0) {
            throw new Error('AI 未识别到任何交互元素，请确认选择的是完整页面');
        }
        const results = [];
        for (const item of parsed) {
            if (!item || typeof item !== 'object')
                continue;
            if (!item.eventName)
                continue;
            const propsRaw = Array.isArray(item.properties) ? item.properties : [];
            const properties = propsRaw
                .filter((p) => p && typeof p === 'object' && p.key)
                .slice(0, 5)
                .map((p) => ({
                key: toSnakeCase(String(p.key)),
                displayName: String(p.displayName || p.key),
                description: String(p.description || ''),
                possibleValues: p.possibleValues ? String(p.possibleValues) : undefined,
            }));
            // Let AI decide category, avoid generic defaults
            let category = String(item.category || 'General');
            if (category === 'Navigation' || category === 'Page' || category === 'Button') {
                category = 'General'; // Flag for review
            }
            // Ensure trigger condition has business context
            let triggerCondition = String(item.triggerCondition || '');
            if (!triggerCondition || triggerCondition.length < 10) {
                triggerCondition = `用户在${input.frameName}页面与该元素交互时触发`;
            }
            results.push({
                elementDescription: String(item.elementDescription || item.element || '未知元素'),
                eventName: String(item.eventName),
                eventDisplayName: String(item.eventDisplayName || item.eventName),
                category,
                triggerCondition,
                properties: properties.length > 0 ? properties : [
                    { key: 'source_page', displayName: '来源页面', description: '用户从哪个页面触发该操作' }
                ],
            });
        }
        return results;
    }
    catch (e) {
        const error = e;
        console.error('[Vision Analysis] Parse error:', error.message);
        if (error.message.includes('AI ')) {
            throw error;
        }
        throw new Error(`JSON 解析失败: ${error.message}。请重试或更换模型。`);
    }
}

;// ./src/plugin/code.ts
/// <reference types="@figma/plugin-typings" />



const STORAGE_SETTINGS = 'onekey_settings';
const STORAGE_AUTOSYNC = 'onekey_autosync';
const STORAGE_MODE = 'onekey_mode';
const STORAGE_TRACKING = 'onekey_tracking_events';
const DEFAULT_SETTINGS = {
    openRouterApiKey: '',
    model: 'anthropic/claude-3.5-sonnet',
};
let settings = DEFAULT_SETTINGS;
let autoSync = true;
let mode = 'prd';
let lastContextKey = '';
let trackingEvents = [];
figma.showUI(__html__, { width: 420, height: 720, themeColors: true });
function post(msg) {
    figma.ui.postMessage(msg);
}
async function loadState() {
    var _a;
    settings = (await figma.clientStorage.getAsync(STORAGE_SETTINGS)) || DEFAULT_SETTINGS;
    autoSync = (_a = (await figma.clientStorage.getAsync(STORAGE_AUTOSYNC))) !== null && _a !== void 0 ? _a : true;
    mode = (await figma.clientStorage.getAsync(STORAGE_MODE)) || 'prd';
    trackingEvents = (await figma.clientStorage.getAsync(STORAGE_TRACKING)) || [];
}
async function saveTrackingEvents() {
    await figma.clientStorage.setAsync(STORAGE_TRACKING, trackingEvents);
    post({ type: 'TRACKING_EVENTS', events: trackingEvents });
}
function makeContextKey(ctx) {
    return `${ctx.frameId}:${ctx.texts.join('|').slice(0, 500)}:${ctx.componentNames.join('|').slice(0, 500)}`;
}
async function pushScanContext() {
    const ctx = scanSelectedFrame();
    post({ type: 'SCAN_CONTEXT', context: ctx });
    if (!ctx)
        return;
    const key = makeContextKey(ctx);
    if (key === lastContextKey)
        return;
    lastContextKey = key;
    if (autoSync && mode === 'prd') {
        await doSyncPRD(ctx);
    }
}
async function doSyncPRD(ctx) {
    const context = ctx || scanSelectedFrame();
    if (!context) {
        post({ type: 'PRD_RESULT', result: null });
        return;
    }
    try {
        // Show loading
        post({
            type: 'LOADING_STATUS',
            status: {
                isLoading: true,
                message: '正在生成 PRD...'
            }
        });
        const result = await syncPRD(settings, context);
        // Hide loading
        post({ type: 'LOADING_STATUS', status: { isLoading: false } });
        post({ type: 'PRD_RESULT', result });
    }
    catch (e) {
        // Hide loading on error
        post({ type: 'LOADING_STATUS', status: { isLoading: false } });
        post({ type: 'ERROR', message: String(e.message || e) });
    }
}
function simpleId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
async function doGenerateTracking() {
    const nodes = scanSelectedInteractiveNodes();
    if (nodes.length === 0) {
        post({ type: 'ERROR', message: '请选择至少一个元素（按钮/Tab/Input 等）' });
        return;
    }
    // Show loading in UI
    post({
        type: 'LOADING_STATUS',
        status: {
            isLoading: true,
            message: `正在为 ${nodes.length} 个元素生成埋点...`,
            progress: { current: 0, total: nodes.length }
        }
    });
    figma.notify(`正在为 ${nodes.length} 个元素生成埋点...`);
    const next = [];
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const existing = readTrackingFromLayer(n.nodeId);
        try {
            // Update progress
            post({
                type: 'LOADING_STATUS',
                status: {
                    isLoading: true,
                    message: `AI 正在分析元素 ${i + 1}/${nodes.length}`,
                    progress: { current: i + 1, total: nodes.length }
                }
            });
            if (nodes.length > 1) {
                figma.notify(`AI 正在分析第 ${i + 1}/${nodes.length} 个元素...`);
            }
            // Get screenshot of the element
            const screenshotBase64 = await exportNodeAsBase64(n.nodeId, 256);
            // Get screenshot of the parent page/frame for context
            const rootFrame = getRootFrame(n.nodeId);
            const pageScreenshotBase64 = rootFrame ? await exportNodeAsBase64(rootFrame.id, 800) : undefined;
            const ai = await generateTrackingForNode(settings, Object.assign(Object.assign({}, n), { screenshotBase64: screenshotBase64 || undefined, pageScreenshotBase64: pageScreenshotBase64 || undefined, platform: 'App' }));
            next.push({
                id: simpleId(),
                nodeId: n.nodeId,
                nodeName: n.nodeName,
                parentFrameName: n.parentFrameName,
                elementType: ai.elementType,
                eventName: (existing === null || existing === void 0 ? void 0 : existing.eventName) || ai.eventName,
                eventDisplayName: (existing === null || existing === void 0 ? void 0 : existing.eventDisplayName) || ai.eventDisplayName,
                category: (existing === null || existing === void 0 ? void 0 : existing.category) || ai.category,
                triggerCondition: (existing === null || existing === void 0 ? void 0 : existing.triggerCondition) || ai.triggerCondition,
                properties: (existing === null || existing === void 0 ? void 0 : existing.properties) || ai.properties,
                verified: (existing === null || existing === void 0 ? void 0 : existing.verified) || false,
            });
        }
        catch (e) {
            next.push({
                id: simpleId(),
                nodeId: n.nodeId,
                nodeName: n.nodeName,
                parentFrameName: n.parentFrameName,
                elementType: n.elementType,
                eventName: `tap${n.nodeName.replace(/[^a-zA-Z]/g, '')}`,
                eventDisplayName: `${n.nodeName} 点击`,
                category: 'Wallet',
                triggerCondition: '用户点击时触发',
                properties: [],
                verified: false,
            });
        }
    }
    trackingEvents = next;
    await saveTrackingEvents();
    // Hide loading
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    figma.notify(`✓ 已为 ${next.length} 个元素生成埋点`);
}
async function doScanPageForTracking() {
    var _a, _b;
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
        post({ type: 'ERROR', message: '请选择一个 Frame（整个页面/屏幕）' });
        return;
    }
    // Find the frame to analyze
    let frameToAnalyze = null;
    const selectedNode = selection[0];
    if (selectedNode.type === 'FRAME') {
        frameToAnalyze = selectedNode;
    }
    else {
        // Find parent frame
        let p = selectedNode.parent;
        while (p) {
            if (p.type === 'FRAME') {
                frameToAnalyze = p;
                break;
            }
            p = p.parent;
        }
    }
    if (!frameToAnalyze) {
        post({ type: 'ERROR', message: '请选择一个 Frame（整个页面/屏幕）' });
        return;
    }
    // Show loading in UI
    post({
        type: 'LOADING_STATUS',
        status: {
            isLoading: true,
            message: '正在截图并分析页面...'
        }
    });
    figma.notify('正在截图并分析页面...');
    // Get page screenshot
    const pageScreenshotBase64 = await exportNodeAsBase64(frameToAnalyze.id, 1200);
    if (!pageScreenshotBase64) {
        post({ type: 'LOADING_STATUS', status: { isLoading: false } });
        post({ type: 'ERROR', message: '截图失败，请重试' });
        return;
    }
    // Update loading status
    post({
        type: 'LOADING_STATUS',
        status: {
            isLoading: true,
            message: '正在收集页面元素信息...'
        }
    });
    // Collect all element names as hints (low weight reference)
    const elementHints = [];
    const pageTexts = [];
    const descendants = frameToAnalyze.findAll(() => true);
    for (const d of descendants) {
        // Collect element names as hints
        if (d.type === 'INSTANCE' || d.type === 'FRAME' || d.type === 'GROUP') {
            let text;
            // Try to get text from inside
            if ('findOne' in d) {
                const textNode = d.findOne(n => n.type === 'TEXT');
                if (textNode) {
                    text = (_a = textNode.characters) === null || _a === void 0 ? void 0 : _a.trim().slice(0, 50);
                }
            }
            elementHints.push({
                nodeName: d.name,
                nodeType: d.type,
                text,
            });
        }
        // Collect visible text
        if (d.type === 'TEXT') {
            const t = (_b = d.characters) === null || _b === void 0 ? void 0 : _b.trim();
            if (t && t.length < 100) {
                pageTexts.push(t);
            }
        }
    }
    // Update loading status
    post({
        type: 'LOADING_STATUS',
        status: {
            isLoading: true,
            message: 'AI 正在分析页面中的交互元素...'
        }
    });
    figma.notify('AI 正在分析页面中的交互元素...');
    try {
        // Call vision-based analysis
        const visionResults = await analyzePageWithVision(settings, {
            pageScreenshotBase64,
            frameName: frameToAnalyze.name,
            pageTexts: [...new Set(pageTexts)].slice(0, 50),
            elementHints: elementHints.slice(0, 60),
        });
        // Convert to TrackingEvent format
        const next = visionResults.map((result, idx) => ({
            id: simpleId(),
            nodeId: `vision_${idx}`, // No actual node mapping
            nodeName: result.elementDescription, // Use AI's description
            parentFrameName: frameToAnalyze.name,
            elementType: 'Vision-Detected',
            eventName: result.eventName,
            eventDisplayName: result.eventDisplayName,
            category: result.category,
            triggerCondition: result.triggerCondition,
            properties: result.properties,
            verified: false,
            selected: true,
        }));
        trackingEvents = next;
        await saveTrackingEvents();
        // Hide loading
        post({ type: 'LOADING_STATUS', status: { isLoading: false } });
        figma.notify(`✓ AI 识别了 ${next.length} 个交互元素并生成埋点`);
    }
    catch (e) {
        // Hide loading on error
        post({ type: 'LOADING_STATUS', status: { isLoading: false } });
        post({ type: 'ERROR', message: `分析失败: ${e.message}` });
    }
}
function toCSV(events) {
    const header = [
        '事件名称',
        '事件显示名称',
        '分类',
        '触发时机',
        '属性名称',
        '属性显示名称',
        '属性说明',
        '可选值',
        '验证状态',
        '来源元素',
        '来源页面'
    ];
    const rows = [];
    const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    for (const e of events) {
        // If event has properties, create one row per property
        if (e.properties.length > 0) {
            for (let i = 0; i < e.properties.length; i++) {
                const prop = e.properties[i];
                rows.push([
                    i === 0 ? esc(e.eventName) : '', // Only show event name on first row
                    i === 0 ? esc(e.eventDisplayName) : '',
                    i === 0 ? esc(e.category) : '',
                    i === 0 ? esc(e.triggerCondition) : '',
                    esc(prop.key),
                    esc(prop.displayName),
                    esc(prop.description),
                    esc(prop.possibleValues || ''),
                    i === 0 ? esc(e.verified ? '已验证' : '待验证') : '',
                    i === 0 ? esc(e.nodeName) : '',
                    i === 0 ? esc(e.parentFrameName) : '',
                ].join(','));
            }
        }
        else {
            // No properties
            rows.push([
                esc(e.eventName),
                esc(e.eventDisplayName),
                esc(e.category),
                esc(e.triggerCondition),
                '', '', '', '',
                esc(e.verified ? '已验证' : '待验证'),
                esc(e.nodeName),
                esc(e.parentFrameName),
            ].join(','));
        }
    }
    return [header.join(','), ...rows].join('\n');
}
figma.ui.onmessage = async (msg) => {
    try {
        if (msg.type === 'INIT') {
            await loadState();
            post({ type: 'INIT_DATA', settings, autoSync, mode });
            post({ type: 'TRACKING_EVENTS', events: trackingEvents });
            await pushScanContext();
            return;
        }
        if (msg.type === 'SET_SETTINGS') {
            settings = msg.settings;
            await figma.clientStorage.setAsync(STORAGE_SETTINGS, settings);
            post({ type: 'INIT_DATA', settings, autoSync, mode });
            figma.notify('Settings saved');
            return;
        }
        if (msg.type === 'SET_AUTOSYNC') {
            autoSync = msg.enabled;
            await figma.clientStorage.setAsync(STORAGE_AUTOSYNC, autoSync);
            return;
        }
        if (msg.type === 'SET_MODE') {
            mode = msg.mode;
            await figma.clientStorage.setAsync(STORAGE_MODE, mode);
            return;
        }
        if (msg.type === 'SYNC_PRD_NOW') {
            await doSyncPRD();
            return;
        }
        if (msg.type === 'GENERATE_TRACKING_NOW') {
            await doGenerateTracking();
            return;
        }
        if (msg.type === 'SCAN_PAGE_FOR_TRACKING') {
            await doScanPageForTracking();
            return;
        }
        if (msg.type === 'UPDATE_TRACKING_EVENT') {
            trackingEvents = trackingEvents.map((e) => (e.id === msg.event.id ? msg.event : e));
            await saveTrackingEvents();
            return;
        }
        if (msg.type === 'TOGGLE_EVENT_SELECTION') {
            trackingEvents = trackingEvents.map((e) => e.id === msg.id ? Object.assign(Object.assign({}, e), { selected: !e.selected }) : e);
            await saveTrackingEvents();
            return;
        }
        if (msg.type === 'SELECT_ALL_EVENTS') {
            trackingEvents = trackingEvents.map((e) => (Object.assign(Object.assign({}, e), { selected: msg.selected })));
            await saveTrackingEvents();
            return;
        }
        if (msg.type === 'DELETE_TRACKING_EVENT') {
            trackingEvents = trackingEvents.filter((e) => e.id !== msg.id);
            await saveTrackingEvents();
            return;
        }
        if (msg.type === 'DELETE_ALL_EVENTS') {
            trackingEvents = [];
            await saveTrackingEvents();
            figma.notify('已清空所有埋点');
            return;
        }
        if (msg.type === 'ATTACH_TRACKING_TO_LAYER') {
            const ev = trackingEvents.find((e) => e.id === msg.id);
            if (!ev)
                throw new Error('Event not found');
            attachTrackingToLayer(ev.nodeId, ev);
            figma.notify('Attached to layer');
            return;
        }
        if (msg.type === 'EXPORT_TRACKING') {
            // Only export selected events (or all if none selected)
            const eventsToExport = trackingEvents.filter(e => e.selected !== false);
            const data = msg.format === 'csv' ? toCSV(eventsToExport) : JSON.stringify(eventsToExport, null, 2);
            post({ type: 'EXPORT_DATA', format: msg.format, data });
            figma.notify(`Exported ${eventsToExport.length} events`);
            return;
        }
        if (msg.type === 'CREATE_TRACKING_TABLE') {
            const eventsToExport = trackingEvents.filter(e => e.selected !== false);
            if (eventsToExport.length === 0) {
                post({ type: 'ERROR', message: '请先选择要导出的埋点事件' });
                return;
            }
            createTrackingTableInFigma(eventsToExport);
            figma.notify(`✓ 已创建埋点表格 (${eventsToExport.length} 个事件)`);
            return;
        }
    }
    catch (e) {
        post({ type: 'ERROR', message: String(e.message || e) });
    }
};
figma.on('selectionchange', () => {
    pushScanContext().catch((e) => post({ type: 'ERROR', message: String(e.message || e) }));
});
// ============ CREATE TABLE IN FIGMA ============
function createTrackingTableInFigma(events) {
    // Table styling - Clean white theme
    const COLORS = {
        headerBg: { r: 0.95, g: 0.95, b: 0.95 }, // Light gray header
        rowBg: { r: 1, g: 1, b: 1 }, // White
        rowAltBg: { r: 0.98, g: 0.98, b: 0.98 }, // Very light gray
        border: { r: 0.85, g: 0.85, b: 0.85 }, // Light border
        text: { r: 0.1, g: 0.1, b: 0.1 }, // Dark text
        subtext: { r: 0.4, g: 0.4, b: 0.4 }, // Gray text
        primary: { r: 0.2, g: 0.4, b: 0.9 }, // Blue
        success: { r: 0.13, g: 0.55, b: 0.13 }, // Green
    };
    const COL_WIDTHS = {
        category: 100,
        eventName: 180,
        displayName: 150,
        trigger: 200,
        properties: 300,
        verified: 80,
    };
    const ROW_HEIGHT = 48;
    const HEADER_HEIGHT = 40;
    const PADDING = 12;
    const TOTAL_WIDTH = Object.values(COL_WIDTHS).reduce((a, b) => a + b, 0);
    // Create main frame
    const tableFrame = figma.createFrame();
    tableFrame.name = `Tracking Events Table (${events.length})`;
    tableFrame.resize(TOTAL_WIDTH, HEADER_HEIGHT + events.length * ROW_HEIGHT);
    tableFrame.layoutMode = 'VERTICAL';
    tableFrame.primaryAxisSizingMode = 'AUTO';
    tableFrame.counterAxisSizingMode = 'FIXED';
    tableFrame.fills = [{ type: 'SOLID', color: COLORS.rowBg }];
    tableFrame.strokes = [{ type: 'SOLID', color: COLORS.border }];
    tableFrame.strokeWeight = 1;
    tableFrame.cornerRadius = 8;
    tableFrame.clipsContent = true;
    // Helper: create text node
    async function createText(text, fontSize, color, bold = false) {
        const node = figma.createText();
        await figma.loadFontAsync({ family: 'Inter', style: bold ? 'Bold' : 'Regular' });
        node.fontName = { family: 'Inter', style: bold ? 'Bold' : 'Regular' };
        node.characters = text || '-';
        node.fontSize = fontSize;
        node.fills = [{ type: 'SOLID', color }];
        return node;
    }
    // Helper: create cell frame
    function createCell(width) {
        const cell = figma.createFrame();
        cell.resize(width, ROW_HEIGHT);
        cell.layoutMode = 'VERTICAL';
        cell.primaryAxisAlignItems = 'CENTER';
        cell.counterAxisAlignItems = 'MIN';
        cell.paddingLeft = PADDING;
        cell.paddingRight = PADDING;
        cell.paddingTop = 8;
        cell.paddingBottom = 8;
        cell.fills = [];
        return cell;
    }
    // Create header row
    async function createHeaderRow() {
        const row = figma.createFrame();
        row.name = 'Header';
        row.layoutMode = 'HORIZONTAL';
        row.primaryAxisSizingMode = 'FIXED';
        row.counterAxisSizingMode = 'FIXED';
        row.resize(TOTAL_WIDTH, HEADER_HEIGHT);
        row.fills = [{ type: 'SOLID', color: COLORS.headerBg }];
        const headers = [
            { text: '分类', width: COL_WIDTHS.category },
            { text: '事件名称', width: COL_WIDTHS.eventName },
            { text: '显示名称', width: COL_WIDTHS.displayName },
            { text: '触发时机', width: COL_WIDTHS.trigger },
            { text: '属性', width: COL_WIDTHS.properties },
            { text: '状态', width: COL_WIDTHS.verified },
        ];
        for (const h of headers) {
            const cell = createCell(h.width);
            cell.resize(h.width, HEADER_HEIGHT);
            const text = await createText(h.text, 12, COLORS.subtext, true);
            cell.appendChild(text);
            row.appendChild(cell);
        }
        return row;
    }
    // Create data row
    async function createDataRow(event, index) {
        const row = figma.createFrame();
        row.name = `Row: ${event.eventName}`;
        row.layoutMode = 'HORIZONTAL';
        row.primaryAxisSizingMode = 'FIXED';
        row.counterAxisSizingMode = 'AUTO';
        row.resize(TOTAL_WIDTH, ROW_HEIGHT);
        row.fills = [{ type: 'SOLID', color: index % 2 === 0 ? COLORS.rowBg : COLORS.rowAltBg }];
        // Category
        const catCell = createCell(COL_WIDTHS.category);
        const catText = await createText(event.category, 11, COLORS.primary, true);
        catCell.appendChild(catText);
        row.appendChild(catCell);
        // Event Name
        const nameCell = createCell(COL_WIDTHS.eventName);
        const nameText = await createText(event.eventName, 12, COLORS.text, true);
        nameCell.appendChild(nameText);
        row.appendChild(nameCell);
        // Display Name
        const dispCell = createCell(COL_WIDTHS.displayName);
        const dispText = await createText(event.eventDisplayName, 11, COLORS.subtext);
        dispCell.appendChild(dispText);
        row.appendChild(dispCell);
        // Trigger
        const triggerCell = createCell(COL_WIDTHS.trigger);
        const triggerText = await createText(event.triggerCondition, 11, COLORS.subtext);
        triggerCell.appendChild(triggerText);
        row.appendChild(triggerCell);
        // Properties
        const propsCell = createCell(COL_WIDTHS.properties);
        const propsStr = event.properties.map(p => `${p.key}`).join(', ') || '-';
        const propsText = await createText(propsStr, 10, COLORS.subtext);
        propsCell.appendChild(propsText);
        row.appendChild(propsCell);
        // Verified
        const verCell = createCell(COL_WIDTHS.verified);
        const verText = await createText(event.verified ? '✓ 已验证' : '待验证', 11, event.verified ? COLORS.success : COLORS.subtext);
        verCell.appendChild(verText);
        row.appendChild(verCell);
        return row;
    }
    // Build table
    (async () => {
        const header = await createHeaderRow();
        tableFrame.appendChild(header);
        for (let i = 0; i < events.length; i++) {
            const row = await createDataRow(events[i], i);
            tableFrame.appendChild(row);
        }
        // Position near current viewport
        const viewport = figma.viewport.center;
        tableFrame.x = viewport.x - TOTAL_WIDTH / 2;
        tableFrame.y = viewport.y - tableFrame.height / 2;
        // Select and zoom to it
        figma.currentPage.selection = [tableFrame];
        figma.viewport.scrollAndZoomIntoView([tableFrame]);
    })();
}

/******/ })()
;