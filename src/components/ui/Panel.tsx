import type { CSSProperties, ReactNode } from 'react';

export interface PanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padded?: boolean;
  style?: CSSProperties;
}

/** Base card used across the app. */
export function Panel({ children, className = '', hover = false, padded = true, style }: PanelProps) {
  return (
    <div
      style={style}
      className={`panel ${hover ? 'panel-hover' : ''} ${padded ? 'p-5 sm:p-6' : ''} rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}
