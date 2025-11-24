import { useRef, useEffect, useState } from 'react';

export function useDraggable() {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Track when ref is attached
  useEffect(() => {
    if (elementRef.current && !mounted) {
      setMounted(true);
    } else if (!elementRef.current && mounted) {
      setMounted(false);
    }
  });

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Only drag from header area (first 60px)
      const rect = element.getBoundingClientRect();
      if (e.clientY - rect.top > 60) return;
      
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      e.preventDefault();
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Only drag from header area (first 60px)
      const rect = element.getBoundingClientRect();
      const touch = e.touches[0];
      if (touch.clientY - rect.top > 60) return;
      
      setIsDragging(true);
      dragStartPos.current = {
        x: touch.clientX - position.x,
        y: touch.clientY - position.y,
      };
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStartPos.current.x,
        y: touch.clientY - dragStartPos.current.y,
      });
      e.preventDefault();
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    // Mouse events
    element.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Touch events
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, position, mounted]);

  return {
    ref: elementRef,
    style: {
      transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
      cursor: isDragging ? 'grabbing' : 'default',
    },
    headerStyle: {
      cursor: 'grab',
    },
  };
}
