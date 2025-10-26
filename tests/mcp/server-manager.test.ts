/** @jest-environment node */

import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';

import { McpServerManager } from '@/app/lib/mcp/serverManager';

type MockChildProcess = ChildProcessWithoutNullStreams &
  EventEmitter & {
    kill: jest.Mock<boolean, [NodeJS.Signals | number | undefined]>;
  };

const createMockChildProcess = (): MockChildProcess => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const child = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin,
    kill: jest.fn().mockReturnValue(true),
    pid: Math.floor(Math.random() * 10_000),
    spawnfile: 'mock',
    spawnargs: ['mock'],
    connected: true,
    killed: false,
  });

  return child as MockChildProcess;
};

const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('McpServerManager', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('spawns enabled servers and tracks status', async () => {
    const child = createMockChildProcess();
    const spawnMock = jest.fn().mockReturnValue(child);
    const logger = createLogger();

    const manager = new McpServerManager({
      spawn: spawnMock,
      loadConfig: async () => ({
        servers: [
          {
            id: 'codex',
            command: 'codex-tasks',
            args: ['mcp'],
            description: 'Codex tasks server',
            enabled: true,
          },
          {
            id: 'disabled',
            command: 'noop',
            args: [],
            enabled: false,
          },
        ],
      }),
      env: { CUSTOM_VAR: 'value' },
      logger,
      now: () => 123,
    });

    await manager.start();

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      'codex-tasks',
      ['mcp'],
      expect.objectContaining({
        stdio: 'pipe',
      }),
    );

    const spawnOptions = spawnMock.mock.calls[0][2];
    expect(spawnOptions.env).toMatchObject({ CUSTOM_VAR: 'value' });

    let statuses = manager.getStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      id: 'codex',
      status: 'starting',
      restarts: 0,
    });

    child.emit('spawn');

    statuses = manager.getStatuses();
    expect(statuses[0]).toMatchObject({
      id: 'codex',
      status: 'running',
      restarts: 0,
      lastStartedAt: 123,
    });
    expect(statuses[0].pid).toBe(child.pid);
  });

  it('restarts servers with backoff when they exit unexpectedly', async () => {
    jest.useFakeTimers();
    const child1 = createMockChildProcess();
    const child2 = createMockChildProcess();
    const spawnMock = jest
      .fn()
      .mockReturnValueOnce(child1)
      .mockReturnValueOnce(child2);
    const logger = createLogger();

    const manager = new McpServerManager({
      spawn: spawnMock,
      loadConfig: async () => ({
        servers: [
          {
            id: 'codex',
            command: 'codex-tasks',
            args: ['mcp'],
            enabled: true,
          },
        ],
      }),
      logger,
      backoff: { initialMs: 50, maxMs: 100 },
    });

    await manager.start();
    child1.emit('spawn');

    child1.emit('exit', 1, null);
    let statuses = manager.getStatuses();
    expect(statuses[0]).toMatchObject({
      id: 'codex',
      status: 'restarting',
      restarts: 1,
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(50);
    await Promise.resolve();

    expect(spawnMock).toHaveBeenCalledTimes(2);

    child2.emit('spawn');
    statuses = manager.getStatuses();
    expect(statuses[0]).toMatchObject({
      id: 'codex',
      status: 'running',
      restarts: 1,
    });
  });

  it('stops servers gracefully and prevents restarts', async () => {
    jest.useFakeTimers();
    const child = createMockChildProcess();
    const spawnMock = jest.fn().mockReturnValue(child);
    const logger = createLogger();

    const manager = new McpServerManager({
      spawn: spawnMock,
      loadConfig: async () => ({
        servers: [
          {
            id: 'codex',
            command: 'codex-tasks',
            args: ['mcp'],
            enabled: true,
          },
        ],
      }),
      logger,
    });

    await manager.start();
    child.emit('spawn');

    await manager.stop();

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    child.emit('exit', null, 'SIGTERM');
    jest.advanceTimersByTime(1_000);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const statuses = manager.getStatuses();
    expect(statuses[0]).toMatchObject({
      id: 'codex',
      status: 'stopped',
    });
  });

  it('reloads configuration and restarts changed servers', async () => {
    const child1 = createMockChildProcess();
    const child2 = createMockChildProcess();
    const child3 = createMockChildProcess();

    const spawnMock = jest
      .fn()
      .mockReturnValueOnce(child1)
      .mockReturnValueOnce(child2)
      .mockReturnValueOnce(child3);

    const logger = createLogger();
    const configs = [
      {
        servers: [
          {
            id: 'codex',
            command: 'codex-tasks',
            args: ['mcp'],
            enabled: true,
          },
        ],
      },
      {
        servers: [
          {
            id: 'codex',
            command: 'codex-tasks',
            args: ['mcp', '--verbose'],
            enabled: true,
          },
          {
            id: 'analysis',
            command: 'analysis-tool',
            args: ['start'],
            enabled: true,
          },
        ],
      },
    ];

    let index = 0;
    const manager = new McpServerManager({
      spawn: spawnMock,
      logger,
      loadConfig: async () => configs[index],
    });

    await manager.start();
    child1.emit('spawn');

    index = 1;
    const reloadPromise = manager.reload();
    child1.emit('exit', 0, null);
    await reloadPromise;

    expect(spawnMock).toHaveBeenCalledTimes(3);
    expect(spawnMock.mock.calls[1][0]).toBe('codex-tasks');
    expect(spawnMock.mock.calls[1][1]).toEqual(['mcp', '--verbose']);
    expect(spawnMock.mock.calls[2][0]).toBe('analysis-tool');

    const statuses = manager.getStatuses();
    expect(statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'codex', status: 'starting' }),
        expect.objectContaining({ id: 'analysis', status: 'starting' }),
      ]),
    );
  });
});
