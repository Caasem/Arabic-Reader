/** Where the word was met: the sentence, with the word itself in bold. */
export function SentenceInBook({ sentence, word }: { sentence: string; word: string }) {
  const at = sentence.indexOf(word);
  return (
    <div className="dict-popup__context">
      <div className="dict-popup__group-header">In this book</div>
      <div className="dict-popup__sentence">
        “
        {at === -1 ? (
          sentence
        ) : (
          <>
            {sentence.slice(0, at)}
            <strong>{word}</strong>
            {sentence.slice(at + word.length)}
          </>
        )}
        ”
      </div>
    </div>
  );
}
