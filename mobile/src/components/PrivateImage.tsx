import { Image, type ImageProps } from 'expo-image';
import { usePrivateAssetUrl } from '../api/usePrivateAssetUrl';

// Shared native rendering for draft portfolio media and project attachments.
export function PrivateImage({ source, ...props }: ImageProps) {
  const path = typeof source === 'string' ? source :
    source && typeof source === 'object' && !Array.isArray(source) && 'uri' in source ? source.uri : undefined;
  const uri = usePrivateAssetUrl(path);
  const resolved = path ? (uri ? { ...(typeof source === 'object' ? source : {}), uri } : undefined) : source;
  return <Image {...props} source={resolved} cachePolicy="none" />;
}
