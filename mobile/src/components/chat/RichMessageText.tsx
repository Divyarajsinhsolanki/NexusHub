import { Text, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { tokenizeChatMessage, type MentionLookups, type Entity } from '../../chat/mentions';
export function RichMessageText({ text, lookups, color }: { text: string; lookups: MentionLookups; color: string }) {
  const router = useRouter();
  const openTask = (task: Entity) => {
    if (task.task_url && /^https?:\/\//i.test(String(task.task_url))) { void Linking.openURL(String(task.task_url)); return; }
    const project = task.project_id || task.sprint?.project_id;
    router.push((project ? `/projects/${project}?taskId=${task.id}` : `/work?taskId=${task.id}`) as never);
  };
  return <>{tokenizeChatMessage(text, lookups).map((part, index) => part.kind === 'text' ? part.text : <Text accessibilityRole="link" key={index} onPress={() => part.kind === 'user' ? router.push(`/profile/${part.user!.id}` as never) : openTask(part.task!)} style={{ color, fontWeight: '700', textDecorationLine: 'underline' }}>{part.text}</Text>)}</>;
}
