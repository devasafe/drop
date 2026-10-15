/** Simula a largura da tela para hooks com matchMedia (o jsdom não tem matchMedia). */
export function setViewportWidth(px: number): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      const max = /max-width:\s*(\d+)px/.exec(query);
      const matches = min ? px >= Number(min[1]) : max ? px <= Number(max[1]) : false;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      };
    },
  });
}

export function resetViewport(): void {
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
}
