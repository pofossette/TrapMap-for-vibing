// @ts-nocheck
// Thin app for light - P7
import { createAssembly } from '@trapmap/assembly';
export async function bootstrap() {
  const assembly = createAssembly();
  // light profile
  return assembly.build();
}
