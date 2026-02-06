# Android App Integration Prompt

**Objective**: Update the Watchtopia Android app to use the new "Direct Link" capabilities of the API (rawUrl + headers) for reliable playback, downloading, and casting.

## Context
The `watchtopia-api` now returns sources with `rawUrl` (the direct HLS/MP4 link) and `headers` (required HTTP headers like Referer/User-Agent). Previously, the app relied on generic webview-based players or lucky guessing of headers.

## Tasks

### 1. Update Data Models
Modify your Source/Episode data models (e.g., in `com.watchtopia.data.tmdb.Models` or wherever API responses are parsed) to include:
```kotlin
data class Source(
    // ... existing fields
    val rawUrl: String?,
    val headers: Map<String, String>?
)
```

### 2. Implement HeaderStore (Crucial for Downloads)
Since `DownloadManager` in Media3 shares a single `DataSource.Factory` and doesn't easily support per-request headers, implement a singleton `HeaderStore`:

```kotlin
object HeaderStore {
    private val headersMap = mutableMapOf<String, Map<String, String>>()

    fun saveHeaders(url: String, headers: Map<String, String>) {
        headersMap[url] = headers
    }

    fun getHeaders(url: String): Map<String, String>? {
        return headersMap[url]
    }
}
```

### 3. Update `DownloadUtil` Interceptor
Modify `com.watchtopia.download.DownloadUtil.getOkHttpClient`:
In the `addInterceptor` block, look up headers for the URL and apply them *before* the existing fallback logic.

```kotlin
.addInterceptor { chain ->
    val original = chain.request()
    val builder = original.newBuilder()
    
    // 1. Apply API-provided headers if available
    val apiHeaders = HeaderStore.getHeaders(original.url.toString())
    apiHeaders?.forEach { (k, v) ->
        builder.header(k, v)
    }

    // 2. Keep existing fallback logic (lines 90-126) for links without explicit headers
    // ...
}
```

### 4. Update Playback Logic (`PlayerScreen` / `OfflinePlayerScreen`)
When starting playback:
1.  Save the headers: `HeaderStore.saveHeaders(rawUrl, headers)`
2.  Pass the `rawUrl` to the player.
3.  If using `OkHttpDataSource.Factory` directly in `OfflinePlayerScreen`, you can also do:
    ```kotlin
    val dataSourceFactory = OkHttpDataSource.Factory(okHttpClient)
        .setDefaultRequestProperties(headers)
    ```

### 5. Update Download Logic (`startDownload`)
1.  Save the headers: `HeaderStore.saveHeaders(url, headers)`
2.  Start the download using the `rawUrl`.

### 6. Casting Strategy
For casting to Android TV / Chromecast:
*   **Option A (Proxy)**: Use the `url` field (which points to the API proxy). The API handles headers, so the TV just sees a standard stream. This is the easiest and most reliable method for standard Cast receivers.
*   **Option B (Local Proxy)**: If you must use `rawUrl`, embed a localized proxy (like NanoHTTPD) in the Android app. The headers are injected by the local proxy, and the TV connects to the phone's IP.
*   **Recommendation**: Use Option A (API Proxy) for simplicity.

## Summary for Agent
"Please refactor `DownloadUtil` to support dynamic headers via a `HeaderStore` pattern. Update the API data models to parse `rawUrl` and `headers`. Ensure that whenever a stream is played or downloaded, its specific headers are registered in the `HeaderStore` so the `OkHttp` interceptor can inject them."
