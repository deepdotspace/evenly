/**
 * Insights presentation metadata — category labels + the warm chart palette.
 *
 * Kept in the insights component layer (not the design system) because it is the
 * one place that maps the CONTRACT §1.2 category catalog to human labels and
 * assigns colors to chart segments. Every color is drawn from the brand's warm,
 * earthy family — never a saturated navy/purple default.
 */

/** Human label for a CONTRACT §1.2 category id (icons come from the design set). */
const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food',
  dining: 'Dining',
  groceries: 'Groceries',
  lodging: 'Lodging',
  transport: 'Transport',
  transit: 'Transit',
  fuel: 'Fuel',
  utilities: 'Utilities',
  entertainment: 'Entertainment',
  attraction: 'Attractions',
  shopping: 'Shopping',
  health: 'Health',
  fees: 'Fees',
  other: 'Other',
}

export function categoryLabel(id: string | undefined | null): string {
  if (!id) return 'Other'
  return CATEGORY_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

/**
 * Ordered categorical palette for the category donut — soft, warm, harmonious,
 * each distinct enough to read as a separate slice on the cream surface. Assigned
 * in descending-value order so the largest slice always lands on the clay accent.
 */
export const CATEGORY_CHART_COLORS = [
  '#E2725B', // clay (brand)
  '#9CAF88', // sage (brand)
  '#C79A4E', // honey (brand)
  '#C2876B', // terracotta
  '#8AA6A0', // muted teal-sage
  '#D2A05A', // amber
  '#B58AA6', // dusty mauve
  '#9C8F73', // greige-olive
  '#CB9180', // rosewood
  '#8E9E6E', // olive
  '#C99A7A', // sand
  '#A88FB0', // soft lilac
] as const

/** The color for the Nth-largest category slice (cycles past the palette end). */
export function categoryColor(index: number): string {
  return CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length]
}
