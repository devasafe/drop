/**
 * Utilitário de debouncing para evitar spam de eventos
 * Especialmente útil para location updates de motoboys
 */

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Debounce com leading edge (executa imediatamente e depois aguarda)
 */
export function debounceLeading<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let lastCall = 0;

  return function executedFunction(...args: Parameters<T>) {
    const now = Date.now();
    const isLeading = now - lastCall >= wait;

    if (isLeading) {
      func(...args);
      lastCall = now;
    }

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (Date.now() - lastCall >= wait) {
        func(...args);
        lastCall = Date.now();
      }
      timeout = null;
    }, wait);
  };
}

/**
 * Throttle - executa no máximo uma vez a cada wait ms
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return function executedFunction(...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= wait) {
      func(...args);
      lastCall = now;
    }
  };
}
