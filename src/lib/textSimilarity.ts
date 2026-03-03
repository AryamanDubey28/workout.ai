/**
 * Shared text similarity utilities for deduplication in AI agents.
 * Uses Jaccard word-overlap similarity — simple, fast, no dependencies.
 */

// Common stopwords to ignore in similarity comparisons
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "and", "but", "or",
  "not", "no", "nor", "so", "yet", "both", "either", "neither", "each",
  "every", "all", "any", "few", "more", "most", "other", "some", "such",
  "than", "too", "very", "just", "about", "also", "over", "that", "this",
  "these", "those", "it", "its",
]);

/**
 * Tokenize text into a set of meaningful words.
 * Lowercases, removes punctuation, filters stopwords and short tokens.
 */
export function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Jaccard similarity between two strings based on word overlap.
 * Returns a value between 0 (no overlap) and 1 (identical word sets).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if a candidate string is similar to any string in a list.
 * Returns true if similarity exceeds the threshold with any item.
 */
export function isSimilarToAny(
  candidate: string,
  existing: string[],
  threshold = 0.5
): boolean {
  return existing.some((item) => jaccardSimilarity(candidate, item) >= threshold);
}
