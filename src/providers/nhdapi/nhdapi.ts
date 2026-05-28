import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Subtitle,
    AudioTrack,
    Diagnostic,
    Source,
    SourceType
} from '@omss/framework';
import { BaseProvider } from '@omss/framework';
import { ApiResponse, EncryptedPayload, Switch, TvFallbackResponse } from './nhdapi.types.js';
import { decryptStreamMafia } from './decrypt.js';
import { generateRandomUserAgent } from '../../utils/ua.js';

export class NhdApiProvider extends BaseProvider {
    readonly id = 'nhdapi';
    readonly name = 'NHD API';
    readonly enabled = true;
    readonly BASE_URL = 'https://player.nhdapi.com';
    readonly HEADERS = {
        'User-Agent': '',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: this.BASE_URL + '/',
        Origin: this.BASE_URL,
        Cookie: '',
        'x-api-token': '',
        'x-content-id': ''
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        try {
            this.HEADERS['User-Agent'] = generateRandomUserAgent();
            this.HEADERS['x-content-id'] = media.tmdbId.toString();

            const cookie: string = await this.getSessionCookie();
            if (!cookie) {
                return this.emptyResult('Failed to retrieve session cookie');
            }

            this.HEADERS.Cookie =
                cookie.split(';')[0] ||
                'vid_session=' +
                    Buffer.from(
                        JSON.stringify({
                            id: media.tmdbId,
                            iat: Math.floor(Date.now() / 1000)
                        })
                    ).toString('base64');

            await new Promise((resolve) => setTimeout(resolve, 100));

            const token: string = await this.getToken();
            if (!token) {
                return this.emptyResult('Failed to retrieve access token');
            }

            this.HEADERS['x-api-token'] = token;

            const url = `${this.BASE_URL}/api/movie/?id=${media.tmdbId}`;
            const encrypted = await this.fetchPage(url);

            if (!encrypted) {
                return this.emptyResult('Invalid API response');
            }

            const api = decryptStreamMafia(encrypted) as ApiResponse;
            return await this.mapApiResponse(api);
        } catch (err) {
            return this.emptyResult(
                err instanceof Error ? err.message : 'Unknown error'
            );
        }
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        try {
            this.HEADERS['User-Agent'] = generateRandomUserAgent();
            this.HEADERS['x-content-id'] = media.tmdbId.toString();

            const cookie: string = await this.getSessionCookie();
            if (!cookie) {
                return this.emptyResult('Failed to retrieve session cookie');
            }

            this.HEADERS.Cookie =
                cookie.split(';')[0] ||
                'vid_session=' +
                    Buffer.from(
                        JSON.stringify({
                            id: media.tmdbId,
                            iat: Math.floor(Date.now() / 1000)
                        })
                    ).toString('base64');

            await new Promise((resolve) => setTimeout(resolve, 100));

            const token: string = await this.getToken();
            if (!token) {
                return this.emptyResult('Failed to retrieve access token');
            }

            this.HEADERS['x-api-token'] = token;

            const packages = await this.getActivePackages();

            const results = await Promise.allSettled(
                packages.map(async (pkg) => {
                    const url = `${this.BASE_URL}/api/v3/fallback?type=tv&id=${media.tmdbId}&s=${media.s}&e=${media.e}&pkg=${pkg}`;
                    const encrypted = await this.fetchPage(url);
                    if (!encrypted) return null;
                    const decrypted = decryptStreamMafia(encrypted) as TvFallbackResponse;
                    return decrypted;
                })
            );

            const sources: Source[] = [];
            const subtitles: Subtitle[] = [];
            const diagnostics: Diagnostic[] = [];

            const fallbackAudio: AudioTrack = {
                language: 'unknown',
                label: 'Unknown'
            };

            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) {
                    const decrypted = r.value;
                    const url = decrypted.url;
                    if (url) {
                        const parsedQuality = this.normalizeQuality(decrypted.quality || 'auto');
                        const proxyUrl = this.createProxyUrl(url, {
                            ...this.HEADERS,
                            Referer: this.BASE_URL + '/',
                            Origin: this.BASE_URL
                        });
                        const type = this.inferSourceType(url);

                        if (type === 'hls') {
                            const hlsSources = await this.resolveHLS(
                                proxyUrl,
                                fallbackAudio,
                                parsedQuality,
                                url
                            );
                            for (const s of hlsSources) {
                                if ((s.quality === 'auto' || s.quality === 'unknown') && parsedQuality !== 'unknown' && parsedQuality !== 'auto') {
                                    s.quality = parsedQuality;
                                }
                            }
                            sources.push(...hlsSources);
                        } else {
                            sources.push({
                                url: proxyUrl,
                                type,
                                quality: parsedQuality,
                                audioTracks: [fallbackAudio],
                                provider: {
                                    id: this.id,
                                    name: this.name
                                },
                                rawUrl: url
                            } as any as Source);
                        }
                    }
                }
            }

            if (sources.length === 0) {
                diagnostics.push({
                    code: 'PROVIDER_ERROR',
                    message: `${this.name}: No TV sources found`,
                    field: '',
                    severity: 'error'
                });
            }

            // Deduplicate and filter languages
            const seen = new Set<string>();
            const deduped: Source[] = [];

            for (const s of sources) {
                if (seen.has(s.url)) continue;

                const isAllowed =
                    s.audioTracks.length === 0 ||
                    s.audioTracks.some(
                        (t: AudioTrack) =>
                            this.isAllowedLanguage(t.language) ||
                            this.isAllowedLanguage(t.label)
                    );

                if (!isAllowed) continue;

                seen.add(s.url);
                deduped.push(s);
            }

            return { sources: this.sortSourcesByQuality(deduped), subtitles, diagnostics };
        } catch (err) {
            return this.emptyResult(
                err instanceof Error ? err.message : 'Unknown error'
            );
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const res = await fetch(this.BASE_URL, {
                method: 'HEAD',
                headers: this.HEADERS,
                signal: AbortSignal.timeout(6000)
            });
            return res.status === 200;
        } catch {
            return false;
        }
    }

    private async getToken(): Promise<string> {
        try {
            const res = await fetch(`${this.BASE_URL}/api/token`, {
                headers: { ...this.HEADERS },
                referrer: this.BASE_URL + '/',
                signal: AbortSignal.timeout(6000)
            });
            if (res.status !== 200) return '';
            const data = (await res.json()) as { token?: string };
            return data.token || '';
        } catch {
            return '';
        }
    }

    private async getSessionCookie(): Promise<string> {
        try {
            const res = await fetch(this.BASE_URL + '/api/session', {
                method: 'POST',
                headers: this.HEADERS,
                body: null,
                signal: AbortSignal.timeout(6000)
            });
            return res.headers.get('Set-Cookie') || '';
        } catch {
            return '';
        }
    }

    private async getActivePackages(): Promise<string[]> {
        const fallbackPackages = ['Hydra', 'Titan', 'Nexus', 'Inferno', 'BKC'];
        try {
            const res = await fetch('https://embedmafia.in/', {
                headers: {
                    'User-Agent': generateRandomUserAgent(),
                    Accept: 'application/json'
                },
                signal: AbortSignal.timeout(6000)
            });
            if (res.status !== 200) {
                return fallbackPackages;
            }
            const data = (await res.json()) as { servers?: Array<{ name: string; active: boolean }> };
            if (data && Array.isArray(data.servers)) {
                const active = data.servers
                    .filter((s) => s.active && s.name)
                    .map((s) => s.name);
                if (active.length > 0) {
                    return active;
                }
            }
            return fallbackPackages;
        } catch {
            return fallbackPackages;
        }
    }

    private async fetchPage(url: string): Promise<EncryptedPayload | null> {
        try {
            const res = await fetch(url, {
                headers: this.HEADERS,
                signal: AbortSignal.timeout(6000)
            });
            if (res.status !== 200) return null;
            return (await res.json()) as EncryptedPayload;
        } catch {
            return null;
        }
    }

    private async mapApiResponse(api: ApiResponse): Promise<ProviderResult> {
        const sources: Source[] = [];
        const subtitles: Subtitle[] = [];
        const diagnostics: Diagnostic[] = [];

        const fallbackAudio = this.extractAudioTrack(api.selected);

        // main stream
        const mainSources = await this.extractSourcesFromApi(
            api,
            fallbackAudio
        );
        sources.push(...mainSources);

        // switches in parallel
        if ((api.switches?.length ?? 0) > 0) {
            const switchResults = await Promise.all(
                api.switches.map((sw) => this.resolveSwitch(sw))
            );

            for (const result of switchResults) {
                sources.push(...result);
            }
        }

        if (sources.length === 0) {
            diagnostics.push({
                code: 'PROVIDER_ERROR',
                message: `${this.name}: No playable sources found`,
                field: '',
                severity: 'error'
            });
        }

        // dedupe and filter by language
        const seen = new Set<string>();
        const deduped: Source[] = [];

        for (const s of sources) {
            if (seen.has(s.url)) continue;

            const isAllowed =
                s.audioTracks.length === 0 ||
                s.audioTracks.some(
                    (t: AudioTrack) =>
                        this.isAllowedLanguage(t.language) ||
                        this.isAllowedLanguage(t.label)
                );

            if (!isAllowed) continue;

            seen.add(s.url);
            deduped.push(s);
        }

        return { sources: this.sortSourcesByQuality(deduped), subtitles, diagnostics };
    }

    private isAllowedLanguage(lang?: string): boolean {
        if (!lang) return true; // Allow unknown as it's often English
        const l = lang.toLowerCase();
        const allowed = ['en', 'eng', 'english', 'hi', 'hin', 'hindi'];
        return allowed.includes(l);
    }

    private async resolveSwitch(sw: Switch): Promise<Source[]> {
        try {
            const url = `${this.BASE_URL}/api/source/${sw.file_code}`;
            const encrypted = await this.fetchPage(url);

            if (!encrypted) return [];

            const api = decryptStreamMafia(encrypted) as ApiResponse;

            const fallbackAudio: AudioTrack = {
                language: sw.lang_code?.toLowerCase() || 'unknown',
                label: sw.lang || sw.lang_code || 'Unknown'
            };

            return await this.extractSourcesFromApi(api, fallbackAudio);
        } catch {
            return [];
        }
    }

    private async extractSourcesFromApi(
        api: ApiResponse,
        fallbackAudio: AudioTrack
    ): Promise<Source[]> {
        const sources: Source[] = [];

        if (api.stream?.hls_streaming) {
            const hlsSources = await this.resolveHLS(
                this.createProxyUrl(api.stream.hls_streaming, {
                    ...this.HEADERS,
                    Referer: this.BASE_URL + '/',
                    Origin: this.BASE_URL
                }),
                fallbackAudio,
                'auto',
                api.stream.hls_streaming
            );
            const filteredHls = hlsSources.filter((s) =>
                s.audioTracks.every(
                    (t) =>
                        this.isAllowedLanguage(t.language) ||
                        this.isAllowedLanguage(t.label)
                )
            );
            sources.push(...filteredHls);
        }

        for (const download of api.stream?.download ?? []) {
            sources.push({
                url: this.createProxyUrl(download.url, {
                    ...this.HEADERS,
                    Referer: this.BASE_URL + '/',
                    Origin: this.BASE_URL
                }),
                type: this.inferSourceType(download.url),
                quality: this.normalizeQuality(download.quality),
                audioTracks: [fallbackAudio],
                provider: {
                    id: this.id,
                    name: this.name
                },
                rawUrl: download.url
            } as any as Source);
        }

        const allowedQualities = ['360p', '480p', '720p', '1080p', '4k'];
        return sources.filter(
            (s) =>
                allowedQualities.includes(s.quality) &&
                s.audioTracks.length <= 1
        );
    }

    private extractAudioTrack(selected: ApiResponse['selected']): AudioTrack {
        const language =
            selected?.lang_code?.trim().toLowerCase() ||
            selected?.lang?.trim().toLowerCase() ||
            'unknown';

        const label =
            selected?.lang?.trim() ||
            selected?.lang_code?.toUpperCase() ||
            'Unknown';

        return { language, label };
    }

    private async resolveHLS(
        url: string,
        fallbackAudio: AudioTrack,
        originalQuality: string,
        rawUrl?: string
    ): Promise<Source[]> {
        try {
            const res = await fetch(url, {
                headers: {
                    ...this.HEADERS,
                    Referer: this.BASE_URL + '/'
                },
                signal: AbortSignal.timeout(6000)
            });

            const content: string = await res.text();
            const variants = this.parseVariants(content, url);
            const rawVariants = rawUrl ? this.parseVariants(content, rawUrl) : [];
            const audioTracks = this.parseAudioTracks(content);
            const tracks =
                audioTracks.length > 0 ? audioTracks : [fallbackAudio];

            if (variants.length === 0) {
                return [
                    {
                        url,
                        type: 'hls',
                        quality: 'auto',
                        audioTracks: tracks,
                        provider: { id: this.id, name: this.name },
                        rawUrl: rawUrl || url
                    } as any as Source
                ];
            }

            return variants.map((v, idx) => ({
                url: v.url,
                type: 'hls',
                quality: this.normalizeQuality(`${v.resolution}p`),
                audioTracks: tracks,
                provider: { id: this.id, name: this.name },
                rawUrl: rawVariants[idx]?.url || v.url
            } as any as Source));
        } catch {
            return [
                {
                    url,
                    type: 'hls',
                    quality: 'auto',
                    audioTracks: [fallbackAudio],
                    provider: { id: this.id, name: this.name },
                    rawUrl: rawUrl || url
                } as any as Source
            ];
        }
    }

    private parseVariants(
        content: string,
        baseUrl: string
    ): Array<{ resolution: number; url: string }> {
        const variants: Array<{ resolution: number; url: string }> = [];
        const regex =
            /#EXT-X-STREAM-INF:.*RESOLUTION=\d+x(\d+).*\n(?:#[^\n]*\n)*([^#\n][^\n]*)/g;

        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            const resolution = parseInt(match[1], 10);
            let variantUrl = match[2].trim();

            if (!variantUrl.startsWith('http') && !variantUrl.startsWith('/')) {
                // relative to baseUrl
                const parts = baseUrl.split('?')[0].split('/');
                parts.pop();
                variantUrl = parts.join('/') + '/' + variantUrl;
            } else if (variantUrl.startsWith('/')) {
                // relative to origin of baseUrl
                try {
                    const urlObj = new URL(baseUrl);
                    variantUrl = urlObj.origin + variantUrl;
                } catch {
                    // fallback if baseUrl is not a full URL
                }
            }

            variants.push({ resolution, url: variantUrl });
        }

        return variants;
    }

    private parseAudioTracks(content: string): AudioTrack[] {
        const tracks: AudioTrack[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            if (!line.includes('TYPE=AUDIO')) continue;

            const language =
                line.match(/LANGUAGE="([^"]+)"/)?.[1]?.toLowerCase() ??
                'unknown';
            const label = line.match(/NAME="([^"]+)"/)?.[1] ?? language;

            tracks.push({ language, label });
        }

        return tracks;
    }

    private inferSourceType(url: string): SourceType {
        const clean = url.toLowerCase().split('?')[0];

        if (clean.endsWith('.m3u8')) return 'hls';
        if (clean.endsWith('.mpd')) return 'dash';
        if (clean.endsWith('.mp4')) return 'mp4';
        if (clean.endsWith('.mkv')) return 'mkv';
        if (clean.endsWith('.webm')) return 'webm';

        return 'hls';
    }

    private normalizeQuality(value?: string): string {
        if (!value) return 'unknown';

        const v = value.toLowerCase();

        if (v.includes('2160') || v.includes('4k')) return '4k';
        if (v.includes('1080')) return '1080p';
        if (v.includes('720')) return '720p';
        if (v.includes('480') || v.includes('482')) return '480p';
        if (v.includes('360') || v.includes('358')) return '360p';

        return value;
    }

    private sortSourcesByQuality(sources: Source[]): Source[] {
        const qualityPriority: Record<string, number> = {
            '4k': 5,
            '1080p': 4,
            '720p': 3,
            '480p': 2,
            '360p': 1,
            'auto': 0,
            'unknown': -1
        };

        return sources.sort((a, b) => {
            const prioA = qualityPriority[a.quality] ?? -2;
            const prioB = qualityPriority[b.quality] ?? -2;
            return prioB - prioA;
        });
    }

    private emptyResult(message: string): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [
                {
                    code: 'PROVIDER_ERROR',
                    message: `${this.name}: ${message}`,
                    field: '',
                    severity: 'error'
                }
            ]
        };
    }
}
