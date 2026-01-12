import type { Settings } from '@shared/messages';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string; // data:image/png;base64,... or https://...
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | (TextContent | ImageContent)[];
}

export async function openRouterChat(settings: Settings, messages: ChatMessage[]): Promise<string> {
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
      temperature: 0.3,
      max_tokens: 8000, // 增加到8000以支持详细的PRD文档
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenRouter returned empty response');
  }
  return content;
}

/** Check if the model supports vision */
export function isVisionModel(model: string): boolean {
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
