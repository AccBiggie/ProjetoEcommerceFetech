import { Children, useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import './ProductCarousel.css';

export default function ProductCarousel({ children }) {
  const slides = Children.toArray(children);
  const [viewport, api] = useEmblaCarousel();
  const [navigation, setNavigation] = useState({ previous: false, next: false });
  const updateNavigation = useCallback(() => {
    if (api) setNavigation({ previous: api.canScrollPrev(), next: api.canScrollNext() });
  }, [api]);

  useEffect(() => {
    if (!api) return;
    updateNavigation();
    api.on('select', updateNavigation).on('reInit', updateNavigation);
    return () => { api.off('select', updateNavigation).off('reInit', updateNavigation); };
  }, [api, updateNavigation]);

  return <section aria-label="Imagens do produto" className="productCarousel">
    <div ref={viewport} className="productCarouselViewport">
      <div className="productCarouselSlides">
        {slides.map((slide, index) => <div className="productCarouselSlide" key={slide.key || index}>{slide}</div>)}
      </div>
    </div>
    {slides.length > 1 && <div className="productCarouselControls">
      <button disabled={!navigation.previous} onClick={() => api?.scrollPrev()}>Imagem anterior</button>
      <button disabled={!navigation.next} onClick={() => api?.scrollNext()}>Próxima imagem</button>
    </div>}
  </section>;
}
