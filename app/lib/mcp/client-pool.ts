import fs from 'node:fs';
import path from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  ReadBuffer,
  serializeMessage,
} from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import type { McpServerDefinition } from './config';

const MCP_DEBUG_LOG_PATH = path.join(process.cwd(), 'logs', 'mcp-debug.log');

const appendDebugLog = (message: string): void => {
  try {
    fs.mkdirSync(path.dirname(MCP_DEBUG_LOG_PATH), { recursive: true });
    fs.appendFileSync(MCP_DEBUG_LOG_PATH, `${message}\n`);
  } catch (error) {
    console.error('[mcp-client-pool] failed to write debug log:', error);
  }
};

export interface ClientPoolLogger {
  warn?: (message: string) => void;
}

export interface ClientPoolOptions {
  requestTimeoutMs: number;
  logger?: ClientPoolLogger;
}

interface ClientEntry {
  client: Client;
  transport: ExistingProcessTransport;
  pid?: number;
}

export class McpClientPool {
  private readonly clients = new Map<string, ClientEntry>();

  constructor(private readonly options: ClientPoolOptions) {}

  async getClient(
    definition: McpServerDefinition,
    process: ChildProcessWithoutNullStreams,
    pid?: number,
  ): Promise<Client> {
    const existing = this.clients.get(definition.id);
    if (existing && existing.pid === (pid ?? process.pid ?? undefined)) {
      return existing.client;
    }

    if (existing) {
      await existing.client.close().catch(() => {});
      await existing.transport.close().catch(() => {});
      this.clients.delete(definition.id);
    }

    const transport = new ExistingProcessTransport(process);
    const client = new Client(
      { name: 'vibechat-mcp-client', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );

    transport.onclose = () => {
      this.clients.delete(definition.id);
    };
    transport.onerror = (error) => {
      this.options.logger?.warn?.(
        `[mcp-client-pool] transport error for "${definition.id}": ${String(
          error,
        )}`,
      );
      this.clients.delete(definition.id);
    };

    await client.connect(transport, {
      timeout: this.options.requestTimeoutMs,
    });

    this.clients.set(definition.id, { client, transport, pid });
    return client;
  }

  invalidate(serverId: string): void {
    const entry = this.clients.get(serverId);
    if (!entry) {
      return;
    }

    this.clients.delete(serverId);
    void entry.client.close();
    void entry.transport.close();
  }

  async closeAll(): Promise<void> {
    const entries = Array.from(this.clients.values());
    this.clients.clear();
    await Promise.allSettled(
      entries.map(async ({ client, transport }) => {
        await client.close().catch(() => {});
        await transport.close().catch(() => {});
      }),
    );
  }
}

class ExistingProcessTransport {
  sessionId?: string;

  onclose?: () => void;

  onerror?: (error: Error) => void;

  onmessage?: (message: JSONRPCMessage) => void;

  private readonly readBuffer = new ReadBuffer();

  private readonly stdoutHandler = (chunk: Buffer) => this.handleChunk(chunk);

  private readonly stdoutErrorHandler = (error: Error) =>
    this.onerror?.(error);

  private readonly processExitHandler = () => this.close().catch(() => {});

  private readonly processErrorHandler = (error: Error) =>
    this.onerror?.(error);

  private closed = false;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {}

  async start(): Promise<void> {
    if (!this.child.stdout || !this.child.stdin) {
      throw new Error('MCP server does not expose stdio streams');
    }

    this.child.stdout.on('data', this.stdoutHandler);
    this.child.stdout.on('error', this.stdoutErrorHandler);
    this.child.once('exit', this.processExitHandler);
    this.child.once('error', this.processErrorHandler);
  }

  async send(
    message: JSONRPCMessage,
    _options?: TransportSendOptions,
  ): Promise<void> {
    if (this.closed || !this.child.stdin?.writable) {
      throw new Error('Cannot send message: transport not writable');
    }

    await new Promise<void>((resolve, reject) => {
      const payload = serializeMessage(message);
      const stdin = this.child.stdin;
      if (!stdin) {
        reject(new Error('Child process stdin not available'));
        return;
      }

      const writeSucceeded = stdin.write(payload);
      if (writeSucceeded) {
        resolve();
        return;
      }

      const cleanup = (error?: Error | null) => {
        stdin.removeListener('drain', onDrain);
        stdin.removeListener('error', onError);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const onDrain = () => cleanup();
      const onError = (error: Error) => cleanup(error);
      stdin.once('drain', onDrain);
      stdin.once('error', onError);
    });
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.child.stdout?.off('data', this.stdoutHandler);
    this.child.stdout?.off('error', this.stdoutErrorHandler);
    this.child.off('exit', this.processExitHandler);
    this.child.off('error', this.processErrorHandler);
    this.readBuffer.clear();
    this.onclose?.();
  }

  private handleChunk(chunk: Buffer) {
    this.readBuffer.append(chunk);

    let lastMessage: JSONRPCMessage | null = null;
    while (true) {
      try {
        const message = this.readBuffer.readMessage();
        if (message === null) {
          break;
        }
        lastMessage = message;
        this.onmessage?.(message);
      } catch (error) {
        const chunkString = chunk.toString('utf-8');
        const payloadPreview = (() => {
          try {
            if (lastMessage) {
              return JSON.stringify(lastMessage).slice(0, 500);
            }
          } catch {
            // fall through
          }
          return chunkString.slice(0, 500);
        })();
        console.log('[mcp-client-pool] raw chunk:', chunkString);
        console.log(
          '[mcp-client-pool] failed to handle MCP message:',
          payloadPreview,
        );
        appendDebugLog(
          `[${new Date().toISOString()}] raw chunk: ${chunkString}`,
        );
        appendDebugLog(
          `[${new Date().toISOString()}] failed payload: ${payloadPreview}`,
        );
        this.onerror?.(error as Error);
        break;
      }
    }
  }
}
