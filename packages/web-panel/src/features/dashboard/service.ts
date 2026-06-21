import { mapRuntimeOverview } from '@trapmap/web-panel/services/mappers/runtime-status-mapper';
import type { AdminPanelApiContract, RuntimeOverview } from '@trapmap/web-panel/shared/enum-types';

export async function loadRuntimeOverview(api: AdminPanelApiContract): Promise<RuntimeOverview> {
  const response = await api.loadRuntimeOverview();
  return mapRuntimeOverview(response);
}
