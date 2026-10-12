import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View } from 'react-native';

export function ChatKeyboardAvoidingView(props: ComponentProps<typeof KeyboardAvoidingView>) {
  const container = useRef<View>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subscription = Keyboard.addListener('keyboardWillChangeFrame', event => Keyboard.scheduleLayoutAnimation(event));
    return () => subscription.remove();
  }, []);
  return <View ref={container} style={{ flex: 1 }} onLayout={() => container.current?.measureInWindow((_x, y) => setOffset(y))}>
    <KeyboardAvoidingView {...props} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={offset} />
  </View>;
}
