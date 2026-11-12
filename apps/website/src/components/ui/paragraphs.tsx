/** A card's body in one or more paragraphs, written with a blank line between each. */
export function Paragraphs({ text, className }: { text: string; className: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {text.split('\n\n').map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}
