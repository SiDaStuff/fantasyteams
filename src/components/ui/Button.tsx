import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface BaseButtonProps {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export interface ButtonProps
  extends BaseButtonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode;
  /** Renders the button as a react-router link. */
  to?: string;
  /** Renders the button as a plain anchor. */
  href?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-electric-500 text-white hover:bg-electric-400 focus-visible:ring-electric-300',
  secondary:
    'bg-navy-800 text-white border border-line hover:border-navy-500 hover:bg-navy-700 focus-visible:ring-electric-400/60',
  outline:
    'border border-line text-slate-200 hover:border-navy-500 hover:bg-navy-800 focus-visible:ring-electric-400/60',
  ghost: 'text-slate-300 hover:bg-white/5 hover:text-white focus-visible:ring-electric-400/60',
  danger:
    'border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 focus-visible:ring-rose-400/60',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-lg',
};

const BASE_CLASSES =
  'focus-ring inline-flex items-center justify-center font-semibold tracking-tight select-none transition-colors duration-150 disabled:pointer-events-none disabled:opacity-55';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    to,
    href,
    className = '',
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  const classes = [
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? 'w-full' : '',
    className,
  ].join(' ');

  const content = (
    <>
      {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...(rest as object)}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes} {...(rest as object)}>
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || isLoading}
      {...rest}
    >
      {content}
    </button>
  );
});

export type { BaseButtonProps as ButtonBaseProps };
