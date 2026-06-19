import { mapRuntimeOverview } from '../../services/mappers/runtime-status-mapper';
import type { AdminPanelApiContract, RuntimeOverview } from '../../shared/types/admin-panel';

export async function loadRuntimeOverview(api: AdminPanelApiContract): Promise<RuntimeOverview> {
  const response = await api.loadRuntimeOverview();
  return mapRuntimeOverview(response);
}
