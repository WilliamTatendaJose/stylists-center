export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <>
      <img
        src="/style-center-logo-light.png"
        alt="Style Center — Style. Connect. Grow."
        className={`dark:hidden ${className}`}
      />
      <img
        src="/style-center-logo.png"
        alt=""
        aria-hidden="true"
        className={`hidden dark:block ${className}`}
      />
    </>
  );
}
