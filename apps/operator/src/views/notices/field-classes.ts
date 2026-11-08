/** The text field's own box (packages/ui's TextField), for the editor's fields that carry a counter beside the label. */
export function fieldBox(bad: boolean): string {
  return `flex min-h-field items-center rounded-control border bg-field transition focus-within:ring-2 ${
    bad
      ? 'border-danger focus-within:ring-field-error-ring'
      : 'border-control-line focus-within:border-line-active focus-within:ring-field-ring'
  }`;
}

export const FIELD_INPUT =
  'num min-w-0 flex-1 bg-transparent px-field py-2.5 text-input text-fg placeholder:text-placeholder focus:outline-none';
