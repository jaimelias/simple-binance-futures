# Coding for Google Apps Script

## Syntax & Environment

- No modern JS runtime features: No ES modules, top-level await, or `BigInt`.
- No standard APIs: Replace `fetch` with `UrlFetchApp`. Replace `setTimeout` with `Utilities.sleep`.
- Entry points: Use `function` declarations for triggers, `doGet`/`doPost`, and menus. NEVER use arrow functions.
- Execution: Global code re-runs entirely every execution. `async/await` blocks execution; there is no true event loop.
- Formatting: Replace `Intl`/`toLocaleString` with `Utilities.formatDate` (pass timezones explicitly). Avoid numeric separators (`100_000` -> `100000`).

## Limits & Architecture

- **Timeouts: Scripts die at 6 minutes. Chunk heavy workloads and reschedule via triggers.
- **Concurrency: Use `LockService` to prevent race conditions.
- **Triggers: Delete old programmatic triggers before creating new ones. Use installable triggers (not simple ones) if the script requires user authorization.
- **External APIs: Implement exponential backoff. Add `muteHttpExceptions: true` to `UrlFetchApp` to handle non-200 responses.
- **State & Secrets: Store in `PropertiesService` or `CacheService`, never hardcoded.