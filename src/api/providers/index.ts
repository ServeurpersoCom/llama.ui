import { InferenceProvider } from '../../types';
import { WebSocketTunnelClient } from '../websocketTunnel';
import { BaseOpenAIProvider } from './BaseOpenAIProvider';
import { GoogleProvider } from './GoogleProvider';
import { GroqProvider } from './GroqProvider';
import { LlamaCppProvider } from './LlamaCppProvider';
import { OpenRouterProvider } from './OpenRouterProvider';

const PROVIDER_CACHE = new Map<string, InferenceProvider>();

type ProviderFactoryOptions = {
  webSocketTunnelUrl?: string;
};

export function getInferenceProvider(
  key: string,
  baseUrl: string,
  apiKey: string = '',
  options: ProviderFactoryOptions = {}
): InferenceProvider {
  if (!baseUrl) throw new Error(`Base URL is not specified`);

  const tunnelUrl = options.webSocketTunnelUrl?.trim();
  const tunnelKey = tunnelUrl ? `ws:${tunnelUrl}` : 'direct';
  const cacheKey = `${key}-${baseUrl}-${tunnelKey}`;
  if (PROVIDER_CACHE.has(cacheKey)) {
    const provider = PROVIDER_CACHE.get(cacheKey)!;
    if (provider.getApiKey() === apiKey) {
      return provider;
    }
  }

  const tunnelClient = tunnelUrl
    ? new WebSocketTunnelClient(tunnelUrl)
    : undefined;

  let provider: InferenceProvider;
  switch (key) {
    case 'llama-cpp':
      provider = LlamaCppProvider.new(baseUrl, apiKey, tunnelClient);
      break;
    case 'open-router':
      provider = OpenRouterProvider.new(baseUrl, apiKey, tunnelClient);
      break;
    case 'google':
      provider = GoogleProvider.new(baseUrl, apiKey, tunnelClient);
      break;
    case 'groq':
      provider = GroqProvider.new(baseUrl, apiKey, tunnelClient);
      break;
    default:
      provider = BaseOpenAIProvider.new(baseUrl, apiKey, tunnelClient);
  }

  PROVIDER_CACHE.set(cacheKey, provider);
  return provider;
}
