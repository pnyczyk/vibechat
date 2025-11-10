import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { createSerializer } from '@emotion/jest';
import { TextEncoder, TextDecoder } from 'node:util';

expect.addSnapshotSerializer(createSerializer());

jest.useRealTimers();
configure({ asyncUtilTimeout: 2000 });

jest.mock('react-markdown', () => require('./mocks/react-markdown'));
jest.mock('remark-gfm', () => () => null);
jest.mock('remark-math', () => () => null);
jest.mock('rehype-katex', () => () => null);

if (typeof global.TextEncoder === 'undefined') {
  // @ts-expect-error - allow assignment for Node test environment
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  // @ts-expect-error - allow assignment for Node test environment
  global.TextDecoder = TextDecoder;
}
