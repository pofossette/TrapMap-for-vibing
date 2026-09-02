// @ts-nocheck
// Thin app for distributed - P7
import { createAssembly } from '@trapmap/assembly';
export async function bootstrap() {
  const assembly = createAssembly();
  // distributed profile
  return assembly.build();
}
