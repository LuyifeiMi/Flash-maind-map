import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, Circle, Layers } from 'lucide-react';
import { Node } from '@xyflow/react';
import { cn } from '../lib/utils';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingNodes: Node[];
  onConfirm: (selectedIds: string[]) => void;
  mode: 'new' | 'expand';
}

export function PreviewModal({ isOpen, onClose, pendingNodes, onConfirm, mode }: PreviewModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      // Select all by default when opened
      setSelectedIds(new Set(pendingNodes.map(n => n.id)));
    }
  }, [isOpen, pendingNodes]);

  if (!isOpen) return null;

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => setSelectedIds(new Set(pendingNodes.map(n => n.id)));
  const deselectAll = () => setSelectedIds(new Set());

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-3xl bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] z-10"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-slate-200 bg-white rounded-t-2xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {mode === 'new' ? 'Review Generated Map' : 'Review Expanded Concepts'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Select the flashcards you want to add to your mind map.
                </p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-3 bg-white border-b border-slate-200 flex justify-between items-center">
              <span className="text-sm font-medium text-slate-600">
                {selectedIds.size} of {pendingNodes.length} selected
              </span>
              <div className="flex gap-3">
                <button onClick={selectAll} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Select All</button>
                <button onClick={deselectAll} className="text-sm text-slate-500 hover:text-slate-700 font-medium">Deselect All</button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {pendingNodes.map((node) => {
                const isSelected = selectedIds.has(node.id);
                return (
                  <div 
                    key={node.id}
                    onClick={() => toggleSelection(node.id)}
                    className={cn(
                      "p-4 rounded-xl border-2 cursor-pointer transition-all flex gap-4 bg-white shadow-sm hover:shadow-md",
                      isSelected ? "border-indigo-500 ring-1 ring-indigo-500/20" : "border-slate-200 hover:border-indigo-300"
                    )}
                  >
                    <div className="pt-1">
                      {isSelected ? (
                        <CheckCircle2 className="text-indigo-600" size={24} />
                      ) : (
                        <Circle className="text-slate-300" size={24} />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1 bg-indigo-50 rounded text-indigo-600">
                          <Layers size={14} />
                        </div>
                        <h3 className="font-bold text-slate-800">{node.data.label}</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Question</span>
                          <p className="text-sm text-slate-700">{node.data.question}</p>
                        </div>
                        <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50">
                          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1">Answer</span>
                          <p className="text-sm text-slate-700">{node.data.answer}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200 bg-white rounded-b-2xl flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(Array.from(selectedIds))}
                disabled={selectedIds.size === 0}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
              >
                Add {selectedIds.size} Cards to Map
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
