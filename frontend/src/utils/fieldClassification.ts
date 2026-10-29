export const UNCLASSIFIED_LABEL = 'Unclassified';

type ClassifiableField = { category?: string; notes?: string; description?: string };

/**
 * A global dictionary field is "Unclassified" when it has no real business category:
 *  - category is empty or the generic 'General', or
 *  - the category is just the name of the table the column was discovered in
 *    (schema discovery historically fell back to the table name, e.g. "auth_log_tab").
 *
 * The second rule is evidence-based: it only fires when the category string appears in the
 * field's own discovery provenance (notes / description), so user-typed custom categories
 * are never mislabelled and no stored data has to be rewritten.
 */
export function isUnclassifiedField(f: ClassifiableField): boolean {
  const category = (f.category || '').trim();
  if (!category || category.toLowerCase() === 'general') return true;
  const provenance = `${f.notes || ''} ${f.description || ''}`;
  return provenance.includes(category) && /\b(table|from)\b/i.test(provenance);
}

export function displayCategory(f: ClassifiableField): string {
  return isUnclassifiedField(f) ? UNCLASSIFIED_LABEL : (f.category as string);
}
