/*
 * src/Text.ts
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

import { use as useFont } from './Font';
import { Font, Path as OTPath } from "opentype.js";
import { vecDist, vecAdd } from "waend-util";

interface Path extends OTPath {
    segment: Segment;
    pos: [number, number];
    nextPos: [number, number]
}

export type Segment = [[number, number], [number, number]];

enum TextMarker {
    END_TEXT = -2,
    END_PARAGRAPH = -1
}

export class TextCursor {

    private p = 0;
    private i = 0;

    constructor(private text: Text) { }

    next() {
        const par = this.text.paragraphs[this.p];

        if (this.i >= par.length) {
            this.p = this.p + 1;
            this.i = 0;
            if (this.p >= this.text.paragraphs.length) {
                this.p = 0;
                return TextMarker.END_TEXT;
            }
            return TextMarker.END_PARAGRAPH;
        }
        const c = par[this.i];
        this.i += 1;
        return c;
    }

    rewind() {
        let par = this.text.paragraphs[this.p];
        const i = this.i - 1;

        if (i < 0) {
            this.p -= 1;
            if (this.p < 0) {
                this.p = 0;
                this.i = 0;
                return this;
            }
            par = this.text.paragraphs[this.p];
            this.i = par.length - 1;
            return this;
        }

        this.i = i;
        return this;
    }
}


class Text {
    private font: Font | null;
    paragraphs: string[];

    constructor(private _string: string, fontUrl: string) {
        this.paragraphs = _string.split('\n');
        this.font = useFont(fontUrl);
    }

    cursor() {
        return (new TextCursor(this));
    }

    getFont() {
        return this.font;
    }

    getFlatLength(fontSize: number) {
        if (this.font) {
            const glyphs = this.font.stringToGlyphs(this._string);
            const scale = fontSize / this.font.unitsPerEm;
            let len = 0;

            for (let i = 0, gl = glyphs.length; i < gl; i++) {
                len += glyphs[i].advanceWidth * scale;
            }

            return len;
        }
        return 0;
    }

    // font size & horizontal segments
    // a hyper basic text composer
    draw(fontsz: number, segments: Segment[], cursor: TextCursor, mergeSegments: boolean): [(TextCursor | null), Path[]] {
        if (!this.font) {
            return [null, []];
        }

        let csIdx = 0;
        let cs = segments[csIdx];
        let curPos = cs[0];
        let endPos = cs[1];
        const scale = fontsz / this.font.unitsPerEm;
        const paths = [];

        while (true) {
            const character = cursor.next();
            if (TextMarker.END_TEXT === character) {
                return [null, paths];
            }
            else if (TextMarker.END_PARAGRAPH === character) {
                csIdx++;
                if (csIdx >= segments.length) {
                    return [cursor, paths];
                }
                continue;
            }
            else {
                const glyphs = this.font.stringToGlyphs(character);
                let accAdvance = 0;
                let glyph: opentype.Glyph;
                let gi: number;

                for (gi = 0; gi < glyphs.length; gi++) {
                    glyph = glyphs[gi];
                    accAdvance += glyph.advanceWidth * scale;
                }

                if (accAdvance < vecDist(curPos, endPos)) {
                    for (gi = 0; gi < glyphs.length; gi++) {
                        const nextPos = vecAdd(curPos, endPos, accAdvance);
                        glyph = glyphs[gi];
                        const currentPath = <Path>getPath(glyph, curPos[0], curPos[1], fontsz);
                        currentPath.segment = cs;
                        currentPath.pos = curPos;
                        currentPath.nextPos = nextPos;
                        paths.push(currentPath);
                        curPos = [nextPos[0], nextPos[1]];
                    }
                }
                else {
                    csIdx++;
                    cursor.rewind();
                    if (csIdx >= segments.length) {
                        return [cursor, paths];
                    }
                    if (mergeSegments) {
                        cs = [curPos, segments[csIdx][1]];
                    }
                    else {
                        cs = segments[csIdx];
                    }
                    curPos = cs[0];
                    endPos = cs[1];
                }
            }
        }
    }
}

/*
opentype.js getPath flips Ys, it's fair. but as long as we flip the viewport to
accomodate with a weird OL3 behaviour, ther's no point to flip glyphs.
*/
function getPath(glyph: opentype.Glyph, x: number, y: number, fontSize: number) {
    const path = <opentype.Path>glyph.path;
    const scale = 1 / path.unitsPerEm * fontSize;

    return (
        path.commands.reduce((p, cmd) => {
            if (cmd.type === 'M') {
                if (cmd.x && cmd.y) {
                    p.moveTo(x + (cmd.x * scale), y + (cmd.y * scale));
                }
            }
            else if (cmd.type === 'L') {
                if (cmd.x && cmd.y) {
                    p.lineTo(x + (cmd.x * scale), y + (cmd.y * scale));
                }
            }
            else if (cmd.type === 'Q') {
                if (cmd.x1 && cmd.y1 && cmd.x && cmd.y) {
                    p.quadraticCurveTo(x + (cmd.x1 * scale), y + (cmd.y1 * scale),
                        x + (cmd.x * scale), y + (cmd.y * scale));
                }
            }
            else if (cmd.type === 'C') {
                if (cmd.x1 && cmd.y1 && cmd.x2 && cmd.y2 && cmd.x && cmd.y) {
                    p.curveTo(x + (cmd.x1 * scale), y + (cmd.y1 * scale),
                        x + (cmd.x2 * scale), y + (cmd.y2 * scale),
                        x + (cmd.x * scale), y + (cmd.y * scale));
                }
            }
            else if (cmd.type === 'Z') {
                p.closePath();
            }
            return p;
        }, new OTPath())
    );
}




export default Text;
