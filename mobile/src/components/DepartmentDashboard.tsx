import { Picker } from '@react-native-picker/picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Text, View } from 'react-native';
import { useRef } from 'react';
import type { Department } from '../api/types';
import { endpoints } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAppTheme } from '../theme';

export function DepartmentDashboard({ department, canAssignHead }: { department: Department; canAssignHead: boolean }) {
  const theme = useAppTheme();
  const client = useQueryClient();
  const flight = useRef(false);
  const save = useMutation({ mutationFn: async (managerId: number | null) => {
    if(flight.current) return;
    flight.current=true;
    try { await endpoints.updateDepartment(department.id,{manager_id:managerId}); }
    finally {flight.current=false;}
  }, onSuccess: async()=>{await client.invalidateQueries({queryKey:['department',department.id]});await client.invalidateQueries({queryKey:['departments']});}, onError:error=>Alert.alert('Unable to assign head',apiErrorMessage(error)) });
  const dashboard = department.dashboard;
  if (!dashboard) return null;
  const candidates = [...(department.members || [])];
  if (department.manager && !candidates.some(member=>member.id===department.manager_id)) candidates.push({id:department.manager.id,full_name:department.manager.full_name,email:''});
  return <View style={{padding:16,gap:12}}>
    <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>Department dashboard</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{[['Members',dashboard.members_count],['Active projects',dashboard.active_projects],['Open tasks',dashboard.open_tasks],['Overdue',dashboard.overdue_tasks],['Due in 7 days',dashboard.due_this_week]].map(([label,count])=><View key={label} style={{backgroundColor:theme.surface,borderRadius:12,padding:12,minWidth:120}}><Text style={{color:theme.textMuted}}>{label}</Text><Text style={{color:theme.text,fontSize:22,fontWeight:'700'}}>{count}</Text></View>)}</View>
    <Text style={{color:theme.textMuted}}>{dashboard.scope}</Text>
    <Text style={{color:theme.textMuted}}>Heads and managers manage members. Heads and workspace administrators assign roles. Department roles do not grant project access.</Text>
    {canAssignHead ? <><Text style={{color:theme.text,fontWeight:'700'}}>Department head</Text><Picker accessibilityLabel="Department head" enabled={!save.isPending} selectedValue={department.manager_id || 0} onValueChange={value=>{if(Number(value)!==(department.manager_id||0))save.mutate(Number(value)||null);}} style={{color:theme.text}}><Picker.Item label="No head assigned" value={0}/>{candidates.map(member=><Picker.Item key={member.id} label={member.full_name} value={member.id}/>)}</Picker></>:null}
    <Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Members and workload</Text>
  </View>;
}
