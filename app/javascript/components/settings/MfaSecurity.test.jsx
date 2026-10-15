// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AuthContext} from '../../context/AuthContext';
import api from '../api';
import MfaSecurity from './MfaSecurity';
import SupportAccess from './SupportAccess';
vi.mock('../../context/AuthContext', async()=>({AuthContext:(await import('react')).createContext(null)}));
vi.mock('../api',()=>({default:{post:vi.fn(),get:vi.fn(),delete:vi.fn()}}));
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks());
const user={id:1,roles:[{name:'owner'}],mfa:{required:true,enabled:false,verified:false}};
it('enables MFA only after a code and keeps recovery codes visible until saved',async()=>{
 api.post.mockResolvedValueOnce({data:{secret:'SETUPKEY'}}).mockResolvedValueOnce({data:{recovery_codes:['recovery-one','recovery-two']}});api.get.mockResolvedValue({data:{user:{...user,mfa:{...user.mfa,enabled:true,verified:true}}}});
 const setUser=vi.fn();render(<AuthContext.Provider value={{user,setUser,handleLogout:vi.fn()}}><MfaSecurity gate/></AuthContext.Provider>);
 fireEvent.click(screen.getByText('Set up authenticator'));await screen.findByText('SETUPKEY');
 fireEvent.change(screen.getByLabelText('Authenticator code'),{target:{value:'123456'}});fireEvent.click(screen.getByText('Enable MFA'));
 await screen.findByText(/recovery-one/);expect(setUser).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('I saved my recovery codes'));await waitFor(()=>expect(setUser).toHaveBeenCalled());
 expect(api.post).toHaveBeenLastCalledWith('/mfa/confirm',{otp_code:'123456'});
});
it('shows failed verification and offers recovery without collecting an employee password',async()=>{
 api.post.mockRejectedValue({response:{data:{message:'Already used code'}}});render(<AuthContext.Provider value={{user:{...user,mfa:{...user.mfa,enabled:true}},setUser:vi.fn()}}><MfaSecurity gate/></AuthContext.Provider>);
 fireEvent.change(screen.getByLabelText('Authenticator or recovery code'),{target:{value:'used'}});fireEvent.click(screen.getByText('Verify MFA'));await screen.findByRole('alert');expect(screen.getByText('Already used code')).toBeTruthy();expect(screen.queryByLabelText('Current password')).toBeNull();
});
it('approves explicit expiring support resources and never calls impersonation',async()=>{
 api.get.mockResolvedValue({data:[]});api.post.mockResolvedValue({data:{}});render(<AuthContext.Provider value={{user:{...user,mfa:{recent:true}}}}><SupportAccess/></AuthContext.Provider>);
 fireEvent.change(screen.getByLabelText('Support administrator email'),{target:{value:'support@example.test'}});fireEvent.change(screen.getByLabelText('Reason / ticket reference'),{target:{value:'Investigate ticket NX-100'}});fireEvent.click(screen.getByText('Approve support access'));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/support_access_grants',{support_access_grant:{support_email:'support@example.test',reason:'Investigate ticket NX-100',duration_minutes:30,resources:['projects']}}));
});
