import { RESPONSE_LENGTHS, RESPONSE_LENGTH_LABELS_FA, type ResponseLength } from '@shared/modules';

export function LengthSelector({
  value,
  onChange,
}: {
  value: ResponseLength;
  onChange: (next: ResponseLength) => void;
}) {
  return (
    <div className="length" role="group" aria-label="طول پاسخ">
      <span className="length__label">طول پاسخ</span>
      {RESPONSE_LENGTHS.map((option) => (
        <button
          key={option}
          type="button"
          className={`length__option ${option === value ? 'length__option--active' : ''}`}
          onClick={() => onChange(option)}
        >
          {RESPONSE_LENGTH_LABELS_FA[option]}
        </button>
      ))}
    </div>
  );
}
