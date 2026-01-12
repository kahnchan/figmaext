/// <reference types="@figma/plugin-typings" />

import type { Mode, PluginToUIMessage, Settings, TrackingEvent, UIToPluginMessage, ScanContext, I18nKey } from '@shared/messages';
import { scanSelectedFrame, scanSelectedInteractiveNodes, exportNodeAsBase64, getRootFrame, scanFrameForInteractiveElements } from './scan';
import { syncPRD } from './prd';
import { attachTrackingToLayer, generateTrackingForNode, readTrackingFromLayer, analyzePageWithVision, type ElementHint } from './tracker';
import { fetchConfluencePage, compareAndMergePRD, syncToConfluence, testConfluenceConnection } from './confluence';
import { scanTextNodesMultiFrame, generateI18nKeys, exportSingleAddCommand, exportBulkaddData, exportMultiCheckCommand, exportAsJSON, exportAsCSV, createI18nTable } from './i18n';

const STORAGE_SETTINGS = 'onekey_settings';
const STORAGE_AUTOSYNC = 'onekey_autosync';
const STORAGE_MODE = 'onekey_mode';
const STORAGE_TRACKING = 'onekey_tracking_events';

const DEFAULT_SETTINGS: Settings = {
  openRouterApiKey: '',
  model: 'anthropic/claude-3.5-sonnet',
};

let settings: Settings = DEFAULT_SETTINGS;
let autoSync = true;
let mode: Mode = 'prd';
let lastContextKey = '';
let trackingEvents: TrackingEvent[] = [];
let i18nKeys: I18nKey[] = [];

figma.showUI(__html__, { width: 420, height: 720, themeColors: true });

function post(msg: PluginToUIMessage) {
  figma.ui.postMessage(msg);
}

async function loadState() {
  settings = (await figma.clientStorage.getAsync(STORAGE_SETTINGS)) || DEFAULT_SETTINGS;
  autoSync = (await figma.clientStorage.getAsync(STORAGE_AUTOSYNC)) ?? true;
  mode = (await figma.clientStorage.getAsync(STORAGE_MODE)) || 'prd';
  trackingEvents = (await figma.clientStorage.getAsync(STORAGE_TRACKING)) || [];
}

async function saveTrackingEvents() {
  await figma.clientStorage.setAsync(STORAGE_TRACKING, trackingEvents);
  post({ type: 'TRACKING_EVENTS', events: trackingEvents });
}

function makeContextKey(ctx: ScanContext): string {
  if (ctx.frames && ctx.frames.length > 0) {
    // Multi-frame: use all frame IDs
    const frameIds = ctx.frames.map((f) => f.frameId).join(',');
    const allTexts: string[] = [];
    for (const frame of ctx.frames) {
      allTexts.push(...frame.texts);
    }
    return `${frameIds}:${allTexts.join('|').slice(0, 500)}`;
  }
  // Legacy single frame
  return `${ctx.frameId}:${ctx.texts?.join('|').slice(0, 500)}:${ctx.componentNames?.join('|').slice(0, 500)}`;
}

async function pushScanContext() {
  const ctx = await scanSelectedFrame();
  post({ type: 'SCAN_CONTEXT', context: ctx });

  if (!ctx) return;

  const key = makeContextKey(ctx);
  if (key === lastContextKey) return;
  lastContextKey = key;

  if (autoSync && mode === 'prd') {
    await doSyncPRD(undefined, ctx);
  }
}

async function doTestConfluenceConnection() {
  try {
    post({
      type: 'LOADING_STATUS',
      status: {
        isLoading: true,
        message: '正在测试 Confluence 连接...'
      }
    });

    // Check if Confluence authentication is configured
    if (!settings.confluenceUrl || !settings.confluenceEmail || !settings.confluenceApiToken) {
      figma.notify('❌ 请先在设置中配置 Confluence 认证信息', { timeout: 5000 });
      post({ type: 'ERROR', message: '请先在设置中配置 Confluence 认证信息' });
      return;
    }

    console.log('[Debug] Testing Confluence connection with settings:', {
      url: settings.confluenceUrl,
      email: settings.confluenceEmail,
      hasToken: !!settings.confluenceApiToken,
    });

    const result = await testConfluenceConnection({
      url: settings.confluenceUrl,
      email: settings.confluenceEmail,
      apiToken: settings.confluenceApiToken,
    });

    console.log('[Debug] Test result:', result);

    if (result.success) {
      figma.notify(result.message, { timeout: 5000 });
    } else {
      figma.notify(result.message, { timeout: 8000 });
      post({ type: 'ERROR', message: result.message });
    }

  } catch (error) {
    const errorMsg = `❌ 测试失败: ${(error as Error).message}`;
    console.error('[Debug] Test connection error:', error);
    figma.notify(errorMsg, { timeout: 8000 });
    post({ type: 'ERROR', message: errorMsg });
  } finally {
    post({
      type: 'LOADING_STATUS',
      status: {
        isLoading: false
      }
    });
  }
}

async function doSyncToConfluence(confluenceUrl: string, markdown: string) {
  try {
    post({
      type: 'LOADING_STATUS',
      status: {
        isLoading: true,
        message: '正在同步到 Confluence...'
      }
    });

    // Check if Confluence authentication is configured
    if (!settings.confluenceUrl || !settings.confluenceEmail || !settings.confluenceApiToken) {
      // Fallback: Copy to clipboard and open URL
      post({ 
        type: 'COPY_TO_CLIPBOARD_ACK', 
        text: markdown 
      });

      figma.notify('⚠️ 请先在设置中配置 Confluence 认证信息\n\nPRD 已复制到剪贴板，正在打开 Confluence 页面', {
        timeout: 8000
      });

      post({
        type: 'OPEN_URL',
        url: confluenceUrl
      });
      
      return;
    }

    // Extract PRD title from markdown
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : 'PRD Document';

    // Sync to Confluence using REST API
    const result = await syncToConfluence(
      confluenceUrl,
      markdown,
      title,
      {
        url: settings.confluenceUrl,
        email: settings.confluenceEmail,
        apiToken: settings.confluenceApiToken,
      }
    );

    if (result.success) {
      figma.notify(`✅ ${result.message}`, { timeout: 5000 });
      
      // Open the Confluence page
      if (result.url) {
        post({
          type: 'OPEN_URL',
          url: result.url
        });
      }
    } else {
      figma.notify(`❌ ${result.message}`, { timeout: 8000 });
      
      // Fallback: Copy to clipboard
      post({ 
        type: 'COPY_TO_CLIPBOARD_ACK', 
        text: markdown 
      });
    }

  } catch (error) {
    figma.notify('❌ 同步失败: ' + (error as Error).message, { timeout: 8000 });
    post({ type: 'ERROR', message: (error as Error).message });
  } finally {
    post({
      type: 'LOADING_STATUS',
      status: {
        isLoading: false
      }
    });
  }
}

async function doSyncPRD(additionalPrompt?: string, ctx?: Awaited<ReturnType<typeof scanSelectedFrame>>) {
  const context = ctx || await scanSelectedFrame();
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
    
    // Generate new PRD (pure AI generation, no Confluence involved)
    const result = await syncPRD(settings, context, additionalPrompt);
    
    // Note: Confluence integration (fetching/merging) has been removed from the generation flow
    // If you want to sync to Confluence, use the "🔄 同步" button after generation
    
    // Hide loading
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    post({ type: 'PRD_RESULT', result });
  } catch (e) {
    // Hide loading on error
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    post({ type: 'ERROR', message: String((e as Error).message || e) });
  }
}

function simpleId(): string {
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

  const next: TrackingEvent[] = [];

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

      const ai = await generateTrackingForNode(settings, {
        ...n,
        screenshotBase64: screenshotBase64 || undefined,
        pageScreenshotBase64: pageScreenshotBase64 || undefined,
        platform: 'App',
      });

      next.push({
        id: simpleId(),
        nodeId: n.nodeId,
        nodeName: n.nodeName,
        parentFrameName: n.parentFrameName,
        elementType: ai.elementType,
        eventName: existing?.eventName || ai.eventName,
        eventDisplayName: existing?.eventDisplayName || ai.eventDisplayName,
        category: existing?.category || ai.category,
        triggerCondition: existing?.triggerCondition || ai.triggerCondition,
        properties: existing?.properties || ai.properties,
        verified: existing?.verified || false,
      });
    } catch (e) {
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
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    post({ type: 'ERROR', message: '请选择一个 Frame（整个页面/屏幕）' });
    return;
  }
  
  // Find the frame to analyze
  let frameToAnalyze: FrameNode | null = null;
  const selectedNode = selection[0];
  
  if (selectedNode.type === 'FRAME') {
    frameToAnalyze = selectedNode as FrameNode;
  } else {
    // Find parent frame
    let p: BaseNode | null = selectedNode.parent;
    while (p) {
      if (p.type === 'FRAME') {
        frameToAnalyze = p as FrameNode;
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
  const elementHints: ElementHint[] = [];
  const pageTexts: string[] = [];
  
  const descendants = frameToAnalyze.findAll(() => true);
  for (const d of descendants) {
    // Collect element names as hints
    if (d.type === 'INSTANCE' || d.type === 'FRAME' || d.type === 'GROUP') {
      let text: string | undefined;
      // Try to get text from inside
      if ('findOne' in d) {
        const textNode = (d as FrameNode).findOne(n => n.type === 'TEXT') as TextNode | null;
        if (textNode) {
          text = textNode.characters?.trim().slice(0, 50);
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
      const t = (d as TextNode).characters?.trim();
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
    const next: TrackingEvent[] = visionResults.map((result, idx) => ({
      id: simpleId(),
      nodeId: `vision_${idx}`, // No actual node mapping
      nodeName: result.elementDescription, // Use AI's description
      parentFrameName: frameToAnalyze!.name,
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
  } catch (e) {
    // Hide loading on error
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    post({ type: 'ERROR', message: `分析失败: ${(e as Error).message}` });
  }
}

function toCSV(events: TrackingEvent[]): string {
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
  
  const rows: string[] = [];
  const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
  
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
    } else {
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

figma.ui.onmessage = async (msg: UIToPluginMessage) => {
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
      await doSyncPRD(msg.additionalPrompt);
      return;
    }

    if (msg.type === 'SYNC_TO_CONFLUENCE') {
      await doSyncToConfluence(msg.confluenceUrl, msg.markdown);
      return;
    }

    if (msg.type === 'TEST_CONFLUENCE_CONNECTION') {
      await doTestConfluenceConnection();
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
      trackingEvents = trackingEvents.map((e) => 
        e.id === msg.id ? { ...e, selected: !e.selected } : e
      );
      await saveTrackingEvents();
      return;
    }

    if (msg.type === 'SELECT_ALL_EVENTS') {
      trackingEvents = trackingEvents.map((e) => ({ ...e, selected: msg.selected }));
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
      if (!ev) throw new Error('Event not found');
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

    // ============ i18n Message Handlers ============
    
    if (msg.type === 'GENERATE_I18N_KEYS') {
      await doGenerateI18nKeys(msg.projectName, msg.additionalPrompt, msg.excludeTexts);
      return;
    }

    if (msg.type === 'UPDATE_I18N_KEY') {
      i18nKeys = i18nKeys.map(k => k.id === msg.key.id ? { ...msg.key, edited: true } : k);
      post({ type: 'I18N_KEYS', keys: i18nKeys });
      return;
    }

    if (msg.type === 'TOGGLE_I18N_KEY') {
      i18nKeys = i18nKeys.map(k => k.id === msg.id ? { ...k, selected: !k.selected } : k);
      post({ type: 'I18N_KEYS', keys: i18nKeys });
      return;
    }

    if (msg.type === 'SELECT_ALL_I18N_KEYS') {
      i18nKeys = i18nKeys.map(k => ({ ...k, selected: msg.selected }));
      post({ type: 'I18N_KEYS', keys: i18nKeys });
      return;
    }

    if (msg.type === 'DELETE_I18N_KEY') {
      i18nKeys = i18nKeys.filter(k => k.id !== msg.id);
      post({ type: 'I18N_KEYS', keys: i18nKeys });
      return;
    }

    if (msg.type === 'EXPORT_I18N') {
      await doExportI18n(msg.format, msg.projectName);
      return;
    }

    if (msg.type === 'COPY_SINGLE_ADD_COMMAND') {
      await doCopySingleAddCommand(msg.keyId, msg.projectName);
      return;
    }

    if (msg.type === 'CREATE_I18N_TABLE') {
      await doCreateI18nTable();
      return;
    }
  } catch (e) {
    post({ type: 'ERROR', message: String((e as Error).message || e) });
  }
};

figma.on('selectionchange', () => {
  pushScanContext().catch((e) => post({ type: 'ERROR', message: String((e as Error).message || e) }));
});

// ============ i18n Helper Functions ============

async function doGenerateI18nKeys(projectName?: string, additionalPrompt?: string, excludeTexts?: string[]) {
  const selection = figma.currentPage.selection;
  
  // Filter out all FRAME type nodes
  const frames = selection.filter(node => node.type === 'FRAME');
  
  if (frames.length === 0) {
    figma.notify('请选择至少一个 Frame');
    return;
  }

  try {
    post({ type: 'LOADING_STATUS', status: { isLoading: true, message: `正在扫描 ${frames.length} 个 Frame 中的文本...` } });
    
    const frameIds = frames.map(f => f.id);
    const frameNames = frames.map(f => f.name);
    let { texts, filteredCount } = await scanTextNodesMultiFrame(frameIds);
    
    // 过滤掉用户已删除的文本
    if (excludeTexts && excludeTexts.length > 0) {
      const excludeSet = new Set(excludeTexts);
      const beforeCount = texts.length;
      texts = texts.filter(t => !excludeSet.has(t.textContent));
      const excludedCount = beforeCount - texts.length;
      if (excludedCount > 0) {
        console.log(`[i18n] Excluded ${excludedCount} user-deleted texts`);
        filteredCount += excludedCount;
      }
    }
    
    // 去重文本内容（相同文本只保留一个，减少 AI 处理量）
    const seenTexts = new Set<string>();
    const beforeDedup = texts.length;
    texts = texts.filter(t => {
      if (seenTexts.has(t.textContent)) {
        return false;
      }
      seenTexts.add(t.textContent);
      return true;
    });
    const dedupCount = beforeDedup - texts.length;
    if (dedupCount > 0) {
      console.log(`[i18n] Deduplicated ${dedupCount} duplicate texts`);
    }
    
    if (texts.length === 0) {
      figma.notify(`未找到需要翻译的文本（已过滤 ${filteredCount} 个非文本项）`);
      post({ type: 'LOADING_STATUS', status: { isLoading: false } });
      return;
    }
    
    console.log(`[i18n] Found ${texts.length} translatable texts, filtered ${filteredCount} items`);
    
    post({ type: 'LOADING_STATUS', status: { isLoading: true, message: `正在导出 ${frames.length} 张截图...` } });
    const screenshots: string[] = [];
    for (const frameId of frameIds) {
      const screenshot = await exportNodeAsBase64(frameId, 1200);
      if (screenshot) screenshots.push(screenshot);
    }
    
    post({ type: 'LOADING_STATUS', status: { isLoading: true, message: '正在使用 AI 生成英文 keys...' } });
    const result = await generateI18nKeys(settings, frameNames, texts, screenshots, additionalPrompt);
    
    // 去重：根据 key 名称去重，保留第一个
    const seenKeys = new Set<string>();
    const uniqueKeys = result.keys.filter(k => {
      if (seenKeys.has(k.key)) {
        return false;
      }
      seenKeys.add(k.key);
      return true;
    });
    
    const duplicateCount = result.keys.length - uniqueKeys.length;
    result.keys = uniqueKeys;
    result.totalKeys = uniqueKeys.length;
    
    i18nKeys = result.keys;
    
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    post({ type: 'I18N_RESULT', result });
    post({ type: 'I18N_KEYS', keys: i18nKeys });
    
    const msg = duplicateCount > 0 
      ? `✓ 成功生成 ${uniqueKeys.length} 个 i18n keys（已去重 ${duplicateCount} 个）`
      : `✓ 成功生成 ${uniqueKeys.length} 个 i18n keys`;
    figma.notify(msg);
    
  } catch (e) {
    figma.notify('生成失败: ' + (e as Error).message);
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    post({ type: 'ERROR', message: (e as Error).message });
  }
}

async function doExportI18n(format: 'bulkadd' | 'multicheck' | 'json' | 'csv', projectName: string) {
  try {
    let data: string;
    let filename: string;
    
    if (format === 'bulkadd') {
      data = exportBulkaddData(i18nKeys);
      filename = `i18n_bulkadd_${projectName}_${Date.now()}.txt`;
    } else if (format === 'multicheck') {
      data = exportMultiCheckCommand(i18nKeys, projectName);
      filename = `i18n_multicheck_${projectName}_${Date.now()}.txt`;
    } else if (format === 'json') {
      data = exportAsJSON(i18nKeys);
      filename = `i18n_keys_${projectName}_${Date.now()}.json`;
    } else {
      data = exportAsCSV(i18nKeys);
      filename = `i18n_keys_${projectName}_${Date.now()}.csv`;
    }
    
    post({ type: 'EXPORT_DATA', format, data });
    figma.notify(`✓ 导出成功：${filename}`);
    
  } catch (e) {
    figma.notify('导出失败: ' + (e as Error).message);
  }
}

async function doCopySingleAddCommand(keyId: string, projectName: string) {
  try {
    const key = i18nKeys.find(k => k.id === keyId);
    if (!key) {
      figma.notify('Key not found');
      return;
    }
    
    const command = exportSingleAddCommand(key, projectName);
    
    // Send to UI for clipboard copy
    post({ type: 'COPY_TO_CLIPBOARD_ACK', text: command });
    figma.notify(`✓ 已复制: ${key.key}`);
    
  } catch (e) {
    figma.notify('复制失败: ' + (e as Error).message);
  }
}

async function doCreateI18nTable() {
  try {
    post({ type: 'LOADING_STATUS', status: { isLoading: true, message: '正在创建 Figma 表格...' } });
    
    await createI18nTable(i18nKeys);
    
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    figma.notify(`✓ 成功创建表格：${i18nKeys.filter(k => k.selected).length} 行`);
    
  } catch (e) {
    figma.notify('创建表格失败: ' + (e as Error).message);
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
  }
}

// ============ CREATE TABLE IN FIGMA ============

function createTrackingTableInFigma(events: TrackingEvent[]) {
  // Table styling - Clean white theme
  const COLORS = {
    headerBg: { r: 0.95, g: 0.95, b: 0.95 },    // Light gray header
    rowBg: { r: 1, g: 1, b: 1 },                 // White
    rowAltBg: { r: 0.98, g: 0.98, b: 0.98 },     // Very light gray
    border: { r: 0.85, g: 0.85, b: 0.85 },       // Light border
    text: { r: 0.1, g: 0.1, b: 0.1 },            // Dark text
    subtext: { r: 0.4, g: 0.4, b: 0.4 },         // Gray text
    primary: { r: 0.2, g: 0.4, b: 0.9 },         // Blue
    success: { r: 0.13, g: 0.55, b: 0.13 },      // Green
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
  async function createText(text: string, fontSize: number, color: RGB, bold = false): Promise<TextNode> {
    const node = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: bold ? 'Bold' : 'Regular' });
    node.fontName = { family: 'Inter', style: bold ? 'Bold' : 'Regular' };
    node.characters = text || '-';
    node.fontSize = fontSize;
    node.fills = [{ type: 'SOLID', color }];
    return node;
  }

  // Helper: create cell frame
  function createCell(width: number): FrameNode {
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
  async function createHeaderRow(): Promise<FrameNode> {
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
  async function createDataRow(event: TrackingEvent, index: number): Promise<FrameNode> {
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
