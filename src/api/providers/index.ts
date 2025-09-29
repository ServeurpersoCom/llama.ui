import { InferenceProvider } from '../../types';
import { BaseOpenAIProvider } from './BaseOpenAIProvider';
import { GoogleProvider } from './GoogleProvider';
import { GroqProvider } from './GroqProvider';
import { LlamaCppProvider } from './LlamaCppProvider';
import { MistralProvider } from './MistralProvider';
import { OpenRouterProvider } from './OpenRouterProvider';

const PROVIDER_CACHE = new Map<string, InferenceProvider>();

type TunnelOptions = {
  useWebSocketTunnel?: boolean;
  webSocketUrl?: string;
};

type TunnelConfigurable = {
  configureTunnel(options?: TunnelOptions): void;
};

export function getInferenceProvider(
  key: string,
  baseUrl: string,
  apiKey: string = '',
  tunnelOptions?: TunnelOptions
): InferenceProvider {
  if (!baseUrl) throw new Error(`Base URL is not specified`);

  const cacheKey = `${key}-${baseUrl}`;
  if (PROVIDER_CACHE.has(cacheKey)) {
    const provider = PROVIDER_CACHE.get(cacheKey)!;
    if (provider.getApiKey() === apiKey) {
      if (
        tunnelOptions &&
        'configureTunnel' in provider &&
        typeof (provider as TunnelConfigurable).configureTunnel === 'function'
      ) {
        (provider as TunnelConfigurable).configureTunnel(tunnelOptions);
      }
      return PROVIDER_CACHE.get(cacheKey)!;
    }
  }

  let provider: InferenceProvider;
  switch (key) {
    case 'llama-cpp':
      provider = LlamaCppProvider.new(baseUrl, apiKey);
      break;
    case 'open-router':
      provider = OpenRouterProvider.new(baseUrl, apiKey);
      break;
    case 'google':
      provider = GoogleProvider.new(baseUrl, apiKey);
      break;
    case 'groq':
      provider = GroqProvider.new(baseUrl, apiKey);
      break;
    case 'mistral':
      provider = MistralProvider.new(baseUrl, apiKey);
      break;
    default:
      provider = BaseOpenAIProvider.new(baseUrl, apiKey);
  }

  if (
    tunnelOptions &&
    'configureTunnel' in provider &&
    typeof (provider as TunnelConfigurable).configureTunnel === 'function'
  ) {
    (provider as TunnelConfigurable).configureTunnel(tunnelOptions);
  }

  PROVIDER_CACHE.set(cacheKey, provider);
  return provider;
}
