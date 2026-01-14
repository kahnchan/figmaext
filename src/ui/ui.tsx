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
  LoadingStatus,
  I18nKey,
  I18nResult,
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
        </div>


        <div className="hr" />
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Lokalise 配置</div>
        
        <div style={{ marginBottom: 12 }}>
          <div className="label">Default Lokalise Project</div>
          <input
            className="input"
            value={settings.lokaliseProject || ''}
            onChange={(e) => onChange({ ...settings, lokaliseProject: e.target.value || undefined })}
            placeholder="v5"
          />
          <div className="small" style={{ marginTop: 6 }}>
            默认项目名称（生成时可修改）
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
  const [additionalPrompt, setAdditionalPrompt] = React.useState('');
  const frameCount = context?.frames ? context.frames.length : (context ? 1 : 0);
  const isMultiFrame = frameCount > 1;

  return (
    <div className="content">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 8 }}>
          {isMultiFrame ? `Selected Frames (${frameCount})` : 'Selected Frame'}
        </div>
        
        {context ? (
          context.frames && context.frames.length > 1 ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {context.frames[0].frameName} → ... → {context.frames[context.frames.length - 1].frameName}
              </div>
              <div className="small">
                完整产品流程（{context.frames.length} 个屏幕）· Text nodes: <span className="mono">{context.frames.reduce((acc, f) => acc + f.texts.length, 0)}</span> · Components: <span className="mono">{context.frames.reduce((acc, f) => acc + f.componentNames.length, 0)}</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {context.frameName || 'None'}
              </div>
              {context && (
                <div className="small" style={{ marginTop: 6 }}>
                  Text nodes: <span className="mono">{context.texts?.length || 0}</span> · Components: <span className="mono">{context.componentNames?.length || 0}</span>
                </div>
              )}
            </div>
          )
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'var(--subtext)' }}>
              请在 Figma 中选择一个或多个 Frame
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              选择后点击下方按钮进行操作
            </div>
          </div>
        )}

      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>使用方法</div>
        <div className="hr" />
        <div className="small" style={{ marginBottom: 12, lineHeight: 1.6 }}>
          <strong>单 Frame 模式：</strong>选择一个 Frame，生成该设计稿的 PRD 文档
          <br/><br/>
          <strong>多 Frame 流程模式：</strong>按住 Shift/Cmd 选择多个 Frame，生成完整产品流程的 PRD 文档
        </div>
        <div className="hr" />
        
        <div className="label" style={{ marginBottom: 8, marginTop: 12 }}>PRD Output</div>
        <div className="hr" />
        
        {result ? (
          <>
            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto',
              paddingRight: '4px',
              marginBottom: 12
            }}>
              <Markdown markdown={result.markdown} />
            </div>
            
            <div className="hr" />
            
            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ marginBottom: 6 }}>补充提示（可选）：</div>
              <textarea 
                className="input" 
                placeholder="例如：重点关注风险提示相关的埋点"
                value={additionalPrompt}
                onChange={(e) => setAdditionalPrompt(e.target.value)}
                rows={2}
                style={{ 
                  width: '100%', 
                  marginBottom: 8,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  fontSize: '12px'
                }}
              />
              
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button 
                  className="btn btnPrimary" 
                  onClick={() => postMessage({ 
                    type: 'SYNC_PRD_NOW',
                    additionalPrompt: additionalPrompt || undefined
                  })}
                  title="基于当前选择重新生成 PRD"
                >
                  🔄 重新生成
                </button>
                <button 
                  className="btn" 
                  onClick={() => {
                    const textarea = document.createElement('textarea');
                    textarea.value = result.markdown;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                      document.execCommand('copy');
                      alert(`✓ PRD已复制到剪贴板\n\n文档长度: ${result.markdown.length} 字符`);
                    } catch (err) {
                      alert('复制失败，请手动选择文本复制');
                    }
                    document.body.removeChild(textarea);
                  }}
                  title="复制 PRD 到剪贴板"
                >
                  📋 复制
                </button>
                <button 
                  className="btn" 
                  onClick={() => {
                    if (confirm('确定要清空当前 PRD 吗？')) {
                      postMessage({ type: 'CLEAR_PRD' });
                      setAdditionalPrompt('');
                    }
                  }}
                  title="清空当前 PRD"
                >
                  🗑️ 清空
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ marginBottom: 6 }}>补充提示（可选）：</div>
              <textarea 
                className="input" 
                placeholder="例如：重点关注风险提示相关的埋点"
                value={additionalPrompt}
                onChange={(e) => setAdditionalPrompt(e.target.value)}
                rows={2}
                style={{ 
                  width: '100%', 
                  marginBottom: 8,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  fontSize: '12px'
                }}
              />
              
              <div className="row" style={{ gap: 8 }}>
                <button 
                  className="btn btnPrimary" 
                  onClick={() => postMessage({ 
                    type: 'SYNC_PRD_NOW',
                    additionalPrompt: additionalPrompt || undefined
                  })}
                >
                  {isMultiFrame ? '📝 生成产品流程 PRD' : '📝 生成 PRD'}
                </button>
              </div>
            </div>
          </>
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

function I18nView({
  context,
  settings,
  i18nResult,
  i18nKeys,
}: {
  context: ScanContext | null;
  settings: Settings;
  i18nResult: I18nResult | null;
  i18nKeys: I18nKey[];
}) {
  const [projectName, setProjectName] = useState(settings.lokaliseProject || 'v5');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [deletedTexts, setDeletedTexts] = useState<string[]>([]);

  useEffect(() => {
    setProjectName(settings.lokaliseProject || 'v5');
  }, [settings.lokaliseProject]);

  const selectedCount = i18nKeys.filter(k => k.selected).length;
  
  // Use context for real-time frame selection display, i18nResult for generated keys
  const contextFrameCount = context?.frames ? context.frames.length : (context ? 1 : 0);
  const resultFrameCount = i18nResult?.frames.length || 0;
  const frameCount = i18nResult ? resultFrameCount : contextFrameCount;
  const isMultiFrame = frameCount > 1;
  
  // Get frame names from context (real-time) or i18nResult (after generation)
  const getFrameNames = () => {
    if (i18nResult && i18nResult.frames.length > 0) {
      return i18nResult.frames;
    }
    if (context?.frames && context.frames.length > 0) {
      return context.frames.map(f => f.frameName);
    }
    if (context?.frameName) {
      return [context.frameName];
    }
    return [];
  };
  const frameNames = getFrameNames();
  
  // Get text count from context
  const getTextCount = () => {
    if (i18nResult) {
      return i18nResult.totalKeys;
    }
    if (context?.frames && context.frames.length > 0) {
      return context.frames.reduce((acc, f) => acc + f.texts.length, 0);
    }
    if (context?.texts) {
      return context.texts.length;
    }
    return 0;
  };
  const textCount = getTextCount();

  return (
    <div className="content">
      {/* Selected Frames Info - Real-time update from context */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 8 }}>
          {isMultiFrame ? `Selected Frames (${frameCount})` : 'Selected Frame'}
        </div>
        
        {context ? (
          context.frames && context.frames.length > 1 ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {context.frames[0].frameName} → ... → {context.frames[context.frames.length - 1].frameName}
              </div>
              <div className="small">
                完整产品流程（{context.frames.length} 个屏幕）· Text nodes: <span className="mono">{context.frames.reduce((acc, f) => acc + f.texts.length, 0)}</span> · Components: <span className="mono">{context.frames.reduce((acc, f) => acc + f.componentNames.length, 0)}</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {context.frameName || 'None'}
              </div>
              {context && (
                <div className="small" style={{ marginTop: 6 }}>
                  Text nodes: <span className="mono">{context.texts?.length || 0}</span> · Components: <span className="mono">{context.componentNames?.length || 0}</span>
                </div>
              )}
            </div>
          )
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'var(--subtext)' }}>
              请在 Figma 中选择一个或多个 Frame
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              选择后点击下方按钮进行操作
            </div>
          </div>
        )}
      </div>

      {/* i18n Keys Generation & Output */}
      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>使用方法</div>
        <div className="hr" />
        <div className="small" style={{ marginBottom: 12, lineHeight: 1.6 }}>
          <strong>单 Frame 模式：</strong>选择一个 Frame，生成该设计稿中的 i18n keys
          <br/><br/>
          <strong>多 Frame 流程模式：</strong>按住 Shift/Cmd 选择多个 Frame，批量生成所有设计稿的 i18n keys
        </div>
        <div className="hr" />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 12 }}>
          <div className="label" style={{ marginBottom: 0 }}>i18n Keys</div>
          {i18nResult && (
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={selectedCount === i18nKeys.length && i18nKeys.length > 0}
                onChange={() => {
                  const allSelected = selectedCount === i18nKeys.length;
                  postMessage({ type: 'SELECT_ALL_I18N_KEYS', selected: !allSelected });
                }}
                style={{ marginRight: 4 }}
              />
              全选 ({selectedCount}/{i18nKeys.length})
            </label>
          )}
        </div>
        <div className="hr" />
        
        {i18nResult ? (
          <>
            {/* Keys List */}
            <div style={{ 
              maxHeight: '320px', 
              overflowY: 'auto',
              paddingRight: '4px',
              marginBottom: 12
            }}>
              
              {i18nKeys.map(key => (
                <I18nKeyCard
                  key={key.id}
                  i18nKey={key}
                  projectName={projectName}
                  isEditing={editingKey === key.id}
                  onEdit={() => setEditingKey(editingKey === key.id ? null : key.id)}
                  onSave={(updated) => {
                    postMessage({ type: 'UPDATE_I18N_KEY', key: updated });
                    setEditingKey(null);
                  }}
                  onToggle={() => postMessage({ type: 'TOGGLE_I18N_KEY', id: key.id })}
                  onDelete={() => {
                    // 记录被删除的原始文本，重新生成时会排除
                    setDeletedTexts(prev => [...prev, key.originalText]);
                    postMessage({ type: 'DELETE_I18N_KEY', id: key.id });
                  }}
                  onCopyAdd={(keyId) => postMessage({ type: 'COPY_SINGLE_ADD_COMMAND', keyId, projectName })}
                />
              ))}
            </div>
            
            <div className="hr" />
            
            {/* Actions */}
            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ marginBottom: 6 }}>Lokalise Project：</div>
              <input
                className="input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="v5"
                style={{ 
                  width: '100%', 
                  marginBottom: 12,
                  fontFamily: 'inherit',
                  fontSize: '12px'
                }}
              />
              
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button 
                  className="btn btnPrimary" 
                  onClick={() => {
                    const selectedKeys = i18nKeys.filter(k => k.selected);
                    if (selectedKeys.length === 0) {
                      alert('请先选择要导出的 keys');
                      return;
                    }
                    const bulkaddData = selectedKeys.map(k => `${k.key} | ${k.value}`).join('\n');
                    const textarea = document.createElement('textarea');
                    textarea.value = bulkaddData;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                      document.execCommand('copy');
                      alert(`✓ 已复制 bulkadd 数据到剪贴板\n\n共 ${selectedKeys.length} 个 keys\n\n使用方法：\n1. 在 Slack 输入 @Loka-AI bulkadd\n2. 选择项目 ${projectName}\n3. 粘贴数据`);
                    } catch (err) {
                      alert('复制失败，请手动选择文本复制');
                    }
                    document.body.removeChild(textarea);
                  }}
                  disabled={selectedCount === 0}
                  style={{ flex: 1 }}
                >
                  📦 复制 bulkadd 数据
                </button>
                <button 
                  className="btn" 
                  onClick={() => postMessage({ type: 'CREATE_I18N_TABLE' })}
                  style={{ flex: 1 }}
                  title="在画布上创建可编辑表格"
                >
                  📊 创建表格
                </button>
              </div>
              
              <div className="hr" style={{ margin: '12px 0' }} />
              
              <div className="small" style={{ marginBottom: 6 }}>补充提示（可选）：</div>
              <textarea 
                className="input" 
                placeholder="例如：这是 Swap 模块、侧重导航相关的文案、忽略某些特定文本..."
                value={additionalPrompt}
                onChange={(e) => setAdditionalPrompt(e.target.value)}
                rows={2}
                style={{ 
                  width: '100%', 
                  marginBottom: 8,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  fontSize: '12px'
                }}
              />
              
              <div className="row" style={{ gap: 8 }}>
                <button 
                  className="btn" 
                  style={{ flex: 1 }}
                  onClick={() => postMessage({ 
                    type: 'GENERATE_I18N_KEYS', 
                    projectName,
                    additionalPrompt: additionalPrompt || undefined,
                    excludeTexts: deletedTexts.length > 0 ? deletedTexts : undefined
                  })}
                >
                  🔄 重新生成 {deletedTexts.length > 0 && `(已排除 ${deletedTexts.length} 项)`}
                </button>
                <button 
                  className="btn" 
                  onClick={() => {
                    if (confirm('确定要清空当前 i18n keys 吗？')) {
                      postMessage({ type: 'CLEAR_I18N' });
                      setAdditionalPrompt('');
                      setDeletedTexts([]);
                    }
                  }}
                  title="清空当前 i18n keys"
                >
                  🗑️ 清空
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="small" style={{ marginBottom: 6 }}>Lokalise Project：</div>
            <input
              className="input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="v5"
              style={{ 
                width: '100%', 
                marginBottom: 12,
                fontFamily: 'inherit',
                fontSize: '12px'
              }}
            />
            
            <button 
              className="btn btnPrimary" 
              style={{ width: '100%' }}
              onClick={() => postMessage({ type: 'GENERATE_I18N_KEYS', projectName })}
            >
              🔤 生成 i18n Keys
            </button>
            
            <div className="small" style={{ marginTop: 8, textAlign: 'center', color: 'var(--subtext)' }}>
              将扫描选中 Frame 中的所有文本，生成英文 keys
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function I18nKeyCard({
  i18nKey,
  projectName,
  isEditing,
  onEdit,
  onSave,
  onToggle,
  onDelete,
  onCopyAdd,
}: {
  i18nKey: I18nKey;
  projectName: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (key: I18nKey) => void;
  onToggle: () => void;
  onDelete: () => void;
  onCopyAdd: (keyId: string) => void;
}) {
  const [editedKey, setEditedKey] = useState(i18nKey);

  useEffect(() => {
    setEditedKey(i18nKey);
  }, [i18nKey]);

  if (isEditing) {
    return (
      <div style={{ 
        padding: 10, 
        border: '1px solid var(--border)', 
        marginBottom: 6, 
        borderRadius: 6,
        background: 'var(--surface)'
      }}>
        <div style={{ marginBottom: 8 }}>
          <label className="small" style={{ fontWeight: 600 }}>Key:</label>
          <input 
            className="input"
            value={editedKey.key} 
            onChange={e => setEditedKey({ ...editedKey, key: e.target.value })} 
            style={{ marginTop: 4, width: '100%' }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label className="small" style={{ fontWeight: 600 }}>Value (English):</label>
          <input 
            className="input"
            value={editedKey.value} 
            onChange={e => setEditedKey({ ...editedKey, value: e.target.value })} 
            style={{ marginTop: 4, width: '100%' }}
          />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btnPrimary" onClick={() => onSave(editedKey)} style={{ flex: 1 }}>
            保存
          </button>
          <button className="btn" onClick={onEdit} style={{ flex: 1 }}>
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      style={{ 
        padding: 8, 
        border: `1px solid ${i18nKey.selected ? 'var(--primary)' : 'var(--border)'}`, 
        marginBottom: 6, 
        borderRadius: 6,
        background: i18nKey.selected ? 'rgba(91, 140, 255, 0.05)' : 'var(--surface)',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <input 
          type="checkbox" 
          checked={i18nKey.selected} 
          onChange={onToggle}
          style={{ marginTop: 2, cursor: 'pointer' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ 
            fontWeight: 600, 
            fontSize: 11, 
            color: 'var(--text)', 
            wordBreak: 'break-word',
            marginBottom: 4
          }}>
            {i18nKey.key}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text)' }}>
            {i18nKey.value}
          </div>
          {i18nKey.originalText !== i18nKey.value && (
            <div className="small" style={{ color: 'var(--subtext)', marginTop: 4 }}>
              原文: {i18nKey.originalText}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button 
            className="iconBtn" 
            onClick={() => onCopyAdd(i18nKey.id)}
            title="复制 add 命令"
          >
            📋
          </button>
          <button className="iconBtn" onClick={onEdit} title="编辑">✏️</button>
          <button className="iconBtn" onClick={onDelete} title="删除">🗑️</button>
        </div>
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
        <div className="label" style={{ marginBottom: 8 }}>
          {context?.frames && context.frames.length > 1 
            ? `Selected Frames (${context.frames.length})` 
            : 'Selected Frame'}
        </div>
        
        {context ? (
          context.frames && context.frames.length > 1 ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {context.frames[0].frameName} → ... → {context.frames[context.frames.length - 1].frameName}
              </div>
              <div className="small">
                完整产品流程（{context.frames.length} 个屏幕）· Text nodes: <span className="mono">{context.frames.reduce((acc, f) => acc + f.texts.length, 0)}</span> · Components: <span className="mono">{context.frames.reduce((acc, f) => acc + f.componentNames.length, 0)}</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {context.frameName || 'None'}
              </div>
              {context && (
                <div className="small" style={{ marginTop: 6 }}>
                  Text nodes: <span className="mono">{context.texts?.length || 0}</span> · Components: <span className="mono">{context.componentNames?.length || 0}</span>
                </div>
              )}
            </div>
          )
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'var(--subtext)' }}>
              请在 Figma 中选择一个或多个 Frame
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              选择后点击下方按钮进行操作
            </div>
          </div>
        )}
      </div>

      {/* Tracker Actions */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 8 }}>使用方法</div>
        <div className="hr" />
        <div className="small" style={{ marginBottom: 12, lineHeight: 1.6 }}>
          <strong>使用方法：</strong><br/>
          选择一个 Frame，点击 "🔍 Scan Page" 自动识别所有可交互元素并生成埋点
        </div>
        
        <button 
          className="btn btnPrimary" 
          onClick={() => postMessage({ type: 'SCAN_PAGE_FOR_TRACKING' })}
          title="扫描整个页面，识别所有可交互元素"
          disabled={!context}
          style={{ width: '100%' }}
        >
          🔍 Scan Page
        </button>
      </div>

      {/* Tracking Events */}
      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>Tracking Events</div>
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

      {events.length > 0 && (
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

function LoadingOverlay({ status }: { status: LoadingStatus }) {
  if (!status.isLoading) return null;

  return (
    <div className="loadingOverlay">
      <div className="loadingCard">
        <div className="spinner"></div>
        <div style={{ marginTop: 12, fontWeight: 600, fontSize: 14 }}>
          {status.message || '处理中...'}
        </div>
        {status.progress && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {status.progress.current} / {status.progress.total}
          </div>
        )}
      </div>
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
  const [i18nKeys, setI18nKeys] = useState<I18nKey[]>([]);
  const [i18nResult, setI18nResult] = useState<I18nResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportData, setExportData] = useState<{ format: 'csv' | 'json' | 'bulkadd' | 'multicheck'; data: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>({ isLoading: false });

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
        // For CSV, trigger automatic download (tracking feature)
        if (msg.format === 'csv') {
          downloadFile(msg.data, 'tracking_events.csv', 'text/csv;charset=utf-8;');
        } else if (msg.format === 'json') {
          // For JSON, show in modal for copy
          setExportData({ format: msg.format, data: msg.data });
        }
        // bulkadd and multicheck are now handled directly in UI with clipboard
        setError(null);
        return;
      }

      if (msg.type === 'I18N_KEYS') {
        setI18nKeys(msg.keys);
        return;
      }

      if (msg.type === 'I18N_RESULT') {
        setI18nResult(msg.result);
        return;
      }

      if (msg.type === 'LOADING_STATUS') {
        setLoadingStatus(msg.status);
        // Clear error when loading starts
        if (msg.status.isLoading) {
          setError(null);
        }
        return;
      }

      if (msg.type === 'COPY_TO_CLIPBOARD_ACK') {
        // 复制到剪贴板 - 使用 fallback 方法（Figma 插件环境 navigator.clipboard 可能不可用）
        const copyToClipboard = (text: string) => {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand('copy');
          } catch (e) {
            console.error('Copy failed:', e);
          }
          document.body.removeChild(textarea);
        };
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg.text).catch(() => {
            copyToClipboard(msg.text);
          });
        } else {
          copyToClipboard(msg.text);
        }
        return;
      }

      if (msg.type === 'OPEN_URL') {
        // 在新窗口打开 URL
        window.open(msg.url, '_blank');
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
          <button
            className={`tabBtn ${mode === 'i18n' ? 'tabBtnActive' : ''}`}
            onClick={() => {
              setMode('i18n');
              postMessage({ type: 'SET_MODE', mode: 'i18n' });
            }}
          >
            i18n
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
      ) : mode === 'tracker' ? (
        <TrackerView context={context} events={events} />
      ) : (
        <I18nView
          context={context}
          settings={settings}
          i18nResult={i18nResult}
          i18nKeys={i18nKeys}
        />
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

      {error && (
        <div className="notice">
          <span style={{ color: 'var(--color-error)' }}>{error}</span>
        </div>
      )}

      <LoadingOverlay status={loadingStatus} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
