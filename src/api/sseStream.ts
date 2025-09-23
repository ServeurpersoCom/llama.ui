// @ts-expect-error this package does not have typing
import TextLineStream from 'textlinestream';

// ponyfill for missing ReadableStream asyncIterator on Safari
import { asyncIterator } from '@sec-ant/readable-stream/ponyfill/asyncIterator';

export type SSEEvent = {
  data: string;
  event?: string;
  id?: string;
  retry?: number;
};

function createEmptyEvent() {
  return {
    data: [] as string[],
    event: undefined as string | undefined,
    id: undefined as string | undefined,
    retry: undefined as number | undefined,
  };
}

function emitEvent(event: ReturnType<typeof createEmptyEvent>) {
  if (
    !event.data.length &&
    event.event === undefined &&
    event.id === undefined &&
    event.retry === undefined
  ) {
    return null;
  }

  return {
    data: event.data.join('\n'),
    event: event.event,
    id: event.id,
    retry: event.retry,
  } satisfies SSEEvent;
}

function processLine(line: string, event: ReturnType<typeof createEmptyEvent>) {
  if (!line.length) {
    return emitEvent(event);
  }

  if (line.startsWith(':')) {
    // Comment line – ignore.
    return null;
  }

  const separator = line.indexOf(':');
  const field = separator === -1 ? line : line.slice(0, separator);
  const value = separator === -1 ? '' : line.slice(separator + 1).trimStart();

  switch (field) {
    case 'data':
      event.data.push(value);
      break;
    case 'event':
      event.event = value || undefined;
      break;
    case 'id':
      event.id = value || undefined;
      break;
    case 'error': {
      let message = value;
      if (message) {
        try {
          const parsed = JSON.parse(message);
          if (parsed?.message) {
            message = parsed.message;
          }
        } catch {
          /* ignore JSON parse failure */
        }
      }
      throw new Error(message || 'Unknown SSE error');
    }
    case 'retry': {
      const retry = Number(value);
      if (!Number.isNaN(retry)) {
        event.retry = retry;
      }
      break;
    }
    default:
      // Ignore unknown fields to keep the parser generic.
      break;
  }

  return null;
}

export async function* getSSEStreamAsync(
  fetchResponse: Response
): AsyncGenerator<SSEEvent> {
  if (!fetchResponse.body) throw new Error('Response body is empty');
  const lines: ReadableStream<string> = fetchResponse.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());

  let currentEvent = createEmptyEvent();

  // @ts-expect-error asyncIterator complains about type, but it should work
  for await (const rawLine of asyncIterator(lines)) {
    const line = rawLine.replace(/\r$/, '');
    const emitted = processLine(line, currentEvent);
    if (emitted) {
      yield emitted;
      currentEvent = createEmptyEvent();
    }
  }

  const finalEvent = emitEvent(currentEvent);
  if (finalEvent) {
    yield finalEvent;
  }
}

export async function* mapSSEStream<T>(
  source: AsyncGenerator<SSEEvent>,
  parser?: (event: SSEEvent) => T | undefined
): AsyncGenerator<T> {
  for await (const event of source) {
    if (!parser) {
      yield event as unknown as T;
      continue;
    }

    const mapped = parser(event);
    if (mapped !== undefined) {
      yield mapped;
    }
  }
}
