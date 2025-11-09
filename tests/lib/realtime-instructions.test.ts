import { readFile, stat } from 'node:fs/promises';

import {
  getRealtimeInstructions,
  invalidateRealtimeInstructionsCache,
} from '@/app/lib/realtime-instructions';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
  stat: jest.fn(),
}));

const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockStat = stat as jest.MockedFunction<typeof stat>;

describe('getRealtimeInstructions', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockStat.mockReset();
    invalidateRealtimeInstructionsCache();
  });

  it('returns trimmed instructions and caches by mtime', async () => {
    mockStat.mockResolvedValueOnce({ mtimeMs: 100 } as any);
    mockReadFile.mockResolvedValueOnce('  first draft  ');
    mockStat.mockResolvedValueOnce({ mtimeMs: 100 } as any);

    const first = await getRealtimeInstructions();
    const second = await getRealtimeInstructions();

    expect(first).toBe('first draft');
    expect(second).toBe('first draft');
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('reloads when file mtime changes', async () => {
    mockStat.mockResolvedValueOnce({ mtimeMs: 100 } as any);
    mockReadFile.mockResolvedValueOnce('cached value');
    mockStat.mockResolvedValueOnce({ mtimeMs: 200 } as any);
    mockStat.mockResolvedValueOnce({ mtimeMs: 200 } as any);
    mockReadFile.mockResolvedValueOnce('fresh value');

    await getRealtimeInstructions();
    const next = await getRealtimeInstructions();

    expect(next).toBe('fresh value');
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });

  it('throws when instructions file is empty', async () => {
    mockStat.mockResolvedValueOnce({ mtimeMs: 100 } as any);
    mockReadFile.mockResolvedValueOnce('   ');

    await expect(getRealtimeInstructions()).rejects.toThrow(
      'Failed to load realtime instructions: Realtime instructions file is empty',
    );
  });
});
