import { render } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { PreJoin } from '../../app/meet/[publicId]';
import type { CallSession } from '../api/types';
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({publicId:'test'}),useRouter:()=>({replace:jest.fn()})}));
jest.mock('../realtime/useCallRealtime',()=>({useCallRealtime:jest.fn()}));
jest.mock('../calls/mediaPermissions',()=>({requestCallMediaPermissions:jest.fn()}));
jest.mock('../config/runtimeEnvironment',()=>({validateLiveKitEnvironment:jest.fn()}));
test.each(['missed','canceled','ended','failed'] as const)('%s meetings cannot be joined',async status=>{
 const screen=await render(<PreJoin call={{status,call_type:'audio',initiator_name:'Ada',participants:[],share_url:'https://example.test/meet/test'} as unknown as CallSession} camera={false} microphone={true} joining={false} onCamera={()=>{}} onMicrophone={()=>{}} onJoin={()=>{}}/>);
 expect(screen.queryByText('Join now')).toBeNull();
 expect(screen.getByText('This meeting has ended. The link is no longer joinable.')).toBeTruthy();
 await screen.unmount();
});
