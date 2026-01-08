interface ErrorMessageProps {
  message: string;
}

export default function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="flex items-center justify-center py-8 text-red-500">
      <p>{message}</p>
    </div>
  );
}
