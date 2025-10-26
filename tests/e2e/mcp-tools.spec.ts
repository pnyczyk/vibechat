import { expect, test } from '@playwright/test';

test('MCP catalog handshake and tool invocation flow', async ({ page }) => {
  await page.route('**/api/mcp/catalog', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tools: [
          {
            id: 'server-a:Summarize',
            name: 'Summarize',
            description: 'Summaries',
            permissions: [],
            serverId: 'server-a',
            inputSchema: {},
          },
        ],
        collectedAt: Date.now(),
      }),
    });
  });

  await page.route('**/api/mcp/invoke', async (route) => {
    const body = [
      'data: {"type":"started"}\n\n',
      'data: {"type":"final","outcome":{"output":"Completed"}}\n\n',
    ].join('');
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
      },
      body,
    });
  });

  await page.goto('/');

  await expect(page.getByTestId('mcp-tool-summary')).toHaveText(/MCP tools ready: 1/);

  await page.evaluate(() => {
    const adapter = (window as unknown as {
      __vibeMcpAdapter?: {
        processTransportEventForTesting: (event: Record<string, unknown>) => void;
      };
    }).__vibeMcpAdapter;

    adapter?.processTransportEventForTesting({
      type: 'response.output_item.added',
      item: {
        type: 'mcp_tool_call',
        id: 'item-1',
        name: 'Summarize',
        arguments: JSON.stringify({ text: 'hello' }),
      },
    });
  });

  await expect(page.getByTestId('mcp-tool-runs')).toContainText('Summarize');
});
