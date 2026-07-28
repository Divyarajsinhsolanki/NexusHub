const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-pdf') {
    return { filePath: path.resolve(__dirname, 'src/shims/reactNativePdf.web.tsx'), type: 'sourceFile' };
  }
  if (platform === 'web' && moduleName === '@livekit/react-native') {
    return { filePath: path.resolve(__dirname, 'src/shims/livekitReactNative.web.tsx'), type: 'sourceFile' };
  }
  if (platform === 'web' && moduleName === 'expo-sqlite') {
    return { filePath: path.resolve(__dirname, 'src/shims/expoSqlite.web.ts'), type: 'sourceFile' };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
