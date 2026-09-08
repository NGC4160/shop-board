export function CartMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M4 18.5h19.5l3.2-7.2H14.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 11.5h7.5v7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="23" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="22" cy="23" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6.5 11.5h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
