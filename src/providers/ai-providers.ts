import type { ProviderConfig, ChatMessage } from '../types';

// ─── Base Interface ───

export interface AIStreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export interface AIProviderInterface {
  chat(
    messages: ChatMessage[],
    systemPrompt: string,
    config: ProviderConfig,
    signal: AbortSignal,
    callbacks: AIStreamCallbacks
  ): Promise<void>;
}

// ─── Ollama ───

const ollamaProvider: AIProviderInterface = {
  async chat(messages, systemPrompt, config, signal, cb) {
    const url = `${config.baseUrl || 'http://localhost:11434'}/api/chat`;
    const body = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: true,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) cb.onToken(json.message.content);
          if (json.done) cb.onDone();
        } catch {}
      }
    }
    cb.onDone();
  },
};

// ─── Claude (Anthropic) ───

const claudeProvider: AIProviderInterface = {
  async chat(messages, systemPrompt, config, signal, cb) {
    const url = 'https://api.anthropic.com/v1/messages';
    const body = {
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error ${res.status}: ${err}`);
    }
    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            cb.onDone();
            return;
          }
          try {
            const json = JSON.parse(data);
            if (json.type === 'content_block_delta' && json.delta?.text) {
              cb.onToken(json.delta.text);
            }
            if (json.type === 'message_stop') cb.onDone();
          } catch {}
        }
      }
    }
    cb.onDone();
  },
};

// ─── OpenAI ───

const openaiProvider: AIProviderInterface = {
  async chat(messages, systemPrompt, config, signal, cb) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const body = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: true,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${err}`);
    }
    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            cb.onDone();
            return;
          }
          try {
            const json = JSON.parse(data);
            const token = json.choices?.[0]?.delta?.content;
            if (token) cb.onToken(token);
          } catch {}
        }
      }
    }
    cb.onDone();
  },
};

// ─── Gemini ───

const geminiProvider: AIProviderInterface = {
  async chat(messages, systemPrompt, config, signal, cb) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error ${res.status}: ${err}`);
    }
    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) cb.onToken(text);
          } catch {}
        }
      }
    }
    cb.onDone();
  },
};

// ─── Provider Registry ───

export const providers: Record<string, AIProviderInterface> = {
  ollama: ollamaProvider,
  claude: claudeProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
};

// ─── System Prompt Builder ───

export function buildSystemPrompt(pdfText: string, maxChars: number = 100000): string {
  const truncated = pdfText.length > maxChars ? pdfText.slice(0, maxChars) + '\n\n[... document truncated ...]' : pdfText;

  return `You are Lexio, an intelligent PDF reading assistant. You help users understand documents by answering questions about their content.

You have access to the full text of the currently open PDF document. When answering questions:
- Reference specific parts of the document when relevant
- Be precise and cite page numbers or sections when possible
- If the user highlights a specific passage, focus your answer on that passage but use the broader document context
- Explain complex concepts clearly, using analogies when helpful
- If you're uncertain about something, say so rather than guessing
- Format responses with markdown for readability (bold, lists, code blocks as appropriate)

──── DOCUMENT CONTENT ────
${truncated}
──── END DOCUMENT ────`;
}
