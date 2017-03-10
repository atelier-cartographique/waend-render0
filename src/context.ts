/*
 * app/src/libworker.js
 *
 *
 * Copyright (C) 2015  Pierre Marchand <pierremarc07@gmail.com>
 *
 * License in LICENSE file at the root of the repository.
 *
 */

import * as underscore from 'lodash';
import Transform from '../lib/Transform';
import { isZero, pathKey, vecDist, lineAngle } from '../lib/util';
import Text, { Segment, TextCursor } from './Text';
import { ModelProperties } from "../lib/Model";
import { PainterCommandApplyTexture, PainterCommandClear, PainterCommandClearRect, CoordPolygon, PainterCommandImage, DrawingInstruction, PainterCommandInstructions, PainterCommandRestore, PainterCommandSave, PainterCommandEndTexture, ImageOptions, PainterCommandSet, ContextValue, PainterCommandStartTexture, PainterCommandTransform, PainterCommandLine, CoordLinestring, PolygonEnds, PainterCommandPolygon, PainterCommand } from "../lib/waend";
import { isNumber } from "util";
import { vec2 } from "gl-matrix";
import { Polygon } from "../lib/Geometry";
import { transformCommand } from "./Font";

/*

line intersect from paper.js
*/



function lineIntersect(apx: number, apy: number, avx: number, avy: number, bpx: number, bpy: number, bvx: number, bvy: number, asVector: boolean,
    isInfinite: boolean) {
    // Convert 2nd points to vectors if they are not specified as such.
    if (!asVector) {
        avx -= apx;
        avy -= apy;
        bvx -= bpx;
        bvy -= bpy;
    }
    const cross = avx * bvy - avy * bvx;
    // Avoid divisions by 0, and errors when getting too close to 0
    if (!isZero(cross)) {
        const dx = apx - bpx;
        const dy = apy - bpy;
        const ta = (bvx * dy - bvy * dx) / cross;
        const tb = (avx * dy - avy * dx) / cross;
        // Check the ranges of t parameters if the line is not allowed
        // to extend beyond the definition points.
        if (isInfinite || 0 <= ta && ta <= 1 && 0 <= tb && tb <= 1)
            return [apx + ta * avx, apy + ta * avy];
    }
    return null;
}

function coordinatesLefter<T extends (vec2 | number[])>(a: T, b: T) {
    return (a[0] - b[0]);
}

function findIntersectSegment(coordinates: CoordPolygon, apx: number, apy: number, avx: number, avy: number) {
    const ret: number[][] = [];
    let ring;
    let bpx;
    let bpy;
    let bvx;
    let bvy;
    let r;
    for (let i = 0; i < coordinates.length; i++) {
        ring = coordinates[i];
        for (let vi = 1; vi < ring.length; vi++) {
            bpx = ring[vi - 1][0];
            bpy = ring[vi - 1][1];
            bvx = ring[vi][0] - bpx;
            bvy = ring[vi][1] - bpy;
            r = lineIntersect(apx, apy, avx, avy, bpx, bpy, bvx, bvy, true, false);
            if (r) {
                ret.push(r);
            }
        }
    }
    ret.sort(coordinatesLefter);
    return ret;
}


function getWritableSegments(p: Polygon, lineHeight: number, start?: number): (null | Segment[]) {
    const coordinates = p.getCoordinates();
    const extent = p.getExtent();
    const height = extent.getHeight();
    const width = extent.getWidth();
    const bottomLeft = extent.getBottomLeft().getCoordinates();
    const topRight = extent.getTopRight().getCoordinates();
    const left = bottomLeft[0];
    const top = topRight[1];
    const segments: Segment[] = [];

    start = (start || 0) + 1;
    const offset = start * lineHeight;
    if (offset > height) {
        return null;
    }
    const intersections = findIntersectSegment(coordinates,
        left, top - offset, width, 0);
    for (let i = 1; i < intersections.length; i += 2) {
        const [i0x, i0y] = intersections[i - 1];
        const [i1x, i1y] = intersections[i];
        const s: Segment = [[i0x, i0y], [i1x, i1y]];
        segments.push(s);
    }

    return segments;
}




export const drawTextInPolygon: (a: Transform, b: Polygon, c: string, d: string, e: number) => PainterCommandInstructions =
    (T, polygon, txt, fontUrl, fs) => {
        let startSegment = 0;
        let segments = getWritableSegments(polygon, fs * 1.2, startSegment);
        const t = new Text(txt, fontUrl);
        let result;
        let cursor: (TextCursor | null) = t.cursor();
        let paths;
        let p;
        const tfn = T.mapVec2Fn();
        const instructions: DrawingInstruction[] = [];

        while (segments) {
            if (!cursor) {
                break;
            }
            if (segments.length > 0) {
                result = t.draw(fs, segments, cursor, false);
                cursor = result[0];
                paths = result[1];

                for (let i = 0; i < paths.length; i++) {
                    p = paths[i];
                    instructions.push(['beginPath']);
                    for (let ii = 0; ii < p.commands.length; ii++) {
                        transformCommand(instructions, [tfn], p.commands[ii]);
                    }
                    instructions.push(['fill']);
                }
            }
            startSegment += 1;
            segments = getWritableSegments(polygon, fs * 1.2, startSegment);
        }

        return paintInstructions(instructions);
    }



/*
 * implements binary search (recursive)
 *
 * https://en.wikipedia.org/wiki/Binary_search_algorithm
 * Where it's different from general implementation lies in the fact
 * that's the predicate which evaluates rather then numeric comparision.
 * Thus the predicate must know the key.
 *
 * @param min Number minimum value
 * @param max Number maximun value
 * @predicate Function(pivot) a function that evaluates the current mid value a la compareFunction
 * @context Object context to which the predicate is applied
 *
 */

type BinaryPredicate = (a: number) => number;

const binarySearch: (a: number, b: number, c: BinaryPredicate) => number =
    (min, max, predicate) => {
        const interval = max - min;
        const pivot = min + (Math.floor(interval / 2));

        if (max === min) {
            return pivot;
        }
        else if (max < min) {
            // throw (new Error('MaxLowerThanMin'));
            return pivot;
        }

        if (predicate(pivot) > 0) {
            return binarySearch(min, pivot, predicate);
        }
        else if (predicate(pivot) < 0) {
            return binarySearch(pivot + 1, max, predicate);
        }
        return pivot;
    }


export const drawTextInPolygonAuto: (a: Transform, b: Polygon, c: string, d: string) => PainterCommandInstructions =
    (T, polygon, txt, fontUrl) => {
        const basefs = 1;
        const highfs = 1000000;
        const t = new Text(txt, fontUrl);

        const segmentsLength: (a: number) => number =
            (fs) => {
                let start = 0;
                let segments = getWritableSegments(polygon, fs * 1.2, start);
                let totalLength = 0;
                while (segments) {
                    for (let i = 0, sl = segments.length; i < sl; i++) {
                        totalLength += vecDist(segments[i][0], segments[i][1]);
                    }
                    start += 1;
                    segments = getWritableSegments(polygon, fs * 1.2, start);
                }
                return totalLength * (1 - (Math.log(fs) / 100));
            };


        const baseTextLength = t.getFlatLength(1);
        const predicate: BinaryPredicate =
            (pivot) => {
                const sl = segmentsLength(pivot);
                const tl = baseTextLength * pivot;

                return Math.floor(tl - sl);
            };

        const fs = binarySearch(basefs, highfs, predicate);
        return drawTextInPolygon(T, polygon, txt, fontUrl, fs);

    }






export const drawTextOnLine: (a: Transform, b: CoordLinestring, c: string, d: string, e?: number) => PainterCommandInstructions =
    (T, coordinates, txt, fontUrl, fsz) => {
        const fs = fsz || 100;
        const t = new Text(txt, fontUrl);
        let cursor: TextCursor | null = t.cursor();
        let instructions: DrawingInstruction[] = [];
        const segments: Segment[] = [];


        for (let lidx = 1; lidx < coordinates.length; lidx++) {
            const start = coordinates[lidx - 1];
            const end = coordinates[lidx];
            const seg: Segment = [[start[0], start[1]], [end[0], end[1]]];
            segments.push(seg);
        }


        if (segments.length > 0 && cursor) {
            const result = t.draw(fs, segments, cursor, true);
            const paths = result[1];
            let TT;
            let angle;
            let p;

            cursor = result[0];

            for (let i = 0; i < paths.length; i++) {
                p = paths[i];
                instructions = [];
                angle = Math.abs(lineAngle(p.segment[0], p.segment[1])) * -1;

                TT = T.clone();
                TT.rotate(angle, p.pos);
                const tfn = TT.mapVec2Fn();
                instructions.push(['beginPath']);
                for (let ii = 0; ii < p.commands.length; ii++) {
                    transformCommand(instructions, [tfn], p.commands[ii]);

                }
                instructions.push(['fill']);
            }
        }

        return paintInstructions(instructions);
    }


export function getProperty(props: any, key: string, def: any) {
    const val = pathKey(props, key, def);
    if (val
        && underscore.isString(val)
        && (val.length > 1)
        && ('@' === val[0])) {
        return pathKey(props, val.slice(1), def);
    }
    return val;
}

export const processStyle: (a: PainterCommand[], b: ModelProperties, c: Transform) => PainterCommand[] =
    (commands, props, T) => {
        const scale = T.getScale()[0];
        commands.push(['save']);
        if ('style' in props) {
            const style = props.style;
            for (const k in style) {
                const val = getStyle(props, k, null);
                if (val) {
                    if (isNumber(val)) {
                        const tv = val * scale;
                        commands.push(paintSet(k, tv));
                    }
                    else if ('dashLine' === k) {
                        const tv0 = val[0] * scale;
                        const tv1 = val[1] * scale;
                        commands.push(paintSet('dashLine', [tv0, tv1]));
                    }
                    else {
                        commands.push(paintSet(k, val));
                    }
                }
            }
        }
        return commands;
    }

export const getParameter =
    (props: ModelProperties, k: string, def: any) => getProperty(props, `params.${k}`, def);

export const getStyle =
    (props: ModelProperties, k: string, def: any) => getProperty(props, `style.${k}`, def);




export const paintApplyTexture: (a: string) => PainterCommandApplyTexture =
    (id) => {
        return ['applyTexture', id];
    }


export const paintClear: () => PainterCommandClear =
    () => {
        return ['clear'];
    }

export const paintClearRect: (a: number[]) => PainterCommandClearRect =
    (coords) => {
        return ['clearRect', coords];
    }

export const paintEndTexture: () => PainterCommandEndTexture =
    () => {
        return ['endTexture'];
    }

export const paintImage: (a: CoordPolygon, b: number[], c: ImageOptions) => PainterCommandImage =
    (coords, extent, options) => {
        return ['image', coords, extent, options];
    }

export const paintInstructions: (a: DrawingInstruction[]) => PainterCommandInstructions =
    (instructions) => {
        return ['instructions', instructions];
    }

export const paintRestore: () => PainterCommandRestore =
    () => {
        return ['restore'];
    }

export const paintSave: () => PainterCommandSave =
    () => {
        return ['save'];
    }

export const paintSet: (a: string, b: ContextValue) => PainterCommandSet =
    (key, value) => {
        return ['set', key, value];
    }

export const paintStartTexture: (a: string) => PainterCommandStartTexture =
    (id) => {
        return ['startTexture', id];
    }

export const paintTransorm: (a: number, b: number, c: number, d: number, e: number, f: number) => PainterCommandTransform =
    (a, b, c, d, e, f) => {
        return ['transform', a, b, c, d, e, f];
    }

export const paintLine: (a: CoordLinestring) => PainterCommandLine =
    (coords) => {
        return ['line', coords];
    }

export const paintPolygon: (a: CoordPolygon, b: PolygonEnds) => PainterCommandPolygon =
    (coords, ends) => {
        return ['polygon', coords, ends];
    }







// eof
