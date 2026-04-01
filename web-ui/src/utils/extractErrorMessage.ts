import type { AxiosError } from 'axios';

export function extractErrorMessage(error: unknown): string {
  const axErr = error as AxiosError<{ error?: string }>;
  return axErr.response?.data?.error || (error instanceof Error ? error.message : 'Unknown error');
}
