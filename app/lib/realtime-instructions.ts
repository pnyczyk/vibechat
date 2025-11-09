import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const instructionsPath = path.join(process.cwd(), 'config/instructions.md');

type CacheEntry = {
  mtimeMs: number;
  value: string;
};

let cached: CacheEntry | null = null;

async function readInstructionsFile(): Promise<CacheEntry> {
  const fileStat = await stat(instructionsPath);
  const buffer = await readFile(instructionsPath, 'utf-8');
  const value = buffer.trim();
  if (!value) {
    throw new Error('Realtime instructions file is empty');
  }
  return { mtimeMs: fileStat.mtimeMs, value };
}

export async function getRealtimeInstructions(): Promise<string> {
  try {
    if (!cached) {
      cached = await readInstructionsFile();
      return cached.value;
    }

    const fileStat = await stat(instructionsPath);
    if (fileStat.mtimeMs !== cached.mtimeMs) {
      cached = await readInstructionsFile();
    }

    return cached.value;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown instructions load error';
    throw new Error(`Failed to load realtime instructions: ${message}`);
  }
}

export function invalidateRealtimeInstructionsCache(): void {
  cached = null;
}
