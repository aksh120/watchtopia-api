import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Subtitle,
    SourceType,
    Source,
    AudioTrack
} from '@omss/framework';
import type { VideasyServer } from './videasy.types.js';
import { decryptResponse } from './decryptor.js';

/**
 * all known api endpoints. mb-flix is the primary english source.
 * endpoints like meine, overflix, cuevana serve other languages.
 * hdmovie returns sources where the "quality" field is actually
 * a language label ("Hindi", "English") rather than a resolution.
 * those which are commented do not work
 */

const VIDEASY_SERVERS: readonly VideasyServer[] = [
    // { name: 'primesrcme', url: 'https://api.videasy.net/primesrcme/sources-with-title' },
    // { name: 'm4uhd',      url: 'https://api.videasy.net/m4uhd/sources-with-title' },
    // { name: 'meine-de',   url: 'https://api.videasy.net/meine/sources-with-title', language: 'german' },
    // { name: 'meine-it',   url: 'https://api.videasy.net/meine/sources-with-title', language: 'italian' },
    // { name: 'meine-fr',   url: 'https://api.videasy.net/meine/sources-with-title', language: 'french' },
    // { name: 'overflix',    url: 'https://api2.videasy.net/overflix/sources-with-title',   language: 'english' },
    // { name: 'visioncine',  url: 'https://api.videasy.net/visioncine/sources-with-title',  language: 'english' },
    // { name: 'hdmovie',     url: 'https://api.videasy.net/hdmovie/sources-with-title',     language: 'english' },
    // { name: 'primewire',   url: 'https://api2.videasy.net/primewire/sources-with-title',  language: 'english' },

    {
        name: 'cuevana',
        url: 'https://api2.videasy.net/cuevana/sources-with-title',
        language: 'english'
    },
    {
        name: 'mb-flix',
        url: 'https://api.videasy.net/mb-flix/sources-with-title',
        language: 'english'
    },
    {
        name: '1movies',
        url: 'https://api.videasy.net/1movies/sources-with-title',
        language: 'english'
    },
    {
        name: 'cdn',
        url: 'https://api.videasy.net/cdn/sources-with-title',
        language: 'english'
    },
    {
        name: 'superflix',
        url: 'https://api.videasy.net/superflix/sources-with-title',
        language: 'english'
    },
    {
        name: 'lamovie',
        url: 'https://api.videasy.net/lamovie/sources-with-title',
        language: 'english'
    }
] as const;

export class VideasyProvider extends BaseProvider {
    readonly id = 'Videasy';
    readonly name = 'Videasy';
    readonly enabled = true;
    readonly BASE_URL = 'https://api.videasy.net';
    readonly HEADERS = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json, */*; q=0.01',
        Referer: 'https://player.videasy.net/',
        Origin: 'https://player.videasy.net'
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

    // fans out to all servers in parallel, merges results
    private async getSources(
        media: ProviderMediaObject
    ): Promise<ProviderResult> {
        const hlsCache = new Map<string, Promise<Source[]>>();
        const results = await Promise.allSettled(
            VIDEASY_SERVERS.map((server) =>
                this.fetchFromServer(server, media, hlsCache)
            )
        );

        const sources: ProviderResult['sources'] = [];
        const subtitles: ProviderResult['subtitles'] = [];
        const diagnostics: ProviderResult['diagnostics'] = [];
        let failCount = 0;

        for (const result of results) {
            if (result.status === 'rejected' || !result.value) {
                failCount++;
                continue;
            }
            sources.push(...result.value.sources);
            subtitles.push(...result.value.subtitles);
        }

        const allowedQualities = ['360p', '480p', '720p', '1080p', '4k'];
        const finalSources = sources.filter(
            (s) =>
                allowedQualities.includes(s.quality) &&
                s.audioTracks.length <= 1
        );

        if (failCount > 0 && sources.length > 0) {
            diagnostics.push({
                code: 'PARTIAL_SCRAPE',
                message: `${failCount} of ${VIDEASY_SERVERS.length} videasy servers did not return results`,
                field: '',
                severity: 'warning'
            });
        }

        if (sources.length === 0) {
            return this.emptyResult(
                'all videasy servers returned no sources',
                media
            );
        }

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

    // I have added a small identification of error in case in future we have some problem
    // if the error has all capital then it proly mean that they shifted their encryption and all
    // if it's small and has same then we might have to change a bit let's say api url ?.
    // suppose the small invalid response indicates that they might have changed their setup
    // while the capital indicates that the response might be short not enough, hope it helps.

    // fetches one server, reads plain text blob, decrypts via enc-dec.app
    private async fetchFromServer(
        server: VideasyServer,
        media: ProviderMediaObject,
        hlsCache: Map<string, Promise<Source[]>>
    ): Promise<ProviderResult | null> {
        const params = this.buildParams(server, media);
        const url = `${server.url}?${new URLSearchParams(params as Record<string, string>)}`;
        const response = await fetch(url, {
            headers: this.HEADERS,
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            return this.emptyResult('invalid response', media);
        }

        // api returns plain text hex blob, not json
        const blob = await response.text();

        if (!blob || blob.length < 10) {
            return this.emptyResult('INVALID RESPONSE', media);
        }

        const decrypted = await decryptResponse(blob, String(media.tmdbId));

        if (!decrypted || decrypted.sources.length === 0) {
            return this.emptyResult('Unable to Decode', media);
        }

        const sourcePromises = decrypted.sources.map(async (s) => {
            if (!s?.url) return [];

            const type = this.detectType(s.url, s.type);
            const proxiedUrl = this.createProxyUrl(s.url, this.HEADERS);

            if (type === 'hls') {
                return await this.resolveHLSCached(
                    proxiedUrl,
                    this.resolveLanguage(server),
                    this.resolveLanguageLabel(server),
                    this.normalizeQuality(s.quality),
                    hlsCache
                );
            }

            const quality = this.normalizeQuality(s.quality);
            return [
                {
                    url: proxiedUrl,
                    type,
                    quality,
                    audioTracks: [
                        {
                            language: this.resolveLanguage(server),
                            label: this.resolveLanguageLabel(server)
                        }
                    ],
                    provider: { id: this.id, name: this.name }
                }
            ] as Source[];
        });

        const sources = (await Promise.all(sourcePromises)).flat();

        const subtitles: ProviderResult['subtitles'] = decrypted.subtitles
            .filter(
                (s) =>
                    !!s?.url &&
                    !s.url.includes('megafiles.store') &&
                    !s.url.includes('midwesteagle.com')
            )
            .map((s) => ({
                url: this.createProxyUrl(s.url, {}),
                label: this.formatSubtitleLabel(s.lang ?? s.language ?? 'Unknown'),
                format: 'vtt' as const
            }));

        return {
            sources: sources.filter((s) =>
                s.audioTracks.some(
                    (t: AudioTrack) =>
                        this.isAllowedLanguage(t.language) ||
                        this.isAllowedLanguage(t.label)
                )
            ),
            subtitles,
            diagnostics: []
        };
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

    // builds query params — title passed as plain string, URLSearchParams handles encoding
    private buildParams(
        server: VideasyServer,
        media: ProviderMediaObject
    ): Record<string, string> {
        const base: Record<string, string> = {
            title: media.title ?? '', // no encodeURIComponent — URLSearchParams does it
            mediaType: media.type === 'movie' ? 'movie' : 'tv',
            tmdbId: String(media.tmdbId),
            imdbId: media.imdbId ?? '',
            episodeId: String(media.type === 'tv' ? (media.e ?? 1) : 1),
            seasonId: String(media.type === 'tv' ? (media.s ?? 1) : 1)
        };

        if (media.type === 'movie') {
            base.year = String(media.releaseYear ?? '');
        }

        if (server.language) {
            base.language = server.language;
        }

        return base;
    }

    // detects stream type from url extension and api hint
    private detectType(url: string, hint?: string): 'hls' | 'mp4' {
        const lower = (hint ?? '').toLowerCase();
        if (
            lower.includes('hls') ||
            lower.includes('m3u8') ||
            url.toLowerCase().includes('.m3u8')
        ) {
            return 'hls';
        }
        return 'mp4';
    }

    // strictly allowed resolutions: 360p, 480p, 720p, 1080p, 4k
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

    private async resolveHLSCached(
        url: string,
        lang: string,
        label: string,
        originalQuality: string,
        cache: Map<string, Promise<Source[]>>
    ): Promise<Source[]> {
        if (!cache.has(url)) {
            cache.set(url, this.resolveHLS(url, lang, label, originalQuality));
        }
        return cache.get(url)!;
    }

    private async resolveHLS(
        url: string,
        lang: string,
        label: string,
        originalQuality: string
    ): Promise<Source[]> {
        try {
            const res = await fetch(url, {
                headers: this.HEADERS,
                signal: AbortSignal.timeout(10000)
            });
            const content = await res.text();
            const variants = this.parseVariants(content, url);

            if (variants.length === 0) {
                return [
                    {
                        url,
                        type: 'hls',
                        quality: originalQuality,
                        audioTracks: [{ language: lang, label }],
                        provider: { id: this.id, name: this.name }
                    }
                ];
            }

            return variants.map((v) => ({
                url: v.url,
                type: 'hls',
                quality: this.normalizeQuality(`${v.resolution}p`),
                audioTracks: [{ language: lang, label }],
                provider: { id: this.id, name: this.name }
            }));
        } catch {
            return [
                {
                    url,
                    type: 'hls',
                    quality: 'auto',
                    audioTracks: [{ language: lang, label }],
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

    private resolveLanguage(server: VideasyServer): string {
        if (!server.language) return 'en';
        const map: Record<string, string> = {
            german: 'de',
            italian: 'it',
            french: 'fr'
        };
        return map[server.language] ?? 'en';
    }

    private resolveLanguageLabel(server: VideasyServer): string {
        if (!server.language) return 'English';
        const map: Record<string, string> = {
            german: 'German',
            italian: 'Italian',
            french: 'French'
        };
        return map[server.language] ?? 'English';
    }

    private emptyResult(
        message: string,
        _media: ProviderMediaObject
    ): ProviderResult {
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

    async healthCheck(): Promise<boolean> {
        try {
            const res = await fetch(this.BASE_URL, {
                method: 'HEAD',
                headers: this.HEADERS
            });
            return res.status < 500;
        } catch {
            return false;
        }
    }
}
