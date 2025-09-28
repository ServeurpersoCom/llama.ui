import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { getInferenceProvider } from '../api/providers';
import { CONFIG_DEFAULT, INFERENCE_PROVIDERS } from '../config';
import { Configuration, InferenceApiModel, InferenceProvider } from '../types';
import { deepEqual } from '../utils';
import { useAppContext } from './app';

// --- Type Definitions ---

type FetchOptions = {
  silent?: boolean;
};

interface InferenceContextValue {
  provider?: InferenceProvider | null;
  models: InferenceApiModel[];
  selectedModel: InferenceApiModel | null;

  fetchModels: (
    config: Configuration,
    options?: FetchOptions
  ) => Promise<InferenceApiModel[]>;
}

// --- Constants ---

const noModels: InferenceApiModel[] = [];

const InferenceContext = createContext<InferenceContextValue | null>(null);

// --- Helper Functions ---

function isProviderReady(config: Configuration) {
  if (!config.provider) return false;

  const providerInfo = INFERENCE_PROVIDERS[config.provider];
  if (!providerInfo) return true;

  return (
    !!config.baseUrl && (!providerInfo.isKeyRequired || config.apiKey !== '')
  );
}

function getTunnelUrl(config: Configuration): string | undefined {
  if (!config.useWebSocketTunnel) {
    return undefined;
  }

  const trimmed = config.webSocketUrl.trim();
  return trimmed.length ? trimmed : undefined;
}

export const InferenceContextProvider = ({
  children,
}: {
  children: React.ReactElement;
}) => {
  const { t } = useTranslation();

  const currentConfigRef = useRef<Configuration>(CONFIG_DEFAULT);
  const [provider, setProvider] = useState<InferenceProvider | null>(null);
  const [models, setModels] = useState<InferenceApiModel[]>(noModels);
  const [selectedModel, setSelectedModel] = useState<InferenceApiModel | null>(
    null
  );

  // --- Main Functions ---

  const updateApi = useCallback((config: Configuration) => {
    if (!isProviderReady(config)) {
      setProvider(null);
      return;
    }

    console.debug('Update Inference API');
    const tunnelUrl = getTunnelUrl(config);
    const newProvider = getInferenceProvider(
      config.provider,
      config.baseUrl,
      config.apiKey,
      tunnelUrl ? { webSocketTunnelUrl: tunnelUrl } : undefined
    );
    setProvider(newProvider);
  }, []);

  const fetchModels = useCallback(
    async (
      config: Configuration,
      options: FetchOptions = { silent: false }
    ): Promise<InferenceApiModel[]> => {
      if (!isProviderReady(config)) {
        return noModels;
      }

      console.debug('Fetch models');
      const tunnelUrl = getTunnelUrl(config);
      const newProvider = getInferenceProvider(
        config.provider,
        config.baseUrl,
        config.apiKey,
        tunnelUrl ? { webSocketTunnelUrl: tunnelUrl } : undefined
      );
      let newModels = noModels;
      try {
        newModels = await newProvider.getModels();
      } catch (err) {
        if (!options.silent) {
          console.error('fetch models failed: ', err);
          toast.error(
            t('state.inference.errors.providerError', {
              message: (err as Error).message,
            })
          );
        }
      }
      return newModels;
    },
    [t]
  );

  const updateSelectedModel = useCallback(
    (config: Configuration) => {
      if (!!config.model && models.length > 0) {
        const selectedModel = models.find((m) => m.id === config.model) || null;
        setSelectedModel(selectedModel);
      }
    },
    [models]
  );

  const syncServer = useCallback(
    async (config: Configuration, options: FetchOptions = {}) => {
      if (Object.is(CONFIG_DEFAULT, config) || !config.baseUrl) return;

      console.debug('Synchronize models with server');
      const models = await fetchModels(config, options);
      setModels(models);

      updateSelectedModel(config);
    },
    [fetchModels, updateSelectedModel]
  );

  // --- Initialization ---

  const { config } = useAppContext();
  useEffect(() => {
    const prevConfig = currentConfigRef.current;
    if (!deepEqual(currentConfigRef.current, config) || !provider) {
      updateApi(config);
    }
    const shouldSync =
      prevConfig.baseUrl !== config.baseUrl ||
      prevConfig.apiKey !== config.apiKey ||
      (Object.is(prevConfig, CONFIG_DEFAULT) && !!config.baseUrl);

    if (shouldSync) {
      syncServer(config);
    }

    updateSelectedModel(config);

    currentConfigRef.current = config;
  }, [syncServer, updateApi, updateSelectedModel, config, provider]);

  return (
    <InferenceContext.Provider
      value={{ provider, models, selectedModel, fetchModels }}
    >
      {children}
    </InferenceContext.Provider>
  );
};

export const useInferenceContext = () => {
  const context = useContext(InferenceContext);
  if (!context) {
    throw new Error(
      'useInferenceContext must be used within an InferenceContextProvider'
    );
  }
  return context;
};
