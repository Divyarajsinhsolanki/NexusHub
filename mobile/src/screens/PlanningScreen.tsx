import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { useState } from "react";
import { useRouter } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { endpoints } from "../api/endpoints";
import { apiErrorMessage } from "../api/client";
import { useAppTheme } from "../theme";
import { useAuth } from "../auth/AuthProvider";
import { Screen } from "../components/Screen";
import { PageHeader } from "../components/PageHeader";
import { PrimaryButton } from "../components/PrimaryButton";
import { EmptyState, ErrorState, LoadingState } from "../components/StateView";
export function PlanningScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [day, setDay] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const start = new Date(`${day}T00:00:00`);
  const end = addDays(start, 1);
  const events = useQuery({
    queryKey: ["calendar-events", "planning", day],
    queryFn: () =>
      endpoints.calendarEvents({
        start: start.toISOString(),
        end: end.toISOString(),
      }),
  });
  const logs = useInfiniteQuery({
    queryKey: ["work-logs", "planning", day],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => endpoints.workLogs(pageParam, day),
    getNextPageParam: (page) => page.meta?.next_page ?? undefined,
  });
  const rows = [
    ...(events.data?.data || []).map((event) => ({
      id: `event:${event.id}`,
      title: event.title,
      time: event.all_day
        ? "All day"
        : format(new Date(event.start_at), "HH:mm"),
      path: event.managed_operation
        ? `/projects/${event.project_id}/environments`
        : `/more/calendar?eventId=${event.id}`,
      kind: "Event",
    })),
    ...(logs.data?.pages.flatMap((page) => page.data) || []).map((log) => ({
      id: `log:${log.id}`,
      title: log.title,
      time: log.start_time,
      path: `/work?mode=logs&date=${day}&logId=${log.id}`,
      kind: "Work log",
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <Screen
      header={
        <PageHeader
          title="Planning"
          subtitle="Daily events and work entries"
          leading={
            <Pressable accessibilityLabel="Back" onPress={() => router.back()}>
              <Text style={{ color: theme.primary, padding: 12 }}>Back</Text>
            </Pressable>
          }
        />
      }
    >
      <View style={{ padding: 16, gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Pressable
            accessibilityLabel="Previous day"
            onPress={() => setDay(format(addDays(start, -1), "yyyy-MM-dd"))}
          >
            <Text style={{ color: theme.primary, padding: 12 }}>Previous</Text>
          </Pressable>
          <Text style={{ color: theme.text }}>{day}</Text>
          <Pressable
            accessibilityLabel="Next day"
            onPress={() => setDay(format(addDays(start, 1), "yyyy-MM-dd"))}
          >
            <Text style={{ color: theme.primary, padding: 12 }}>Next</Text>
          </Pressable>
        </View>
        {!user?.demo_account ? (
          <>
            <PrimaryButton
              label="Add event"
              onPress={() =>
                router.push(`/create?type=event&date=${day}` as never)
              }
            />
            <PrimaryButton
              label="Add work entry"
              onPress={() =>
                router.push(`/create?type=work_log&date=${day}` as never)
              }
            />
          </>
        ) : null}
      </View>
      {events.isError ? (
        <ErrorState
          message={apiErrorMessage(events.error)}
          onRetry={() => events.refetch()}
        />
      ) : null}
      {logs.isError ? (
        <ErrorState
          message={apiErrorMessage(logs.error)}
          onRetry={() => logs.refetch()}
        />
      ) : null}
      {events.isPending || logs.isPending ? <LoadingState /> : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ padding: 16 }}
        onRefresh={() => {
          void events.refetch();
          void logs.refetch();
        }}
        refreshing={
          events.isRefetching || (logs.isRefetching && !logs.isFetchingNextPage)
        }
        ListEmptyComponent={
          !events.isPending &&
          !logs.isPending &&
          !events.isError &&
          !logs.isError ? (
            <EmptyState
              title="Nothing planned"
              message="Choose another day or add an event or work entry."
            />
          ) : null
        }
        ListFooterComponent={
          logs.hasNextPage ? (
            <PrimaryButton
              label="Load more work entries"
              loading={logs.isFetchingNextPage}
              onPress={() => {
                if (!logs.isFetchingNextPage) void logs.fetchNextPage();
              }}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(item.path as never)}
            style={{
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              {item.title}
            </Text>
            <Text style={{ color: theme.textMuted }}>
              {item.time} · {item.kind}
            </Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}
