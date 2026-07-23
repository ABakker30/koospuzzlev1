import * as THREE from "three";
import type { IJK } from "../../types/shape";
import type { ViewTransforms } from "../../services/ViewTransforms";
import { mat4ToThree, estimateSphereRadiusFromView } from "./sceneMath";

type InteractionTarget = "ghost" | "cell" | "piece" | "background";
type InteractionType = "single" | "double" | "long" | "paint";

export function attachInteractions(opts: {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;

  // refs / state sources (use refs to avoid effect re-runs)
  viewRef: React.MutableRefObject<ViewTransforms | null>;
  placedPiecesRef: React.MutableRefObject<Array<{ uid: string; cells: IJK[] }>>;
  placedMeshesRef: React.MutableRefObject<Map<string, THREE.InstancedMesh>>;
  meshRef: React.MutableRefObject<THREE.InstancedMesh | undefined>;
  visibleCellsRef: React.MutableRefObject<IJK[]>;
  hidePlacedPiecesRef: React.MutableRefObject<boolean>;

  // Drag-to-paint piece forming (see the paint layer below). controlsRef is
  // the OrbitControls instance so a paint gesture can disable the camera for
  // its duration; paintEnabledRef gates the whole layer (the game board sets
  // it while interactionMode === 'placing'); drawingCellsCountRef mirrors the
  // current drawing-selection size so a stroke can detect "piece committed /
  // rejected" (count drops back to 0) and end itself.
  controlsRef: React.MutableRefObject<any>;
  paintEnabledRef: React.MutableRefObject<boolean>;
  drawingCellsCountRef: React.MutableRefObject<number>;

  // legacy guard
  gestureCompletedRef: React.MutableRefObject<boolean>;

  // Persistent refs for double-click detection (survive effect re-runs)
  pendingTapTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  lastTapResultRef: React.MutableRefObject<{ target: string | null; data?: any; timestamp?: number } | null>;

  // Use ref to avoid effect re-runs when callback changes
  onInteractionRef: React.MutableRefObject<((target: InteractionTarget, type: InteractionType, data?: any) => void) | undefined>;
}) {
  const {
    renderer,
    camera,
    raycaster,
    mouse,
    viewRef,
    placedPiecesRef,
    placedMeshesRef,
    meshRef,
    visibleCellsRef,
    hidePlacedPiecesRef,
    controlsRef,
    paintEnabledRef,
    drawingCellsCountRef,
    gestureCompletedRef,
    pendingTapTimerRef,
    lastTapResultRef,
    onInteractionRef,
  } = opts;
  
  // Helper to call onInteraction via ref (always uses latest callback)
  const onInteraction = (target: InteractionTarget, type: InteractionType, data?: any) => {
    onInteractionRef.current?.(target, type, data);
  };

  // ---- Local state (resets on re-attach, but that's OK for these) ----
  const longPressTimerRef = { current: null as any };

  const touchMovedRef = { current: false };
  const longPressFiredRef = { current: false };

  // Drag detection
  const dragStartedRef = { current: false };
  const isDraggingRef = { current: false };
  const suppressNextClickRef = { current: false };
  const dragStartPosRef = { current: null as { x: number; y: number } | null };
  const DRAG_THRESHOLD_SQ = 100;

  const DOUBLE_TAP_WINDOW = 400; // Increased from 350 for more reliable detection
  const LONG_PRESS_DELAY = 500;

  const clearTimers = () => {
    if (pendingTapTimerRef.current) {
      clearTimeout(pendingTapTimerRef.current);
      pendingTapTimerRef.current = null;
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const getEmptyCellUnderCursor = (
    rayOrigin: THREE.Vector3,
    rayDirection: THREE.Vector3,
    maxDistance: number
  ): IJK | null => {
    const view = viewRef.current;
    const visibleCells = visibleCellsRef.current;
    if (!view) return null;

    const occupiedSet = new Set<string>();
    for (const piece of placedPiecesRef.current) {
      for (const cell of piece.cells) {
        occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
      }
    }

    let nearestCell: IJK | null = null;
    let nearestDistance = Infinity;

    const M = mat4ToThree(view.M_world);
    estimateSphereRadiusFromView(view); // keep parity; even if unused

    const perpendicularTolerance = 0.03;
    const epsilon = 0.01;
    const frontLimit = maxDistance - epsilon;

    for (const cell of visibleCells) {
      const cellKey = `${cell.i},${cell.j},${cell.k}`;
      if (occupiedSet.has(cellKey)) continue;

      const cellWorldPos = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
      const toCellVec = new THREE.Vector3().subVectors(cellWorldPos, rayOrigin);
      const distAlongRay = toCellVec.dot(rayDirection);

      if (distAlongRay < 0 || distAlongRay >= frontLimit) continue;

      const closestPointOnRay = new THREE.Vector3()
        .copy(rayOrigin)
        .addScaledVector(rayDirection, distAlongRay);

      const perpDistance = cellWorldPos.distanceTo(closestPointOnRay);

      if (perpDistance < perpendicularTolerance && distAlongRay < nearestDistance) {
        nearestDistance = distAlongRay;
        nearestCell = cell;
      }
    }

    return nearestCell;
  };

  const performRaycast = (
    clientX: number,
    clientY: number
  ): { target: "cell" | "piece" | "background"; data?: any } => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const rayOrigin = raycaster.ray.origin.clone();
    const rayDirection = raycaster.ray.direction.clone();

    // Piece hit - select closest piece to camera when multiple pieces overlap
    let pieceHit: { uid: string; distance: number; emptyCellUnderCursor: IJK | null } | null = null;

    if (!hidePlacedPiecesRef.current && placedMeshesRef.current.size > 0) {
      const allPieceMeshes = Array.from(placedMeshesRef.current.values());
      const allIntersections = raycaster.intersectObjects(allPieceMeshes, true);
      
      // Iterate through intersections in order (closest first) until we identify a piece UID
      for (const intersection of allIntersections) {
        let hitPieceUid: string | null = null;
        
        // First, check if the intersection object is directly a piece mesh
        for (const [uid, m] of placedMeshesRef.current.entries()) {
          if (intersection.object === m) {
            hitPieceUid = uid;
            break;
          }
        }
        
        // If not found, walk up the parent hierarchy
        if (!hitPieceUid) {
          for (const [uid, m] of placedMeshesRef.current.entries()) {
            let obj = intersection.object.parent;
            while (obj) {
              if (obj === m) {
                hitPieceUid = uid;
                break;
              }
              obj = obj.parent;
            }
            if (hitPieceUid) break;
          }
        }

        // If we identified this intersection's piece, use it (it's the closest)
        if (hitPieceUid) {
          const hitPoint = intersection.point.clone();
          const hitPieceDistance = rayOrigin.distanceTo(hitPoint);
          const emptyCellUnderCursor = getEmptyCellUnderCursor(rayOrigin, rayDirection, hitPieceDistance);

          pieceHit = { uid: hitPieceUid, distance: hitPieceDistance, emptyCellUnderCursor };
          break; // Stop at first identified piece (closest to camera)
        }
      }
    }

    // Cell hit
    let cellHit: { cell: IJK; distance: number } | null = null;
    const mesh = meshRef.current;
    const visibleCells = visibleCellsRef.current;
    if (mesh) {
      const intersections = raycaster.intersectObject(mesh);
      if (intersections.length > 0) {
        const intersection = intersections[0];
        const instanceId = intersection.instanceId;
        if (instanceId !== undefined && instanceId < visibleCells.length) {
          const clickedCell = visibleCells[instanceId];
          cellHit = { cell: clickedCell, distance: intersection.distance };
        }
      }
    }

    const epsilon = 0.001;

    if (pieceHit && cellHit) {
      if (pieceHit.distance + epsilon < cellHit.distance) {
        return {
          target: "piece",
          data: {
            uid: pieceHit.uid,
            hitPieceDistance: pieceHit.distance,
            emptyCellUnderCursor: pieceHit.emptyCellUnderCursor,
          },
        };
      }
      return { target: "cell", data: cellHit.cell };
    }

    if (pieceHit) {
      return {
        target: "piece",
        data: {
          uid: pieceHit.uid,
          hitPieceDistance: pieceHit.distance,
          emptyCellUnderCursor: pieceHit.emptyCellUnderCursor,
        },
      };
    }

    if (cellHit) {
      return { target: "cell", data: cellHit.cell };
    }

    return { target: "background" };
  };

  // ---- Drag-to-paint piece forming (pointer events, mouse + touch) ----
  // When the parent enables painting (interactionMode === 'placing'), a
  // pointer-down on an EMPTY container cell claims the whole gesture for
  // piece-forming instead of the camera:
  //   - the pressed cell is dispatched IMMEDIATELY as a 'paint' interaction
  //     (no 400 ms double-tap disambiguation wait — the consumer treats
  //     'paint' exactly like the old single-tap draw, so a press-and-release
  //     on one cell is the old tap, just instant);
  //   - OrbitControls is disabled for the duration of the gesture and
  //     restored on release;
  //   - each pointermove raycasts at most once per animation frame and
  //     dispatches every NEW cell hit as another 'paint' interaction.
  //     Validation (occupancy + FCC adjacency + 4-cell recognition) stays
  //     entirely with the consumer's drawCell, so sweeping over an occupied
  //     or non-adjacent cell is silently forgiven and the stroke continues.
  // Pointer-down on the background or a placed piece never starts a paint,
  // so orbit / piece-selection / cancel gestures keep their exact behavior.
  // The container mesh only ever contains UNOCCUPIED cells (occupied ones are
  // filtered out when it is rebuilt), so a 'cell' raycast hit IS an empty cell.
  //
  // The pointerdown listener sits on window in the CAPTURE phase: OrbitControls
  // registered its own pointerdown on the canvas first (at scene init), and
  // same-node listeners run in registration order, so the only way to claim
  // the gesture before the camera is from an ancestor's capture phase.
  // stopPropagation() there keeps OrbitControls from ever seeing the press.
  // Browser touch scrolling is already prevented: OrbitControls sets
  // `touchAction = 'none'` on the canvas at construction.
  const paintRef = {
    pointerId: null as number | null,
    lastCellKey: null as string | null,
    x: 0,
    y: 0,
    rafId: 0,
    rafQueued: false,
    // Becomes true once the drawing selection is observed non-empty during
    // this stroke; when the count then drops back to 0 the piece committed
    // (or was rejected at recognition), and the stroke ends itself so the
    // finger sliding onward can't start an accidental new selection.
    sawSelection: false,
    // Suppresses the legacy tap path (touchend / click) for a gesture the
    // paint layer already consumed.
    consumedGesture: false,
    controlsWereEnabled: true,
  };

  const cellKeyOf = (c: IJK) => `${c.i},${c.j},${c.k}`;

  const endPaint = (pointerId: number) => {
    paintRef.pointerId = null;
    paintRef.lastCellKey = null;
    paintRef.sawSelection = false;
    if (paintRef.rafQueued) {
      cancelAnimationFrame(paintRef.rafId);
      paintRef.rafQueued = false;
    }
    try {
      renderer.domElement.releasePointerCapture(pointerId);
    } catch {
      /* pointer may already be released */
    }
    const controls = controlsRef.current;
    if (controls && paintRef.controlsWereEnabled) controls.enabled = true;
  };

  const paintFrame = () => {
    paintRef.rafQueued = false;
    const pointerId = paintRef.pointerId;
    if (pointerId === null) return;

    // Stroke-completion check: drawCell clears the selection when the 4th
    // cell commits or the shape is rejected — end the stroke there.
    const count = drawingCellsCountRef.current;
    if (count > 0) {
      paintRef.sawSelection = true;
    } else if (paintRef.sawSelection) {
      endPaint(pointerId);
      return;
    }

    const result = performRaycast(paintRef.x, paintRef.y);
    // Forgiving stroke: background / placed-piece hits do nothing.
    if (result.target !== "cell") return;
    const key = cellKeyOf(result.data as IJK);
    if (key === paintRef.lastCellKey) return; // same cell as last dispatch
    paintRef.lastCellKey = key;
    onInteraction("cell", "paint", result.data);
  };

  const onPaintPointerDown = (e: PointerEvent) => {
    // Any new primary press clears stale suppression (e.g. a click event
    // that never arrived after the previous paint gesture).
    if (e.isPrimary) paintRef.consumedGesture = false;

    if (!paintEnabledRef.current) return;
    if (e.target !== renderer.domElement) return;
    if (!e.isPrimary || paintRef.pointerId !== null) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const result = performRaycast(e.clientX, e.clientY);
    if (result.target !== "cell") return; // orbit / selection gestures untouched

    // Claim the gesture: camera never sees it.
    e.stopPropagation();
    e.preventDefault();
    paintRef.pointerId = e.pointerId;
    paintRef.lastCellKey = cellKeyOf(result.data as IJK);
    paintRef.sawSelection = false;
    paintRef.consumedGesture = true;
    const controls = controlsRef.current;
    paintRef.controlsWereEnabled = controls ? controls.enabled !== false : true;
    if (controls) controls.enabled = false;
    try {
      renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — window-level listeners still track the pointer */
    }
    onInteraction("cell", "paint", result.data);
  };

  const onPaintPointerMove = (e: PointerEvent) => {
    if (paintRef.pointerId === null || e.pointerId !== paintRef.pointerId) return;
    paintRef.x = e.clientX;
    paintRef.y = e.clientY;
    // Raycast at most once per animation frame during the stroke.
    if (!paintRef.rafQueued) {
      paintRef.rafQueued = true;
      paintRef.rafId = requestAnimationFrame(paintFrame);
    }
  };

  const onPaintPointerEnd = (e: PointerEvent) => {
    if (paintRef.pointerId === null || e.pointerId !== paintRef.pointerId) return;
    endPaint(e.pointerId);
    // consumedGesture stays true so the trailing click / touchend of this
    // gesture is swallowed by the legacy handlers below.
  };

  const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;
  if (supportsPointerEvents) {
    window.addEventListener("pointerdown", onPaintPointerDown, { capture: true });
    window.addEventListener("pointermove", onPaintPointerMove, { capture: true });
    window.addEventListener("pointerup", onPaintPointerEnd, { capture: true });
    window.addEventListener("pointercancel", onPaintPointerEnd, { capture: true });
  }
  const detachPaint = () => {
    if (!supportsPointerEvents) return;
    if (paintRef.pointerId !== null) endPaint(paintRef.pointerId);
    window.removeEventListener("pointerdown", onPaintPointerDown, { capture: true });
    window.removeEventListener("pointermove", onPaintPointerMove, { capture: true });
    window.removeEventListener("pointerup", onPaintPointerEnd, { capture: true });
    window.removeEventListener("pointercancel", onPaintPointerEnd, { capture: true });
  };

  const isMobile = "ontouchstart" in window;

  if (isMobile) {
    const onTouchStart = (e: TouchEvent) => {
      if (e.target !== renderer.domElement) return;

      // An active paint gesture owns this touch (pointerdown fires before
      // touchstart, so the paint layer has already claimed it).
      if (paintRef.pointerId !== null) return;

      // Multi-touch (pinch/zoom): cancel any pending gestures
      if (e.touches.length !== 1) {
        touchMovedRef.current = true;
        longPressFiredRef.current = false;
        clearTimers();
        dragStartedRef.current = false;
        isDraggingRef.current = false;
        dragStartPosRef.current = null;
        return;
      }

      const touch = e.touches[0];

      dragStartedRef.current = true;
      isDraggingRef.current = false;
      dragStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      touchMovedRef.current = false;
      longPressFiredRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        if (!touchMovedRef.current && !isDraggingRef.current) {
          longPressFiredRef.current = true;
          const result = performRaycast(touch.clientX, touch.clientY);
          onInteraction(result.target, "long", result.data);
        }
      }, LONG_PRESS_DELAY);
    };

    const onTouchMove = (e: TouchEvent) => {
      // If second finger added during move (pinch), cancel everything
      if (e.touches.length !== 1) {
        touchMovedRef.current = true;
        clearTimers();
        return;
      }
      if (!dragStartedRef.current || !dragStartPosRef.current) return;

      const touch = e.touches[0];
      const dx = touch.clientX - dragStartPosRef.current.x;
      const dy = touch.clientY - dragStartPosRef.current.y;
      const distSq = dx * dx + dy * dy;

      if (distSq > DRAG_THRESHOLD_SQ) {
        isDraggingRef.current = true;
        touchMovedRef.current = true;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      // Paint gesture still active (another finger lifted): not ours.
      if (paintRef.pointerId !== null) return;
      // Tail of a gesture the paint layer consumed (pointerup fires before
      // touchend, so the paint itself already ended): swallow it so no
      // legacy tap is synthesized on top of the painted cells.
      if (paintRef.consumedGesture && e.touches.length === 0) {
        paintRef.consumedGesture = false;
        return;
      }

      // If there are still touches on screen (pinch ending), do nothing
      if (e.touches.length > 0) {
        clearTimers();
        return;
      }

      if (gestureCompletedRef.current) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }

      if (dragStartedRef.current && isDraggingRef.current) {
        clearTimers();
        dragStartedRef.current = false;
        isDraggingRef.current = false;
        dragStartPosRef.current = null;
        return;
      }

      dragStartedRef.current = false;
      isDraggingRef.current = false;

      if (e.target !== renderer.domElement) return;

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (touchMovedRef.current) return;
      if (longPressFiredRef.current) return;

      const touch = e.changedTouches[0];
      const result = performRaycast(touch.clientX, touch.clientY);
      const now = Date.now();

      if (pendingTapTimerRef.current && lastTapResultRef.current) {
        const sameTarget = result.target === lastTapResultRef.current.target;
        const samePiece = result.target === 'piece' && lastTapResultRef.current.target === 'piece' 
          ? result.data?.uid === lastTapResultRef.current.data?.uid 
          : true;
        
        if (sameTarget && samePiece) {
          clearTimeout(pendingTapTimerRef.current);
          pendingTapTimerRef.current = null;
          onInteraction(result.target, "double", result.data);
          lastTapResultRef.current = null;
        } else {
          clearTimeout(pendingTapTimerRef.current);
          if (lastTapResultRef.current.target) {
            onInteraction(lastTapResultRef.current.target, "single", lastTapResultRef.current.data);
          }
          lastTapResultRef.current = result;
          pendingTapTimerRef.current = setTimeout(() => {
            if (lastTapResultRef.current?.target) {
              onInteraction(lastTapResultRef.current.target, "single", lastTapResultRef.current.data);
            }
            lastTapResultRef.current = null;
            pendingTapTimerRef.current = null;
          }, DOUBLE_TAP_WINDOW);
        }
      } else {
        (result as any).timestamp = now;
        lastTapResultRef.current = result;
        pendingTapTimerRef.current = setTimeout(() => {
          if (lastTapResultRef.current?.target) {
            onInteraction(lastTapResultRef.current.target, "single", lastTapResultRef.current.data);
          }
          lastTapResultRef.current = null;
          pendingTapTimerRef.current = null;
        }, DOUBLE_TAP_WINDOW);
      }
    };

    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: false });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true });
    renderer.domElement.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      clearTimers();
      detachPaint();
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
    };
  }

  // Desktop
  const onMouseDown = (e: MouseEvent) => {
    if (e.target !== renderer.domElement) return;
    // An active paint gesture owns this press (pointerdown fires first).
    if (paintRef.pointerId !== null) return;
    dragStartedRef.current = true;
    isDraggingRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragStartedRef.current || !dragStartPosRef.current) return;
    const dx = e.clientX - dragStartPosRef.current.x;
    const dy = e.clientY - dragStartPosRef.current.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > DRAG_THRESHOLD_SQ) {
      isDraggingRef.current = true;
      suppressNextClickRef.current = true;
    }
  };

  const onMouseUp = () => {
    if (dragStartedRef.current && isDraggingRef.current) {
      clearTimers();
      dragStartedRef.current = false;
      isDraggingRef.current = false;
      dragStartPosRef.current = null;
      return;
    }
    dragStartedRef.current = false;
    isDraggingRef.current = false;
    dragStartPosRef.current = null;
  };

  const onClick = (e: MouseEvent) => {
    if (e.target !== renderer.domElement) return;

    // Swallow the click synthesized at the end of a paint gesture — the
    // painted cells were already dispatched on pointerdown/move.
    if (paintRef.pointerId !== null) return;
    if (paintRef.consumedGesture) {
      paintRef.consumedGesture = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    if (suppressNextClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressNextClickRef.current = false;
      return;
    }

    const result = performRaycast(e.clientX, e.clientY);
    const now = Date.now();

    if (pendingTapTimerRef.current && lastTapResultRef.current) {
      const sameTarget = result.target === lastTapResultRef.current.target;
      const samePiece = result.target === 'piece' && lastTapResultRef.current.target === 'piece' 
        ? result.data?.uid === lastTapResultRef.current.data?.uid 
        : true;
      
      if (sameTarget && samePiece) {
        clearTimeout(pendingTapTimerRef.current);
        pendingTapTimerRef.current = null;
        onInteraction(result.target, "double", result.data);
        lastTapResultRef.current = null;
      } else {
        clearTimeout(pendingTapTimerRef.current);
        if (lastTapResultRef.current.target) {
          onInteraction(lastTapResultRef.current.target, "single", lastTapResultRef.current.data);
        }
        lastTapResultRef.current = result;
        pendingTapTimerRef.current = setTimeout(() => {
          if (lastTapResultRef.current?.target) {
            onInteraction(lastTapResultRef.current.target, "single", lastTapResultRef.current.data);
          }
          lastTapResultRef.current = null;
          pendingTapTimerRef.current = null;
        }, DOUBLE_TAP_WINDOW);
      }
    } else {
      (result as any).timestamp = now;
      lastTapResultRef.current = result;
      pendingTapTimerRef.current = setTimeout(() => {
        if (lastTapResultRef.current?.target) {
          onInteraction(lastTapResultRef.current.target, "single", lastTapResultRef.current.data);
        }
        lastTapResultRef.current = null;
        pendingTapTimerRef.current = null;
      }, DOUBLE_TAP_WINDOW);
    }
  };

  renderer.domElement.addEventListener("mousedown", onMouseDown);
  renderer.domElement.addEventListener("mousemove", onMouseMove);
  renderer.domElement.addEventListener("mouseup", onMouseUp);
  renderer.domElement.addEventListener("click", onClick);

  return () => {
    clearTimers();
    detachPaint();
    renderer.domElement.removeEventListener("mousedown", onMouseDown);
    renderer.domElement.removeEventListener("mousemove", onMouseMove);
    renderer.domElement.removeEventListener("mouseup", onMouseUp);
    renderer.domElement.removeEventListener("click", onClick);
  };
}
