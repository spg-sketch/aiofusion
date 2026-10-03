import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./SavedMediaTable.css";

/** Keeps narrow-screen overflow inside the sector panel, not the page. */
export function SavedMediaTable({ type, sector, children }: {
  type: "contacts" | "publications";
  sector: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [scroll, setScroll] = useState({ left: false, right: false });
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => {
      const left = element.scrollLeft > 1;
      const right = element.scrollWidth - element.clientWidth - element.scrollLeft > 1;
      setScroll((previous) => previous.left === left && previous.right === right ? previous : { left, right });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [type, sector]);

  const overflow = scroll.left || scroll.right;
  return <div className={`media-saved-table media-saved-table--${type}`}>
    {overflow && <div className="media-saved-table-hint">
      <p id={hintId}>Scroll sideways to see all columns and actions.</p>
      <div className="media-saved-table-scroll-buttons">
        <button type="button" disabled={!scroll.left} aria-label={`Scroll ${sector} ${type} left`} onClick={() => scrollRef.current?.scrollBy({ left: -240, behavior: "smooth" })}><ChevronLeft size={16} /></button>
        <button type="button" disabled={!scroll.right} aria-label={`Scroll ${sector} ${type} right`} onClick={() => scrollRef.current?.scrollBy({ left: 240, behavior: "smooth" })}><ChevronRight size={16} /></button>
      </div>
    </div>}
    <div ref={scrollRef} className="media-saved-table-scroll" role="region" aria-label={`Saved ${type} in ${sector}`} aria-describedby={overflow ? hintId : undefined} tabIndex={0}>
      {children}
    </div>
  </div>;
}