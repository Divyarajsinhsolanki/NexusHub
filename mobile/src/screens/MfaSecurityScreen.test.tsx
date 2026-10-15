import {fireEvent,render,waitFor,cleanup} from '@testing-library/react-native';
import {afterEach,beforeEach,expect,jest,test} from '@jest/globals';
import {api} from '../api/client';
import {MfaSecurityScreen,NativeMfaGate} from './MfaSecurityScreen';
import {Text} from 'react-native';
const mockRefresh=jest.fn(async()=>{});
let mockUser={mfa:{required:true,enabled:false,verified:false}};
jest.mock('../auth/AuthProvider',()=>({useAuth:()=>({user:mockUser,refreshUser:mockRefresh,signOut:jest.fn()})}));
jest.mock('../api/client',()=>({api:{post:jest.fn()},apiErrorMessage:()=> 'Invalid code'}));
jest.mock('expo-splash-screen',()=>({hideAsync:jest.fn(async()=>{})}));
beforeEach(()=>{jest.clearAllMocks();mockUser={mfa:{required:true,enabled:false,verified:false}};});afterEach(cleanup);
test('keeps privileged workspace hidden until authenticator verification',async()=>{
 const view=await render(<NativeMfaGate><Text>Private workspace</Text></NativeMfaGate>);
 expect(view.queryByText('Private workspace')).toBeNull();expect(view.getByText('Set up authenticator')).toBeTruthy();
});
test('shows setup and recovery codes from the native API envelope before continuing',async()=>{
 jest.mocked(api.post).mockResolvedValueOnce({data:{data:{secret:'SETUPKEY'}}} as never).mockResolvedValueOnce({data:{data:{recovery_codes:['recovery-code']}}} as never);
 const view=await render(<MfaSecurityScreen gate/>);
 await fireEvent.press(view.getByText('Set up authenticator'));await view.findByText('SETUPKEY');await fireEvent.changeText(view.getByLabelText('Authenticator code'),'123456');await fireEvent.press(view.getByText('Enable MFA'));await view.findByText('recovery-code');expect(mockRefresh).not.toHaveBeenCalled();await fireEvent.press(view.getByText('I saved my recovery codes'));await waitFor(()=>expect(mockRefresh).toHaveBeenCalled());
});
test('verifies an enrolled account with a recovery code and refreshes auth state',async()=>{
 mockUser={mfa:{required:true,enabled:true,verified:false}};jest.mocked(api.post).mockResolvedValue({data:{data:{verified:true}}} as never);
 const view=await render(<MfaSecurityScreen gate/>);await fireEvent.changeText(view.getByLabelText('Authenticator or recovery code'),'recovery-code');await fireEvent.press(view.getByText('Verify MFA'));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/mfa/verify',{otp_code:'recovery-code'}));await waitFor(()=>expect(mockRefresh).toHaveBeenCalled());
});
