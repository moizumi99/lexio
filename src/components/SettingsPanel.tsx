import { useState } from 'react';
import { X, Eye, EyeOff, Check, ExternalLink } from 'lucide-react';
import { useStore } from '../stores/useStore';
import type { AIProvider } from '../types';

const PROVIDER_DOCS: Record<AIProvider, string> = {
  ollama: 'https://ollama.com/download',
  claude: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey',
};

const PROVIDER_ICONS: Record<AIProvider, string> = {
  ollama: '🦙',
  claude: '🟠',
  openai: '🟢',
  gemini: '🔵',
};

export default function SettingsPanel() {
  const { settings, updateProviderConfig, setSettingsOpen, updateSettings } = useStore();
  const [activeTab, setActiveTab] = useState<AIProvider>('ollama');
  const [showKey, setShowKey] = useState(false);

  const provider = settings.providers[activeTab];

  const handleSave = () => {
    // Persist via electron
    if (window.electronAPI) {
      window.electronAPI.saveSettings(settings);
    }
    setSettingsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-1 border border-surface-3 rounded-2xl shadow-2xl w-[620px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-3">
          <h2 className="text-base font-semibold text-text-primary">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-lg text-text-muted hover:bg-surface-3 hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <div className="w-48 border-r border-surface-3 py-2 flex-shrink-0">
            <div className="px-3 py-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                AI Providers
              </span>
            </div>
            {(Object.keys(settings.providers) as AIProvider[]).map((id) => {
              const p = settings.providers[id];
              return (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    setShowKey(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                    activeTab === id
                      ? 'bg-accent/10 text-accent-light border-r-2 border-accent'
                      : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                  }`}
                >
                  <span>{PROVIDER_ICONS[id]}</span>
                  <span className="truncate">{p.name}</span>
                  {(p.enabled || p.id === 'ollama') && (
                    <Check size={12} className="ml-auto text-emerald-400 flex-shrink-0" />
                  )}
                </button>
              );
            })}

            <div className="border-t border-surface-3 mt-2 pt-2 px-3 py-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                General
              </span>
            </div>
            <div className="px-3 py-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.sendFullPdfContext}
                  onChange={(e) => updateSettings({ sendFullPdfContext: e.target.checked })}
                  className="accent-accent"
                />
                <span className="text-xs text-text-secondary">Send full PDF to AI</span>
              </label>
            </div>
          </div>

          {/* Right content */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{provider.name}</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {activeTab === 'ollama'
                    ? 'Local inference — no API key required'
                    : 'Cloud API — requires an API key'}
                </p>
              </div>
              {activeTab !== 'ollama' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-text-secondary">Enabled</span>
                  <div
                    onClick={() =>
                      updateProviderConfig(activeTab, { enabled: !provider.enabled })
                    }
                    className={`w-9 h-5 rounded-full transition-colors cursor-pointer flex items-center ${
                      provider.enabled ? 'bg-accent' : 'bg-surface-4'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        provider.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </div>
                </label>
              )}
            </div>

            {/* Base URL (Ollama) */}
            {activeTab === 'ollama' && (
              <SettingField label="Server URL">
                <input
                  type="text"
                  value={provider.baseUrl || ''}
                  onChange={(e) =>
                    updateProviderConfig(activeTab, { baseUrl: e.target.value })
                  }
                  placeholder="http://localhost:11434"
                  className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/40 transition-colors font-mono"
                />
              </SettingField>
            )}

            {/* API Key */}
            {activeTab !== 'ollama' && (
              <SettingField
                label="API Key"
                action={
                  <a
                    href={PROVIDER_DOCS[activeTab]}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1 text-[11px] text-accent-light hover:underline"
                  >
                    Get key <ExternalLink size={10} />
                  </a>
                }
              >
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={provider.apiKey || ''}
                    onChange={(e) =>
                      updateProviderConfig(activeTab, {
                        apiKey: e.target.value,
                        enabled: e.target.value.length > 0,
                      })
                    }
                    placeholder={`Enter your ${provider.name} API key`}
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 pr-10 text-sm text-text-primary outline-none focus:border-accent/40 transition-colors font-mono"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </SettingField>
            )}

            {/* Model selector */}
            <SettingField label="Model">
              <div className="flex gap-2">
                <select
                  value={provider.model}
                  onChange={(e) =>
                    updateProviderConfig(activeTab, { model: e.target.value })
                  }
                  className="flex-1 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/40 transition-colors appearance-none cursor-pointer"
                >
                  {provider.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={provider.model}
                  onChange={(e) =>
                    updateProviderConfig(activeTab, { model: e.target.value })
                  }
                  placeholder="Custom model name"
                  className="flex-1 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/40 transition-colors font-mono"
                />
              </div>
              <p className="text-[11px] text-text-muted mt-1">
                Select a preset or type a custom model name
              </p>
            </SettingField>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-3">
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm bg-accent text-white hover:bg-accent-dim transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingField({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-text-secondary">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}
