export interface Note { id: string; text: string }
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data as T;
}
