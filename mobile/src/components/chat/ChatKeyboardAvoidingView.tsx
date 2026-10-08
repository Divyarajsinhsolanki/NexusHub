import { useRef, useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

export function ChatKeyboardAvoidingView(props: ComponentProps<typeof KeyboardAvoidingView>) {
  const container = useRef<View>(null);
  const [offset, setOffset] = useState(0);
  return <View ref={container} style={{ flex: 1 }} onLayout={() => container.current?.measureInWindow((_x, y) => setOffset(y))}>
    <KeyboardAvoidingView {...props} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={offset} />
  </View>;
}
