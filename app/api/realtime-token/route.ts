import { NextResponse } from 'next/server';

import { getRealtimeInstructions } from '@/app/lib/realtime-instructions';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = 'gpt-realtime';

export async function GET() {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Server is missing OPENAI_API_KEY' },
      { status: 500 },
    );
  }

  let instructions: string;
  try {
    instructions = await getRealtimeInstructions();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load instructions';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return NextResponse.json(
        {
          error: 'Failed to create realtime client secret',
          details: errorBody,
        },
        { status: response.status },
      );
    }

    const secret = await response.json();
    return NextResponse.json(secret);
  } catch (error) {
    console.error('Failed to request realtime client secret', error);
    return NextResponse.json(
      { error: 'Unexpected error while requesting realtime client secret' },
      { status: 500 },
    );
  }
}
