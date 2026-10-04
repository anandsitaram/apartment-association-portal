import type { Data } from '../../../shared/types';
import type { Save } from '../core/api';

export interface ScreenProps {
  data: Data;
  admin: boolean;
  superAdmin: boolean;
  flat: string | null;
  username: string;
  save: Save;
  token?: string;
  onNavigate?: (page: string) => void;
  parcelNoticeId?: number | null;
  onClearParcelNotice?: () => void;
}
