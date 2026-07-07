import { motion, AnimatePresence } from 'motion/react';
import { X, RotateCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface FlashcardModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeData: {
    label: string;
    question: string;
    answer: string;
  } | null;
}

export function FlashcardModal({ isOpen, onClose, nodeData }: FlashcardModalProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  // Reset flip state when a new card is opened
  useEffect(() => {
    if (isOpen) {
      setIsFlipped(false);
    }
  }, [isOpen, nodeData]);

  if (!nodeData) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          
          <div className="relative w-full max-w-2xl perspective-1000 z-10 h-[500px]">
            <motion.div
              className="w-full h-full relative preserve-3d cursor-pointer"
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
              onClick={() => setIsFlipped(!isFlipped)}
            >
              {/* Front of card (Question) */}
              <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 flex flex-col">
                <div className="flex justify-between items-start mb-6">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                    {nodeData.label}
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="flex-1 flex flex-col items-center justify-center text-center overflow-y-auto custom-scrollbar">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Question</h3>
                  <div className="text-xl font-medium text-slate-800 leading-relaxed text-left w-full">
                    <MarkdownRenderer content={nodeData.question} />
                  </div>
                </div>
                
                <div className="mt-auto pt-4 flex justify-center text-slate-400 items-center gap-2 text-sm">
                  <RotateCw size={16} />
                  <span>Click to reveal answer</span>
                </div>
              </div>

              {/* Back of card (Answer) */}
              <div 
                className="absolute inset-0 backface-hidden bg-indigo-600 rounded-3xl shadow-2xl border border-indigo-500 p-8 flex flex-col text-white"
                style={{ transform: "rotateY(180deg)" }}
              >
                <div className="flex justify-between items-start mb-6">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/50 text-indigo-50">
                    {nodeData.label}
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="p-2 text-indigo-200 hover:text-white hover:bg-indigo-500 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="flex-1 flex flex-col items-center justify-center text-center overflow-y-auto custom-scrollbar">
                  <h3 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider mb-4">Answer</h3>
                  <div className="text-lg font-medium text-white leading-relaxed text-left w-full">
                    <MarkdownRenderer content={nodeData.answer} dark={true} />
                  </div>
                </div>
                
                <div className="mt-auto pt-4 flex justify-center text-indigo-300 items-center gap-2 text-sm">
                  <RotateCw size={16} />
                  <span>Click to flip back</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
