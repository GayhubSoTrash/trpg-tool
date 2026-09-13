'use strict';

/**
 * Shared battlefield geometry using world coordinates.
 * Used by 魂靈風息 (any orthogonal direction) and 絆腳 (fixed UP).
 * Works across different grid_groups.
 */

function worldOrthogonalTolerance(aCellSize, bCellSize) {
    return Math.max(
        8,
        Math.min(Number(aCellSize || 32), Number(bCellSize || 32)) * 0.34
    );
}

/**
 * Is `targetPos` on the orthogonal ray starting at `originPos`
 * in the given direction (UP / DOWN / LEFT / RIGHT)?
 *
 * UP = smaller centerY, DOWN = larger centerY,
 * LEFT = smaller centerX, RIGHT = larger centerX.
 */
function isOnOrthogonalRay(originPos, targetPos, direction) {
    if (!originPos || !targetPos) return false;
    const dir = String(direction || '').toUpperCase();
    if (!['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(dir)) return false;

    const tolerance = worldOrthogonalTolerance(
        originPos.cellSize,
        targetPos.cellSize
    );
    const dx = Number(targetPos.centerX) - Number(originPos.centerX);
    const dy = Number(targetPos.centerY) - Number(originPos.centerY);
    const vertical = Math.abs(dx) <= tolerance;
    const horizontal = Math.abs(dy) <= tolerance;

    return (
        (dir === 'UP' && vertical && dy < -tolerance) ||
        (dir === 'DOWN' && vertical && dy > tolerance) ||
        (dir === 'LEFT' && horizontal && dx < -tolerance) ||
        (dir === 'RIGHT' && horizontal && dx > tolerance)
    );
}

/** Convenience: target is directly above origin (絆腳). */
function isWorldDirectlyAbove(targetPos, originPos) {
    return isOnOrthogonalRay(originPos, targetPos, 'UP');
}

module.exports = {
    worldOrthogonalTolerance,
    isOnOrthogonalRay,
    isWorldDirectlyAbove
};
