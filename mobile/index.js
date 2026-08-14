// LiveKit's WebRTC globals must exist before Expo Router evaluates any route
// that imports livekit-client. Keep this CommonJS require after registration;
// static ESM imports would be evaluated too early.
const { registerGlobals } = require('@livekit/react-native');

registerGlobals();
require('expo-router/entry');
