/*
 * src/texture.ts
 *
 * 
 * Copyright (C) 2015-2017 Pierre Marchand <pierremarc07@gmail.com>
 * Copyright (C) 2017 Pacôme Béru <pacome.beru@gmail.com>
 *
 *  License in LICENSE file at the root of the repository.
 *
 *  This file is part of waend-render0 package.
 *
 *  waend-render0 is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, version 3 of the License.
 *
 *  waend-render0 is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with waend-render0.  If not, see <http://www.gnu.org/licenses/>.
 */


import { getProperty, paintStartTexture, processStyle, paintPolygon, paintLine, paintEndTexture } from "./context";
import { ModelProperties, Extent, Transform, PainterCommand } from "waend-lib";
import { lineTransform } from "waend-util";


interface TextureIndex {
    [key: string]: boolean;
}

interface TextureCache {
    [key: string]: PainterCommand[];
}


const textureIndex: TextureIndex = {};
const textureCache: TextureCache = {};

export const addTexture: (z: string, a: ModelProperties, b: Extent, c: Extent, d: Transform) => PainterCommand[] =
    (key, props, viewport, extent, transform) => {
        textureIndex[key] = true;
        if (!(key in textureCache)) {
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

            textureCache[key] = commands;
        }
        return textureCache[key];
    };

export const getKey: (a: ModelProperties, b: Extent, c: Extent, d: Transform) => [string, boolean] =
    (props, viewport, extent, transform) => {
        const strokeColor = getProperty(props, 'style.strokeStyle', '#000');
        const lineWidth = getProperty(props, 'style.lineWidth', 1);
        const rotation = getProperty(props, 'params.rotation', 0);
        const paramHN = getProperty(props, 'params.hn', 24);
        let paramStep = getProperty(props, 'step', null);
        let computedHN = Math.floor(
            (viewport.getHeight() * paramHN) / extent.getHeight());
        let step = viewport.getHeight() / computedHN;
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
        return ((key in textureIndex) && textureIndex[key]);
    }

export const clearIndex: () => void =
    () => {
        Object.keys(textureIndex)
            .forEach((key) => {
                textureIndex[key] = false;
            });
    }
