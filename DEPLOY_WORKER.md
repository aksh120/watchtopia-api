# How to Fix "Blocked" Errors on Render (The Free Solution)

Since standard cloud IPs (like Render) are blocked by VixSrc, you need a "middleman" that isn't blocked. Cloudflare Workers are perfect for this because they are free and have whitelisted/varied IPs.

### Steps to Deploy (5 minutes)

1.  **Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)** (Create a free account if you don't have one).
2.  Go to **Workers & Pages**.
3.  Click **Create Application** -> **Create Worker**.
4.  Name it something like `vix-proxy`.
5.  Click **Deploy**.
6.  Once deployed, click **Edit Code**.
7.  **Delete** the existing code in `worker.js`.
8.  **Copy & Paste** the code from the `CLOUDFLARE_WORKER.js` file in this repository.
9.  Click **Save and Deploy**.
10. Copy your Worker's URL (e.g., `https://vix-proxy.yourname.workers.dev`).

### Link to Your API

1.  Go to your **Render Dashboard**.
2.  Select your `watchtopia-api` service.
3.  Go to **Environment**.
4.  Add a new Environment Variable:
    *   **Key**: `VIXSRC_PROXY`
    *   **Value**: `https://vix-proxy.yourname.workers.dev` (The URL you copied)
5.  Render will redeploy automatically.

**Result**: Your API will request the Cloudflare Worker -> Worker requests VixSrc (Bypassing block) -> Returns data to API.
