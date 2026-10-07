import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save } from 'lucide-react';
import type { FlashNode, FlashNodeData } from '../types';

interface EditNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: FlashNode | null;
  onSave: (nodeId: string, newData: FlashNodeData) => void;
}

export function EditNodeModal({ isOpen, onClose, node, onSave }: EditNodeModalProps) {
  const [label, setLabel] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [reviewEnabled, setReviewEnabled] = useState(true);
  const [sourceExcerpt, setSourceExcerpt] = useState('');

  useEffect(() => {
    if (node && isOpen) {
      setLabel(node.data.label || '');
      setQuestion(node.data.question || '');
      setAnswer(node.data.answer || '');
      setReviewEnabled(node.data.reviewEnabled !== false);
      setSourceExcerpt(node.data.sourceExcerpt || '');
    }
  }, [node, isOpen]);

  if (!node) return null;

  const handleSave = () => {
    onSave(node.id, { ...node.data, label: label.trim(), question, answer, reviewEnabled, sourceExcerpt });
    onClose();
  };

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
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 z-10 flex flex-col gap-4"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-800">编辑知识点</h2>
              <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4 py-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={reviewEnabled} onChange={e => setReviewEnabled(e.target.checked)} />
                参与闪卡复习（题目和答案都填写后生效）
              </label>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">知识点标题</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., Photosynthesis"
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">闪卡问题</label>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What is the main purpose of..."
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm text-slate-800 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">闪卡答案</label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="The main purpose is to..."
                  rows={4}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm text-slate-800 resize-none custom-scrollbar"
                />
              </div>
            </div>

            <label className="text-xs text-slate-500">原文摘录（可选）
              <textarea value={sourceExcerpt} onChange={e => setSourceExcerpt(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" />
            </label>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!label.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2 shadow-sm"
              >
                <Save size={16} />
                保存修改
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
