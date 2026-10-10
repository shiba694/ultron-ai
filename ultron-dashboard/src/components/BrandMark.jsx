export default function BrandMark({ className = 'brand-mark' }) {
  return (
    <svg className={className} viewBox="0 0 40 44" fill="none" aria-hidden="true">
      <path d="M20 2 36 9v12c0 10-7 16-16 21C11 37 4 31 4 21V9L20 2Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 15v9c0 5 3 8 7 8s7-3 7-8v-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="m22 10-5 11h7l-4 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
