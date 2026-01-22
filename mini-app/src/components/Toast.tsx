interface ToastProps {
  message: string;
}

export default function Toast({ message }: ToastProps) {
  return (
    <div
      className="fixed bottom-20 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg bg-tg-secondary text-tg-text text-sm shadow-lg animate-fade-in z-50"
      style={{
        animation: "fadeIn 0.2s ease-in-out",
      }}
    >
      {message}
    </div>
  );
}
