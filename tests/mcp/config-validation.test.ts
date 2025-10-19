/** @jest-environment node */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  McpConfigError,
  loadMcpConfig,
  loadMcpConfigSync,
} from '@/app/lib/mcp/config';

const createTempConfig = (data: unknown): string => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vibechat-mcp-config-'),
  );
  const filePath = path.join(tmpDir, 'mcp.json');
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  return filePath;
};

const createLogger = () => ({
  warn: jest.fn(),
  error: jest.fn(),
});

describe('loadMcpConfigSync', () => {
  it('loads and normalizes valid config entries', () => {
    const logger = createLogger();
    const filePath = createTempConfig({
      servers: [
        {
          id: 'codex-tasks',
          command: 'codex-tasks',
          args: ['mcp'],
          description: 'Codex tasks MCP server',
          enabled: true,
        },
        {
          id: 'disabled-server',
          command: 'echo',
          args: ['hello'],
          enabled: false,
        },
      ],
    });

    const config = loadMcpConfigSync({ configPath: filePath, logger });

    expect(config.servers).toHaveLength(2);
    expect(config.servers[0]).toEqual({
      id: 'codex-tasks',
      command: 'codex-tasks',
      args: ['mcp'],
      description: 'Codex tasks MCP server',
      enabled: true,
    });
    expect(config.servers[1]).toEqual({
      id: 'disabled-server',
      command: 'echo',
      args: ['hello'],
      description: undefined,
      enabled: false,
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('throws when duplicate ids are present', () => {
    const logger = createLogger();
    const filePath = createTempConfig({
      servers: [
        { id: 'dup', command: 'cmd', args: [] },
        { id: 'dup', command: 'cmd', args: [] },
      ],
    });

    expect(() =>
      loadMcpConfigSync({ configPath: filePath, logger }),
    ).toThrow(McpConfigError);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate server id "dup"'),
    );
  });

  it('throws when command is missing', () => {
    const logger = createLogger();
    const filePath = createTempConfig({
      servers: [{ id: 'missing-command' }],
    });

    expect(() =>
      loadMcpConfigSync({ configPath: filePath, logger }),
    ).toThrow(McpConfigError);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('must include a non-empty string "command"'),
    );
  });

  it('returns empty config when file missing', () => {
    const logger = createLogger();

    const config = loadMcpConfigSync({
      configPath: path.join(
        os.tmpdir(),
        `vibechat-missing-${Date.now()}`,
        'missing.json',
      ),
      logger,
    });

    expect(config.servers).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No config found'),
    );
  });
});

describe('loadMcpConfig', () => {
  it('delegates to the sync loader', async () => {
    const logger = createLogger();
    const filePath = createTempConfig({
      servers: [{ id: 'async', command: 'echo', args: [] }],
    });

    const config = await loadMcpConfig({ configPath: filePath, logger });

    expect(config.servers[0].id).toBe('async');
  });
});
