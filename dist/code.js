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

const VISION_SYSTEM_PROMPT = `You are an expert at analyzing mobile app UI screenshots to generate tracking events.

I will show you:
1. A screenshot of the FULL PAGE/SCREEN for context
2. A screenshot of the SPECIFIC ELEMENT the user wants to track

Your task:
1. Look at the full page to understand the CONTEXT (what feature/page is this?)
2. Look at the element to understand WHAT ACTION it triggers
3. Generate a tracking event that accurately reflects the business logic

**CRITICAL:**
- Base your analysis on what you SEE in the screenshots
- The page screenshot tells you the context (Orders page? Swap page? Settings?)
- The element screenshot tells you the action (Cancel button? Confirm? Toggle?)

**Event Naming (camelCase):**
- cancelLimitOrder (not just "cancel")
- confirmSwap (not just "confirm")  
- toggleWatchlist (not just "toggle")

**Categories:**
- Orders: order lists, limit orders, order history
- Trade: swap, exchange, trading
- Market: prices, charts, token lists
- Wallet: balances, assets
- Send/Receive: transfers
- Settings: app settings
- Onboarding: ONLY initial wallet setup

Output JSON only:
{
  "eventName": "camelCase",
  "eventDisplayName": "中文描述",
  "category": "based on page context",
  "triggerCondition": "触发时机",
  "properties": [
    {"key": "snake_case", "displayName": "中文", "description": "说明", "possibleValues": "可选值"}
  ]
}`;
const TEXT_SYSTEM_PROMPT = `You are a tracking event generator for a Web3 Wallet app.

Analyze the UI element and page context texts to generate an appropriate tracking event.

**CRITICAL:** Base your response on the ACTUAL texts shown on the page.
- If texts include "Open orders", "Limit price", "Cancel" → this is an ORDERS page
- If texts include "Swap", "Exchange" → this is a TRADE page
- DO NOT guess features that aren't shown

Output JSON only:
{
  "eventName": "camelCase",
  "eventDisplayName": "中文描述",
  "category": "based on context",
  "triggerCondition": "触发时机",
  "properties": [{"key": "snake_case", "displayName": "中文", "description": "说明", "possibleValues": "可选值"}]
}`;
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
    const match = raw.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : raw;
    try {
        const parsed = JSON.parse(jsonText);
        const eventName = String(parsed.eventName || 'unknownEvent');
        const eventDisplayName = String(parsed.eventDisplayName || parsed.eventName || '未知事件');
        const category = String(parsed.category || inferCategoryFromContext(input.pageContextTexts));
        const triggerCondition = String(parsed.triggerCondition || '用户触发时');
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
            eventDisplayName: `${input.text || input.nodeName}`,
            category,
            triggerCondition: '用户点击时触发',
            properties: inferPropertiesFromContext(input.pageContextTexts),
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
function inferCategoryFromContext(texts) {
    const joined = texts.join(' ').toLowerCase();
    if (joined.includes('order') || joined.includes('limit price') || joined.includes('open orders'))
        return 'Orders';
    if (joined.includes('swap') || joined.includes('exchange'))
        return 'Trade';
    if (joined.includes('send') && (joined.includes('address') || joined.includes('amount')))
        return 'Send';
    if (joined.includes('receive') || joined.includes('deposit'))
        return 'Receive';
    if (joined.includes('market') || joined.includes('price') || joined.includes('chart'))
        return 'Market';
    if (joined.includes('nft'))
        return 'NFT';
    if (joined.includes('dapp') || joined.includes('connect'))
        return 'DApp';
    if (joined.includes('setting'))
        return 'Settings';
    if (joined.includes('onboarding') || joined.includes('welcome') || joined.includes('create wallet'))
        return 'Onboarding';
    return 'Wallet';
}
function inferEventNameFromContext(nodeName, text, pageTexts) {
    const name = (text || nodeName).toLowerCase();
    const context = pageTexts.join(' ').toLowerCase();
    if (context.includes('order')) {
        if (name.includes('cancel'))
            return 'cancelOrder';
        if (name.includes('detail') || name.includes('view'))
            return 'viewOrderDetail';
        if (name.includes('history'))
            return 'viewOrderHistory';
    }
    if (name.includes('swap'))
        return 'confirmSwap';
    if (name.includes('send'))
        return 'confirmSend';
    if (name.includes('cancel'))
        return 'cancelAction';
    if (name.includes('confirm'))
        return 'confirmAction';
    const cleaned = name.replace(/[^a-zA-Z]/g, '');
    return cleaned ? `tap${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}` : 'tapElement';
}
function inferPropertiesFromContext(texts) {
    const joined = texts.join(' ').toLowerCase();
    const props = [];
    if (joined.includes('order') || joined.includes('limit')) {
        props.push({ key: 'order_id', displayName: '订单ID', description: '订单唯一标识' }, { key: 'order_type', displayName: '订单类型', description: '订单类型', possibleValues: 'limit, market' }, { key: 'order_status', displayName: '订单状态', description: '当前状态', possibleValues: 'open, filled, cancelled' });
    }
    if (joined.includes('symbol') || joined.includes('token') || joined.includes('matic') || joined.includes('usdc')) {
        props.push({ key: 'token_symbol', displayName: '代币符号', description: '代币名称' }, { key: 'token_amount', displayName: '代币数量', description: '数量' });
    }
    if (joined.includes('network') || joined.includes('ethereum') || joined.includes('polygon')) {
        props.push({ key: 'network', displayName: '网络', description: '区块链网络', possibleValues: 'ethereum, polygon, bsc' });
    }
    if (props.length === 0) {
        props.push({ key: 'source_screen', displayName: '来源页面', description: '用户从哪个页面触发' });
    }
    return props.slice(0, 4);
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
const VISION_PAGE_ANALYSIS_PROMPT = `You are an expert at analyzing mobile app UI screenshots to identify ALL interactive elements that need tracking.

**YOUR TASK:**
1. LOOK at the screenshot carefully - this is a Web3 Wallet app
2. IDENTIFY all interactive elements (buttons, tabs, cards, inputs, toggles, links, etc.)
3. For EACH interactive element, generate a tracking event

**CRITICAL - Use your VISUAL understanding:**
- Don't just rely on element names - they may be inaccurate (e.g., "Frame 123")
- LOOK at what the element actually IS and DOES
- Understand the PAGE CONTEXT: Is this an Orders page? Trading page? Settings?

**I will also provide a list of element names from the design file as HINTS:**
- These names are OPTIONAL references - some may be useful, many may not
- Prioritize what you SEE in the screenshot over the element names
- If a name like "CancelButton" matches what you see, use that info
- If a name like "Frame 34494" is meaningless, ignore it

**Event Naming (camelCase):**
- Be specific and contextual: "cancelLimitOrder" not just "cancel"
- Include page context: "viewOrderDetail" not just "view"
- Match the actual business action shown in the UI

**Categories:**
- Orders: order lists, limit orders, order history, order details
- Trade: swap, exchange, trading pairs
- Market: prices, charts, token lists, watchlist
- Wallet: balances, assets, portfolio overview
- Send: sending crypto transactions
- Receive: receiving crypto, deposit
- Settings: app settings, preferences
- Onboarding: initial wallet setup, welcome screens

**Output JSON array - one object per interactive element you identify:**
[
  {
    "elementDescription": "描述这个元素的位置和外观 (e.g., '右上角的Cancel按钮')",
    "eventName": "camelCase event name",
    "eventDisplayName": "中文描述",
    "category": "category",
    "triggerCondition": "触发时机 (when does this event fire)",
    "properties": [
      {"key": "snake_case", "displayName": "中文名", "description": "说明", "possibleValues": "可选值 if applicable"}
    ]
  },
  ...
]

**IMPORTANT:** Identify ALL meaningful interactive elements. Common ones include:
- Buttons (primary actions, cancel, confirm, submit)
- Tab switches
- List items / Cards that can be tapped
- Input fields
- Toggles / Switches
- Navigation elements
- Icons that are clickable`;
// (Legacy generateTrackingBatch removed - now using analyzePageWithVision)
// ============ NEW: VISION-FIRST PAGE ANALYSIS ============
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
    console.log('[Vision Analysis] Raw AI response preview:', raw.slice(0, 500));
    // Try multiple patterns to extract JSON array
    let jsonText = '';
    // Pattern 1: Standard JSON array
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        jsonText = arrayMatch[0];
    }
    // Pattern 2: JSON in markdown code block
    if (!jsonText) {
        const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            const inner = codeBlockMatch[1].trim();
            if (inner.startsWith('[')) {
                jsonText = inner;
            }
        }
    }
    // Pattern 3: Use raw if it looks like JSON
    if (!jsonText && raw.trim().startsWith('[')) {
        jsonText = raw.trim();
    }
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
            results.push({
                elementDescription: String(item.elementDescription || item.element || '未知元素'),
                eventName: String(item.eventName),
                eventDisplayName: String(item.eventDisplayName || item.eventName),
                category: String(item.category || 'Wallet'),
                triggerCondition: String(item.triggerCondition || '用户点击时'),
                properties: properties.length > 0 ? properties : [
                    { key: 'source_screen', displayName: '来源页面', description: '当前页面' }
                ],
            });
        }
        if (results.length === 0) {
            console.error('[Vision Analysis] No valid events parsed from:', parsed);
            throw new Error('AI 返回的数据无法解析为有效埋点，请重试');
        }
        console.log('[Vision Analysis] Successfully parsed', results.length, 'events');
        return results;
    }
    catch (e) {
        const error = e;
        console.error('[Vision Analysis] Parse error:', error.message);
        console.error('[Vision Analysis] jsonText was:', jsonText.slice(0, 300));
        // If it's our own error, rethrow
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
        const result = await syncPRD(settings, context);
        post({ type: 'PRD_RESULT', result });
    }
    catch (e) {
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
    const next = [];
    for (const n of nodes) {
        const existing = readTrackingFromLayer(n.nodeId);
        try {
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
    figma.notify('正在截图并分析页面...');
    // Get page screenshot
    const pageScreenshotBase64 = await exportNodeAsBase64(frameToAnalyze.id, 1200);
    if (!pageScreenshotBase64) {
        post({ type: 'ERROR', message: '截图失败，请重试' });
        return;
    }
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
        figma.notify(`✓ AI 识别了 ${next.length} 个交互元素并生成埋点`);
    }
    catch (e) {
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