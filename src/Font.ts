/*
 * src/Font.ts
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


import { flow } from 'lodash';
import * as Promise from 'bluebird';
import * as opentype from 'opentype.js';
import { vec2 } from "gl-matrix";
import { DrawingInstruction } from "waend-lib";


interface FontCollection {
    [url: string]: opentype.Font;
}

type FontArray = Array<opentype.Font>;
type ResolveFontFn = (a: opentype.Font) => void;
type RejectFontFn = (a: Error) => void;


const collection: FontCollection = {};


const loadFont: (a: string) => Promise<opentype.Font> =
    (url) => {
        if (url in collection) {
            return Promise.resolve(collection[url]);
        }

        const resolver: (a: ResolveFontFn, b: RejectFontFn) => void =
            (resolve, reject) => {
                fetch(url)
                    .then((resp) => resp.arrayBuffer())
                    .then((buffer) => {
                        const font = opentype.parse(buffer);
                        if (!font) {
                            return reject(new Error('CouldNotGetTheFont'));
                        }
                        collection[url] = font;
                        resolve(font);

                    })
                    .catch((err) => reject(err));
            };
        return (new Promise(resolver));
    };



export const select: (a: string[]) => Promise<FontArray> =
    (urls) => {
        return (
            Promise.map(urls, loadFont)
        );
    }


export const use: (a: string) => (opentype.Font | null) =
    (url) => {
        return collection[url];
    }


type TransformFn = <T extends (vec2 | number[]) >(v: T) => T;

export const transformCommand: (a: DrawingInstruction[], b: TransformFn[], c: opentype.PathCommand) => void =
    (instructions, transforms, cmd) => {
        let tfn: TransformFn;
        let p0;
        let p1;
        let p2;

        if (1 === transforms.length) {
            tfn = transforms[0];
        }
        else {
            tfn = flow<TransformFn>(...transforms);
        }
        switch (cmd.type) {
            case 'M':
                if (cmd.x && cmd.y) {
                    p0 = tfn([cmd.x, cmd.y]);
                    instructions.push(['moveTo', p0[0], p0[1]]);
                }
                break;

            case 'L':
                if (cmd.x && cmd.y) {
                    p0 = tfn([cmd.x, cmd.y]);
                    instructions.push(['lineTo', p0[0], p0[1]]);
                }
                break;

            case 'C':
                if (cmd.x1 && cmd.y1 && cmd.x2 && cmd.y2 && cmd.x && cmd.y) {
                    p0 = tfn([cmd.x1, cmd.y1]);
                    p1 = tfn([cmd.x2, cmd.y2]);
                    p2 = tfn([cmd.x, cmd.y]);
                    instructions.push(['bezierCurveTo',
                        p0[0], p0[1], p1[0], p1[1], p2[0], p2[1]]);
                }
                break;

            case 'Q':
                if (cmd.x1 && cmd.y1 && cmd.x && cmd.y) {
                    p0 = tfn([cmd.x1, cmd.y1]);
                    p1 = tfn([cmd.x, cmd.y]);
                    instructions.push(['quadraticCurveTo',
                        p0[0], p0[1], p1[0], p1[1]]);
                }
                break;

            case 'Z':
                instructions.push(['closePath']);
        }
    }

export const Font = opentype.Font;
export const Glyph = opentype.Glyph;
export const Path = opentype.Path;
