declare module 'virtual:mini-start/registry' {
  export const registry: Record<string, { exportName: string; load: () => Promise<(options: { data: unknown }) => Promise<{ result: unknown } | { error: string }>> }>;
}
