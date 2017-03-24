

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
