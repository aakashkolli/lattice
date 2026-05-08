'use client';

import { useCallback, useRef, useState } from 'react';

interface Props {
  placeholder?: string;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function CommentComposer({ placeholder = 'Write a comment…', onSubmit, onCancel, autoFocus }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  }, [text, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  }, [handleSubmit, onCancel]);

  return (
    <div className="comment-composer">
      <textarea
        ref={textareaRef}
        className="comment-input"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        autoFocus={autoFocus}
      />
      <div className="comment-composer-actions">
        {onCancel && (
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSubmit}
          disabled={!text.trim()}
        >
          Comment
        </button>
      </div>
    </div>
  );
}
