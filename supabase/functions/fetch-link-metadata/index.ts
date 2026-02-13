// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function extractContent(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  return match?.[1]?.replace(/\s+/g, ' ').trim();
}

function detectPublication(html: string): string | undefined {
  return (
    extractContent(html, /<meta\s+property="og:site_name"\s+content="([^"]+)"/i) ||
    extractContent(html, /<meta\s+name="citation_journal_title"\s+content="([^"]+)"/i) ||
    extractContent(html, /<meta\s+name="twitter:site"\s+content="([^"]+)"/i)
  );
}

serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    const body = (await req.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.endsWith('jw.org') && !hostname.endsWith('wol.jw.org')) {
      return new Response(
        JSON.stringify({
          title: undefined,
          publication_name: undefined,
          section_heading: undefined,
          fallback: true
        }),
        {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' }
        }
      );
    }

    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Bible Study Journal Metadata Fetcher)'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page (${response.status})`);
    }

    const html = await response.text();

    const title =
      extractContent(html, /<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
      extractContent(html, /<title>([^<]+)<\/title>/i);

    const sectionHeading =
      extractContent(html, /<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
      extractContent(html, /<h1[^>]*>([^<]+)<\/h1>/i);

    const publicationName = detectPublication(html);

    return new Response(
      JSON.stringify({
        title,
        publication_name: publicationName,
        section_heading: sectionHeading,
        fallback: false
      }),
      {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      }
    );
  } catch (_error: any) {
    return new Response(
      JSON.stringify({
        title: undefined,
        publication_name: undefined,
        section_heading: undefined,
        fallback: true
      }),
      {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      }
    );
  }
});
