export function logDevelopmentError(error: unknown): void {
  if (__DEV__) {
    console.error(error);
  }
}
