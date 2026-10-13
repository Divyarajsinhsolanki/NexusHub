export type AccountStatus = {
  status: 'none' | 'verification_pending' | 'scheduled' | 'cancelled' | 'blocked' | 'completed';
  delete_after: string | null;
  receipt_id: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  retention: string;
  needs_transfer: boolean;
  can_delete: boolean;
  successors: { id: number; name: string }[];
};
