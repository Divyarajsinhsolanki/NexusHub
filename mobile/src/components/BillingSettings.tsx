import { Picker } from '@react-native-picker/picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Text, View } from 'react-native';
import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { BillingAction } from '../api/billingTypes';
import { useAuth } from '../auth/AuthProvider';
import { PrimaryButton } from './PrimaryButton';
import { useAppTheme } from '../theme';

export function BillingSettings() {
  const { user, refreshUser } = useAuth();
  const client = useQueryClient();
  const theme = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState('growth');
  const flight = useRef(false);
  const mounted = useRef(true);
  const owner = Boolean(user?.roles?.includes('owner') && !user.demo_account && !user.impersonation?.active);
  const workspaceId = user?.workspace?.id;
  const billing = useQuery({ queryKey: ['billing', workspaceId], queryFn: endpoints.billing, enabled: owner });
  const run = useCallback(async (action: BillingAction, payload: Record<string, unknown> = {}) => {
    if (flight.current) return;
    flight.current = true; setBusy(true);
    try {
      const response = await endpoints.billingAction(action, payload);
      if (!mounted.current) return;
      if ('url' in response) {
        const uri = new URL(response.url);
        if (uri.protocol !== 'https:' || !['checkout.stripe.com','billing.stripe.com','rzp.io','payments.razorpay.com'].includes(uri.hostname) || uri.username || uri.password) throw new Error('Invalid billing link. Please refresh billing.');
        await Linking.openURL(response.url);
      } else {
        client.setQueryData(['billing', workspaceId], response);
        await refreshUser();
      }
    } catch (error) { if (mounted.current) Alert.alert('Billing', apiErrorMessage(error)); }
    finally { flight.current = false; if (mounted.current) setBusy(false); }
  }, [client, workspaceId, refreshUser]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!owner) return;
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void run('refresh'); });
    return () => listener.remove();
  }, [owner, run]);
  if (!owner) return <Text style={{ color: theme.textMuted }}>Ask your workspace owner to manage billing.</Text>;
  if (billing.isLoading) return <Text accessibilityRole="text" style={{ color: theme.textMuted }}>Loading subscription…</Text>;
  if (billing.error) return <View><Text accessibilityRole="alert" style={{ color: theme.danger }}>{apiErrorMessage(billing.error)}</Text><PrimaryButton label="Retry billing" onPress={() => void billing.refetch()} /></View>;
  const data = billing.data;
  if (!data) return null;
  const subscription = data.subscription;
  const terminal = !subscription || ['canceled', 'cancelled', 'expired', 'completed', 'incomplete_expired'].includes(subscription.status);
  const plans = data.saas.plans?.filter(item => item.key !== 'starter') || [{key:'growth',name:'Growth'}, {key:'enterprise',name:'Enterprise'}];
  return <View style={{ gap: 16 }}>
    <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{data.saas.plan.name}</Text>
    {data.mode === 'test' ? <Text style={{color:theme.textMuted}}>Test billing — no live payments.</Text> : null}
    <Text style={{ color: theme.textMuted }}>{subscription ? `${subscription.provider}: ${subscription.status}` : data.saas.billing.status}</Text>
    {subscription?.current_period_end ? <Text style={{ color: theme.textMuted }}>{subscription.cancel_at_period_end ? 'Access ends' : 'Current billing period ends'} {new Date(subscription.current_period_end).toLocaleDateString()}</Text> : null}
    <Text style={{ color: theme.textMuted }}>Confirm the amount, currency and recurring terms on the provider checkout before subscribing.</Text>
    {terminal ? <>
      <Text style={{color:theme.text}}>Subscription plan</Text>
      <Picker accessibilityLabel="Subscription plan" enabled={!busy} selectedValue={plan} onValueChange={value=>setPlan(value)} style={{color:theme.text}}>{plans.map(item=><Picker.Item key={item.key} label={item.name} value={item.key} />)}</Picker>
      {data.providers.map(provider => <PrimaryButton key={provider.key} disabled={busy || !provider.plans.includes(plan)} label={`Subscribe to ${plans.find(item=>item.key===plan)?.name || plan} with ${provider.name}${provider.plans.includes(plan) ? '' : ' · Unavailable'}`} onPress={() => void run('checkout', { provider: provider.key, plan_key: plan })} />)}
    </> : <>
      {subscription.status === 'pending' || subscription.provider === 'stripe' && subscription.status === 'checkout_unknown' ? <PrimaryButton disabled={busy} label="Resume checkout" onPress={()=>void run('checkout',{provider:subscription.provider,plan_key:subscription.plan_key})} /> : null}
      {subscription.status === 'checkout_unknown' && subscription.provider === 'razorpay' ? <Text style={{color:theme.textMuted}}>Checkout could not be confirmed. Contact support before starting another subscription.</Text> : null}
      {subscription.provider === 'stripe' ? <PrimaryButton disabled={busy} label="Manage plan, payments and invoices" onPress={() => void run('portal')} /> : null}
      {!subscription.cancel_at_period_end ? <PrimaryButton disabled={busy} label="Cancel subscription" onPress={() => Alert.alert('Cancel subscription?', 'Active access continues until the end of the current billing period.', [{ text: 'Keep subscription', style: 'cancel' }, { text: 'Cancel subscription', style: 'destructive', onPress: () => void run('cancel') }])} /> : null}
    </>}
    <PrimaryButton disabled={busy} label="Refresh billing status" onPress={() => void run('refresh')} />
  </View>;
}
