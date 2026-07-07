import { Handle, Position, useReactFlow } from '@xyflow/react';
import { BrainCircuit, Layers, Plus, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useContext } from 'react';
import { GraphContext } from '../contexts/GraphContext';

export function CustomNode({ id, data, selected }: { id: string, data: any; selected: boolean }) {
  const depth = data.depth || 0;
  const { getEdges } = useReactFlow();
  const edges = getEdges();
  const hasChildren = edges.some(e => e.source === id);
  const { onToggleCollapse } = useContext(GraphContext);
  
  let sizeClasses = "";
  let titleClasses = "";
  let iconSize = 16;
  let textClasses = "";
  
  if (depth === 0) {
    sizeClasses = "w-[320px] min-h-[140px] p-6";
    titleClasses = "text-xl font-bold";
    iconSize = 24;
    textClasses = "text-sm line-clamp-3";
  } else if (depth === 1) {
    sizeClasses = "w-[260px] min-h-[110px] p-5";
    titleClasses = "text-lg font-semibold";
    iconSize = 20;
    textClasses = "text-sm line-clamp-2";
  } else if (depth === 2) {
    sizeClasses = "w-[200px] min-h-[80px] p-4";
    titleClasses = "text-base font-medium";
    iconSize = 16;
    textClasses = "text-xs line-clamp-2";
  } else {
    sizeClasses = "w-[160px] min-h-[60px] p-3";
    titleClasses = "text-sm font-medium";
    iconSize = 14;
    textClasses = "text-[10px] line-clamp-1";
  }

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-white border-2 transition-all flex flex-col justify-center relative",
        sizeClasses,
        selected && !data.isGhost ? "border-indigo-500 shadow-lg scale-105" : "border-slate-200 hover:border-indigo-300",
        data.isGhost && "opacity-50 border-dashed border-indigo-400"
      )}
    >
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-indigo-400" />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600 flex-shrink-0">
          {data.isRoot ? <BrainCircuit size={iconSize} /> : <Layers size={iconSize} />}
        </div>
        <div className={cn("text-slate-800 truncate", titleClasses)}>
          {data.label}
        </div>
      </div>
      
      <div className={cn("text-slate-500 mt-1 overflow-hidden", textClasses)}>
        <span className="font-medium text-slate-600">Q:</span> 
        <div className="inline ml-1 align-top pointer-events-none">
          <MarkdownRenderer content={data.question} className="!text-inherit !text-[inherit] inline [&>p]:inline [&>p]:mb-0 [&_pre]:hidden" />
        </div>
      </div>

      {hasChildren && (
        <button
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-indigo-400 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-50 hover:scale-110 transition-all z-10 shadow-sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(id);
          }}
        >
          {data.isCollapsed ? <Plus size={14} strokeWidth={3} /> : <Minus size={14} strokeWidth={3} />}
        </button>
      )}

      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-indigo-400" />
    </div>
  );
}
