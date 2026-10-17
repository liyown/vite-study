import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
const LoaderData = createContext<unknown>(undefined);
// 只实现单页示例需要的 loader/component/useLoaderData，不是完整路由器。
export function createFileRoute(_path: '/') {
  return function<Data>(options: { loader: () => Promise<Data>; component: ComponentType }) {
    return { ...options, useLoaderData: () => useContext(LoaderData) as Data };
  };
}
export function RouterProvider({ data, children }: { data: unknown; children: ReactNode }) {
  return <LoaderData.Provider value={data}>{children}</LoaderData.Provider>;
}
