import { useRef, useEffect, useState } from 'react';

// Store last constraint call for debugging
let lastConstraintCall = { inputX: 0, inputY: 0, outputX: 0, outputY: 0, called: false };

const MARGIN = 20;

// Constrain using *screen* coordinates (rect.left/top) and map back to transform offsets
function constrainToViewport(
  element: HTMLDivElement,
  nextX: number,
  nextY: number,
  currentPos: { x: number; y: number }
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  const modalW = rect.width;
  const modalH = rect.height;

  // Desired new top-left in screen space, based on how much the transform is changing
  const dx = nextX - currentPos.x;
  const dy = nextY - currentPos.y;

  const unclampedLeft = rect.left + dx;
  const unclampedTop = rect.top + dy;

  const minLeft = MARGIN;
  const maxLeft = screenW - modalW - MARGIN;
  const minTop = MARGIN;
  const maxTop = screenH - modalH - MARGIN;

  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, unclampedLeft));
  const clampedTop = Math.max(minTop, Math.min(maxTop, unclampedTop));

  // Map clamped top-left back into transform-offset space
  const clampedX = currentPos.x + (clampedLeft - rect.left);
  const clampedY = currentPos.y + (clampedTop - rect.top);

  // Store for debug display (transform-space values)
  lastConstraintCall = {
    inputX: Math.round(nextX),
    inputY: Math.round(nextY),
    outputX: Math.round(clampedX),
    outputY: Math.round(clampedY),
    called: true,
  };

  return { x: clampedX, y: clampedY };
}

export function useDraggable() {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const positionRef = useRef({ x: 0, y: 0 }); // keep latest position for event handlers
  const [mounted, setMounted] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);

  // Keep ref in sync with state
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

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
      setPosition((currentPos) => {
        dragStartPos.current = {
          x: e.clientX - currentPos.x,
          y: e.clientY - currentPos.y,
        };
        return currentPos;
      });
      e.preventDefault();
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Only drag from header area (first 60px)
      const rect = element.getBoundingClientRect();
      const touch = e.touches[0];
      if (touch.clientY - rect.top > 60) return;
      
      setIsDragging(true);
      setPosition((currentPos) => {
        dragStartPos.current = {
          x: touch.clientX - currentPos.x,
          y: touch.clientY - currentPos.y,
        };
        return currentPos;
      });
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragStartPos.current.x;
      const newY = e.clientY - dragStartPos.current.y;
      
      // Constrain position to screen bounds
      const constrainedPos = constrainToViewport(element, newX, newY, positionRef.current);
      
      setPosition(constrainedPos);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      
      const touch = e.touches[0];
      const newX = touch.clientX - dragStartPos.current.x;
      const newY = touch.clientY - dragStartPos.current.y;
      
      // Constrain position to screen bounds
      const constrainedPos = constrainToViewport(element, newX, newY, positionRef.current);
      
      setPosition(constrainedPos);
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
  }, [isDragging, mounted]);

  // Add debug overlay to document if enabled
  useEffect(() => {
    if (!showDebugOverlay) return;
    
    // Create boundary frame
    const frame = document.createElement('div');
    frame.id = 'drag-debug-frame';
    frame.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      right: 10px;
      bottom: 10px;
      border: 4px solid red;
      pointer-events: none;
      z-index: 99999;
      box-shadow: inset 0 0 0 2px yellow;
    `;
    
    const label = document.createElement('div');
    label.id = 'drag-debug-label';
    label.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(255,0,0,0.9);
      color: white;
      padding: 8px 12px;
      font-size: 12px;
      font-family: monospace;
      font-weight: bold;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      max-width: 300px;
      line-height: 1.4;
    `;
    label.textContent = 'SAFE BOUNDARY (15px margin)';
    frame.appendChild(label);
    
    document.body.appendChild(frame);
    
    return () => {
      document.body.removeChild(frame);
    };
  }, [showDebugOverlay]);
  
  // Update debug label with position info
  useEffect(() => {
    if (!showDebugOverlay || !elementRef.current) return;
    
    const label = document.getElementById('drag-debug-label');
    if (!label) return;
    
    const rect = elementRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = Math.round(rect.width);
    const mh = Math.round(rect.height);
    const modalLeft = Math.round(rect.left);
    const modalTop = Math.round(rect.top);
    
    // Calculate what the constraint should produce
    const shouldBeLeft = MARGIN;
    const shouldBeTop = MARGIN;
    const shouldBeRight = vw - mw - MARGIN;
    const shouldBeBottom = vh - mh - MARGIN;
    
    label.innerHTML = `Screen: ${vw}x${vh} Modal: ${mw}x${mh}<br/>
Upper-Left: (${modalLeft}, ${modalTop})<br/>
Should be: X∈[${shouldBeLeft}, ${shouldBeRight}] Y∈[${shouldBeTop}, ${shouldBeBottom}]<br/>
Constraint: ${lastConstraintCall.called ? `in(${lastConstraintCall.inputX},${lastConstraintCall.inputY})→out(${lastConstraintCall.outputX},${lastConstraintCall.outputY})` : 'NOT CALLED'}`;
  }, [showDebugOverlay, position, mounted]);

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
