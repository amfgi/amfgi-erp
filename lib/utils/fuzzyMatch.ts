/**
 * Fuzzy match algorithm - finds similarity score between search term and target
 * Returns score 0-1 where 1 is exact match
 */
export function fuzzyMatch(searchTerm: string, target: string): number {
  const search = searchTerm.toLowerCase().trim();
  const text = target.toLowerCase().trim();

  if (!search) return 0;
  if (search === text) return 1;
  if (text.includes(search)) return 0.9;

  let searchIdx = 0;
  let textIdx = 0;
  let score = 0;
  const maxScore = search.length;

  while (searchIdx < search.length && textIdx < text.length) {
    if (search[searchIdx] === text[textIdx]) {
      score += 1;
      searchIdx++;
    }
    textIdx++;
  }

  // Didn't match all characters
  if (searchIdx !== search.length) return 0;

  // Higher score for matches at the beginning
  const startBonus = text.startsWith(search) ? 0.5 : 0;

  return (score / maxScore) * 0.5 + startBonus;
}

export interface SearchableItem {
  id: string;
  label: string;
  searchText?: string; // Additional text to search
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Prefer label matches (exact, prefix, word) over incidental substring / stock-text hits. */
export function scoreSearchLabel(label: string, query: string): number {
  const normalizedLabel = label.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!normalizedQuery) return 0;
  if (normalizedLabel === normalizedQuery) return 1;
  if (normalizedLabel.startsWith(normalizedQuery)) return 0.96;

  const wordBoundary = new RegExp(`(?:^|\\s)${escapeRegExp(normalizedQuery)}(?:\\s|$)`, 'i');
  if (wordBoundary.test(normalizedLabel)) return 0.92;

  const index = normalizedLabel.indexOf(normalizedQuery);
  if (index >= 0) {
    const positionBonus = 1 - index / Math.max(normalizedLabel.length, 1);
    const lengthBonus = normalizedQuery.length / Math.max(normalizedLabel.length, 1);
    return 0.78 + positionBonus * 0.1 + lengthBonus * 0.08;
  }

  return fuzzyMatch(normalizedQuery, normalizedLabel) * 0.55;
}

function scoreSearchItem(item: SearchableItem, terms: string[], minScore: number): number {
  if (terms.length === 1) {
    const query = terms[0]!;
    const labelScore = scoreSearchLabel(item.label, query);
    if (labelScore >= minScore) return labelScore;

    if (item.searchText) {
      const auxiliaryText = item.searchText.toLowerCase().replace(/\s+/g, ' ');
      if (auxiliaryText.includes(query)) {
        return Math.max(labelScore, 0.35);
      }
      const auxiliaryScore = fuzzyMatch(query, `${item.label} ${item.searchText}`) * 0.4;
      return Math.max(labelScore, auxiliaryScore);
    }

    return labelScore;
  }

  const termScores = terms.map((term) => {
    const labelScore = scoreSearchLabel(item.label, term);
    if (labelScore >= minScore) return labelScore;
    const searchableText = item.searchText
      ? `${item.label} ${item.searchText}`.toLowerCase().replace(/\s+/g, ' ')
      : item.label.toLowerCase().replace(/\s+/g, ' ');
    if (searchableText.includes(term)) return 0.85;
    return fuzzyMatch(term, searchableText);
  });

  if (termScores.some((termScore) => termScore < minScore)) return 0;
  return termScores.reduce((sum, termScore) => sum + termScore, 0) / termScores.length;
}

export function searchItems<T extends SearchableItem>(
  items: T[],
  searchTerm: string,
  minScore: number = 0.3
): T[] {
  const normalizedSearch = searchTerm.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!normalizedSearch) return items;
  const terms = normalizedSearch.split(' ').filter(Boolean);

  return items
    .map((item) => ({
      item,
      score: scoreSearchItem(item, terms, minScore),
    }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const labelLengthDiff = a.item.label.length - b.item.label.length;
      if (labelLengthDiff !== 0) return labelLengthDiff;
      return a.item.label.localeCompare(b.item.label, undefined, { sensitivity: 'base' });
    })
    .map(({ item }) => item);
}
