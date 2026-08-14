import { Linking, PermissionsAndroid, Platform } from 'react-native';

export type MediaPermissionResult = {
  camera: boolean;
  microphone: boolean;
};

export async function requestCallMediaPermissions(video: boolean): Promise<MediaPermissionResult> {
  if (Platform.OS !== 'android') return { camera: true, microphone: true };

  const requested = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (video) requested.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  const result = await PermissionsAndroid.requestMultiple(requested);

  return {
    microphone: result[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED,
    camera: !video || result[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED,
  };
}

export function openApplicationSettings() {
  return Linking.openSettings();
}
