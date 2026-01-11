import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import './styles.css';

import type {
  Mode,
  PluginToUIMessage,
  PRDResult,
  ScanContext,
  Settings,
  TrackingEvent,
  UIToPluginMessage,
} from '@shared/messages';

function postMessage(msg: UIToPluginMessage) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  // Add BOM for Excel to recognize UTF-8
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function Markdown({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(markdown, {
      gfm: true,
      breaks: true,
    }) as string;
    return DOMPurify.sanitize(raw);
  }, [markdown]);

  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

function SettingsPanel({
  settings,
  onChange,
  onSave,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Settings</div>
          <button className="iconBtn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="label">OpenRouter API Key</div>
          <input
            className="input"
            type="password"
            value={settings.openRouterApiKey}
            onChange={(e) => onChange({ ...settings, openRouterApiKey: e.target.value })}
            placeholder="sk-or-..."
          />
          <div className="small" style={{ marginTop: 6 }}>
            获取：<span className="mono">openrouter.ai/keys</span>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="label">Model</div>
          <select
            className="select"
            value={settings.model}
            onChange={(e) => onChange({ ...settings, model: e.target.value })}
          >
            <optgroup label="🎨 Recommended">
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="openai/gpt-4o">GPT-4o</option>
            </optgroup>
            <optgroup label="⚡ Gemini">
              <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
              <option value="google/gemini-2.5-pro-preview">Gemini 2.5 Pro Preview</option>
            </optgroup>
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="label">PRD KB Endpoint (optional)</div>
          <input
            className="input"
            value={settings.prdEndpointUrl || ''}
            onChange={(e) => onChange({ ...settings, prdEndpointUrl: e.target.value || undefined })}
            placeholder="https://.../prd.json"
          />
          <div className="small" style={{ marginTop: 6 }}>
            留空则使用本地模拟知识库。
          </div>
        </div>

        <div className="hr" />

        <button className="btn btnPrimary" style={{ width: '100%' }} onClick={onSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
}

function PRDSyncView({
  context,
  result,
  autoSync,
  onToggleAutoSync,
}: {
  context: ScanContext | null;
  result: PRDResult | null;
  autoSync: boolean;
  onToggleAutoSync: (v: boolean) => void;
}) {
  return (
    <div className="content">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="label">Selected Frame</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{context ? context.frameName : 'None'}</div>
            {context && (
              <div className="small" style={{ marginTop: 6 }}>
                Text nodes: <span className="mono">{context.texts.length}</span> · Components:{' '}
                <span className="mono">{context.componentNames.length}</span>
              </div>
            )}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => onToggleAutoSync(e.target.checked)}
            />
            Auto-Sync
          </label>
        </div>

        <div className="hr" />

        <div className="row">
          <button className="btn btnPrimary" onClick={() => postMessage({ type: 'SYNC_PRD_NOW' })}>
            Sync PRD
          </button>
        </div>
      </div>

      <div className="card">
        <div className="label">PRD Output</div>
        <div className="hr" />
        {result ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{result.featureName}</div>
            <Markdown markdown={result.markdown} />
            {result.matchedSections.length > 0 && (
              <div className="small" style={{ marginTop: 10 }}>
                Matched: {result.matchedSections.join(', ')}
              </div>
            )}
          </>
        ) : (
          <div className="small">选择一个 Frame，然后点击 Sync PRD。</div>
        )}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: TrackingEvent }) {
  const [expanded, setExpanded] = useState(false);
  const isSelected = event.selected !== false; // Default to true if undefined

  return (
    <div className={`eventCard ${isSelected ? '' : 'eventCardUnselected'}`}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        {/* Checkbox */}
        <label className="checkbox" style={{ marginRight: 8 }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => postMessage({ type: 'TOGGLE_EVENT_SELECTION', id: event.id })}
          />
        </label>
        
        <div style={{ flex: 1 }}>
          <div className="row" style={{ gap: 6, marginBottom: 4 }}>
            <span className="tag">{event.category}</span>
            {event.verified && <span className="tag tagSuccess">已验证</span>}
          </div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            <span className="mono">{event.eventName}</span>
          </div>
          <div className="small" style={{ marginTop: 2 }}>{event.eventDisplayName}</div>
        </div>
        <button className="iconBtn" onClick={() => setExpanded(!expanded)} title={expanded ? '收起' : '展开'}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <div className="small" style={{ flex: 1 }}>
          <strong>触发时机：</strong>{event.triggerCondition}
        </div>
      </div>

      <div className="small" style={{ marginBottom: 8 }}>
        <strong>元素描述：</strong>
        {event.nodeName}
      </div>

      {expanded && (
        <div style={{ marginBottom: 8 }}>
          <div className="label" style={{ marginBottom: 6 }}>属性 Properties</div>
          <div className="propsTable">
            {event.properties.map((prop, idx) => (
              <div key={idx} className="propRow">
                <div className="propKey">
                  <span className="mono">{prop.key}</span>
                  <span className="propDisplayName">{prop.displayName}</span>
                </div>
                <div className="propDesc">
                  {prop.description}
                  {prop.possibleValues && (
                    <div className="propValues">值：{prop.possibleValues}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="hr" style={{ margin: '8px 0' }} />

      <div className="row" style={{ gap: 6 }}>
        <button className="btn" onClick={() => {
          postMessage({ type: 'UPDATE_TRACKING_EVENT', event: { ...event, verified: !event.verified } });
        }}>
          {event.verified ? '取消验证' : '✓ 验证'}
        </button>
        <button className="btn btnDanger" onClick={() => postMessage({ type: 'DELETE_TRACKING_EVENT', id: event.id })}>
          删除
        </button>
      </div>
    </div>
  );
}

function TrackerView({ context, events }: { context: ScanContext | null; events: TrackingEvent[] }) {
  // Group events by category
  const grouped = useMemo(() => {
    const map: Record<string, TrackingEvent[]> = {};
    for (const ev of events) {
      const cat = ev.category || 'Other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(ev);
    }
    return map;
  }, [events]);

  const categories = Object.keys(grouped);
  const selectedCount = events.filter(e => e.selected !== false).length;
  const allSelected = selectedCount === events.length;

  return (
    <div className="content">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div className="label">Selected Frame</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{context ? context.frameName : 'None'}</div>
          </div>
        </div>

        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <button 
            className="btn btnPrimary" 
            onClick={() => postMessage({ type: 'SCAN_PAGE_FOR_TRACKING' })}
            title="扫描整个页面，识别所有可交互元素"
          >
            🔍 Scan Page
          </button>
          <button 
            className="btn" 
            onClick={() => postMessage({ type: 'GENERATE_TRACKING_NOW' })}
            title="只为当前选中的元素生成"
          >
            Generate Selected
          </button>
        </div>

        <div className="hr" />

        {events.length > 0 && (
          <>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => postMessage({ type: 'SELECT_ALL_EVENTS', selected: !allSelected })}
                />
                <span style={{ marginLeft: 6 }}>全选</span>
              </label>
              <div className="small">
                已选 {selectedCount} / {events.length}
              </div>
            </div>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button 
                className="btn btnPrimary" 
                onClick={() => postMessage({ type: 'EXPORT_TRACKING', format: 'csv' })}
                disabled={selectedCount === 0}
              >
                📥 CSV ({selectedCount})
              </button>
              <button 
                className="btn" 
                onClick={() => postMessage({ type: 'EXPORT_TRACKING', format: 'json' })}
                disabled={selectedCount === 0}
              >
                JSON
              </button>
              <button 
                className="btn" 
                onClick={() => postMessage({ type: 'CREATE_TRACKING_TABLE' })}
                disabled={selectedCount === 0}
                title="在 Figma 画布上创建埋点表格"
              >
                📋 创建表格
              </button>
              <button 
                className="btn btnDanger" 
                onClick={() => {
                  if (confirm('确定要删除所有埋点吗？')) {
                    postMessage({ type: 'DELETE_ALL_EVENTS' });
                  }
                }}
                title="删除所有埋点"
              >
                🗑 全部删除
              </button>
            </div>
          </>
        )}
      </div>

      {events.length === 0 ? (
        <div className="card">
          <div className="small">
            <strong>使用方法：</strong><br/><br/>
            1. 选择一个 Frame（整个页面）<br/>
            2. 点击 <strong>Scan Page</strong> 自动识别所有可交互元素<br/>
            3. AI 会批量生成埋点建议<br/>
            4. 复核：勾选需要的，删除不需要的<br/>
            5. 导出选中的埋点
          </div>
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 12 }}>
            <div className="categoryHeader">{cat} ({grouped[cat].length})</div>
            {grouped[cat].map((ev) => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>('prd');
  const [settings, setSettings] = useState<Settings>({ openRouterApiKey: '', model: 'anthropic/claude-3.5-sonnet' });
  const [autoSync, setAutoSync] = useState<boolean>(true);
  const [context, setContext] = useState<ScanContext | null>(null);
  const [prdResult, setPrdResult] = useState<PRDResult | null>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exportData, setExportData] = useState<{ format: 'csv' | 'json'; data: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data.pluginMessage as PluginToUIMessage | undefined;
      if (!msg) return;

      if (msg.type === 'ERROR') {
        setError(msg.message);
        return;
      }

      if (msg.type === 'INIT_DATA') {
        setSettings(msg.settings);
        setAutoSync(msg.autoSync);
        setMode(msg.mode);
        return;
      }

      if (msg.type === 'SCAN_CONTEXT') {
        setContext(msg.context);
        return;
      }

      if (msg.type === 'PRD_RESULT') {
        setPrdResult(msg.result);
        return;
      }

      if (msg.type === 'TRACKING_EVENTS') {
        setEvents(msg.events);
        return;
      }

      if (msg.type === 'EXPORT_DATA') {
        // For CSV, trigger automatic download
        if (msg.format === 'csv') {
          downloadFile(msg.data, 'tracking_events.csv', 'text/csv;charset=utf-8;');
        } else {
          // For JSON, show in modal for copy
          setExportData({ format: msg.format, data: msg.data });
        }
        setError(null);
        return;
      }
    }

    window.addEventListener('message', onMessage);
    postMessage({ type: 'INIT' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const hasApiKey = !!settings.openRouterApiKey;

  return (
    <div className="container">
      <div className="header">
        <div className="title">OneKey · PRD Sync</div>
        <div className="headerRight">
          <div className="tabs">
            <button
              className={`tabBtn ${mode === 'prd' ? 'tabBtnActive' : ''}`}
              onClick={() => {
                setMode('prd');
                postMessage({ type: 'SET_MODE', mode: 'prd' });
              }}
            >
              PRD
            </button>
            <button
              className={`tabBtn ${mode === 'tracker' ? 'tabBtnActive' : ''}`}
              onClick={() => {
                setMode('tracker');
                postMessage({ type: 'SET_MODE', mode: 'tracker' });
              }}
            >
              Tracker
            </button>
          </div>
          <button
            className={`iconBtn ${!hasApiKey ? 'iconBtnWarn' : ''}`}
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {!hasApiKey && (
        <div className="banner bannerWarn">
          请先设置 OpenRouter API Key <button className="linkBtn" onClick={() => setShowSettings(true)}>打开设置</button>
        </div>
      )}

      {mode === 'prd' ? (
        <PRDSyncView
          context={context}
          result={prdResult}
          autoSync={autoSync}
          onToggleAutoSync={(v) => {
            setAutoSync(v);
            postMessage({ type: 'SET_AUTOSYNC', enabled: v });
          }}
        />
      ) : (
        <TrackerView context={context} events={events} />
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onSave={() => {
            postMessage({ type: 'SET_SETTINGS', settings });
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {exportData && (
        <div className="overlay" onClick={() => setExportData(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Export ({exportData.format.toUpperCase()})</div>
              <button className="iconBtn" onClick={() => setExportData(null)}>
                ✕
              </button>
            </div>
            <div className="small" style={{ marginBottom: 8 }}>
              复制下面内容（Cmd/Ctrl + A，然后 Cmd/Ctrl + C）
            </div>
            <textarea
              className="input mono"
              style={{ width: '100%', minHeight: 240, resize: 'vertical' }}
              readOnly
              value={exportData.data}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        </div>
      )}

      <div className="notice">
        {error ? (
          <span style={{ color: 'var(--color-error)' }}>{error}</span>
        ) : (
          <span className="small">选择一个 Frame 使用 PRD Sync；选择按钮/输入框等用 Tracker Pro。</span>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
