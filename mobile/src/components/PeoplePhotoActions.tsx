import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Alert, View } from "react-native";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { PrimaryButton } from "./PrimaryButton";

export function PeoplePhotoActions({ userId }: { userId: number }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const upload = useMutation({
    mutationFn: async (field: "profile_picture" | "cover_photo") => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.82,
        allowsEditing: true,
        aspect: field === "profile_picture" ? [1, 1] : [3, 1],
      });
      if (result.canceled) return;
      const photo = result.assets[0];
      if (photo.fileSize && photo.fileSize > 10_000_000)
        throw new Error("Choose a photo smaller than 10 MB.");
      const body = new FormData();
      body.append(`user[${field}]`, {
        uri: photo.uri,
        name: photo.fileName || "photo.jpg",
        type: photo.mimeType || "image/jpeg",
      } as never);
      await api.patch(`/users/${userId}`, body);
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["resource", "/users"] }),
        client.invalidateQueries({
          queryKey: ["member-profile", String(userId)],
        }),
        client.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
    },
    onError: (error) =>
      Alert.alert("Unable to upload photo", apiErrorMessage(error)),
  });
  if (!user || user.demo_account || !user.permissions?.includes("users.manage"))
    return null;
  return (
    <View style={{ gap: 8 }}>
      <PrimaryButton
        label="Change profile photo"
        disabled={upload.isPending}
        onPress={() => upload.mutate("profile_picture")}
      />
      <PrimaryButton
        label="Change cover photo"
        disabled={upload.isPending}
        onPress={() => upload.mutate("cover_photo")}
      />
    </View>
  );
}
