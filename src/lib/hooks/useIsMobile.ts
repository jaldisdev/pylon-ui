import {useEffect, useState} from "react";

const MOBILE_QUERY = "(max-width: 767.5px)";

// Tracks whether the viewport is narrow enough to switch from the sidebar
// nav to the mobile bottom tab bar. Mirrors gel-ui's useMobile hook.
export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  return isMobile;
};
