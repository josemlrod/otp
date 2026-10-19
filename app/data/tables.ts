import { column as c, table } from 'remix/data-table';
import type { TableRow } from 'remix/data-table';

export const apiCache = table({
  name: 'api_cache',
  primaryKey: 'key',
  columns: {
    key: c.text(),
    // JSON-encoded API response body
    data: c.text(),
    // Epoch milliseconds
    fetched_at: c.integer(),
  },
});

export type ApiCacheRow = TableRow<typeof apiCache>;
