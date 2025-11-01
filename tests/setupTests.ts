import '@testing-library/jest-dom';
import { createSerializer } from '@emotion/jest';
import { TextEncoder, TextDecoder } from 'node:util';

expect.addSnapshotSerializer(createSerializer());

if (typeof global.TextEncoder === 'undefined') {
  // @ts-expect-error - allow assignment for Node test environment
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  // @ts-expect-error - allow assignment for Node test environment
  global.TextDecoder = TextDecoder;
}
