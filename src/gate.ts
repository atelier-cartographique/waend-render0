/*
 * src/gate.ts
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

import {
    MessageFrame, MessageCancel, MessageInit, MessageUpdate,
    EventRenderFrame, EventCancelFrame, EventRenderInit, EventRenderUpdate,
    ResponseAck, ResponseFrame
} from 'waend-lib';

import { ModelData, PainterCommand } from "waend-lib";



type MessageData = MessageFrame | MessageInit | MessageUpdate | MessageCancel;

interface RenderMessageEvent extends MessageEvent {
    data: MessageData;
}

const scope = <DedicatedWorkerGlobalScope>self;

const emit = function <T>(data: T): void {
    postMessage(data);
};

const emitFrame: (a: string) => (b: PainterCommand[]) => void =
    (frameId) => (instructions) => {
        emit<ResponseFrame>({
            instructions,
            id: frameId,
            name: 'frame',
        });
    }

const emitAck: (a: string) => () => void =
    (id) => () => {
        emit<ResponseAck>({
            id,
            name: 'ack',
        });
    }

export type DataFn = (a: ModelData[], b: () => void) => void;
export type FrameFn = (a: number[], b: number[], c: (d: PainterCommand[]) => void, e: string) => void;
export type CancelFrameFn = (a: string) => void;

export const start: (a: DataFn, b: DataFn, c: FrameFn, d: CancelFrameFn) => void =
    (initData, updateData, renderFrame, cancelFrame) => {
        const messageHandler: (a: RenderMessageEvent) => void =
            (event) => {
                switch (event.data.name) {
                    case EventRenderInit:
                        initData(event.data.models, emitAck(event.data.ack));
                        break;

                    case EventRenderUpdate:
                        updateData(event.data.models, emitAck(event.data.ack));
                        break;

                    case EventRenderFrame:
                        renderFrame(event.data.extent, event.data.transform,
                            emitFrame(event.data.id), event.data.id);
                        break;

                    case EventCancelFrame:
                        cancelFrame(event.data.id);
                        break;
                }
            };

        scope.addEventListener('message', messageHandler, false);
    };
