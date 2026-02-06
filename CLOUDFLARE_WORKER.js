export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) {
            return new Response('Missing url parameter', { status: 400 });
        }

        const headers = new Headers({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://vixsrc.to/',
            'Origin': 'https://vixsrc.to',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        });

        const newRequest = new Request(targetUrl, {
            headers: headers,
            method: 'GET',
            redirect: 'follow'
        });

        try {
            const response = await fetch(newRequest, {
                cf: {
                    // Cloudflare-specific optimizations to route through residential-like paths if possible
                    cacheTtl: 60,
                    minify: true
                }
            });

            // Reconstruct the response to ensure CORS headers are set, allowing your Render API to read it
            const newResponse = new Response(response.body, response);
            newResponse.headers.set('Access-Control-Allow-Origin', '*');

            return newResponse;
        } catch (e) {
            return new Response(e.message, { status: 500 });
        }
    }
};
