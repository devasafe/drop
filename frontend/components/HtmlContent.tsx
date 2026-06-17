import React from "react";
import DOMPurify from "isomorphic-dompurify";

interface HtmlContentProps {
  html: string;
  className?: string;
}

// ✅ SEGURANÇA: sanitiza o HTML antes de renderizar (previne XSS armazenado).
// Nunca confiar que o HTML é "interno" — qualquer conteúdo que chegue aqui é limpo.
const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'u', 's', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

export default function HtmlContent({ html, className }: HtmlContentProps) {
  const clean = DOMPurify.sanitize(html ?? "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Bloqueia javascript:, data: e afins em href
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
