import { BaseProvider } from '@omss/framework';
import type {
    Diagnostic,
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Source,
    SourceType,
    Subtitle,
    SubtitleFormat,
    AudioTrack
} from '@omss/framework';

import decrypt from './decrypt.js';
import type {
    ServerMap,
    SupportedServer,
    klikxxiResponse,
    allmoviesResponse,
    onehdResponse,
    hollymoviehdResponse,
    vidlinkResponse,
    purstreamResponse,
    deltaResponse,
    movieboxSource
} from './vidnest.types.js';

export class VidNestProvider extends BaseProvider {
    readonly id = 'vidnest';
    readonly name = 'VidNest';
    readonly enabled = true;

    readonly BASE_URL = 'https://vidnest.fun';
    readonly API_BASE_URL = 'https://new.vidnest.fun';

    readonly HEADERS: Record<string, string> = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `${this.BASE_URL}/`,
        Origin: this.BASE_URL
    };

    /**
     * ALL servers (some unsupported)
     */
    private readonly SERVERS: { path: string; query: string }[] = [
        { path: 'moviebox', query: '' },
        { path: 'allmovies', query: '' },
        { path: 'catflix', query: '' },
        { path: 'purstream', query: '' },
        { path: 'hollymoviehd', query: '' },
        { path: 'lamda', query: '' },
        { path: 'flixhq', query: '' },
        { path: 'vidlink', query: '' },
        { path: 'onehd', query: '?server=upcloud' },
        { path: 'klikxxi', query: '' }
    ];

    /**
     * ✅ ONLY supported servers (typed)
     */
    private readonly handlers: {
        [K in SupportedServer]: {
            parse: (data: string) => ServerMap[K];
            mapSources: (root: ServerMap[K]) => Source[];
            mapSubtitles: (root: ServerMap[K]) => Subtitle[];
        };
    } = {
        klikxxi: {
            parse: (d) => decrypt<klikxxiResponse>(d),
            mapSources: (root) =>
                root.sources.map((s) => ({
                    url: this.createProxyUrl(s.url, this.HEADERS),
                    type: this.inferSourceType(s.type, s.url),
                    quality: s.quality,
                    audioTracks: [],
                    provider: { id: this.id, name: this.name }
                })),
            mapSubtitles: () => []
        },

        allmovies: {
            parse: (d) => decrypt<allmoviesResponse>(d),
            mapSources: (root) =>
                root.streams.map((s) => ({
                    url: this.createProxyUrl(s.url, s.headers),
                    type: this.inferSourceType(s.type, s.url),
                    quality: 'Auto',
                    audioTracks: [{ language: s.language, label: s.language }],
                    provider: { id: this.id, name: this.name }
                })),
            mapSubtitles: () => []
        },

        onehd: {
            parse: (d) => decrypt<onehdResponse>(d),
            mapSources: (root) => [
                {
                    url: this.createProxyUrl(root.url, root.headers),
                    type: this.inferSourceType('', root.url),
                    quality: 'Auto',
                    audioTracks: [{ language: 'English', label: 'eng' }],
                    provider: { id: this.id, name: this.name }
                }
            ],
            mapSubtitles: (root) =>
                root.subtitles.map((s) => ({
                    url: this.createProxyUrl(s.url, root.headers),
                    label: s.lang,
                    format: this.inferSubtitleFormat(s.url)
                }))
        },

        hollymoviehd: {
            parse: (d) => decrypt<hollymoviehdResponse>(d),
            mapSources: (root) =>
                root.sources.map((s) => ({
                    url: this.createProxyUrl(s.file, this.HEADERS),
                    type: this.inferSourceType(s.type, s.file),
                    quality: s.label,
                    audioTracks: [{ language: 'English', label: 'eng' }],
                    provider: { id: this.id, name: this.name }
                })),
            mapSubtitles: () => []
        },

        vidlink: {
            parse: (d) => decrypt<vidlinkResponse>(d),
            mapSources: (root) => [
                {
                    url: this.createProxyUrl(
                        this.fixVidlinkUrl(root.data.stream.playlist),
                        root.headers
                    ),
                    type: this.inferSourceType(
                        root.data.stream.type,
                        root.data.stream.playlist
                    ),
                    quality: 'Auto',
                    audioTracks: [{ language: 'English', label: 'eng' }],
                    provider: { id: this.id, name: this.name }
                }
            ],
            mapSubtitles: (root) =>
                root.data.stream.captions.map((c) => ({
                    url: this.createProxyUrl(c.url, root.headers),
                    label: c.language,
                    format: this.inferSubtitleFormat(c.url)
                }))
        },

        delta: {
            parse: (d) => decrypt<deltaResponse>(d),
            mapSources: (root) =>
                root.streams.map((s) => ({
                    url: this.createProxyUrl(s.url, this.HEADERS),
                    type: this.inferSourceType(s.type, s.url),
                    quality: 'Auto',
                    audioTracks: [
                        { language: s.language.slice(0, 3), label: s.language }
                    ],
                    provider: { id: this.id, name: this.name }
                })),
            mapSubtitles: () => []
        },

        purstream: {
            parse: (d) => decrypt<purstreamResponse>(d),
            mapSources: (root) =>
                root.sources.map((s) => ({
                    url: this.createProxyUrl(s.url, this.HEADERS),
                    type: this.inferSourceType(s.format, s.url),
                    quality: s.name,
                    audioTracks: [{ language: 'French', label: 'fr' }],
                    provider: { id: this.id, name: this.name }
                })),
            mapSubtitles: () => []
        },

        moviebox: {
            parse: (d) => decrypt<movieboxSource>(d),
            mapSources: (root) =>
                root.url.map((u) => ({
                    url: this.createProxyUrl(u.link, this.HEADERS),
                    type: this.inferSourceType(u.type, u.link),
                    quality: 'Auto',
                    audioTracks: [
                        { language: u.lang.slice(0, 3), label: u.lang }
                    ],
                    provider: { id: this.id, name: this.name }
                })),
            mapSubtitles: () => []
        }
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    private async getSources(
        media: ProviderMediaObject
    ): Promise<ProviderResult> {
        const sources: Source[] = [];
        const subtitles: Subtitle[] = [];
        const diagnostics: Diagnostic[] = [];

        const promises = this.SERVERS.map((server) => {
            const url =
                media.type === 'movie'
                    ? this.buildMovieUrl(media, server.path) + server.query
                    : this.buildTvUrl(media, server.path) + server.query;

            return this.fetchVidnest(url);
        });

        const results = await Promise.allSettled(promises);

        const hlsCache = new Map<string, Promise<Source[]>>();

        const serverProcesses = results.map(async (result, i) => {
            if (result.status !== 'fulfilled') return null;

            const server = this.SERVERS[i];
            const handler = this.handlers[server.path as SupportedServer];

            if (!handler) {
                return {
                    sources: [],
                    subtitles: [],
                    diagnostic: {
                        code: 'PARTIAL_SCRAPE',
                        field: '',
                        message: `${this.name}: ${server.path} returned sources, but we don't have a handler for it yet (check for updates: https://github.com/cinepro-org/core).`,
                        severity: 'warning'
                    } as Diagnostic
                };
            }

            const key = server.path as SupportedServer;
            const res = await this.handleServer(
                key,
                result.value.data,
                hlsCache
            );
            return { ...res, diagnostic: null };
        });

        const processResults = await Promise.all(serverProcesses);

        for (const res of processResults) {
            if (!res) continue;
            sources.push(...res.sources);
            subtitles.push(...res.subtitles);
            if (res.diagnostic) diagnostics.push(res.diagnostic);
        }

        const allowedQualities = ['360p', '480p', '720p', '1080p', '4k'];
        const finalSources = sources.filter((s) =>
            allowedQualities.includes(s.quality)
        );

        return {
            sources: this.sortSources(finalSources),
            subtitles,
            diagnostics
        };
    }

    private sortSources(sources: Source[]): Source[] {
        const qualityOrder: Record<string, number> = {
            '4k': 5,
            '1080p': 4,
            '720p': 3,
            '480p': 2,
            '360p': 1
        };

        return [...sources].sort((a, b) => {
            const aLang = a.audioTracks[0]?.language.toLowerCase() || '';
            const bLang = b.audioTracks[0]?.language.toLowerCase() || '';

            const isEng = (l: string) => ['en', 'eng', 'english'].includes(l);
            const isHin = (l: string) => ['hi', 'hin', 'hindi'].includes(l);

            const aEng = isEng(aLang);
            const bEng = isEng(bLang);
            if (aEng && !bEng) return -1;
            if (!aEng && bEng) return 1;

            const aHin = isHin(aLang);
            const bHin = isHin(bLang);
            if (aHin && !bHin) return -1;
            if (!aHin && bHin) return 1;

            const aQ = qualityOrder[a.quality] ?? 0;
            const bQ = qualityOrder[b.quality] ?? 0;
            return bQ - aQ;
        });
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

    private formatSubtitleLabel(label: string): string {
        const map: Record<string, string> = {
            en: 'English',
            eng: 'English',
            fr: 'French',
            fre: 'French',
            es: 'Spanish',
            spa: 'Spanish',
            de: 'German',
            ger: 'German',
            deu: 'German',
            it: 'Italian',
            ita: 'Italian',
            hi: 'Hindi',
            hin: 'Hindi',
            pt: 'Portuguese',
            por: 'Portuguese',
            ru: 'Russian',
            rus: 'Russian',
            ar: 'Arabic',
            ara: 'Arabic',
            zh: 'Chinese',
            chi: 'Chinese',
            zho: 'Chinese',
            ja: 'Japanese',
            jpn: 'Japanese',
            ko: 'Korean',
            kor: 'Korean',
            ind: 'Indonesian',
            id: 'Indonesian',
            ms: 'Malay',
            may: 'Malay',
            vi: 'Vietnamese',
            vie: 'Vietnamese',
            th: 'Thai',
            tha: 'Thai',
            tur: 'Turkish',
            tr: 'Turkish'
        };
        const low = label.toLowerCase().trim();
        return map[low] ?? label.charAt(0).toUpperCase() + label.slice(1);
    }

    private isAllowedLanguage(lang?: string): boolean {
        if (!lang) return true; // Allow unknown as it's often English
        const l = lang.toLowerCase();
        const allowed = ['en', 'eng', 'english', 'hi', 'hin', 'hindi'];
        return allowed.includes(l);
    }

    private async handleServer<K extends SupportedServer>(
        key: K,
        data: string,
        hlsCache: Map<string, Promise<Source[]>>
    ): Promise<{ sources: Source[]; subtitles: Subtitle[] }> {
        const handler = this.handlers[key];
        const root = handler.parse(data);
        const rawSources = handler.mapSources(root);

        const sourcePromises = rawSources.map(async (s) => {
            // Filter by language and track count
            if (s.audioTracks.length > 1) return [];
            
            const allTracksAllowed =
                s.audioTracks.length === 0 ||
                s.audioTracks.every(
                    (t) =>
                        this.isAllowedLanguage(t.language) ||
                        this.isAllowedLanguage(t.label)
                );

            if (!allTracksAllowed) return [];

            if (s.type === 'hls' || s.url.includes('.m3u8')) {
                const flattened = await this.resolveHLSCached(
                    s.url,
                    s.audioTracks[0] || { language: 'English', label: 'eng' },
                    this.normalizeQuality(s.quality),
                    hlsCache
                );
                const allowedQualities = [
                    '360p',
                    '480p',
                    '720p',
                    '1080p',
                    '4k'
                ];
                return flattened.filter((f) =>
                    allowedQualities.includes(f.quality) && f.audioTracks.length <= 1
                );
            }

            const quality = this.normalizeQuality(s.quality);
            if (quality.toLowerCase() === 'auto') return [];

            return [
                {
                    ...s,
                    quality
                }
            ];
        });

        const resolvedSources = (await Promise.all(sourcePromises)).flat();

        return {
            sources: resolvedSources,
            subtitles: handler
                .mapSubtitles(root)
                .filter(
                    (s) =>
                        !s.url.includes('megafiles.store') &&
                        !s.url.includes('midwesteagle.com')
                )
                .map((s) => ({
                    ...s,
                    label: this.formatSubtitleLabel(s.label)
                }))
        };
    }

    private async resolveHLSCached(
        url: string,
        fallbackAudio: AudioTrack,
        originalQuality: string,
        cache: Map<string, Promise<Source[]>>
    ): Promise<Source[]> {
        if (!cache.has(url)) {
            cache.set(url, this.resolveHLS(url, fallbackAudio, originalQuality));
        }
        const sources = await cache.get(url)!;
        const allowedQualities = ['360p', '480p', '720p', '1080p', '4k'];
        return sources.filter((s) => allowedQualities.includes(s.quality));
    }

    private async resolveHLS(
        url: string,
        fallbackAudio: AudioTrack,
        originalQuality: string
    ): Promise<Source[]> {
        try {
            const res = await fetch(url, {
                headers: this.HEADERS,
                signal: AbortSignal.timeout(10000)
            });
            const content = await res.text();
            const variants = this.parseVariants(content, url);
            const audioTracks = this.parseAudioTracks(content);
            const tracks =
                audioTracks.length > 0 ? audioTracks : [fallbackAudio];

            if (variants.length === 0) {
                return [
                    {
                        url,
                        type: 'hls',
                        quality: originalQuality,
                        audioTracks: tracks,
                        provider: { id: this.id, name: this.name }
                    }
                ];
            }

            return variants.map((v) => ({
                url: v.url,
                type: 'hls',
                quality: this.normalizeQuality(`${v.resolution}p`),
                audioTracks: tracks,
                provider: { id: this.id, name: this.name }
            }));
        } catch {
            return [
                {
                    url,
                    type: 'hls',
                    quality: 'auto',
                    audioTracks: [fallbackAudio],
                    provider: { id: this.id, name: this.name }
                }
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
                const parts = baseUrl.split('?')[0].split('/');
                parts.pop();
                variantUrl = parts.join('/') + '/' + variantUrl;
            } else if (variantUrl.startsWith('/')) {
                try {
                    const urlObj = new URL(baseUrl);
                    variantUrl = urlObj.origin + variantUrl;
                } catch {
                    /* fallback */
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

    private buildMovieUrl(media: ProviderMediaObject, server: string) {
        return `${this.API_BASE_URL}/${server}/movie/${media.tmdbId}`;
    }

    private buildTvUrl(media: ProviderMediaObject, server: string) {
        return `${this.API_BASE_URL}/${server}/tv/${media.tmdbId}/${media.s}/${media.e}`;
    }

    private async fetchVidnest(url: string) {
        const res = await fetch(url, {
            headers: this.HEADERS,
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) {
            throw new Error(`VidNest: ${res.status}`);
        }

        return res.json() as Promise<{ encrypted: boolean; data: string }>;
    }

    private inferSourceType(type: string, url: string): SourceType {
        const t = (type ?? '').toLowerCase();
        if (t === 'hls' || url.includes('.m3u8')) return 'hls';
        if (t === 'dash' || url.includes('.mpd')) return 'dash';
        if (t === 'mp4' || url.includes('.mp4')) return 'mp4';
        if (t === 'mkv' || url.includes('.mkv')) return 'mkv';
        if (t === 'webm' || url.includes('.webm')) return 'webm';
        if (t === 'embed') return 'embed';
        return 'hls';
    }

    private inferSubtitleFormat(url: string): SubtitleFormat {
        const u = url.toLowerCase();
        if (u.includes('.vtt')) return 'vtt';
        if (u.includes('.srt')) return 'srt';
        if (u.includes('.ass')) return 'ass';
        if (u.includes('.ssa')) return 'ssa';
        if (u.includes('.ttml')) return 'ttml';
        return 'vtt';
    }

    private fixVidlinkUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const hostParam = urlObj.searchParams.get('host');
            if (
                hostParam &&
                (urlObj.hostname === 'file' ||
                    urlObj.hostname.startsWith('file'))
            ) {
                const targetHost = new URL(hostParam);
                urlObj.protocol = targetHost.protocol;
                urlObj.host = targetHost.host;
                return urlObj.toString();
            }
        } catch {
            /* ignore */
        }
        return url;
    }
}
