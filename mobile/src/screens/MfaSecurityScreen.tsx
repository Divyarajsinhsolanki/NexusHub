import {useEffect,useState} from 'react';
import {ScrollView,Text,TextInput,View} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {api,apiErrorMessage} from '../api/client';
import {useAuth} from '../auth/AuthProvider';
import {useAppTheme} from '../theme';
import {PrimaryButton} from '../components/PrimaryButton';

export function MfaSecurityScreen({gate=false}:{gate?:boolean}){
 const {user,refreshUser,signOut}=useAuth();const theme=useAppTheme();
 const [setup,setSetup]=useState<{secret:string}|null>(null),[codes,setCodes]=useState<string[]|null>(null),[code,setCode]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(gate)void SplashScreen.hideAsync();},[gate]);
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await action();}catch(error){setMessage(apiErrorMessage(error));}finally{setBusy(false);}};
 const input={borderWidth:1,borderColor:theme.border,borderRadius:10,padding:12,color:theme.text,backgroundColor:theme.surface};
 return <ScrollView style={{backgroundColor:theme.background}} contentContainerStyle={{padding:24,paddingTop:gate?64:24,gap:16}} keyboardShouldPersistTaps="handled"><Text accessibilityRole="header" style={{fontSize:24,fontWeight:'700',color:theme.text}}>Authenticator security</Text><Text style={{color:theme.textMuted}}>Privileged accounts require MFA. Sensitive actions need verification within 10 minutes. Use a six-digit authenticator code or a single-use recovery code.</Text>
 {codes?<><Text style={{color:theme.text}}>Save these codes securely outside this account. Each works once; they appear once.</Text>{codes.map(value=><Text key={value} selectable style={{color:theme.text,fontFamily:'monospace'}}>{value}</Text>)}<PrimaryButton label="I saved my recovery codes" disabled={busy} onPress={()=>run(async()=>{setCodes(null);setSetup(null);await refreshUser();})}/></>:<>
 {!user?.mfa?.enabled&&!setup&&<><TextInput accessibilityLabel="Current password for MFA" placeholder="Current password if sign-in was over 10 minutes ago" secureTextEntry style={input} value={password} onChangeText={setPassword}/><PrimaryButton label="Set up authenticator" disabled={busy} onPress={()=>run(async()=>{const {data}=await api.post('/mfa/setup',{password});setSetup(data.data);setPassword('');})}/></>}
 {setup&&<><Text style={{color:theme.text}}>Add this key manually to a time-based account named Nexus Hub in your authenticator. Setup expires in 10 minutes.</Text><Text selectable style={{color:theme.text,fontFamily:'monospace'}}>{setup.secret}</Text></>}
 {(setup||user?.mfa?.enabled)&&<><TextInput accessibilityLabel={setup?"Authenticator code":"Authenticator or recovery code"} placeholder={setup?"Authenticator code":"Authenticator or recovery code"} autoCapitalize="none" autoComplete="one-time-code" style={input} value={code} onChangeText={setCode}/><PrimaryButton label={setup?'Enable MFA':'Verify MFA'} loading={busy} disabled={busy||!code} onPress={()=>run(async()=>{if(setup){const {data}=await api.post('/mfa/confirm',{otp_code:code});setCodes(data.data.recovery_codes);}else{await api.post('/mfa/verify',{otp_code:code});await refreshUser();setMessage('MFA verified. Sensitive actions unlocked for 10 minutes.');}setCode('');})}/></>}
 {!gate&&user?.mfa?.enabled&&<><TextInput accessibilityLabel="Current password for MFA" placeholder="Current password" secureTextEntry style={input} value={password} onChangeText={setPassword}/><PrimaryButton label="Replace recovery codes" disabled={busy} onPress={()=>run(async()=>{const {data}=await api.post('/mfa/recovery',{password});setPassword('');setCodes(data.data.recovery_codes);})}/>{!user.mfa.required&&<PrimaryButton label="Disable MFA" disabled={busy} onPress={()=>run(async()=>{await api.delete('/mfa',{data:{password}});setPassword('');await refreshUser();})}/>}</>}
 </>}{!!message&&<Text accessibilityRole="alert" style={{color:theme.text}}>{message}</Text>}{gate&&<PrimaryButton label="Sign out" disabled={busy} onPress={()=>void signOut()}/>}</ScrollView>;
}
export function NativeMfaGate({children}:{children:React.ReactNode}){const {user}=useAuth();return user?.mfa&&(user.mfa.required||user.mfa.enabled)&&!user.mfa.verified?<MfaSecurityScreen gate/>:<>{children}</>;}
