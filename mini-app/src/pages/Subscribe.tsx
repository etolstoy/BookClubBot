export default function Subscribe() {
  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold text-tg-text">Подписка на рецензии</h1>
      <p className="text-sm font-normal leading-6 text-tg-hint">
        Чтобы получать новые рецензии в личку, открой личные сообщения{" "}
        <a
          href="https://t.me/vas3k_book_bot"
          className="text-tg-text underline"
        >
          нашего бота
        </a>
        , отправь команду <span className="font-mono text-tg-text">/start</span>, а затем{" "}
        <span className="font-mono text-tg-text">/subscribe</span>.
      </p>
    </div>
  );
}
