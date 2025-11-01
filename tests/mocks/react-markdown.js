const React = require('react');

const INLINE_MATH = /\$([^$]+)\$/g;

const transformInline = (text, keyPrefix) => {
  const nodes = [];
  let lastIndex = 0;
  let match;
  let idx = 0;

  while ((match = INLINE_MATH.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const value = match[1];
    nodes.push(
      React.createElement(
        'span',
        { className: 'katex', key: `${keyPrefix}-math-${idx}` },
        value,
      ),
    );
    lastIndex = match.index + match[0].length;
    idx += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
};

const ReactMarkdownMock = ({ children = '' }) => {
  const blocks = String(children).trim().split(/\n\n+/);
  const elements = [];

  blocks.forEach((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) {
      return;
    }

    if (/^```/.test(trimmed)) {
      const lines = trimmed.split('\n');
      lines.shift();
      const code = lines.join('\n').replace(/```$/, '').trim();
      elements.push(
        React.createElement(
          'pre',
          { key: `code-${index}` },
          React.createElement('code', null, code),
        ),
      );
      return;
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        React.createElement(
          'h1',
          { key: `h1-${index}` },
          transformInline(trimmed.slice(2), `h1-${index}`),
        ),
      );
      return;
    }

    if (trimmed.includes('\n|')) {
      const [header, , ...rows] = trimmed.split('\n');
      elements.push(
        React.createElement(
          'table',
          { key: `table-${index}` },
          React.createElement(
            'thead',
            null,
            React.createElement(
              'tr',
              null,
              header
                .split('|')
                .map((cell) => cell.trim())
                .filter(Boolean)
                .map((cell, cellIdx) =>
                  React.createElement('th', { key: `th-${index}-${cellIdx}` }, cell),
                ),
            ),
          ),
          React.createElement(
            'tbody',
            null,
            rows.map((row, rowIdx) =>
              React.createElement(
                'tr',
                { key: `row-${index}-${rowIdx}` },
                row
                  .split('|')
                  .map((cell) => cell.trim())
                  .filter(Boolean)
                  .map((cell, cellIdx) =>
                    React.createElement('td', { key: `td-${index}-${rowIdx}-${cellIdx}` }, cell),
                  ),
              ),
            ),
          ),
        ),
      );
      return;
    }

    elements.push(
      React.createElement(
        'p',
        { key: `p-${index}` },
        transformInline(trimmed, `p-${index}`),
      ),
    );
  });

  return React.createElement(React.Fragment, null, elements);
};

module.exports = ReactMarkdownMock;
module.exports.default = ReactMarkdownMock;
