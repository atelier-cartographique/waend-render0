/*
 * src/index.ts
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

import { start, FrameFn, DataFn, CancelFrameFn } from './gate';
import { PainterCommand, CoordLinestring, CoordPolygon, ImageOptions, BaseSource, Extent, Polygon, LineString, GeoModel, ModelProperties, Transform } from "waend-lib";
import { polygonTransform, polygonProject, lineProject, lineTransform } from "waend-util";
import { paintLine, paintImage, processStyle, getParameter, paintSave, paintRestore, paintPolygon, paintApplyTexture, drawTextInPolygon, drawTextOnLine, drawTextInPolygonAuto } from "./context";
import { getKey as getTextureKey, addTexture, clearIndex as clearTextureIndex } from './texture';
import { select as selectFont } from './Font';
import { lineString as turfLineString, polygon as turfPolygon } from "@turf/helpers";


interface FrameLoopIndex {
    [frameId: string]: number;
}

const loopIndex: FrameLoopIndex = {};

const DEFAULT_FONT_URL = `${self.location.origin}/fonts/default`;
const dataSource = new BaseSource<GeoModel>()
let currentExtent: Extent;
let currentTransform: Transform;
let viewport: Extent;



const textedLine: (a: PainterCommand[], b: CoordLinestring, c: ModelProperties, d: Transform) => void =
    (commands, coordinates, props, T) => {
        lineProject(coordinates);
        commands.push(
            drawTextOnLine(T, coordinates,
                <string>getParameter(props, 'text', ''),
                <string>getParameter(props, 'fontUrl', DEFAULT_FONT_URL),
                <number>getParameter(props, 'fontsize', 0))
        );
    };



const linestring: (b: CoordLinestring, c: ModelProperties, d: Transform) => PainterCommand[] =
    (coordinates, props, T) => {
        const commands: PainterCommand[] = [];
        processStyle(commands, props, T);
        const txt = getParameter(props, 'text', null);
        if (txt) {
            const ts = performance.now();
            textedLine(commands, coordinates, props, T);
            console.log(`textedLine ${txt.length} ${performance.now() - ts}`);
        }
        else {
            lineProject(coordinates);
            lineTransform(T, coordinates);
            const extent = (new LineString(turfLineString(coordinates))).getExtent();
            if ((extent.getHeight() > 1) || (extent.getWidth() > 1)) {
                commands.push(paintLine(coordinates));
            }
        }
        return commands;
    };


const hatchedPolygon: (a: PainterCommand[], b: CoordPolygon, d: ModelProperties, e: Transform) => PainterCommand[] =
    (commands, coordinates, props, T) => {
        polygonProject(coordinates);
        polygonTransform(T, coordinates);
        const p = new Polygon(turfPolygon(coordinates));
        const initialExtent = p.getExtent();
        const initialHeight = initialExtent.getHeight();
        const initialWidth = initialExtent.getWidth();

        if ((initialHeight < 1) || (initialWidth < 1)) {
            return commands;
        }

        const [key, hasTexture] = getTextureKey(props, viewport, initialExtent, T);

        if (!hasTexture) {
            console.log(`Missing Texture ${key}`);
            addTexture(key, props, viewport, initialExtent, T)
                .forEach(c => { commands.push(c); });
        }

        commands.push(paintSave());
        commands.push(paintPolygon(coordinates, ['clip']));
        commands.push(paintApplyTexture(key));
        commands.push(paintRestore());

        return commands;
    };

const textedPolygon: (a: PainterCommand[], b: CoordPolygon, d: ModelProperties, e: Transform) => PainterCommand[] =
    (commands, coordinates, props, T) => {
        polygonProject(coordinates);
        const p = new Polygon(turfPolygon(coordinates));
        const fontUrl: string = getParameter(props, 'fontUrl', DEFAULT_FONT_URL);
        const fs: number = getParameter(props, 'fontsize', 0);
        const text: string = getParameter(props, 'text', '');
        if (fs) {
            commands.push(drawTextInPolygon(T, p, text, fontUrl, fs));
        }
        else {
            commands.concat(drawTextInPolygonAuto(T, p, text, fontUrl));
        }
        return commands;
    };


const imagedPolygon: (a: PainterCommand[], b: CoordPolygon, c: string, d: ModelProperties, e: Transform) => PainterCommand[] =
    (commands, coordinates, image, props, T) => {
        polygonProject(coordinates);
        polygonTransform(T, coordinates);
        const p = new Polygon(turfPolygon(coordinates));
        const extent = p.getExtent().getArray();

        const options: ImageOptions = {
            image,
            clip: getParameter(props, 'clip', true),
            adjust: getParameter(props, 'adjust', 'none'), // 'fit', 'cover'
            rotation: getParameter(props, 'rotation', null)
        };

        commands.push(paintImage(coordinates, extent, options));
        return commands;
    };


const polygon: (b: CoordPolygon, c: ModelProperties, d: Transform) => PainterCommand[] =
    (coordinates, props, T) => {
        const commands: PainterCommand[] = [];
        processStyle(commands, props, T);
        const img = getParameter(props, 'image', null);
        const txt = getParameter(props, 'text', null);
        const ts = performance.now();
        if (img) {
            imagedPolygon(commands, coordinates, img, props, T);
        }
        else if (txt) {
            textedPolygon(commands, coordinates, props, T);
            console.log(`textedPolygon ${txt.length} ${performance.now() - ts}`);
        }
        else {
            hatchedPolygon(commands, coordinates, props, T);
            // console.log(`hatchedPolygon  ${performance.now() - ts}`);
        }

        return commands;
    };


const initData: DataFn =
    (models, end) => {
        dataSource.clear();
        models.forEach((model) => {
            dataSource.addFeature(new GeoModel(model), true);

        });
        dataSource.buildTree();
        end();
    }


const updateData: DataFn =
    (models, end) => {
        models.forEach((model) => {
            dataSource.removeFeature(model.id);
            dataSource.addFeature(new GeoModel(model));
        });
        end();
    }


// TODO - cache this
const detectFonts: (a: GeoModel[]) => string[] =
    (models) => {
        return (
            models.reduce<string[]>((acc, model) => {
                const fontUrl = getParameter(model.getData(), 'fontUrl', null);
                if (!fontUrl) {
                    return acc;
                }
                else if (acc.indexOf(fontUrl) >= 0) {
                    return acc;
                }
                return acc.concat([fontUrl]);
            }, [DEFAULT_FONT_URL])
        );
    }





const renderFrame: FrameFn =
    (opt_extent, opt_matrix, frame, frameId) => {
        currentExtent = new Extent(opt_extent);
        currentTransform = Transform.fromFlatMatrix(opt_matrix);
        clearTextureIndex();

        const poly = currentExtent.toPolygon().getCoordinates();
        polygonProject(poly);
        polygonTransform(currentTransform, poly);
        const tpoly = new Polygon({
            type: 'Polygon',
            coordinates: poly
        });
        viewport = tpoly.getExtent();

        const features = dataSource.getFeatures(opt_extent);

        const processFeature: (a: GeoModel) => PainterCommand[] =
            (feature) => {
                const geom = feature.getGeometry();
                const geomType = geom.getType();
                const props = feature.getData();
                switch (geomType) {
                    case 'LineString':
                        return linestring(
                            (<LineString>geom).getCoordinates(), props,
                            currentTransform);

                    case 'Polygon':
                        return polygon(
                            (<Polygon>geom).getCoordinates(), props,
                            currentTransform);

                    default: return [];
                }
            };

        const processWithFonts =
            () => {
                const ts = performance.now();
                const batchSize = 1024;
                let offset = 0;

                loopIndex[frameId] = self.setInterval(() => {
                    console.log(`Batch ${frameId} ${offset}/${features.length}`);
                    let commands: PainterCommand[] = [];
                    const limit = offset + batchSize;
                    for (let i = offset; i < limit; i++) {
                        if (i < features.length) {
                            processFeature(features[i]).forEach((pc) => {
                                commands.push(pc);
                            })
                        }
                        else {
                            clearInterval(loopIndex[frameId]);
                            delete loopIndex[frameId];
                            const elapsed = Math.ceil(performance.now() - ts);
                            console.log(`Built Frame ${frameId} With ${features.length} Features In ${elapsed}ms`);
                            break;
                        }

                    }
                    frame(commands);
                    offset = limit;
                    // const slice = features.slice(offset, offset + batchSize);
                    // offset += slice.length;
                    // commands = features.map<PainterCommand[]>(processFeature)
                    //     .reduce((acc, cs) => acc.concat(cs), commands);
                }, 1);

            };

        selectFont(detectFonts(features))
            .then(processWithFonts);
    };


const cancelFrame: CancelFrameFn =
    (frameId) => {
        if (frameId in loopIndex) {
            clearInterval(loopIndex[frameId]);
            delete loopIndex[frameId];
        }
    }

start(initData, updateData, renderFrame, cancelFrame);
