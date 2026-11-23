/**
 * Closing credit line. Kept visually quiet: it is the last element on the page
 * in both the lobby and an active session.
 */
export function CreditFooter({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`shrink-0 border-t border-border/50 bg-background/80 px-4 py-3 text-center ${className}`}
    >
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        © تمام حقوق کپی‌رایت این برنامه متعلق به{' '}
        <span className="font-medium text-foreground">komarjahani</span> می‌باشد
      </p>
      <p className="mono mt-1 text-[11px] tracking-[0.06em] text-muted-foreground/80">
        Tel: error_7800
      </p>
    </footer>
  );
}