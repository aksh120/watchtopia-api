import { httpServerHandler } from "cloudflare:node";
import bootstrap from "./app.js";

let server: any;
let app: any;

async function getApp() {
    if (!app) {
        console.log("[Worker] Bootstrapping app...");
        server = await bootstrap();
        console.log("[Worker] App bootstrapped, getting instance...");
        app = server.getInstance();
        console.log("[Worker] Waiting for app.ready()...");
        await app.ready();
        console.log("[Worker] app.ready() finished!");
    }
    return app;
}

export default {
    async fetch(request: any, env: any, ctx: any) {
        console.log("[Worker] Fetch event received:", request.url);
        const appInstance = await getApp();
        console.log("[Worker] App instance retrieved, calling httpServerHandler...");
        const handler = httpServerHandler(appInstance.server as any);
        console.log("[Worker] Calling handler.fetch...");
        const res = await handler.fetch!(request, env, ctx);
        console.log("[Worker] handler.fetch finished, status:", res.status);
        return res;
    }
};
