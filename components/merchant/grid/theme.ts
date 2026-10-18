/**
 * AG Grid theme from the Mandate tokens (Theming API). Values point at the CSS variables defined in
 * app/globals.css, so the grid follows light and dark mode with the rest of the app.
 */
import { themeQuartz } from "ag-grid-community";

export const mandateGridTheme = themeQuartz.withParams({
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  headerFontSize: 13,
  headerFontWeight: 500,
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  textColor: "var(--ink)",
  subtleTextColor: "var(--ink-3)",
  headerTextColor: "var(--ink-2)",
  headerBackgroundColor: "var(--ground)",
  chromeBackgroundColor: "var(--ground)",
  accentColor: "var(--ink)",
  borderColor: "var(--hairline)",
  rowBorder: { color: "var(--hairline-soft)" },
  wrapperBorderRadius: 4,
  borderRadius: 3,
  rowHoverColor: "var(--surface-hover)",
  selectedRowBackgroundColor: "var(--surface-hover)",
  oddRowBackgroundColor: "var(--surface)",
  spacing: 6,
  rowHeight: 48,
  headerHeight: 44,
  iconSize: 14,
  inputBorder: { color: "var(--control-border)" },
  inputFocusBorder: { color: "var(--ink)" },
  focusShadow: { radius: 0, spread: 2, color: "var(--ink)" },
  rangeSelectionBorderColor: "var(--ink)",
  checkboxCheckedBackgroundColor: "var(--ink)",
  checkboxCheckedShapeColor: "var(--surface)",
  columnDropCellBackgroundColor: "var(--surface-hover)",
  columnDropCellBorder: { color: "var(--control-border)" },
});
