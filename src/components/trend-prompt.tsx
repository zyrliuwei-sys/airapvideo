import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

type PromptOption = { id: string; label: string; text: string };
type TrendPromptProps = {
  legend: string;
  options: PromptOption[];
  promptLabel: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
};

export function TrendPrompt({
  legend,
  options,
  promptLabel,
  copyLabel,
  copiedLabel,
  failedLabel,
}: TrendPromptProps) {
  const [selected, setSelected] = useState(options[0].id);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const prompt =
    options.find((option) => option.id === selected)?.text ?? options[0].text;
  const field = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus('copied');
    } catch {
      field.current?.focus();
      field.current?.select();
      setStatus('failed');
    }
  }
  return (
    <div className="rd-prompt-editor">
      <fieldset>
        <legend>{legend}</legend>
        <div className="rd-prompt-options">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected === option.id}
              onClick={() => {
                setSelected(option.id);
                setStatus('idle');
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="rd-prompt-label" htmlFor="road-prompt-text">
        {promptLabel}
      </label>
      <textarea
        ref={field}
        id="road-prompt-text"
        readOnly
        value={prompt}
        spellCheck={false}
      />
      <div className="rd-prompt-copy">
        <button type="button" className="br-btn" onClick={copy}>
          {status === 'copied' ? <Check size={17} /> : <Copy size={17} />}
          {status === 'copied' ? copiedLabel : copyLabel}
        </button>
        <span role="status">
          {status === 'failed'
            ? failedLabel
            : status === 'copied'
              ? copiedLabel
              : ''}
        </span>
      </div>
    </div>
  );
}
