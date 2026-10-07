import { createContext } from 'react';

export const GraphContext = createContext<{
  onToggleCollapse: (id: string) => void;
  hasChildren: (id: string) => boolean;
}>({
  onToggleCollapse: () => {},
  hasChildren: () => false,
});
