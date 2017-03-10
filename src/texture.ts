
import { ModelProperties } from "../lib/Model";
import { getProperty, paintStartTexture, processStyle, paintPolygon, paintLine, paintEndTexture } from "./context";
import { Extent } from "../lib/Geometry";
import Transform from '../lib/Transform';
import { PainterCommand } from "../lib/waend";
import { lineTransform } from "../lib/util/index";


interface Textures {
    [key: string]: boolean;
}

const textures: Textures = {};

export const addTexture: (z: string, a: ModelProperties, b: Extent, c: Extent, d: Transform) => PainterCommand[] =
    (key, props, viewport, extent, transform) => {
        const commands: PainterCommand[] = [];
        const bviewport = viewport.clone().maxSquare().buffer(viewport.getWidth() * 0.7);
        const center = viewport.getCenter();
        const height = extent.getHeight();
        const paramHN = getProperty(props, 'params.hn', 24);
        const rotation = getProperty(props, 'params.rotation', 0);
        const paramStep = getProperty(props, 'params.step', null);
        const strokeColor = getProperty(props, 'style.strokeStyle', '#000');
        const lineWidth = getProperty(props, 'style.lineWidth', 1);
        let hatchLen = Math.floor((bviewport.getHeight() * paramHN) / height);
        const bottomLeft = bviewport.getBottomLeft().getCoordinates();
        const topRight = bviewport.getTopRight().getCoordinates();
        const start = bottomLeft[1];
        const left = bottomLeft[0];
        const right = topRight[0];
        const patternCoordinates = [];
        let step = Math.ceil(bviewport.getHeight() / hatchLen);
        let turnFlag = false;

        textures[key] = true;

        patternCoordinates.push([left, start]);

        if (paramStep) {
            step = Math.ceil(paramStep * transform.getScale()[0]);
            hatchLen = Math.floor(bviewport.getHeight() / step);
        }

        commands.push(paintStartTexture(key));
        if (step <= (1 * lineWidth)) {
            if (!('style' in props)) {
                props.style = {};
            }
            props.style.fillStyle = strokeColor;
            processStyle(commands, props, transform);
            const rcoords = viewport.toPolygon().getCoordinates();
            commands.push(paintPolygon(rcoords, ['closePath', 'fill']))
        }
        else {
            processStyle(commands, props, transform);
            let y;
            for (let i = 0; i < hatchLen; i++) {
                y = start + (i * step);
                if (turnFlag) {
                    if (i > 0) {
                        patternCoordinates.push([right, y]);
                    }
                    patternCoordinates.push([left, y]);
                }
                else {
                    if (i > 0) {
                        patternCoordinates.push([left, y]);
                    }
                    patternCoordinates.push([right, y]);
                }
                turnFlag = !turnFlag;
            }

            if (rotation) {
                const rt = new Transform();
                const ccoords = center.getCoordinates();
                rt.rotate(rotation, ccoords);
                lineTransform(rt, patternCoordinates);
            }

            commands.push(paintLine(patternCoordinates));
        }
        commands.push(paintEndTexture());

        return commands;
    };

export const getKey: (a: ModelProperties, b: Extent, c: Extent, d: Transform) => [string, boolean] =
    (props, viewport, extent, transform) => {
        const strokeColor = getProperty(props, 'style.strokeStyle', '#000');
        const lineWidth = getProperty(props, 'style.lineWidth', 1);
        const rotation = getProperty(props, 'params.rotation', 0);
        let paramStep = getProperty(props, 'step', null);
        let paramHN = Math.floor(
            (viewport.getHeight() * getProperty(props, 'params.hn', 24)) / extent.getHeight());
        let step = viewport.getHeight() / paramHN;
        if (paramStep) {
            step = paramStep * transform.getScale()[0];
        }
        const ceiledStep = Math.ceil(step);
        const hs = [];

        hs.push(ceiledStep.toString());
        hs.push(strokeColor.toString());
        hs.push(lineWidth.toString());
        hs.push(rotation.toString());

        const key = hs.join('-');
        return [key, hasTexture(key)];
    };


export const hasTexture: (a: string) => boolean =
    (key) => {
        return (key in textures);
    }

