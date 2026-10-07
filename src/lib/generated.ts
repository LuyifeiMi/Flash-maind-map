export interface GeneratedCard {
  id: string;
  parentId: string | null;
  label: string;
  question: string;
  answer: string;
  sourceExcerpt?: string;
}
export function validateCards(value: unknown, limit = 40): GeneratedCard[] {
  const items = Array.isArray(value) ? value : [value];
  if (!items.length || items.length > limit) throw new Error('AI 生成数量无效，请重试');
  const ids = new Set<string>();
  const result = items.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error('AI 节点格式无效');
    if (item.id !== undefined && typeof item.id !== 'string') throw new Error('AI 节点 ID 格式无效');
    if (item.parentId !== undefined && item.parentId !== null && typeof item.parentId !== 'string') throw new Error('AI 层级格式无效');
    if (item.sourceExcerpt !== undefined && (typeof item.sourceExcerpt !== 'string' || item.sourceExcerpt.length > 1000)) throw new Error('AI 摘录格式无效');
    for (const field of ['label', 'question', 'answer']) {
      if (typeof item[field] !== 'string' || !item[field].trim() || item[field].length > 5000) throw new Error('AI 内容不完整，请重试');
    }
    const id = typeof item.id === 'string' && item.id ? item.id : `generated-${index}`;
    if (ids.has(id)) throw new Error('AI 节点 ID 重复，请重试');
    ids.add(id);
    return { ...item, id, parentId: item.parentId === 'null' || !item.parentId ? null : item.parentId } as GeneratedCard;
  });
  for (const card of result) {
    if (card.parentId && !ids.has(card.parentId)) throw new Error('AI 父节点缺失，请重试');
    const seen = new Set([card.id]);
    let parent = card.parentId;
    while (parent) {
      if (seen.has(parent)) throw new Error('AI 层级存在循环，请重试');
      seen.add(parent);
      parent = result.find(c => c.id === parent)?.parentId || null;
    }
  }
  return result;
}
