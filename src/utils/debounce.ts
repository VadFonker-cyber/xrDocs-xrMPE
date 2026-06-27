export type DebouncedFunction<T extends (...args: any[]) => void> = ((...args: Parameters<T>) => void) & {
  cancel(): void;
};

export function debounce<T extends (...args: any[]) => void>(fn: T, delayMs: number): DebouncedFunction<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = ((...args: Parameters<T>) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  }) as DebouncedFunction<T>;

  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return debounced;
}
