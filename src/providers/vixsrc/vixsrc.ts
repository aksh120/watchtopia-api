import { BaseProvider } from '@omss/framework';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult, Source, Subtitle } from '@omss/framework';
import axios from 'axios';

export class VixSrcProvider extends BaseProvider {
    readonly id = 'vixsrc';
    readonly name = 'VixSrc';
    readonly enabled = true;
    readonly BASE_URL = 'https://vixsrc.to';
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: this.BASE_URL,
        Origin: this.BASE_URL,
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv'],
    };

    /**
     * Fetch movie sources
     */
    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    /**
     * Fetch TV episode sources
     */
    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    /**
     * Main scraping logic
     */
    private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
        try {
            // Build page URL
            const pageUrl = this.buildPageUrl(media);
            this.console.debug(`VixSrc: Fetching page ${pageUrl}`);

            // Fetch page HTML
            const html = await this.fetchPage(pageUrl, media);
            if (!html) {
                this.console.warn('VixSrc: Failed to fetch page');
                return this.emptyResult('Failed to fetch page', media);
            }

            // Extract token and playlist info
            const tokenData = this.extractTokenData(html, media);
            if (!tokenData) {
                this.console.warn('VixSrc: Failed to extract token data');
                return this.emptyResult('Invalid or expired token', media);
            }
            this.console.debug('VixSrc: Token extracted', tokenData);

            // Build master playlist URL
            const masterUrl = this.buildMasterUrl(tokenData);

            // Fetch master playlist
            const playlistContent = await this.fetchPlaylist(masterUrl, pageUrl, media);
            if (!playlistContent) {
                this.console.warn('VixSrc: Failed to fetch playlist');
                return this.emptyResult('Failed to fetch playlist', media);
            }

            this.console.debug(`VixSrc: Playlist fetched (${playlistContent.length} bytes)`);

            // Parse playlist content
            const result = this.parsePlaylist(playlistContent, masterUrl, pageUrl, media);

            return result;
        } catch (error) {
            this.console.error('VixSrc: Unknown error', error);
            return this.emptyResult(error instanceof Error ? error.message : 'Unknown provider error', media);
        }
    }

    /**
     * Build page URL based on media type
     */
    private buildPageUrl(media: ProviderMediaObject): string {
        if (media.type === 'movie') {
            return `${this.BASE_URL}/movie/${media.tmdbId}`;
        } else {
            return `${this.BASE_URL}/tv/${media.tmdbId}/${media.s}/${media.e}`;
        }
    }

    /**
     * Fetch page HTML
     */
    private async fetchPage(url: string, media: ProviderMediaObject): Promise<string | null> {
        try {
            const response = await axios.get(url, {
                headers: this.HEADERS,
                timeout: 10000,
            });

            if (response.status !== 200) {
                return null;
            }

            return response.data;
        } catch (error) {
            return null;
        }
    }

    /**
     * Extract token, expires, and playlist URL from HTML
     */
    private extractTokenData(html: string, media: ProviderMediaObject): { token: string; expires: string; playlist: string } | null {
        const token = html.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
        const expires = html.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
        const playlist = html.match(/url\s*:\s*["']([^"']+)/)?.[1];

        if (!token || !expires || !playlist) {
            return null;
        }

        // Check if token is expired
        if (this.isTokenExpired(expires)) {
            return null;
        }

        return { token, expires, playlist };
    }

    /**
     * Check if token is expired
     */
    private isTokenExpired(expires: string): boolean {
        return parseInt(expires, 10) * 1000 - 60_000 < Date.now();
    }

    /**
     * Build master playlist URL with token
     */
    private buildMasterUrl(tokenData: { token: string; expires: string; playlist: string }): string {
        const { token, expires, playlist } = tokenData;
        const separator = playlist.includes('?') ? '&' : '?';
        return `${playlist}${separator}token=${token}&expires=${expires}&h=1`;
    }

    /**
     * Fetch playlist content
     */
    private async fetchPlaylist(url: string, referer: string, media: ProviderMediaObject): Promise<string | null> {
        try {
            const response = await axios.get(url, {
                headers: {
                    ...this.HEADERS,
                    Referer: referer,
                },
                timeout: 10000,
            });

            if (response.status !== 200) {
                return null;
            }

            return response.data;
        } catch (error) {
            return null;
        }
    }

    /**
     * Parse HLS playlist content
     */
    private parsePlaylist(content: string, masterUrl: string, pageUrl: string, media: ProviderMediaObject): ProviderResult {
        const subtitles = this.parseSubtitles(content, pageUrl, masterUrl);

        // We only want subtitles from VixSrc
        return {
            sources: [],
            subtitles,
            diagnostics: []
        };
    }

    /**
     * Parse audio tracks (Unused but kept for reference)
     */
    private parseAudioTracks(content: string): Array<{ language: string; label: string }> {
        return [];
    }

    /**
     * Parse subtitles from HLS manifest
     */
    private parseSubtitles(content: string, pageUrl: string, masterUrl: string): Subtitle[] {
        const subtitles: Subtitle[] = [];
        const lines = content.split('\n');

        this.console.debug(`VixSrc: Parsing subtitles from playlist (${lines.length} lines)`);

        for (const line of lines) {
            if (!line.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')) continue;

            // Use separate regex for flexibility
            const urlMatch = line.match(/URI="([^"]+)"/);
            const labelMatch = line.match(/NAME="([^"]+)"/);

            // Also check for language code if needed, but LABEL is usually enough

            if (urlMatch && labelMatch) {
                const url = urlMatch[1];
                const label = labelMatch[1];

                if (url && label) {
                    try {
                        const absoluteUrl = new URL(url, masterUrl).toString();
                        subtitles.push({
                            url: absoluteUrl,
                            label,
                            format: 'vtt',
                        });
                        this.console.debug(`VixSrc: Found subtitle ${label}`);
                    } catch (e) {
                        this.console.warn(`VixSrc: Invalid subtitle URL: ${url}`);
                    }
                }
            }
        }

        this.console.success(`VixSrc: Extracted ${subtitles.length} subtitles`);
        return subtitles;
    }

    /**
     * Parse quality variants from HLS manifest
     */
    private parseVariants(content: string): Array<{ resolution: number; url: string }> {
        const variants: Array<{ resolution: number; url: string }> = [];
        const regex = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=\d+x(\d+)[^\n]*\n([^\n]+)/g;
        let match;

        while ((match = regex.exec(content)) !== null) {
            variants.push({
                resolution: parseInt(match[1], 10),
                url: match[2],
            });
        }

        return variants;
    }

    /**
     * Return empty result with diagnostic
     */
    private emptyResult(message: string, media: ProviderMediaObject): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [
                {
                    code: 'PROVIDER_ERROR',
                    message: `${this.name}: ${message}`,
                    field: '',
                    severity: 'error',
                },
            ],
        };
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await axios.head(this.BASE_URL, {
                timeout: 5000,
                headers: this.HEADERS,
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
