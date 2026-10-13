export type WorkspaceBilling = {
  mode: 'test' | 'live';
  saas: {
    plan: { key: string; name: string; next_plan_key?: string | null };
    billing: { status: string };
    plans?: Array<{ key: string; name: string }>;
  };
  subscription?: {
    provider: 'stripe' | 'razorpay';
    plan_key: string;
    status: string;
    cancel_at_period_end: boolean;
    current_period_end?: string | null;
  } | null;
  providers: Array<{ key: string; name: string; plans: string[] }>;
};
export type BillingAction = 'checkout' | 'refresh' | 'portal' | 'cancel';
export type BillingActionResult = WorkspaceBilling | { url: string };
