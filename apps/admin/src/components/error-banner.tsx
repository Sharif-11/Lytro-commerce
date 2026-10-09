export function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}
