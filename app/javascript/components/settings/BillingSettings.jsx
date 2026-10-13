import React, { useEffect, useRef, useState } from 'react';
import api from '../api';

const ended = status => ['canceled', 'cancelled', 'expired', 'completed', 'incomplete_expired'].includes(status);
const message = error => {
  const value = error?.response?.data?.error;
  return (typeof value === 'string' ? value : value?.message) || 'Unable to update billing. Please try again.';
};

export default function BillingSettings({ onUpdated, returned = false }) {
  const [data, setData] = useState(null);
  const [provider, setProvider] = useState('stripe');
  const [plan, setPlan] = useState('growth');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    const request = returned ? api.post('/billing/refresh') : api.get('/billing');
    request.then(response => {
      if (active) { setData(response.data.data); onUpdated?.(response.data.data.saas); }
    }).catch(failure => { if (active) setError(message(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; mounted.current = false; };
  }, [returned]);
  const run = async (action, payload = {}) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = action === 'load' ? await api.get('/billing') : await api.post(`/billing/${action}`, payload);
      if (!mounted.current) return;
      const value = response.data.data;
      if (value.url) window.location.assign(value.url);
      else { setData(value); onUpdated?.(value.saas); }
    } catch (failure) { if (mounted.current) setError(message(failure)); }
    finally { inFlight.current = false; if (mounted.current) { setBusy(false); setLoading(false); } }
  };
  if (loading) return <p role="status">Loading subscription…</p>;
  const subscription = data?.subscription;
  const canSubscribe = !subscription || ended(subscription.status);
  const configured = data?.providers?.find(item => item.key === provider)?.plans || [];
  const availablePlans = data?.saas?.plans?.filter(item => item.key !== 'starter') || [{key:'growth',name:'Growth'}, {key:'enterprise',name:'Enterprise'}];
  return <div className="mt-6 space-y-3">
    {error ? <p role="alert" className="text-red-600">{error}</p> : null}
    {data?.mode === 'test' ? <p className="text-sm text-muted">Test billing — no live payments.</p> : null}
    <p className="text-xs text-muted">Confirm the amount, currency and recurring terms on the provider checkout before subscribing.</p>
    {canSubscribe && data ? <>
      <label htmlFor="billing-provider">Payment provider</label>
      <select id="billing-provider" className="app-input" value={provider} onChange={event => setProvider(event.target.value)} disabled={busy}>{data.providers.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select>
      <label htmlFor="billing-plan">Subscription plan</label>
      <select id="billing-plan" className="app-input" value={plan} onChange={event => setPlan(event.target.value)} disabled={busy}>{availablePlans.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select>
      <button className="app-primary-button" disabled={busy || !configured.includes(plan)} onClick={() => run('checkout',{provider,plan_key:plan})}>Subscribe to {availablePlans.find(item=>item.key===plan)?.name || plan}</button>
      {!configured.includes(plan) ? <p className="text-sm text-muted">This provider is not configured for the selected plan. Contact support.</p> : null}
    </> : null}
    {subscription ? <>
      <p>{subscription.provider}: {subscription.status}{subscription.cancel_at_period_end ? ' · Cancellation scheduled' : ''}</p>
      {subscription.current_period_end ? <p>{subscription.cancel_at_period_end ? 'Access ends' : 'Current billing period ends'} {new Date(subscription.current_period_end).toLocaleDateString()}</p> : null}
      {subscription.status === 'pending' || subscription.provider === 'stripe' && subscription.status === 'checkout_unknown' ? <button className="app-primary-button" disabled={busy} onClick={()=>run('checkout',{provider:subscription.provider,plan_key:subscription.plan_key})}>Resume checkout</button> : null}
      {subscription.status === 'checkout_unknown' && subscription.provider === 'razorpay' ? <p>Checkout could not be confirmed. Contact support before starting another subscription.</p> : null}
      {subscription.provider === 'stripe' ? <button className="app-secondary-button" disabled={busy} onClick={()=>run('portal')}>Manage plan, payments and invoices</button> : null}
      {!ended(subscription.status) && !subscription.cancel_at_period_end ? <button className="app-secondary-button" disabled={busy} onClick={()=>{if(window.confirm('Cancel this subscription? Active access continues until the end of the current billing period.')) run('cancel');}}>Cancel subscription</button> : null}
    </> : null}
    <button className="app-secondary-button" disabled={busy} onClick={()=>run(data?'refresh':'load')}>{data ? 'Refresh billing status' : 'Retry billing'}</button>
  </div>;
}
