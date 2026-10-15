import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { CallHistoryScreen } from './CallHistoryScreen';
import { endpoints } from '../api/endpoints';
const mockPush=jest.fn();
let mockParams: { conversationId?: string } = {};
const mockRow={id:1,conversation_id:4,title:'Ada',call_type:'video',status:'ended',participant_status:'left',direction:'incoming',created_at:'2026-10-14T00:00:00Z',duration_seconds:65,can_callback:true};
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useRouter:()=>({push:mockPush,back:jest.fn()}),useFocusEffect:jest.fn()}));
jest.mock('../auth/AuthProvider',()=>({useAuth:()=>({user:{id:9,workspace:{id:1},demo_account:false}})}));
jest.mock('../components/Screen',()=>({Screen:({children,header}:any)=><>{header}{children}</>}));
jest.mock('../api/endpoints',()=>({endpoints:{callHistory:jest.fn(async()=>({data:[mockRow,{...mockRow,id:2,title:'Removed member',can_callback:false}],meta:{}})),startCall:jest.fn(async()=>({call_session:{id:8,call_type:'video'}}))}}));
test('shows duration and starts a callback with the original call type and conversation',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{gcTime:Infinity}}});
 const screen=await render(<QueryClientProvider client={client}><CallHistoryScreen/></QueryClientProvider>);
 await screen.findByText('Ada');expect(screen.getAllByText(/1m 5s/)).toHaveLength(2);
 await fireEvent.press(screen.getByLabelText('Call back Removed member'));expect(endpoints.startCall).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByLabelText('Call back Ada'));
 await waitFor(()=>expect(endpoints.startCall).toHaveBeenCalledWith(4,'video'));
 expect(mockPush).toHaveBeenCalledWith('/call/8?type=video');
 await screen.unmount();client.clear();
});

test('filters history by conversation with a separate cache key', async () => {
 mockParams = { conversationId: '7' };
 const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
 const screen = await render(<QueryClientProvider client={client}><CallHistoryScreen /></QueryClientProvider>);
 await screen.findByText('Ada');
 expect(endpoints.callHistory).toHaveBeenCalledWith(1, 7);
 expect(client.getQueryData(['call-history', 1, 7])).toBeTruthy();
 expect(client.getQueryData(['call-history', 1, 'all'])).toBeUndefined();
 await screen.unmount(); client.clear(); mockParams = {};
});
