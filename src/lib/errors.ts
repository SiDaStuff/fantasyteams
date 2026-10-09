/**
 * Normalizes an unknown error into a human-readable message so UI code never
 * crashes on unexpected error types.
 */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (typeof error === 'string' && error.trim() !== '') return error;

  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    String((error as { message: string }).message).trim() !== ''
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}