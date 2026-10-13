// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import BillingSettings from './BillingSettings';
import api from '../api';
vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const snapshot = { mode:'test', saas:{ plans:[{key:'growth',name:'Growth'},{key:'enterprise',name:'Enterprise'}] }, subscription:null, providers:[{key:'stripe',name:'Stripe',plans:['enterprise']},{key:'razorpay',name:'Razorpay',plans:['growth']}] };
beforeEach(()=>{ vi.resetAllMocks(); api.get.mockResolvedValue({data:{data:snapshot}}); });
afterEach(cleanup);
test('configured plans control checkout and mutations are not duplicated',async()=>{
 let finish;
 api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 render(<BillingSettings/>);
 const button=await screen.findByRole('button',{name:'Subscribe to Growth'});
 expect(button.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Subscription plan'),{target:{value:'enterprise'}});
 const upgrade=screen.getByRole('button',{name:'Subscribe to Enterprise'});
 fireEvent.click(upgrade); fireEvent.click(upgrade);
 expect(api.post).toHaveBeenCalledTimes(1);
 expect(api.post).toHaveBeenCalledWith('/billing/checkout',{provider:'stripe',plan_key:'enterprise'});
 finish({data:{data:snapshot}});
 await waitFor(()=>expect(upgrade.disabled).toBe(false));
});
test('failed loads expose API error messages and a working retry',async()=>{
 api.get.mockRejectedValueOnce({response:{data:{error:{message:'Session expired'}}}});
 render(<BillingSettings/>);
 expect((await screen.findByRole('alert')).textContent).toBe('Session expired');
 fireEvent.click(screen.getByRole('button',{name:'Retry billing'}));
 await screen.findByLabelText('Payment provider');
 expect(api.get).toHaveBeenCalledTimes(2);
});
test('checkout return refreshes authoritative state',async()=>{
 api.post.mockResolvedValue({data:{data:snapshot}});
 const updated=vi.fn();
 render(<BillingSettings returned onUpdated={updated}/>);
 await screen.findByLabelText('Payment provider');
 expect(api.post).toHaveBeenCalledWith('/billing/refresh');
 expect(updated).toHaveBeenCalledWith(snapshot.saas);
});
