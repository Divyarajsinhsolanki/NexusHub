import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { TaskStatus } from '../api/types';

export function useTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => endpoints.updateTask(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-tasks'] });
    },
    onError: (error) => Alert.alert('Unable to update task', apiErrorMessage(error)),
  });
}
