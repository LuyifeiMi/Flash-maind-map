import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, XCircle, Trophy, BrainCircuit, RotateCcw } from 'lucide-react';
import { Node } from '@xyflow/react';
import { MarkdownRenderer } from './MarkdownRenderer';

const SRS_INTERVALS = [1, 5, 30, 12 * 60, 24 * 60, 3 * 24 * 60, 7 * 24 * 60]; // in minutes

interface ReviewOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: Node[];
  onSaveProgress: (results: any[]) => void;
  forceReviewAll?: boolean;
  onSelectTopic?: () => void;
}

export function ReviewOverlay({ isOpen, onClose, nodes, onSaveProgress, forceReviewAll, onSelectTopic }: ReviewOverlayProps) {
  const [queue, setQueue] = useState<Node[]>([]);
  const [initialCount, setInitialCount] = useState(0);
  const [failedThisSession, setFailedThisSession] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<any[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [menuMode, setMenuMode] = useState<'menu' | 'reviewing' | 'test' | 'suspended'>('menu');
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
    const flashcardNodes = nodes.filter(n => n.type === 'custom' && !n.data.isSuspended);
    let dueNodes: Node[] = [];

    if (forceAll) {
      dueNodes = flashcardNodes;
    } else if (type === 'daily') {
      dueNodes = flashcardNodes.filter(n => !n.data.nextReviewDate || (n.data.nextReviewDate as number) <= Date.now());
    } else if (type === 'difficult') {
      dueNodes = flashcardNodes.filter(n => n.data.srsLevel === 0 && n.data.nextReviewDate);
      if (dueNodes.length === 0) {
        dueNodes = flashcardNodes.filter(n => !n.data.srsLevel || (n.data.srsLevel as number) <= 1);
      }
    } else if (type === 'test') {
      dueNodes = [...flashcardNodes].sort(() => Math.random() - 0.5).slice(0, 10);
    }

    const shuffled = [...dueNodes].sort(() => Math.random() - 0.5);
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

  const handleClose = () => {
    onSaveProgress(results);
    onClose();
  };

  const handleRemembered = () => {
    const currentCard = queue[0];
    
    if (menuMode === 'test') {
      setTestScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      const newQueue = queue.slice(1);
      setQueue(newQueue);
      setIsFlipped(false);
      if (newQueue.length === 0) setIsFinished(true);
      return;
    }

    const hasFailed = failedThisSession.has(currentCard.id);
    
    const currentLevel = currentCard.data.srsLevel || 0;
    const newLevel = hasFailed ? 0 : Math.min(currentLevel + 1, SRS_INTERVALS.length - 1);
    const nextReviewDate = Date.now() + SRS_INTERVALS[newLevel] * 60 * 1000;

    setResults(prev => [
      ...prev.filter(r => r.id !== currentCard.id), 
      { id: currentCard.id, srsLevel: newLevel, nextReviewDate }
    ]);

    const newQueue = queue.slice(1);
    setQueue(newQueue);
    setIsFlipped(false);

    if (newQueue.length === 0) {
      setIsFinished(true);
    }
  };

  const handleForgot = () => {
    const currentCard = queue[0];

    if (menuMode === 'test') {
      setTestScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
      const newQueue = queue.slice(1);
      setQueue(newQueue);
      setIsFlipped(false);
      if (newQueue.length === 0) setIsFinished(true);
      return;
    }

    setFailedThisSession(prev => new Set(prev).add(currentCard.id));
    setQueue([...queue.slice(1), currentCard]);
    setIsFlipped(false);
  };

  const handleSuspend = () => {
    const currentCard = queue[0];
    
    setResults(prev => [
      ...prev.filter(r => r.id !== currentCard.id), 
      { id: currentCard.id, isSuspended: true }
    ]);

    const newQueue = queue.slice(1);
    setQueue(newQueue);
    setIsFlipped(false);

    if (newQueue.length === 0) {
      setIsFinished(true);
    }
  };

  if (!isOpen) return null;

  if (menuMode === 'menu') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-800">Review Mode</h2>
            <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
              <X size={24} />
            </button>
          </div>
          
          <div className="flex flex-col gap-3">
            <button onClick={() => startReview('daily')} className="p-4 text-left border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">Daily Review</div>
              <div className="text-sm text-slate-500">Review cards that are due today</div>
            </button>
            <button onClick={() => startReview('difficult')} className="p-4 text-left border border-slate-200 hover:border-amber-300 hover:bg-amber-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">Review Difficult Cards</div>
              <div className="text-sm text-slate-500">Focus on cards you frequently forget</div>
            </button>
            <button onClick={() => { if (onSelectTopic) onSelectTopic(); }} className="p-4 text-left border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">Review Specific Topic</div>
              <div className="text-sm text-slate-500">Select a node from the map to review its subtree</div>
            </button>
            <button onClick={() => startReview('test')} className="p-4 text-left border border-slate-200 hover:border-purple-300 hover:bg-purple-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">Test Mode</div>
              <div className="text-sm text-slate-500">Random 10 questions with scoring</div>
            </button>
            <button onClick={() => setMenuMode('suspended')} className="p-4 text-left border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-colors">
              <div className="font-bold text-slate-800">Restore Suspended Cards</div>
              <div className="text-sm text-slate-500">View and restore cards you've hidden</div>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (menuMode === 'suspended') {
    const suspendedNodes = nodes.filter(n => n.type === 'custom' && n.data.isSuspended);
    
    const handleRestore = (id: string) => {
      setResults(prev => [
        ...prev.filter(r => r.id !== id), 
        { id, isSuspended: false }
      ]);
    };

    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center bg-slate-900/90 backdrop-blur-md p-4 sm:p-8">
        <div className="w-full max-w-4xl flex items-center justify-between text-white mb-8">
          <div className="flex items-center gap-3">
            <XCircle className="text-slate-400" />
            <span className="font-bold text-lg tracking-wide">Suspended Cards</span>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl max-h-[70vh] flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800">Suspended Cards</h2>
            <button onClick={() => setMenuMode('menu')} className="text-indigo-600 hover:text-indigo-700 font-medium text-sm">
              Back to Menu
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
            {suspendedNodes.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No suspended cards.</div>
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
                        Restore
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
          <h2 className="text-2xl font-bold text-slate-800 mb-2">All Caught Up!</h2>
          <p className="text-slate-500 mb-8">You have reviewed all your flashcards for this mode. Check back later!</p>
          <button onClick={handleClose} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">
            Back to Map
          </button>
        </motion.div>
      </div>
    );
  }

  // State 2: Finished reviewing
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
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Test Complete!</h2>
            <p className="text-slate-500 mb-8">Here is your score for this session.</p>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                <div className="text-3xl font-bold text-emerald-600 mb-1">{testScore.correct}</div>
                <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Correct</div>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                <div className="text-3xl font-bold text-red-600 mb-1">{testScore.incorrect}</div>
                <div className="text-xs font-semibold text-red-800 uppercase tracking-wider">Incorrect</div>
              </div>
            </div>

            <button onClick={handleClose} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">
              Finish
            </button>
          </motion.div>
        </div>
      );
    }

    const passedFirstTime = initialCount - failedThisSession.size;
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
          <h2 className="text-2xl font-bold text-slate-800 mb-2">🎉 Review Complete!</h2>
          <p className="text-slate-500 mb-8">You reviewed {initialCount} concepts today.</p>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <div className="text-3xl font-bold text-emerald-600 mb-1">{passedFirstTime}</div>
              <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">First Try</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <div className="text-3xl font-bold text-amber-600 mb-1">{repeated}</div>
              <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Repeated</div>
            </div>
          </div>

          <button onClick={handleClose} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">
            Finish & Save
          </button>
        </motion.div>
      </div>
    );
  }

  // State 3: Active Review
  const currentCard = queue[0];
  const progressPercentage = (results.length / initialCount) * 100;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-slate-900/90 backdrop-blur-md p-4 sm:p-8">
      {/* Top Bar */}
      <div className="w-full max-w-4xl flex items-center justify-between text-white mb-8">
        <div className="flex items-center gap-3">
          <BrainCircuit className="text-indigo-400" />
          <span className="font-bold text-lg tracking-wide">
            {menuMode === 'test' ? 'Test Mode' : 'Daily Review'}
          </span>
        </div>
        <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-2xl mb-12">
        <div className="flex justify-between text-xs font-medium text-slate-400 mb-2">
          <span>Progress</span>
          <span>{menuMode === 'test' ? (testScore.correct + testScore.incorrect) : results.length} / {initialCount}</span>
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
      <div className="relative w-full max-w-2xl h-96 [perspective:1000px]">
        <motion.div
          className="w-full h-full relative [transform-style:preserve-3d] cursor-pointer"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.5, type: 'spring', stiffness: 260, damping: 20 }}
          onClick={() => setIsFlipped(!isFlipped)}
        >
          {/* Front */}
          <div className="absolute inset-0 [backface-visibility:hidden] bg-white rounded-3xl shadow-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center">
            <span className="absolute top-6 left-6 text-xs font-bold text-slate-300 uppercase tracking-widest">Question</span>
            <div className="w-full text-left overflow-y-auto custom-scrollbar max-h-[80%]">
              <MarkdownRenderer content={currentCard?.data.question || ''} />
            </div>
            <p className="absolute bottom-8 text-slate-400 text-sm font-medium animate-pulse">Click card to reveal answer</p>
          </div>
          
          {/* Back */}
          <div 
            className="absolute inset-0 [backface-visibility:hidden] bg-indigo-50 rounded-3xl shadow-2xl border border-indigo-100 p-8 sm:p-12 flex flex-col items-center justify-center text-center" 
            style={{ transform: 'rotateY(180deg)' }}
          >
            <span className="absolute top-6 left-6 text-xs font-bold text-indigo-300 uppercase tracking-widest">Answer</span>
            <h3 className="text-xl font-bold text-indigo-900 mb-6 pb-6 border-b border-indigo-200/50 w-full">{currentCard?.data.label}</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar w-full flex items-start justify-start text-left">
              <MarkdownRenderer content={currentCard?.data.answer || ''} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Action Buttons */}
      <div className="w-full max-w-2xl mt-12 h-20">
        <AnimatePresence>
          {isFlipped && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex gap-4 justify-center"
            >
              {menuMode !== 'test' && (
                <button 
                  onClick={handleSuspend}
                  className="flex-1 max-w-[150px] py-4 bg-white hover:bg-slate-100 text-slate-500 border-2 border-slate-200 hover:border-slate-300 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-1"
                  title="Suspend card (don't show again in review)"
                >
                  <XCircle size={20} />
                  Suspend
                </button>
              )}
              <button 
                onClick={handleForgot}
                className="flex-1 max-w-[200px] py-4 bg-white hover:bg-red-50 text-red-600 border-2 border-red-100 hover:border-red-200 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                <RotateCcw size={20} />
                {menuMode === 'test' ? 'Incorrect' : 'Forgot'}
              </button>
              <button 
                onClick={handleRemembered}
                className="flex-1 max-w-[200px] py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-1"
              >
                <Check size={24} />
                {menuMode === 'test' ? 'Correct' : 'Remembered'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

