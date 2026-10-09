// GET /s/:net/:id/:swamp (rewritten to /api/share?net=&id=&swamp=)
// A tiny page whose link preview (X, Discord, Telegram) is the Chog's share card, and which
// sends people on to the Chog's journey on the site.
import { describe, loadShareData, parseQuery, type ShareData } from './_lib/chog.js';

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = parseQuery(url.searchParams);
  if (!q) return new Response('Bad request: expected net, id and swamp.', { status: 400 });

  const origin = `${url.protocol}//${url.host}`;
  const target = `${origin}/?net=${q.net}#/chog/${q.id}`;
  const image = `${origin}/api/og?net=${q.net}&id=${q.id}&swamp=${q.swamp}`;

  let data: ShareData | null = null;
  try {
    data = await loadShareData(q);
  } catch {
    // Still serve a page that redirects; the preview just falls back to generic text.
  }
  const { title, text } = data ? describe(data) : { title: 'Ryoko Chog', text: 'Nine swamps. One Chog. Burning $CHOG on Monad.' };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(title)} · Ryoko Chog</title>
<meta name="description" content="${escape(text)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ryoko Chog">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(text)}">
<meta property="og:url" content="${escape(`${origin}/s/${q.net}/${q.id}/${q.swamp}`)}">
<meta property="og:image" content="${escape(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(text)}">
<meta name="twitter:image" content="${escape(image)}">
<meta http-equiv="refresh" content="0; url=${escape(target)}">
</head>
<body>
<p><a href="${escape(target)}">${escape(title)}: see the journey on Ryoko Chog</a></p>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300' },
  });
}
