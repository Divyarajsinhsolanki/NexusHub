import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { endpoints } from '../api/endpoints';
import { BillingSettings } from './BillingSettings';
let mockOwner = true;
const mockRefresh = jest.fn(async () => undefined);
const mockSnapshot = { mode: 'test', saas: { plan: { name: 'Starter' }, billing: { status: 'free' } }, subscription: null, providers: [{ key:'stripe', name:'Stripe', plans:['growth','enterprise'] },{key:'razorpay', name:'Razorpay', plans:['enterprise']}] };
jest.mock('../auth/AuthProvider',()=>({ useAuth:()=>({user:{roles:mockOwner?['owner']:['member'],workspace:{id:1}},refreshUser:mockRefresh}) }));
jest.mock('../api/endpoints',()=>({endpoints:{billing:jest.fn(async()=>mockSnapshot),billingAction:jest.fn(async()=>mockSnapshot)}}));
beforeEach(()=>{ jest.clearAllMocks();mockOwner=true; });
async function setup(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
 const screen=await render(<QueryClientProvider client={client}><BillingSettings/></QueryClientProvider>);
 return {screen,close:async()=>{await screen.unmount();client.clear();}};
}
test('owners can select Enterprise and refresh only affected billing state',async()=>{
 const {screen,close}=await setup();
 await waitFor(()=>expect(screen.getByLabelText('Subscription plan')).toBeTruthy());
 await fireEvent(screen.getByLabelText('Subscription plan'),'valueChange','enterprise');
 await fireEvent.press(screen.getByRole('button',{name:'Subscribe to Enterprise with Razorpay'}));
 await waitFor(()=>expect(endpoints.billingAction).toHaveBeenCalledWith('checkout',{provider:'razorpay',plan_key:'enterprise'}));
 expect(mockRefresh).toHaveBeenCalledTimes(1);
 expect(endpoints.billing).toHaveBeenCalledTimes(1);
 await close();
});
test('members do not fetch owner billing endpoints',async()=>{
 mockOwner=false;
 const {screen,close}=await setup();
 expect(screen.getByText('Ask your workspace owner to manage billing.')).toBeTruthy();
 expect(endpoints.billing).not.toHaveBeenCalled();
 await close();
});
