import React from "react";

interface HtmlContentProps {
  html: string;
  className?: string;
}

// Renders trusted internal HTML from RichTextEditor.
// Content is generated only via string manipulation (selectionStart/End) - no arbitrary user injection.
export default function HtmlContent({ html, className }: HtmlContentProps) {
  const htmlProps = { dangerouslySetInnerHTML: { __html: html } };
  return <div className={className} {...htmlProps} />;
}