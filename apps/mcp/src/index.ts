import { z } from 'zod';

const appInfoSchema = z.object({
  name: z.literal('@trapmap/app-mcp'),
  version: z.string(),
});

export function createAppInfo() {
  return appInfoSchema.parse({ name: '@trapmap/app-mcp', version: '0.0.0' });
}
