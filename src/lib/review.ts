import type { FlashNode, FlashNodeData, ReviewRating, ReviewResult } from '../types';

const INTERVALS = [1, 5, 30, 720, 1440, 4320, 10080, 20160, 43200, 86400];
export function isReviewable(node: FlashNode) {
  return node.type === 'custom' && node.data.reviewEnabled !== false && !node.data.isSuspended
    && !!node.data.question?.trim() && !!node.data.answer?.trim();
}
export function isDue(node: FlashNode, now = Date.now()) {
  return isReviewable(node) && (!node.data.nextReviewDate || node.data.nextReviewDate <= now);
}
export function learningStatus(node: FlashNode, now = Date.now()) {
  if (!isReviewable(node)) return { label: '仅知识节点', color: 'slate' };
  if (node.data.lastRating === 'forgot') return { label: '最近答错', color: 'rose' };
  if (!node.data.nextReviewDate) return { label: '未学习', color: 'indigo' };
  if (isDue(node, now)) return { label: '待复习', color: 'amber' };
  return { label: '已复习', color: 'emerald' };
}
export function rateCard(id: string, data: FlashNodeData, rating: ReviewRating, now = Date.now()): ReviewResult {
  const current = Math.max(0, Math.min(data.srsLevel || 0, INTERVALS.length - 1));
  const level = rating === 'forgot' ? 0 : rating === 'hard' ? Math.max(1, current) : Math.min(current + (rating === 'easy' ? 2 : 1), INTERVALS.length - 1);
  const nextReviewDate = now + INTERVALS[level] * 60_000;
  return { id, srsLevel: level, nextReviewDate, lastRating: rating,
    reviewHistory: [...(data.reviewHistory || []), { at: now, rating, nextReviewDate }].slice(-200) };
}
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
