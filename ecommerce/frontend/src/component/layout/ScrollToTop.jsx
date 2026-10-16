import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

export default function ScrollToTop() {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    // Lazy routes may first render a loader. Wait for the new page heading.
    const focusPage = () => {
      const heading = document.querySelector('main h1:not([data-loading-heading])');
      if (!heading || heading.offsetParent === null) return false;
      heading.focus({ preventScroll: true });
      return true;
    };
    if (focusPage()) return;
    const observer = new MutationObserver(() => { if (focusPage()) observer.disconnect(); });
    observer.observe(document.getElementById('root'), { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  useEffect(() => {
    if (navigationType !== "POP")
      window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, search, navigationType]);
  return null;
}
