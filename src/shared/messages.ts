export type Mode = 'prd' | 'tracker';

export interface Settings {
  openRouterApiKey: string;
  model: string;
  prdEndpointUrl?: string; // optional external KB endpoint
  // Confluence API authentication
  confluenceUrl?: string; // e.g., https://your-domain.atlassian.net
  confluenceEmail?: string; // Your Atlassian account email
  confluenceApiToken?: string; // API token from https://id.atlassian.com/manage-profile/security/api-tokens
}

export interface FrameData {
  frameId: string;
  frameName: string;
  componentNames: string[];
  texts: string[];
  order: number; // Frame order in the flow
  screenshotBase64?: string; // Base64 encoded PNG screenshot
}

export interface ScanContext {
  frames: FrameData[]; // Support multiple frames
  // Legacy single frame support (for backward compatibility)
  frameId?: string;
  frameName?: string;
  componentNames?: string[];
  texts?: string[];
}

export interface PRDSection {
  feature: string;
  background: string;
  logic: string;
  ac: string;
  keywords?: string[];
}

export interface PRDResult {
  featureName: string;
  markdown: string;
  matchedSections: string[];
}

export interface PRDTask {
  taskId: string;
  taskName: string;
  prdResult: PRDResult | null;
  confluenceUrl?: string;
  scanContext: ScanContext | null;
  createdAt: number;
  updatedAt: number;
}

export interface TrackingProperty {
  key: string;               // snake_case, e.g. token_symbol
  displayName: string;       // 显示名称, e.g. 代币名称
  description: string;       // 业务说明
  possibleValues?: string;   // 可选值说明, e.g. "Catalog / details / Search / 其他"
}

export interface TrackingEvent {
  id: string;
  nodeId: string;
  nodeName: string;
  parentFrameName: string;
  elementType: string;
  // 核心埋点字段
  eventName: string;           // 事件名称 (驼峰), e.g. addToWatchlist
  eventDisplayName: string;    // 事件显示名称, e.g. 添加观察代币
  category: string;            // 分类, e.g. Market, Wallet, Onboarding
  triggerCondition: string;    // 触发时机, e.g. 用户点击添加按钮时
  properties: TrackingProperty[];
  // 状态
  verified?: boolean;          // 是否已验证
  selected?: boolean;          // 是否被选中导出（用于批量模式）
}

export type UIToPluginMessage =
  | { type: 'INIT' }
  | { type: 'SET_SETTINGS'; settings: Settings }
  | { type: 'SET_AUTOSYNC'; enabled: boolean }
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SYNC_PRD_NOW'; additionalPrompt?: string }
  | { type: 'GENERATE_TRACKING_NOW' }
  | { type: 'SCAN_PAGE_FOR_TRACKING' }
  | { type: 'UPDATE_TRACKING_EVENT'; event: TrackingEvent }
  | { type: 'TOGGLE_EVENT_SELECTION'; id: string }
  | { type: 'SELECT_ALL_EVENTS'; selected: boolean }
  | { type: 'DELETE_TRACKING_EVENT'; id: string }
  | { type: 'DELETE_ALL_EVENTS' }
  | { type: 'ATTACH_TRACKING_TO_LAYER'; id: string }
  | { type: 'EXPORT_TRACKING'; format: 'csv' | 'json' }
  | { type: 'CREATE_TRACKING_TABLE' }
  | { type: 'CREATE_PRD_TASK' }
  | { type: 'SELECT_PRD_TASK'; taskId: string }
  | { type: 'DELETE_PRD_TASK'; taskId: string }
  | { type: 'UPDATE_TASK_NAME'; taskId: string; taskName: string }
  | { type: 'UPDATE_TASK_CONFLUENCE_URL'; taskId: string; confluenceUrl: string }
  | { type: 'SYNC_TO_CONFLUENCE'; confluenceUrl: string; markdown: string }
  | { type: 'TEST_CONFLUENCE_CONNECTION' };

export interface LoadingStatus {
  isLoading: boolean;
  message?: string;
  progress?: { current: number; total: number };
}

export type PluginToUIMessage =
  | { type: 'INIT_DATA'; settings: Settings; autoSync: boolean; mode: Mode }
  | { type: 'SCAN_CONTEXT'; context: ScanContext | null }
  | { type: 'PRD_RESULT'; result: PRDResult | null }
  | { type: 'TRACKING_EVENTS'; events: TrackingEvent[] }
  | { type: 'EXPORT_DATA'; format: 'csv' | 'json'; data: string }
  | { type: 'LOADING_STATUS'; status: LoadingStatus }
  | { type: 'ERROR'; message: string }
  | { type: 'PRD_TASKS'; tasks: PRDTask[] }
  | { type: 'CURRENT_TASK'; task: PRDTask | null }
  | { type: 'OPEN_URL'; url: string }
  | { type: 'COPY_TO_CLIPBOARD_ACK'; text: string };
