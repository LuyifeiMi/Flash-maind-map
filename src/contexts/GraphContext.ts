import { createContext } from 'react';

export const GraphContext = createContext<{
  onToggleCollapse: (id: string) => void;
}>({
  onToggleCollapse: () => {},
});
