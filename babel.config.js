const config = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' },
      },
    ],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
};

export default config;

// Support CommonJS consumers (Jest) when available.
if (typeof module !== "undefined") {
  // eslint-disable-next-line no-undef
  module.exports = config;
}
