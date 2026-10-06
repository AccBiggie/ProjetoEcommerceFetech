import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router";

export default function ScrollToTop() {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType !== "POP")
      window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, search, navigationType]);
  return null;
}
