/*
 * app/src/Program.js
 *
 *
 * Copyright (C) 2015  Pierre Marchand <pierremarc07@gmail.com>
 *
 * License in LICENSE file at the root of the repository.
 *
 */

import { start, FrameFn, DataFn } from './gate';
import { Extent, Polygon, LineString } from "../lib/Geometry";
import { GeoModel, ModelProperties } from '../lib/Model';
import Transform from "../lib/Transform";
import { polygonTransform, polygonProject, lineProject, lineTransform } from "../lib/util";
import BaseSource from "../lib/BaseSource";
import { PainterCommand, CoordLinestring, CoordPolygon, ImageOptions } from "../lib/waend";
import { paintLine, paintImage, processStyle, getParameter, paintSave, paintRestore, paintPolygon, paintApplyTexture, drawTextInPolygon, drawTextOnLine, drawTextInPolygonAuto } from "./context";
import { getKey as getTextureKey, addTexture } from './texture';
import { select as selectFont } from './Font';
import config from '../config';
import { lineString as turfLineString, polygon as turfPolygon } from "@turf/helpers";


const DEFAULT_FONT_URL = `${config.baseUrl}/fonts/default`;
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
            textedLine(commands, coordinates, props, T);
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
        if (img) {
            imagedPolygon(commands, coordinates, img, props, T);
        }
        else if (txt) {
            textedPolygon(commands, coordinates, props, T);
        }
        else {
            hatchedPolygon(commands, coordinates, props, T);
        }

        return commands;
    };


const initData: DataFn =
    (models) => {
        dataSource.clear();
        models.forEach((model) => {
            dataSource.addFeature(new GeoModel(model), true);

        });
        dataSource.buildTree();
    }


const updateData: DataFn =
    (models) => {
        models.forEach((model) => {
            dataSource.removeFeature(model.id);
            dataSource.addFeature(new GeoModel(model));
        });
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
    (opt_extent, opt_matrix, frame) => {
        currentExtent = new Extent(opt_extent);
        currentTransform = Transform.fromFlatMatrix(opt_matrix);

        const poly = currentExtent.toPolygon().getCoordinates();
        const tpoly = currentExtent.toPolygon();
        polygonProject(poly);
        polygonTransform(currentTransform, poly);
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
                frame(
                    features.map<PainterCommand[]>(processFeature)
                        .reduce((acc, cs) => acc.concat(cs), [])
                );
            };

        selectFont(detectFonts(features))
            .then(processWithFonts);
    };


start(initData, updateData, renderFrame);