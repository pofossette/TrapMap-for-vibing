import { mapRuntimeOverview } from '@trapmap/web-panel/services/mappers/runtime-status-mapper';
import type {
  AdminPanelApiContract,
  RuntimeOverview,
} from '@trapmap/web-panel/shared/types/admin-panel';

export async function loadRuntimeOverview(api: AdminPanelApiContract): Promise<RuntimeOverview> {
  const response = await api.loadRuntimeOverview();
  return mapRuntimeOverview(response);
}
