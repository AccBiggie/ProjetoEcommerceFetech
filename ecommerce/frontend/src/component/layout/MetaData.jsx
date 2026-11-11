import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router';
import { metadata } from '../../seo/metadata.mjs';
import { applyHead, clearHead } from '../../seo/head.mjs';
const MetaData = ({ title, product }) => {
  const { pathname, search } = useLocation();
  useLayoutEffect(() => {
    applyHead(metadata({ pathname, search, title, product, origin: import.meta.env.VITE_PUBLIC_SITE_URL }));
    return () => clearHead();
  }, [pathname, search, title, product]);
  return null;
};
export default MetaData;
