import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { getInferenceProvider } from '../api/providers';
import { CONFIG_DEFAULT, INFERENCE_PROVIDERS } from '../config';
import { Configuration, InferenceApiModel, InferenceProvider } from '../types';
import { deepEqual } from '../utils';
import { useAppContext } from './app';

// --- Action Types ---

enum InferenceActionTypes {
  SET_PROVIDER = 'SET_PROVIDER',
  SET_MODELS = 'SET_MODELS',
  SET_SELECTED_MODEL = 'SET_SELECTED_MODEL',
  RESET_STATE = 'RESET_STATE',
}

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

interface SetProviderAction {
  type: InferenceActionTypes.SET_PROVIDER;
  payload: InferenceProvider | null;
}

interface SetModelsAction {
  type: InferenceActionTypes.SET_MODELS;
  payload: InferenceApiModel[];
}

interface SetSelectedModelAction {
  type: InferenceActionTypes.SET_SELECTED_MODEL;
  payload: InferenceApiModel | null;
}

interface ResetStateAction {
  type: InferenceActionTypes.RESET_STATE;
}

type InferenceAction =
  | SetProviderAction
  | SetModelsAction
  | SetSelectedModelAction
  | ResetStateAction;

interface InferenceState {
  provider: InferenceProvider | null;
  models: InferenceApiModel[];
  selectedModel: InferenceApiModel | null;
}

// --- Constants ---

const noModels: InferenceApiModel[] = [];

const initialState: InferenceState = {
  provider: null,
  models: noModels,
  selectedModel: null,
};

const inferenceReducer = (
  state: InferenceState,
  action: InferenceAction
): InferenceState => {
  switch (action.type) {
    case InferenceActionTypes.SET_PROVIDER:
      return {
        ...state,
        provider: action.payload,
      };
    case InferenceActionTypes.SET_MODELS:
      return {
        ...state,
        models: action.payload,
      };
    case InferenceActionTypes.SET_SELECTED_MODEL:
      return {
        ...state,
        selectedModel: action.payload,
      };
    case InferenceActionTypes.RESET_STATE:
      return {
        provider: null,
        models: noModels,
        selectedModel: null,
      };
    default:
      return state;
  }
};

// --- Helper Functions ---

function isProviderReady(config: Configuration) {
  if (!config.provider) return false;

  const providerInfo = INFERENCE_PROVIDERS[config.provider];
  if (!providerInfo) return true;

  return (
    !!config.baseUrl && (!providerInfo.isKeyRequired || config.apiKey !== '')
  );
}

const InferenceContext = createContext<InferenceContextValue | null>(null);

export const InferenceContextProvider = ({
  children,
}: {
  children: React.ReactElement;
}) => {
  const { t } = useTranslation();

  const currentConfigRef = useRef<Configuration>(CONFIG_DEFAULT);

  const [state, dispatch] = useReducer(inferenceReducer, initialState);

  // --- Main Functions ---

  const updateApi = useCallback((config: Configuration) => {
    if (!isProviderReady(config)) {
      dispatch({
        type: InferenceActionTypes.SET_PROVIDER,
        payload: null,
      });
      return;
    }

    console.debug('Update Inference API');
    const newProvider = getInferenceProvider(
      config.provider,
      config.baseUrl,
      config.apiKey,
      {
        useWebSocketTunnel: config.useWebSocketTunnel,
        webSocketUrl: config.webSocketUrl,
      }
    );
    dispatch({ type: InferenceActionTypes.SET_PROVIDER, payload: newProvider });
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
      const newProvider = getInferenceProvider(
        config.provider,
        config.baseUrl,
        config.apiKey,
        {
          useWebSocketTunnel: config.useWebSocketTunnel,
          webSocketUrl: config.webSocketUrl,
        }
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
      if (!!config.model && state.models.length > 0) {
        const selectedModel =
          state.models.find((m) => m.id === config.model) || null;
        dispatch({
          type: InferenceActionTypes.SET_SELECTED_MODEL,
          payload: selectedModel,
        });
      }
    },
    [state.models]
  );

  const syncServer = useCallback(
    async (config: Configuration, options: FetchOptions = {}) => {
      if (Object.is(CONFIG_DEFAULT, config) || !config.baseUrl) return;

      console.debug('Synchronize models with server');
      const models = await fetchModels(config, options);
      dispatch({ type: InferenceActionTypes.SET_MODELS, payload: models });

      updateSelectedModel(config);
    },
    [fetchModels, updateSelectedModel]
  );

  // --- Initialization ---

  const { config } = useAppContext();
  useEffect(() => {
    const prevConfig = currentConfigRef.current;
    if (!deepEqual(currentConfigRef.current, config) || !state.provider) {
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
  }, [syncServer, updateApi, updateSelectedModel, config, state.provider]);

  return (
    <InferenceContext.Provider
      value={{
        provider: state.provider,
        models: state.models,
        selectedModel: state.selectedModel,
        fetchModels,
      }}
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
