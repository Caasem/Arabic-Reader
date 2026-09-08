import './ComingSoon.css';

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="coming-soon">
      <h1>{title}</h1>
      <p>{note}</p>
    </div>
  );
}
