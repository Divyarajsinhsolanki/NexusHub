import { useAuth } from "../auth/AuthProvider";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { PrimaryButton } from "../components/PrimaryButton";
import { PostAttachment } from "../components/PostAttachment";
import { ErrorState } from "../components/StateView";
import { apiErrorMessage } from "../api/client";
import { endpoints } from "../api/endpoints";
import { useCallback, useState } from "react";
import { Alert, AppState, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Picker } from "@react-native-picker/picker";
import * as Clipboard from "expo-clipboard";
import { EntityCollectionScreen } from "../components/EntityCollectionScreen";
import type { EntityRecord } from "../api/types";
import { useAppTheme } from "../theme";

const categories = [
  "Credential",
  "Command",
  "Token",
  "Note",
  "Server",
  "Database",
  "Update",
  "Info",
  "Media",
];
export function VaultScreen({
  projectId,
  canWrite = true,
}: { projectId?: number; canWrite?: boolean } = {}) {
  const theme = useAppTheme();
  const { user } = useAuth();
  const client = useQueryClient();
  const uploadMedia = useMutation({
    mutationFn: async () => {
      const picker = await import("expo-image-picker");
      const result = await picker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 2_000_000)
        throw new Error(
          "Choose media smaller than 2 MB, or save a hosted media URL.",
        );
      if (asset.base64 && asset.base64.length > 2_700_000)
        throw new Error("Choose an image smaller than 2 MB.");
      if (!asset.base64)
        throw new Error(
          "Save a hosted video URL instead. Image uploads are supported here.",
        );
      await endpoints.createResource(
        `/projects/${projectId}/vault_items`,
        "project_vault_item",
        {
          title: asset.fileName || "Uploaded image",
          category: "Media",
          content: `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`,
        },
      );
    },
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["resource", `/projects/${projectId}/vault_items`],
      }),
    onError: (error) =>
      Alert.alert("Unable to upload media", apiErrorMessage(error)),
  });
  const [category, setCategory] = useState("");
  const environments = useQuery({
    queryKey: ["vault-environments", projectId],
    queryFn: () => endpoints.resource(`/projects/${projectId}/environments`),
    enabled: !!projectId,
  });
  const [environment, setEnvironment] = useState("");
  const [sort, setSort] = useState("recent");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (state !== "active") setRevealed(new Set());
      });
      return () => {
        subscription.remove();
        setRevealed(new Set());
      };
    }, []),
  );
  const copy = (text: string) =>
    void Clipboard.setStringAsync(text).catch(() =>
      Alert.alert("Unable to copy", "Please try again."),
    );
  const card = (item: EntityRecord) => {
    const secret = item.category === "Credential" || item.category === "Token";
    const visible = !secret || revealed.has(item.id);
    return (
      <View style={{ gap: 8, marginTop: 8 }}>
        {item.category === "Media" ? (
          <PostAttachment uri={String(item.content || "")} />
        ) : null}
        <Text
          style={{
            color: theme.text,
            fontFamily:
              item.category === "Command" || secret ? "SpaceMono" : undefined,
          }}
        >
          {visible
            ? item.category === "Media" &&
              String(item.content).startsWith("data:")
              ? "Uploaded media"
              : String(item.content || "")
            : "••••••••"}
        </Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          {secret ? (
            <Pressable
              accessibilityLabel={`${visible ? "Hide" : "Reveal"} ${String(item.title)}`}
              onPress={(event) => {
                event.stopPropagation();
                setRevealed((previous) => {
                  const next = new Set(previous);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                });
              }}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: theme.primary }}>
                {visible ? "Hide" : "Reveal"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={`Copy ${String(item.title)}`}
            onPress={(event) => {
              event.stopPropagation();
              copy(String(item.content || ""));
            }}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ color: theme.primary }}>Copy</Text>
          </Pressable>
        </View>
      </View>
    );
  };
  return (
    <EntityCollectionScreen
      canWrite={canWrite}
      title={projectId ? "Project vault" : "Vault"}
      subtitle="Private notes, commands, and credentials"
      path={projectId ? `/projects/${projectId}/vault_items` : "/items"}
      wrapper={projectId ? "project_vault_item" : "item"}
      primary="title"
      secondary={projectId ? ["category", "username"] : ["category"]}
      params={
        projectId
          ? { category, environment_id: environment, sort }
          : { categories: category ? [category] : [], sort }
      }
      renderRecord={card}
      toolbar={
        <View style={{ paddingHorizontal: 16 }}>
          {projectId && canWrite && user && !user.demo_account ? (
            <PrimaryButton
              label="Upload Vault image"
              loading={uploadMedia.isPending}
              onPress={() => uploadMedia.mutate()}
            />
          ) : null}
          {environments.isError ? (
            <ErrorState
              message={apiErrorMessage(environments.error)}
              onRetry={() => environments.refetch()}
            />
          ) : null}
          <Picker
            accessibilityLabel="Vault category"
            selectedValue={category}
            onValueChange={(value) => {
              setCategory(value);
              setRevealed(new Set());
            }}
            style={{ color: theme.text }}
          >
            <Picker.Item label="All categories" value="" />
            {categories.map((value) => (
              <Picker.Item key={value} label={value} value={value} />
            ))}
          </Picker>
          {projectId ? (
            <Picker
              accessibilityLabel="Vault environment"
              selectedValue={environment}
              onValueChange={setEnvironment}
              style={{ color: theme.text }}
            >
              <Picker.Item label="All environments" value="" />
              <Picker.Item label="Global" value="global" />
              {environments.data?.data.map((item) => (
                <Picker.Item
                  key={item.id}
                  label={String(item.name)}
                  value={String(item.id)}
                />
              ))}
            </Picker>
          ) : null}
          <Picker
            accessibilityLabel="Vault sort"
            selectedValue={sort}
            onValueChange={setSort}
            style={{ color: theme.text }}
          >
            {[
              { value: "recent", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
              { value: "title_asc", label: "Title A–Z" },
              { value: "title_desc", label: "Title Z–A" },
            ].map((option) => (
              <Picker.Item key={option.value} {...option} />
            ))}
          </Picker>
        </View>
      }
      fields={[
        ...(projectId
          ? [
              { key: "username", label: "Username" },
              {
                key: "project_environment_id",
                label: "Environment",
                options: [
                  { label: "Global", value: "" },
                  ...(environments.data?.data || []).map((item) => ({
                    label: String(item.name),
                    value: String(item.id),
                  })),
                ],
              },
            ]
          : []),
        { key: "title", label: "Title", required: true },
        {
          key: "category",
          label: "Category",
          options: categories,
          required: true,
        },
        {
          key: "content",
          label: "Content",
          secure: true,
          maskWhen: (form) => ["Credential", "Token"].includes(form.category),
          required: true,
        },
      ]}
    />
  );
}
