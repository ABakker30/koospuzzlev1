import * as THREE from "three";
import type { IJK } from "../../types/shape";
import type { ViewTransforms } from "../../services/ViewTransforms";
import { mat4ToThree, estimateSphereRadiusFromView } from "./sceneMath";

type InteractionTarget = "ghost" | "cell" | "piece" | "background";
type InteractionType = "single" | "double" | "long";

export function attachInteractions(opts: {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;

  // refs / state sources
  view: ViewTransforms | null;
  placedPieces: Array<{ uid: string; cells: IJK[] }>;
  placedMeshes: Map<string, THREE.InstancedMesh>;
  mesh: THREE.InstancedMesh | undefined;
  visibleCells: IJK[];
  hidePlacedPieces: boolean;

  // legacy guard
  gestureCompletedRef: React.MutableRefObject<boolean>;

  onInteraction: (target: InteractionTarget, type: InteractionType, data?: any) => void;
}) {
  const {
    renderer,
    camera,
    raycaster,
    mouse,
    view,
    placedPieces,
    placedMeshes,
    mesh,
    visibleCells,
    hidePlacedPieces,
    gestureCompletedRef,
    onInteraction,
  } = opts;

  // ---- Local state (mirrors your current effect) ----
  const pendingTapTimerRef = { current: null as any };
  const longPressTimerRef = { current: null as any };
  const lastTapResultRef = {
    current: null as { target: InteractionTarget | null; data?: any } | null,
  };

  const touchMovedRef = { current: false };
  const longPressFiredRef = { current: false };

  // Drag detection
  const dragStartedRef = { current: false };
  const isDraggingRef = { current: false };
  const suppressNextClickRef = { current: false };
  const dragStartPosRef = { current: null as { x: number; y: number } | null };
  const DRAG_THRESHOLD_SQ = 100;

  const DOUBLE_TAP_WINDOW = 350;
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
    if (!view) return null;

    const occupiedSet = new Set<string>();
    for (const piece of placedPieces) {
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

    // Piece hit
    let pieceHit: { uid: string; distance: number; emptyCellUnderCursor: IJK | null } | null = null;

    if (!hidePlacedPieces && placedMeshes.size > 0) {
      const allPieceMeshes = Array.from(placedMeshes.values());
      const allIntersections = raycaster.intersectObjects(allPieceMeshes, true);
      if (allIntersections.length > 0) {
        const frontMostHit = allIntersections[0];

        let hitPieceUid: string | null = null;
        for (const [uid, m] of placedMeshes.entries()) {
          if (frontMostHit.object === m) {
            hitPieceUid = uid;
            break;
          }
        }
        if (!hitPieceUid) {
          for (const [uid, m] of placedMeshes.entries()) {
            let obj = frontMostHit.object.parent;
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

        if (hitPieceUid) {
          const hitPoint = frontMostHit.point.clone();
          const hitPieceDistance = rayOrigin.distanceTo(hitPoint);
          const emptyCellUnderCursor = getEmptyCellUnderCursor(rayOrigin, rayDirection, hitPieceDistance);

          pieceHit = { uid: hitPieceUid, distance: hitPieceDistance, emptyCellUnderCursor };
        }
      }
    }

    // Cell hit
    let cellHit: { cell: IJK; distance: number } | null = null;
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

  const isMobile = "ontouchstart" in window;

  if (isMobile) {
    const onTouchStart = (e: TouchEvent) => {
      if (e.target !== renderer.domElement) return;

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

      if (pendingTapTimerRef.current && lastTapResultRef.current) {
        clearTimeout(pendingTapTimerRef.current);
        pendingTapTimerRef.current = null;
        onInteraction(result.target, "double", result.data);
        lastTapResultRef.current = null;
      } else {
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
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
    };
  }

  // Desktop
  const onMouseDown = (e: MouseEvent) => {
    if (e.target !== renderer.domElement) return;
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

    if (suppressNextClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressNextClickRef.current = false;
      return;
    }

    const result = performRaycast(e.clientX, e.clientY);

    if (pendingTapTimerRef.current && lastTapResultRef.current) {
      clearTimeout(pendingTapTimerRef.current);
      pendingTapTimerRef.current = null;
      onInteraction(result.target, "double", result.data);
      lastTapResultRef.current = null;
    } else {
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
    renderer.domElement.removeEventListener("mousedown", onMouseDown);
    renderer.domElement.removeEventListener("mousemove", onMouseMove);
    renderer.domElement.removeEventListener("mouseup", onMouseUp);
    renderer.domElement.removeEventListener("click", onClick);
  };
}
