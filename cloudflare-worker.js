/**
 * Cloudflare Worker Proxy for VixSrc
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Go to https://dash.cloudflare.com/
 * 2. Workers & Pages → Create Application → Create Worker
 * 3. Name it something like "vixsrc-proxy"
 * 4. Paste this code and click Deploy
 * 5. Your worker URL will be: https://vixsrc-proxy.<your-subdomain>.workers.dev
 * 6. Set VIXSRC_WORKER_URL environment variable in Render to this URL
 *
 * FREE TIER: 100,000 requests/day
 */

export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                },
            });
        }

        const url = new URL(request.url);

        // Get the target URL from query param
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) {
            return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        try {
            // Forward request to VixSrc with browser-like headers
            const response = await fetch(targetUrl, {
                method: request.method,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://vixsrc.to/',
                    'Origin': 'https://vixsrc.to',
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                },
            });

            // Get response body
            const body = await response.text();

            // Return response with CORS headers
            return new Response(body, {
                status: response.status,
                headers: {
                    'Content-Type': response.headers.get('Content-Type') || 'text/html',
                    'Access-Control-Allow-Origin': '*',
                    'X-Proxied-From': 'cloudflare-worker',
                },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    },
};
