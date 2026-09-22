# Shamela Library Integration

Beta integration for browsing and downloading books from the Shamela Library (المكتبة الشاملة), one of the largest collections of Arabic Islamic texts.

## Architecture

### Files

- **types.ts** - Type definitions for Shamela API responses and errors
- **shamelaBooksProvider.ts** - Low-level HTTP API client for Shamela's public endpoints
- **epubBuilder.ts** - EPUB 2.0 file generation using JSZip
- **shamelaService.ts** - High-level service orchestrating the download and import workflow

### How It Works

1. **Search** - User searches for a book in the ShamelaBrowser component
   - Calls `shamelaBooksProvider.searchBooks(query)` 
   - Uses Shamela's public `ajax/book/` endpoint

2. **Download** - User clicks download on a book
   - Fetches first page ID from book's index page
   - Iterates through all pages using `ajax/pageContent/{bookId}/{pageId}`
   - Reports progress via callback

3. **Convert to EPUB** - Pages are converted to EPUB 2.0 format
   - EpubBuilder sanitizes HTML and wraps in XHTML
   - Generates proper EPUB structure (OPF, NCX, MIME type)
   - Creates the archive using JSZip

4. **Save** - EPUB is saved to the local database via `persistenceService.saveBook()`
   - Acts exactly like locally-imported EPUBs
   - Full offline access after download

## API Endpoints

All endpoints use the public Shamela website without requiring API keys:

- `GET https://shamela.ws/` - Homepage (category extraction)
- `GET https://shamela.ws/category/{id}` - Books in category
- `GET https://shamela.ws/ajax/book/?q={query}` - Search books (JSON)
- `GET https://shamela.ws/book/{id}` - Book index page (first page ID extraction)
- `GET https://shamela.ws/ajax/pageContent/{bookId}/{pageId}` - Page text (JSON)

## Rate Limiting

- 500ms minimum delay between requests (configurable via `ShamelaBooksProvider.minDelayMs`)
- Prevents overwhelming the Shamela server
- Total download time scales with book size (~100 pages per second)

## Error Handling

Three error codes:
- `network` - HTTP/connection failures
- `parse` - Invalid/unexpected response format
- `notfound` - Book/page not found (404)
- `invalid` - Malformed book structure

## Customization

### Disable for Production

Set `shamelaEnabled: false` in [defaultPreferences.ts](/src/state/defaultPreferences.ts) to disable the feature by default.

### Add Rate Limiting

Adjust `minDelayMs` in [shamelaBooksProvider.ts](/src/shamela/shamelaBooksProvider.ts) for more/less aggressive downloading.

### Change EPUB Styling

Modify the CSS in [epubBuilder.ts](/src/shamela/epubBuilder.ts) `pageToXhtml()` method to customize book appearance.

## Security

- **HTML Sanitization** - Script tags and event handlers are stripped from page content
- **No Authentication** - Uses public Shamela endpoints only
- **Local Storage** - Downloaded EPUBs are stored locally; no data sent to external servers
- **User Control** - Must be explicitly enabled in Settings

## Known Limitations

**Search API:** The public search endpoint (`/ajax/book/`) currently returns empty results. This may be due to:
- Shamela server restrictions on direct API access
- Changes in the API since the KOReader plugin was written
- Rate limiting or CORS policies

**Workaround:** 
- Browse books by category on shamela.ws directly
- Copy book IDs from URLs (e.g., `shamela.ws/book/6387` → ID `6387`)
- Use the book ID to download via direct page content API
- Future: Implement category browsing in the UI

## Testing

1. Enable in Settings > Shamela Library (Beta)
2. Go to Library tab
3. Search for a book (currently limited due to API restrictions)
4. Alternative: Use a known book ID or wait for category browsing UI

**Note:** Full functionality depends on Shamela's public API being accessible. If search doesn't work, check:
- Shamela.ws is online and accessible
- No network/firewall blocks to shamela.ws
- Your ISP/region doesn't restrict access
