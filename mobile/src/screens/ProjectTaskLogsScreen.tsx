import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { endpoints } from "../api/endpoints";
import { apiErrorMessage } from "../api/client";
import { EntityCollectionScreen } from "../components/EntityCollectionScreen";
import { PrimaryButton } from "../components/PrimaryButton";
import { ErrorState, LoadingState } from "../components/StateView";
export function ProjectTaskLogsScreen({
  projectId,
  canWrite,
}: {
  projectId: number;
  canWrite: boolean;
}) {
  const tasks = useInfiniteQuery({
    queryKey: ["log-task-options", projectId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      endpoints.tasks({
        project_id: projectId,
        page: pageParam,
        per_page: 100,
      }),
    getNextPageParam: (page) => page.meta?.next_page ?? undefined,
  });
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => endpoints.project(projectId),
  });
  return (
    <EntityCollectionScreen
      canWrite={canWrite}
      title="Task logs"
      subtitle="Delivery effort and status records"
      path="/task_logs"
      params={{ project_id: projectId }}
      wrapper="task_log"
      primary="type"
      secondary={["log_date", "hours_logged", "status"]}
      toolbar={
        <View>
          {tasks.isPending ? (
            <LoadingState label="Loading task choices" />
          ) : tasks.isError ? (
            <ErrorState
              message={apiErrorMessage(tasks.error)}
              onRetry={() => tasks.refetch()}
            />
          ) : null}
          {tasks.hasNextPage ? (
            <PrimaryButton
              label="Load more task choices"
              loading={tasks.isFetchingNextPage}
              onPress={() => {
                if (!tasks.isFetchingNextPage) void tasks.fetchNextPage();
              }}
            />
          ) : null}
        </View>
      }
      fields={[
        {
          key: "task_id",
          label: "Task",
          required: true,
          options: (tasks.data?.pages.flatMap((page) => page.data) || []).map(
            (task) => ({
              label: `#${task.id} ${task.title || ""}`,
              value: String(task.id),
            }),
          ),
        },
        {
          key: "developer_id",
          label: "Developer",
          required: true,
          options: (project.data?.users || []).map((person) => ({
            label: String(person.name || person.full_name || person.id),
            value: String(person.id),
          })),
        },
        {
          key: "type",
          label: "Log type",
          options: ["Code", "qa"],
          required: true,
        },
        {
          key: "log_date",
          label: "Log date",
          placeholder: "YYYY-MM-DD",
          required: true,
        },
        {
          key: "hours_logged",
          label: "Hours",
          keyboardType: "numeric",
          required: true,
        },
        { key: "status", label: "Status" },
      ]}
    />
  );
}
