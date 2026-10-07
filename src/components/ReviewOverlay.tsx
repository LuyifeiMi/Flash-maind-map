import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, XCircle, Trophy, BrainCircuit, RotateCcw } from 'lucide-react';
import type { FlashNode as Node, ReviewRating, ReviewResult } from '../types';
import { isReviewable, isDue, rateCard, shuffle } from '../lib/review';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ReviewOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: Node[];
  onSaveProgress: (results: ReviewResult[]) => void;
  topicTitle?: string;
  onLocateNode?: (id: string) => void;
  forceReviewAll?: boolean;
  onSelectTopic?: () => void;
}

export function ReviewOverlay({ isOpen, onClose, nodes, onSaveProgress, forceReviewAll, onSelectTopic, topicTitle, onLocateNode }: ReviewOverlayProps) {
  const [queue, setQueue] = useState<Node[]>([]);
  const [initialCount, setInitialCount] = useState(0);
  const [failedThisSession, setFailedThisSession] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [menuMode, setMenuMode] = useState<'menu' | 'reviewing' | 'test' | 'suspended'>('menu');
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const ratingLock = useRef(false);
  const [testScore, setTestScore] = useState({ correct: 0, incorrect: 0 });

  useEffect(() => {
    if (isOpen) {
      if (forceReviewAll) {
        startReview('daily', true);
      } else {
        setMenuMode('menu');
        setHasStarted(false);
      }
    } else {
      setHasStarted(false);
      setMenuMode('menu');
    }
  }, [isOpen, forceReviewAll]);

  const startReview = (type: 'daily' | 'difficult' | 'test', forceAll: boolean = false) => {
    const flashcardNodes = nodes.filter(n => isReviewable(n));
    let dueNodes: Node[] = [];

    if (forceAll) {
      dueNodes = flashcardNodes;
    } else if (type === 'daily') {
      dueNodes = flashcardNodes.filter(n => isDue(n));
    } else if (type === 'difficult') {
      dueNodes = flashcardNodes.filter(n => n.data.lastRating === 'forgot' || (n.data.srsLevel === 0 && n.data.nextReviewDate));
      if (dueNodes.length === 0) {
        dueNodes = flashcardNodes.filter(n => !n.data.srsLevel || (n.data.srsLevel as number) <= 1);
      }
    } else if (type === 'test') {
      dueNodes = shuffle(flashcardNodes).slice(0, 10);
    }

    const shuffled = shuffle(dueNodes);
    setCompleted(new Set());
    ratingLock.current = false;
    setQueue(shuffled);
    setInitialCount(shuffled.length);
    setFailedThisSession(new Set());
    setResults([]);
    setIsFlipped(false);
    setIsFinished(false);
    setHasStarted(true);
    setMenuMode(type === 'test' ? 'test' : 'reviewing');
    setTestScore({ correct: 0, incorrect: 0 });
  };

  const handleClose = () => onClose();
  const saveResult = (result: ReviewResult) => {
    setResults(previous => [...previous.filter(r => r.id !== result.id), result]);
    onSaveProgress([result]);
  };
  const handleRating = (rating: ReviewRating) => {
    const card = queue[0];
    if (!card || !isFlipped || ratingLock.current) return;
    ratingLock.current = true;
    if (menuMode === 'test') {
      setTestScore(previous => ({ correct: previous.correct + (rating === 'forgot' ? 0 : 1), incorrect: previous.incorrect + (rating === 'forgot' ? 1 : 0) }));
    } else {
      const data = nodes.find(n => n.id === card.id)?.data || card.data;
      saveResult(rateCard(card.id, data, rating));
      if (rating === 'forgot') {
        setFailedThisSession(previous => new Set(previous).add(card.id));
        setQueue(previous => [...previous.slice(1), card]);
        setIsFlipped(false);
        return;
      }
    }
    setCompleted(previous => new Set(previous).add(card.id));
    const remaining = queue.slice(1);
    setQueue(remaining); setIsFlipped(false);
    if (!remaining.length) setIsFinished(true);
  };
  const handleRemembered = () => handleRating('good');
  const handleForgot = () => handleRating('forgot');
  const handleSuspend = () => {
    const card = queue[0]; if (!card || ratingLock.current) return;
    ratingLock.current = true;
    saveResult({ id: card.id, isSuspended: true });
    setCompleted(previous => new Set(previous).add(card.id));
    const remaining = queue.slice(1); setQueue(remaining); setIsFlipped(false);
    if (!remaining.length) setIsFinished(true);
  };
  useEffect(() => { ratingLock.current = false; }, [queue, isFlipped]);
  useEffect(() => {
    if (!isOpen || !hasStarted || isFinished || !queue.length) return;
    const handleKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,button,[contenteditable=true]')) return;
      if (event.code === 'Space') { event.preventDefault(); setIsFlipped(value => !value); }
      else if (isFlipped && ['1','2','3','4'].includes(event.key)) {
        event.preventDefault();
        if (menuMode === 'test') { if (event.key === '1') handleForgot(); else if (event.key === '3') handleRemembered(); }
        else handleRating(({ '1': 'forgot', '2': 'hard', '3': 'good', '4': 'easy' } as const)[event.key as '1'|'2'|'3'|'4']);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  if (!isOpen) return null;

  if (menuMode === 'menu') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-800">复习模式</h2>
            <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
              <X size={24} />
            </button>
          </div>
          
          <div className="flex flex-col gap-3">
            <button onClick={() => startReview('daily')} className="p-4 text-left border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">每日复习</div>
<div className="text-sm text-slate-500">{nodes.filter(n => isDue(n)).length} 张待复习 · 空卡片与仅知识节点会自动跳过</div>
            </button>
            <button onClick={() => startReview('difficult')} className="p-4 text-left border border-slate-200 hover:border-amber-300 hover:bg-amber-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">困难卡片</div>
              <div className="text-sm text-slate-500">优先复习最近答错或刚开始学习的卡片</div>
            </button>
            <button onClick={() => { if (onSelectTopic) onSelectTopic(); }} className="p-4 text-left border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">按主题复习</div>
              <div className="text-sm text-slate-500">回到导图，选择一个节点复习它的子树</div>
            </button>
            <button onClick={() => startReview('test')} className="p-4 text-left border border-slate-200 hover:border-purple-300 hover:bg-purple-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">小测验</div>
              <div className="text-sm text-slate-500">随机抽取最多 10 道题，自评结果，不改变复习计划</div>
            </button>
            <button onClick={() => setMenuMode('suspended')} className="p-4 text-left border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">恢复暂停的卡片</div>
              <div className="text-sm text-slate-500">查看并恢复暂时不参与复习的卡片</div>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (menuMode === 'suspended') {
    const suspendedNodes = nodes.filter(n => n.type === 'custom' && n.data.isSuspended);
    
    const handleRestore = (id: string) => {
      saveResult({ id, isSuspended: false });
    };

    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-slate-900/90 backdrop-blur-md p-4 sm:p-8">
        <div className="w-full max-w-4xl flex items-center justify-between text-white mb-8">
          <div className="flex items-center gap-3">
            <XCircle className="text-slate-400" />
            <span className="font-bold text-sm tracking-wide">暂停的卡片</span>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl max-h-[70vh] flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800">暂停的卡片</h2>
            <button onClick={() => setMenuMode('menu')} className="text-indigo-600 hover:text-indigo-700 font-medium text-sm">
              返回菜单
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
            {suspendedNodes.length === 0 ? (
              <div className="text-center py-12 text-slate-500">没有暂停的卡片</div>
            ) : (
              <div className="flex flex-col gap-3">
                {suspendedNodes.map(node => {
                  const isRestored = results.some(r => r.id === node.id && r.isSuspended === false);
                  if (isRestored) return null; // Hide from list if restored in this session
                  
                  return (
                    <div key={node.id} className="p-4 border border-slate-200 rounded-xl flex justify-between items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">{node.data.label}</div>
                        <div className="text-sm text-slate-500 truncate">{node.data.question}</div>
                      </div>
                      <button 
                        onClick={() => handleRestore(node.id)}
                        className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg font-medium transition-colors shrink-0"
                      >
                        恢复
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // State 1: No cards due
  if (hasStarted && initialCount === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl"
        >
          <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">当前没有待复习卡片</h2>
          <p className="text-slate-500 mb-8">该模式下暂时没有可复习卡片，稍后再来看看。</p>
          <button onClick={handleClose} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">
            返回导图
          </button>
        </motion.div>
      </div>
    );
  }

  // State 2: 完成ed reviewing
  if (isFinished) {
    if (menuMode === 'test') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl"
          >
            <div className="w-20 h-20 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">小测验完成</h2>
            <p className="text-slate-500 mb-8">以下是本次自评结果。</p>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                <div className="text-3xl font-bold text-emerald-600 mb-1">{testScore.correct}</div>
                <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">答对</div>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                <div className="text-3xl font-bold text-red-600 mb-1">{testScore.incorrect}</div>
                <div className="text-xs font-semibold text-red-800 uppercase tracking-wider">答错</div>
              </div>
            </div>

            <button onClick={handleClose} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">
              完成
            </button>
          </motion.div>
        </div>
      );
    }

    const suspended = results.filter(r => r.isSuspended).length;
    const passedFirstTime = Math.max(0, initialCount - failedThisSession.size - suspended);
    const repeated = failedThisSession.size;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl"
        >
          <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <BrainCircuit size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">🎉 复习完成</h2>
          <p className="text-slate-500 mb-8">本次完成 {initialCount} 张卡片的复习。</p>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <div className="text-3xl font-bold text-emerald-600 mb-1">{passedFirstTime}</div>
              <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">首次答对</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <div className="text-3xl font-bold text-amber-600 mb-1">{repeated}</div>
              <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">本次重复</div>
            </div>
          </div>

          {failedThisSession.size > 0 && <div className="mb-6 max-h-36 overflow-y-auto text-left">
            <p className="mb-2 text-sm font-semibold text-slate-700">本次薄弱知识点</p>
            {[...failedThisSession].map(id => <button key={id} onClick={() => onLocateNode?.(id)} className="mb-1 block text-sm text-rose-600 hover:underline">{nodes.find(n => n.id === id)?.data.label} → 回到导图</button>)}
          </div>}
          <button onClick={handleClose} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">
            完成（进度已逐题保存）
          </button>
        </motion.div>
      </div>
    );
  }

  // State 3: Active Review
  const currentCard = queue[0];
  const progressPercentage = initialCount ? (completed.size / initialCount) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-slate-900/90 backdrop-blur-md p-4 sm:p-8">
      {/* Top Bar */}
      <div className="w-full max-w-4xl flex items-center justify-between text-white mb-8">
        <div className="flex items-center gap-3">
          <BrainCircuit className="text-indigo-400" />
          <span className="font-bold text-lg tracking-wide">
            {topicTitle || (menuMode === 'test' ? '小测验' : '每日复习')}
          </span>
        </div>
        <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={24} />
        </button>
      </div>

      {onLocateNode && queue[0] && <button onClick={() => onLocateNode(queue[0].id)} className="mb-4 text-sm text-indigo-200 hover:underline">在导图中查看：{queue[0].data.label}</button>}
      {/* 进度 Bar */}
      <div className="w-full max-w-2xl mb-4">
        <div className="flex justify-between text-xs font-medium text-slate-400 mb-2">
          <span>进度</span>
          <span>{menuMode === 'test' ? (testScore.correct + testScore.incorrect) : completed.size} / {initialCount}</span>
        </div>
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-indigo-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${menuMode === 'test' ? ((testScore.correct + testScore.incorrect) / initialCount) * 100 : progressPercentage}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <div className="relative w-full max-w-2xl h-[min(24rem,45dvh)] min-h-56 shrink-0 [perspective:1000px]">
        <motion.div
          className="w-full h-full relative [transform-style:preserve-3d] cursor-pointer"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 260, damping: 20 }}
          onClick={() => setIsFlipped(!isFlipped)}
        >
          {/* Front */}
          <div className="absolute inset-0 [backface-visibility:hidden] bg-white rounded-3xl shadow-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center">
            <span className="absolute top-6 left-6 text-xs font-bold text-slate-300 uppercase tracking-widest">问题</span>
            <div className="w-full text-left overflow-y-auto custom-scrollbar max-h-[80%]">
              <MarkdownRenderer content={currentCard?.data.question || ''} />
            </div>
            <p className="absolute bottom-8 text-slate-400 text-sm font-medium animate-pulse">点击或按空格显示答案</p>
          </div>
          
          {/* Back */}
          <div 
            className="absolute inset-0 [backface-visibility:hidden] bg-indigo-50 rounded-3xl shadow-2xl border border-indigo-100 p-8 sm:p-12 flex flex-col items-center justify-center text-center" 
            style={{ transform: 'rotateY(180deg)' }}
          >
            <span className="absolute top-6 left-6 text-xs font-bold text-indigo-300 uppercase tracking-widest">答案</span>
            <h3 className="text-xl font-bold text-indigo-900 mb-6 pb-6 border-b border-indigo-200/50 w-full">{currentCard?.data.label}</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar w-full flex items-start justify-start text-left">
              <MarkdownRenderer content={currentCard?.data.answer || ''} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Action Buttons */}
      <div className="w-full max-w-2xl mt-4 min-h-20 shrink-0">
        <AnimatePresence>
          {isFlipped && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex flex-wrap gap-2 justify-center"
            >
              {menuMode !== 'test' && (
                <button 
                  onClick={handleSuspend}
                  className="flex-1 max-w-[150px] py-3 bg-white hover:bg-slate-100 text-slate-500 border-2 border-slate-200 hover:border-slate-300 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-1"
                  title="暂停这张卡片，可在菜单中恢复"
                >
                  <XCircle size={20} />
                  暂停
                </button>
              )}
              <button 
                onClick={handleForgot}
                className="flex-1 max-w-[200px] py-4 bg-white hover:bg-red-50 text-red-600 border-2 border-red-100 hover:border-red-200 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                <RotateCcw size={20} />
                {menuMode === 'test' ? '答错 1' : '忘记 1'}
              </button>
              {menuMode !== 'test' && <button onClick={() => handleRating('hard')} className="flex-1 rounded-2xl bg-amber-100 px-3 py-4 font-bold text-amber-800">困难 2</button>}
              <button 
                onClick={handleRemembered}
                className="flex-1 max-w-[200px] py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-1"
              >
                <Check size={24} />
                {menuMode === 'test' ? '答对 3' : '记得 3'}
              </button>
              {menuMode !== 'test' && <button onClick={() => handleRating('easy')} className="flex-1 rounded-2xl bg-indigo-500 px-3 py-4 font-bold text-white">轻松 4</button>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

