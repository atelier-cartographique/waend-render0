

import {
    MessageFrame, MessageInit, MessageUpdate,
    EventRenderFrame, EventRenderInit, EventRenderUpdate,
    ResponseAck, ResponseFrame
} from '../map/Worker';
import { ModelData } from "../lib/Model";
import { PainterCommand } from "../lib/waend";



type MessageData = MessageFrame | MessageInit | MessageUpdate;

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
export type FrameFn = (a: number[], b: number[], c: (d: PainterCommand[]) => void) => void;

export const start: (a: DataFn, b: DataFn, c: FrameFn) => void =
    (initData, updateData, renderFrame) => {
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
                            emitFrame(event.data.id));
                        break;
                }
            };

        scope.addEventListener('message', messageHandler, false);
    };
