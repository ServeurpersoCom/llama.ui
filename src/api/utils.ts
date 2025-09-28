import {
  Configuration,
  InferenceApiMessage,
  InferenceApiMessageContentPart,
  Message,
} from '../types';
// @ts-expect-error this package does not have typing
import TextLineStream from 'textlinestream';

// ponyfill for missing ReadableStream asyncIterator on Safari
import { asyncIterator } from '@sec-ant/readable-stream/ponyfill/asyncIterator';

import { SSEEvent } from './sseStream';

/**
 * Converts application message format to API-compatible message structure.
 * Processes extra content (context, files) and formats them according to API requirements.
 *
 * @param messages - Array of messages in application format to normalize
 * @returns Array of messages formatted for API consumption
 *
 * @remarks
 * This function processes extra content first, followed by the user message,
 * which allows for better cache prefix utilization with long context windows. [[3]]
 */
export function normalizeMsgsForAPI(
  messages: Readonly<Message[]>
): InferenceApiMessage[] {
  return messages.map((msg) => {
    if (msg.role !== 'user' || !msg.extra) {
      return {
        role: msg.role,
        content: msg.content,
      };
    }

    // extra content first, then user text message in the end
    // this allow re-using the same cache prefix for long context
    const contentArr: InferenceApiMessageContentPart[] = [];

    for (const extra of msg.extra ?? []) {
      if (extra.type === 'context') {
        contentArr.push({
          type: 'text',
          text: extra.content,
        });
      } else if (extra.type === 'textFile') {
        contentArr.push({
          type: 'text',
          text: `File: ${extra.name}\nContent:\n\n${extra.content}`,
        });
      } else if (extra.type === 'imageFile') {
        contentArr.push({
          type: 'image_url',
          image_url: { url: extra.base64Url },
        });
      } else if (extra.type === 'audioFile') {
        contentArr.push({
          type: 'input_audio',
          input_audio: {
            data: extra.base64Data,
            format: /wav/.test(extra.mimeType) ? 'wav' : 'mp3',
          },
        });
      } else {
        throw new Error('Unknown extra type');
      }
    }

    // add user message to the end
    contentArr.push({
      type: 'text',
      text: msg.content,
    });

    return {
      role: msg.role,
      content: contentArr,
    };
  });
}

/**
 * Parses individual chat-completion SSE events and returns their JSON payload.
 * The OpenAI-compatible APIs emit `[DONE]` sentinels that are ignored by design.
 */
export function parseChatCompletionEvent(
  event: Pick<SSEEvent, 'data'>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | undefined {
  const payload = event.data ?? '';
  if (payload === '[DONE]') {
    return undefined;
  }

  return JSON.parse(payload);
}

/**
 * Creates an async generator for processing Server-Sent Events (SSE) streams.
 * Handles parsing of event data and error conditions from the stream.
 *
 * @param fetchResponse - Response object from a fetch request expecting SSE
 * @returns Async generator yielding parsed event data
 *
 * @throws When encountering error messages in the stream
 *
 * @remarks
 * This implementation uses TextLineStream and asyncIterator ponyfill to handle
 * streaming responses in environments like Safari that lack native support. [[2]]
 */
export async function* getSSEStreamAsync(fetchResponse: Response) {
  if (!fetchResponse.body) throw new Error('Response body is empty');
  const lines: ReadableStream<string> = fetchResponse.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());
  // @ts-expect-error asyncIterator complains about type, but it should work
  for await (const line of asyncIterator(lines)) {
    //if (isDev) console.debug({ line });
    if (line.startsWith('data:') && !line.endsWith('[DONE]')) {
      const data = JSON.parse(line.slice(5));
      yield data;
    } else if (line.startsWith('error:')) {
      const data = JSON.parse(line.slice(6));
      throw new Error(data.message || 'Unknown error');
    }
  }
}

export const noResponse = new Response(null, { status: 444 });

export const configToCustomOptions = (config: Configuration) => {
  // prepare params
  let params = {};

  if (config.overrideGenerationOptions)
    params = Object.assign(params, {
      temperature: config.temperature,
      top_k: config.top_k,
      top_p: config.top_p,
      min_p: config.min_p,
      max_tokens: config.max_tokens,
    });

  if (config.overrideSamplersOptions)
    params = Object.assign(params, {
      samplers: config.samplers,
      dynatemp_range: config.dynatemp_range,
      dynatemp_exponent: config.dynatemp_exponent,
      typical_p: config.typical_p,
      xtc_probability: config.xtc_probability,
      xtc_threshold: config.xtc_threshold,
    });

  if (config.overridePenaltyOptions)
    params = Object.assign(params, {
      repeat_last_n: config.repeat_last_n,
      repeat_penalty: config.repeat_penalty,
      presence_penalty: config.presence_penalty,
      frequency_penalty: config.frequency_penalty,
      dry_multiplier: config.dry_multiplier,
      dry_base: config.dry_base,
      dry_allowed_length: config.dry_allowed_length,
      dry_penalty_last_n: config.dry_penalty_last_n,
    });

  if (config.custom.trim().length) {
    try {
      params = Object.assign(params, JSON.parse(config.custom));
    } catch (e) {
      console.error('Failed to parse custom configuration:', e);
    }
  }

  return params;
};
