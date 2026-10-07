import type { Node } from '@xyflow/react';

export type ReviewRating = 'forgot' | 'hard' | 'good' | 'easy';
export interface ReviewLog {
  at: number;
  rating: ReviewRating;
  nextReviewDate: number;
}
export type FlashNodeData = Record<string, unknown> & {
  label?: string;
  question?: string;
  answer?: string;
  isRoot?: boolean;
  depth?: number;
  isCollapsed?: boolean;
  isGhost?: boolean;
  reviewEnabled?: boolean;
  isSuspended?: boolean;
  srsLevel?: number;
  nextReviewDate?: number;
  lastRating?: ReviewRating;
  reviewHistory?: ReviewLog[];
  sourceExcerpt?: string;
  targetIds?: string[];
};
export type FlashNode = Node<FlashNodeData>;
export type ReviewResult = Partial<FlashNodeData> & { id: string };
export interface MapItem {
  id: string;
  title: string;
  nodes: string;
  edges: string;
  updatedAt: string;
}
