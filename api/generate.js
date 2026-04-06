export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const eventName = body.eventName || '';

    // 1단계: 빠른 모델로 핵심 정보만 웹서치
    let searchInfo = '';
    try {
      const searchRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
          messages: [{
            role: 'user',
            content: eventName + ' 공식 정보를 검색해서 아래 항목만 한국어로 짧게 답해줘:\n기간:\n장소:\n주최/주관:\n홈페이지:\nSNS:'
          }]
        }),
      });

      const searchData = await searchRes.json();
      if (searchData.content) {
        searchInfo = searchData.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
      }
    } catch(e) {
      searchInfo = '';
    }

    // 2단계: 리서치 정보 합쳐서 블로그 글 생성
    const messages = body.messages || [];
    const lastMsg = messages[messages.length - 1];
    const enrichedContent = lastMsg.content + (searchInfo ? '\n\n[웹 리서치 결과 — 아래 정보를 행사 개요에 반영할 것]\n' + searchInfo : '');
    const enrichedMessages = messages.slice(0, -1).concat([{
      role: lastMsg.role,
      content: enrichedContent
    }]);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: enrichedMessages,
      }),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
