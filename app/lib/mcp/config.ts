import fs from 'node:fs';
import path from 'node:path';

export interface McpServerDefinition {
  id: string;
  command: string;
  args: string[];
  description?: string;
  enabled: boolean;
}

export interface McpServerConfig {
  servers: McpServerDefinition[];
}

export interface LoadMcpConfigOptions {
  configPath?: string;
  logger?: Pick<Console, 'warn' | 'error'>;
}

const DEFAULT_CONFIG_PATH = path.join(
  process.cwd(),
  'config',
  'mcp-servers.json',
);

const DEFAULT_LOGGER: Pick<Console, 'warn' | 'error'> = {
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpConfigError';
  }
}

export function loadMcpConfigSync(
  options: LoadMcpConfigOptions = {},
): McpServerConfig {
  const { configPath = DEFAULT_CONFIG_PATH, logger = DEFAULT_LOGGER } = options;

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err && err.code === 'ENOENT') {
      logger.warn(
        `[mcp-config] No config found at ${configPath}. Serving empty catalog.`,
      );
      return { servers: [] };
    }

    logger.error(
      `[mcp-config] Failed to read config at ${configPath}: ${err?.message ?? err}`,
    );
    throw new McpConfigError(
      `Failed to read MCP config at ${configPath}: ${err?.message ?? err}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logger.error(
      `[mcp-config] Config at ${configPath} is not valid JSON: ${String(
        error,
      )}`,
    );
    throw new McpConfigError(
      `Config at ${configPath} is not valid JSON: ${String(error)}`,
    );
  }

  return validateAndNormalizeConfig(parsed, configPath, logger);
}

export async function loadMcpConfig(
  options: LoadMcpConfigOptions = {},
): Promise<McpServerConfig> {
  return loadMcpConfigSync(options);
}

function validateAndNormalizeConfig(
  input: unknown,
  configPath: string,
  logger: Pick<Console, 'warn' | 'error'>,
): McpServerConfig {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('servers' in input) ||
    !Array.isArray((input as Record<string, unknown>).servers)
  ) {
    const message = `[mcp-config] Config at ${configPath} must contain a \"servers\" array`;
    logger.error(message);
    throw new McpConfigError(message);
  }

  const servers = (input as { servers: unknown[] }).servers;
  const seenIds = new Set<string>();
  const normalized: McpServerDefinition[] = servers.map((server, index) => {
    if (typeof server !== 'object' || server === null) {
      throwConfigError(
        `Entry at index ${index} must be an object`,
        configPath,
        logger,
      );
    }

    const value = server as Record<string, unknown>;
    const id = value.id;
    if (typeof id !== 'string' || id.trim().length === 0) {
      throwConfigError(
        `Entry at index ${index} must include a non-empty string "id"`,
        configPath,
        logger,
      );
    }

    if (seenIds.has(id)) {
      throwConfigError(
        `Duplicate server id "${id}" found`,
        configPath,
        logger,
      );
    }
    seenIds.add(id);

    const command = value.command;
    if (typeof command !== 'string' || command.trim().length === 0) {
      throwConfigError(
        `Server "${id}" must include a non-empty string "command"`,
        configPath,
        logger,
      );
    }

    let args: string[] = [];
    if ('args' in value) {
      if (!Array.isArray(value.args)) {
        throwConfigError(
          `Server "${id}" has invalid "args"; expected array of strings`,
          configPath,
          logger,
        );
      }
      args = value.args.map((arg, argIndex) => {
        if (typeof arg !== 'string') {
          throwConfigError(
            `Server "${id}" argument at index ${argIndex} must be a string`,
            configPath,
            logger,
          );
        }
        return arg;
      });
    }

    if ('enabled' in value && typeof value.enabled !== 'boolean') {
      throwConfigError(
        `Server "${id}" has invalid "enabled"; expected boolean`,
        configPath,
        logger,
      );
    }
    const enabled =
      'enabled' in value ? (value.enabled as boolean) : (true as boolean);

    const description =
      'description' in value && typeof value.description === 'string'
        ? value.description
        : undefined;

    return {
      id,
      command: command.trim(),
      args,
      description,
      enabled,
    };
  });

  return { servers: normalized };
}

function throwConfigError(
  message: string,
  configPath: string,
  logger: Pick<Console, 'warn' | 'error'>,
): never {
  const formatted = `[mcp-config] ${message} (file: ${configPath})`;
  logger.error(formatted);
  throw new McpConfigError(formatted);
}
