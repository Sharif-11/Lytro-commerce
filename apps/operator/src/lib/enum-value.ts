/** A select's chosen word as the enum it was drawn from, or what it was if the word isn't one of them. */
export function enumValue<T extends string>(values: readonly T[], chosen: string, current: T): T {
  return (
    values.find((value) => {
      const word: string = value;
      return word === chosen;
    }) ?? current
  );
}
