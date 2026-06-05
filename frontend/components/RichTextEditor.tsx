import React, { useRef, useCallback } from 'react';
import styles from './RichTextEditor.module.css';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

// Editor de descrição com toolbar de formatação.
// Os botões inserem tags HTML ao redor do texto selecionado no textarea.
// O conteúdo é armazenado como HTML; ao exibir para clientes, sanitize com DOMPurify.

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = useCallback((open: string, close: string) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const selected = value.slice(s, e) || 'texto';
    const next = value.slice(0, s) + open + selected + close + value.slice(e);
    onChange(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(s + open.length, s + open.length + selected.length);
    }, 0);
  }, [value, onChange]);

  const insertBlock = useCallback((tag: string) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const selected = value.slice(s, e) || 'Texto';
    const block = `<${tag}>${selected}</${tag}>\n`;
    onChange(value.slice(0, s) + block + value.slice(e));
    setTimeout(() => el.focus(), 0);
  }, [value, onChange]);

  const insertList = useCallback((ordered: boolean) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const tag = ordered ? 'ol' : 'ul';
    const rawLines = value.slice(s, e);
    const items = rawLines
      ? rawLines.split('\n').map((l) => `  <li>${l}</li>`).join('\n')
      : '  <li>Item 1</li>\n  <li>Item 2</li>';
    const block = `<${tag}>\n${items}\n</${tag}>\n`;
    onChange(value.slice(0, s) + block + value.slice(e));
    setTimeout(() => el.focus(), 0);
  }, [value, onChange]);

  const clearFormat = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const cleaned = value.slice(s, e).replace(/<[^>]+>/g, '');
    onChange(value.slice(0, s) + cleaned + value.slice(e));
    setTimeout(() => el.focus(), 0);
  }, [value, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = ref.current;
      if (!el) return;
      const s = el.selectionStart;
      const next = value.slice(0, s) + '  ' + value.slice(el.selectionEnd);
      onChange(next);
      setTimeout(() => el.setSelectionRange(s + 2, s + 2), 0);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar} role="toolbar" aria-label="Formatação de texto">
        <button type="button" title="Negrito" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); wrapSelection('<strong>', '</strong>'); }}>
          <strong>B</strong>
        </button>
        <button type="button" title="Itálico" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); wrapSelection('<em>', '</em>'); }}>
          <em>I</em>
        </button>
        <button type="button" title="Sublinhado" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); wrapSelection('<u>', '</u>'); }}>
          <span style={{ textDecoration: 'underline' }}>U</span>
        </button>
        <button type="button" title="Tachado" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); wrapSelection('<s>', '</s>'); }}>
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </button>

        <div className={styles.separator} />

        <button type="button" title="Título" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); insertBlock('h2'); }}>H1</button>
        <button type="button" title="Subtítulo" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); insertBlock('h3'); }}>H2</button>
        <button type="button" title="Parágrafo" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); insertBlock('p'); }}>P</button>

        <div className={styles.separator} />

        <button type="button" title="Lista com marcadores" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); insertList(false); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
            <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <button type="button" title="Lista numerada" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); insertList(true); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
            <text x="1" y="8" fontSize="8" fill="currentColor" stroke="none">1.</text>
            <text x="1" y="14" fontSize="8" fill="currentColor" stroke="none">2.</text>
            <text x="1" y="20" fontSize="8" fill="currentColor" stroke="none">3.</text>
          </svg>
        </button>

        <div className={styles.separator} />

        <button type="button" title="Remover formatação" className={styles.toolBtn}
          onMouseDown={(e) => { e.preventDefault(); clearFormat(); }}>Tx</button>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Descreva seu produto...'}
        className={styles.editor}
        aria-label="Editor de descrição"
      />
    </div>
  );
}